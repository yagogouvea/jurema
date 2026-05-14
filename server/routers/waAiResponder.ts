/**
 * waAiResponder.ts
 * Geração automática de resposta da IA para conversas WhatsApp.
 *
 * Fluxo (chamado pelo webhook wa.receiveWebhook após o classificador de status):
 * 1) IA habilitada na instância?            → wa_ai_config.enabled = 1
 * 2) IA habilitada nesta conversa?          → wa_conversations.aiEnabled = 1
 * 3) Status da conversa permite resposta?   → != 'finalizado' && != 'spam' && != 'intervencao'
 * 4) Dentro do horário comercial?           → awayEnabled + awayStart/awayEnd + awaySchedule (America/Sao_Paulo)
 *    (fora do horário, quem responde é checkAwayMessage com awayMessage)
 * 5) Última mensagem da conversa é do cliente (não geramos resposta se fromMe=1)
 * 6) Há palavra-chave de escalação? → IA responde "Só um momento." e desliga aiEnabled
 * 6b) Webhook: debounce por conversa (silêncio após última msg do cliente; WA_AI_CUSTOMER_SEQUENCE_WAIT_MS, padrão 6s)
 * 7) Monta system prompt + últimas N mensagens (maxContextMessages) → invokeLLM (gpt-4o-mini)
 * 8) Aguarda delay aleatório [responseDelayMin, responseDelayMax] antes de enviar (humanização)
 * 9) Reverifica aiEnabled (humano pode ter assumido durante o delay)
 * 10) Reverifica se a última mensagem ainda é do cliente
 * 11) Insere mensagem em wa_messages (senderType='ai'), atualiza conversa,
 *     envia via wa-bridge e registra wa_ai_logs.
 */

import mysql from "mysql2/promise";
import { ORDER_QUANTITY_RULES_BLOCK, PRINTS_ORDER_CONTEXT_BLOCK } from "@shared/waAiDefaultStrings";
import {
  buildOrderQuantitySystemHint,
  collectTrailingCustomerTextParts,
  joinTrailingCustomerTextMessages,
} from "@shared/waOrderQuantityHint";
import { invokeLLM } from "../_core/llm";
import { isStoreOpenNowSaoPaulo } from "./waHours";
import { parseExtraLinks } from "./waAiTrainingDefaults";

const QTY_RULES_MARKER = "MULTILINHA E QUANTIDADES NO PEDIDO";
const PRINTS_CONTEXT_MARKER = "PRINTS, IMAGENS E CONTEXTO DO PEDIDO";

const SO_UM_MOMENTO_PREFIX = ["só um momento", "so um momento"];

function normalize(text: string): string {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function pickResponseDelayMs(min: number, max: number): number {
  const lo = Math.max(0, Math.min(min, max));
  const hi = Math.max(0, Math.max(min, max));
  if (hi <= lo) return lo;
  return Math.floor(lo + Math.random() * (hi - lo + 1));
}

function parseEscalateKeywords(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((s) => String(s));
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return [];
    if (s.startsWith("[")) {
      try { const j = JSON.parse(s); return Array.isArray(j) ? j.map(String) : []; }
      catch { /* string CSV */ }
    }
    return s.split(",").map((k) => k.trim()).filter(Boolean);
  }
  return [];
}

type ConvRow = {
  id: number;
  aiEnabled: number | boolean;
  status: string;
  remoteJid: string;
};

type AiCfgRow = {
  enabled: number | boolean;
  aiName: string | null;
  systemPrompt: string | null;
  personality: string | null;
  businessContext: string | null;
  catalogLink: string | null;
  groupLink: string | null;
  instagramLink: string | null;
  extraLinks: unknown;
  awayEnabled: number | boolean;
  awayStart: string | null;
  awayEnd: string | null;
  awaySchedule: unknown;
  maxContextMessages: number | null;
  responseDelayMin: number | null;
  responseDelayMax: number | null;
  escalateKeywords: unknown;
};

type MsgRow = {
  fromMe: number | boolean;
  senderType: string;
  type: string;
  content: string | null;
  mediaUrl: string | null;
  mediaStorageKey?: string | null;
  timestamp: Date | string;
};

function buildFallbackSystemPrompt(cfg: AiCfgRow): string {
  const name = cfg.aiName || "Ju";
  const personality = cfg.personality || "Atendente educada e direta, sem se apresentar como IA.";
  const business = cfg.businessContext || "Loja Jurema Sport — camisas de times e seleções (atacado e varejo).";
  let p = `Você é ${name}, atendente da Jurema Sport.

PERSONALIDADE:
${personality}

BASE DE CONHECIMENTO:
${business}

REGRAS:
- Responda sempre em português brasileiro.
- Nunca revele que é uma IA.
- Se não souber, responda exatamente: "Só um momento." e aguarde um humano.
- Respostas curtas e diretas, sem repetir o que o cliente disse.`;
  if (cfg.catalogLink) p += `\n\nCATÁLOGO: ${cfg.catalogLink}`;
  if (cfg.groupLink) p += `\nGRUPO: ${cfg.groupLink}`;
  if (cfg.instagramLink) p += `\nINSTAGRAM: ${cfg.instagramLink}`;
  const extras = parseExtraLinks(cfg.extraLinks);
  for (const e of extras) {
    if (e.url) p += `\n${e.label}: ${e.url}`;
  }
  if (!p.includes(QTY_RULES_MARKER)) {
    p += `\n\n${ORDER_QUANTITY_RULES_BLOCK}`;
  }
  if (!p.includes(PRINTS_CONTEXT_MARKER)) {
    p += `\n\n${PRINTS_ORDER_CONTEXT_BLOCK}`;
  }
  return p;
}

type SkipReason =
  | "ai_disabled_instance"
  | "ai_disabled_conversation"
  | "status_blocked"
  | "outside_business_hours"
  | "last_message_was_us"
  | "no_customer_message"
  | "ai_disabled_after_delay"
  | "empty_response";

export type GenerateResult =
  | { ok: true; messageId: number; content: string; escalated: boolean }
  | { ok: false; skipped: SkipReason | "error"; error?: string };

/**
 * Gera e envia uma resposta automática da IA para a conversa.
 * É seguro chamar várias vezes — ela só responde se for a última mensagem do cliente.
 *
 * sendFn: callback para chamar o wa-bridge (passado pelo waRouter para evitar import circular).
 */
export async function generateAiResponse(
  db: mysql.Connection,
  conversationId: number,
  instanceId: number,
  sendFn: (instanceId: number, remoteJid: string, content: string) => Promise<void>
): Promise<GenerateResult> {
  try {
    // 1+2+3. Buscar config da IA da instância e dados da conversa
    const [cfgRows] = await db.execute<any[]>(
      `SELECT enabled, aiName, systemPrompt, personality, businessContext,
              catalogLink, groupLink, instagramLink, extraLinks,
              awayEnabled, awayStart, awayEnd, awaySchedule,
              maxContextMessages, responseDelayMin, responseDelayMax, escalateKeywords
       FROM wa_ai_config WHERE instanceId = ? LIMIT 1`,
      [instanceId]
    );
    if (!cfgRows.length) return { ok: false, skipped: "ai_disabled_instance" };
    const cfg = cfgRows[0] as AiCfgRow;
    if (!cfg.enabled) return { ok: false, skipped: "ai_disabled_instance" };

    const [convRows] = await db.execute<any[]>(
      `SELECT id, aiEnabled, status, statusSetBy, remoteJid FROM wa_conversations WHERE id = ? LIMIT 1`,
      [conversationId]
    );
    if (!convRows.length) return { ok: false, skipped: "ai_disabled_conversation" };
    const conv = convRows[0] as ConvRow & { statusSetBy?: string };
    if (!conv.aiEnabled) return { ok: false, skipped: "ai_disabled_conversation" };

    // Status bloqueante? (consulta wa_status_presets.blocksAi)
    const { isStatusBlocking, applyAiStatus } = await import("./waStatusClassifier");
    if (await isStatusBlocking(db, conv.status)) {
      if ((conv as any).statusSetBy === "ai") {
        try {
          await applyAiStatus(db, conversationId);
          const [recheck] = await db.execute<any[]>(
            `SELECT status FROM wa_conversations WHERE id = ? LIMIT 1`,
            [conversationId]
          );
          const newStatus = String(recheck[0]?.status ?? "");
          if (newStatus && (await isStatusBlocking(db, newStatus))) {
            console.log(`[ai] status_blocked conv=${conversationId} status=${newStatus} (reclassificado, ainda bloqueio).`);
            return { ok: false, skipped: "status_blocked" };
          }
          console.log(`[ai] status reabriu conv=${conversationId}: ${conv.status} -> ${newStatus}`);
        } catch (e) {
          console.warn(`[ai] reclassificação inline falhou conv=${conversationId}:`, e);
          return { ok: false, skipped: "status_blocked" };
        }
      } else {
        return { ok: false, skipped: "status_blocked" };
      }
    }

    // 4. Horário comercial (SP + grade semanal opcional) — fora do horário, awayMessage no webhook
    if (
      !isStoreOpenNowSaoPaulo({
        awayEnabled: Boolean(cfg.awayEnabled),
        awayStart: cfg.awayStart,
        awayEnd: cfg.awayEnd,
        awaySchedule: cfg.awaySchedule,
      })
    ) {
      return { ok: false, skipped: "outside_business_hours" };
    }

    // 5. Buscar últimas N mensagens (maxContextMessages, default 10) em ordem cronológica
    const N = Math.max(1, Math.min(50, cfg.maxContextMessages ?? 10));
    const [msgRowsDesc] = await db.execute<any[]>(
      `SELECT fromMe, senderType, type, content, mediaUrl, mediaStorageKey, timestamp
       FROM wa_messages
       WHERE conversationId = ?
       ORDER BY timestamp DESC
       LIMIT ${N}`,
      [conversationId]
    );
    if (!msgRowsDesc.length) return { ok: false, skipped: "no_customer_message" };
    const msgs = (msgRowsDesc as MsgRow[]).reverse();

    // 5b. Garante transcrição dos áudios do cliente antes de chamar a IA.
    //     Whisper a partir do LONGBLOB salvo em wa_messages.mediaBlob.
    const isPlaceholderAudioContent = (raw: string | null | undefined): boolean => {
      const t = (raw ?? "").trim().toLowerCase();
      if (!t) return true;
      if (t === "[audio]" || t === "[áudio]" || t === "[audio sem transcrição]" || t === "[áudio sem transcrição]") return true;
      if (t === "[voice]" || t === "[ptt]" || t === "[audiomessage]" || t === "[audio message]") return true;
      return false;
    };

    try {
      const { transcribeAudioBuffer } = await import("../_core/voiceTranscription");
      for (let i = msgs.length - 1; i >= 0; i--) {
        const m = msgs[i];
        if (m.fromMe) continue;
        if (m.type !== "audio") continue;
        if (!isPlaceholderAudioContent(m.content)) continue;
        const [audioRows] = (await db.execute(
          `SELECT id, mediaBlob, mediaMimeType FROM wa_messages
           WHERE conversationId = ? AND type='audio' AND fromMe = 0
             AND mediaBlob IS NOT NULL AND OCTET_LENGTH(mediaBlob) > 0
           ORDER BY timestamp DESC LIMIT 1`,
          [conversationId]
        )) as any;
        const row = (audioRows as any[])[0];
        if (!row || !row.mediaBlob) {
          console.warn(`[ai] áudio cliente sem blob no banco; pulando transcrição inline (convId=${conversationId})`);
          break;
        }
        const buf = Buffer.isBuffer(row.mediaBlob) ? row.mediaBlob : Buffer.from(row.mediaBlob);
        const mime = String(row.mediaMimeType ?? "audio/ogg");
        const result = await transcribeAudioBuffer({ audioBuffer: buf, mimeType: mime, language: "pt" });
        if (result && !("error" in result) && result.text) {
          const newContent = `[Áudio] ${result.text}`.slice(0, 8000);
          await db.execute("UPDATE wa_messages SET content = ? WHERE id = ?", [newContent, row.id]);
          m.content = newContent;
          console.log(`[ai] transcrição inline mid=${row.id} chars=${result.text.length}`);
        } else if (result && "error" in result) {
          console.error(`[ai] Whisper falhou inline mid=${row.id}:`, result);
        }
        break;
      }
    } catch (e) {
      console.warn("[ai] Erro na transcrição inline antes da resposta:", e);
    }

    // Anti-loop: só responde se a última mensagem na conversa é do CLIENTE
    const last = msgs[msgs.length - 1];
    if (last.fromMe) return { ok: false, skipped: "last_message_was_us" };

    // 6. Escalação por palavra-chave: se a última msg do cliente bate, responde "Só um momento."
    const escalateKeywords = parseEscalateKeywords(cfg.escalateKeywords);
    const lastCustomerText = normalize(last.content ?? "");
    const matchedKeyword = escalateKeywords.find((k) =>
      k && lastCustomerText.includes(normalize(k))
    );

    let aiContent: string;

    if (matchedKeyword) {
      aiContent = "Só um momento.";
    } else {
      // 7. Montar histórico e chamar invokeLLM
      // O systemPrompt salvo no banco geralmente contém só regras de comportamento.
      // Concatenamos a base de conhecimento (businessContext) e os links para
      // garantir que a IA tenha tudo que precisa pra responder sem cair em
      // "Só um momento." indevidamente.
      const base = (cfg.systemPrompt && cfg.systemPrompt.trim().length > 0)
        ? cfg.systemPrompt
        : buildFallbackSystemPrompt(cfg);
      const pieces: string[] = [base];
      const businessText = (cfg.businessContext || "").trim();
      if (businessText && !base.includes(businessText.substring(0, 80))) {
        pieces.push(`\n\n===== BASE DE CONHECIMENTO =====\n${businessText}`);
      }
      const linkLines: string[] = [];
      if (cfg.catalogLink && !base.includes(cfg.catalogLink)) linkLines.push(`CATÁLOGO: ${cfg.catalogLink}`);
      if (cfg.groupLink && !base.includes(cfg.groupLink)) linkLines.push(`GRUPO WHATSAPP: ${cfg.groupLink}`);
      if (cfg.instagramLink && !base.includes(cfg.instagramLink)) linkLines.push(`INSTAGRAM/SITES: ${cfg.instagramLink}`);
      for (const e of parseExtraLinks(cfg.extraLinks)) {
        if (e.url && !base.includes(e.url)) linkLines.push(`${e.label}: ${e.url}`);
      }
      if (linkLines.length > 0) pieces.push(`\n\n===== LINKS ÚTEIS =====\n${linkLines.join("\n")}`);
      let systemPrompt = pieces.join("");
      if (!systemPrompt.includes(QTY_RULES_MARKER)) {
        systemPrompt += `\n\n${ORDER_QUANTITY_RULES_BLOCK}`;
      }
      if (!systemPrompt.includes(PRINTS_CONTEXT_MARKER)) {
        systemPrompt += `\n\n${PRINTS_ORDER_CONTEXT_BLOCK}`;
      }

      const customerImageCount = msgs.filter((m) => !m.fromMe && m.type === "image").length;
      if (customerImageCount > 0) {
        systemPrompt += `\n\n===== RESUMO AUTOMÁTICO DO TRECHO =====\nMensagens só de imagem/print enviadas pelo cliente neste contexto: ${customerImageCount}.`;
      }

      const tailTextParts = collectTrailingCustomerTextParts(msgs);
      const tailTextBlob = joinTrailingCustomerTextMessages(tailTextParts);
      const qtyAutoHint = buildOrderQuantitySystemHint(tailTextBlob);
      if (qtyAutoHint) {
        systemPrompt += `\n\n${qtyAutoHint}`;
      }
      if (tailTextParts.length >= 2) {
        systemPrompt += `\n\n===== MENSAGENS EM SEQUÊNCIA DO CLIENTE =====\nO cliente enviou ${tailTextParts.length} mensagens de texto seguidas antes desta resposta (sem mensagem nossa entre elas). Trate como um fluxo único: leia todas na ordem e só então conclua quantidades, mínimo de atacado ou confirmação.`;
      }

      const history = msgs.map((m) => {
        const hasMedia =
          !!(m.mediaUrl && String(m.mediaUrl).trim())
          || !!(m.mediaStorageKey && String(m.mediaStorageKey).trim());
        const text = m.content && m.content.trim().length > 0 ? m.content.trim() : "";
        const mediaHint =
          m.type === "audio"
            ? "[áudio sem transcrição]"
            : m.type === "image"
              ? hasMedia
                ? "[Cliente enviou 1 imagem/print — arquivo recebido no sistema]"
                : "[Cliente enviou 1 imagem/print — sem arquivo no sistema; peça reenvio se precisar do arquivo]"
              : m.type === "video"
                ? "[vídeo]"
                : m.type === "document"
                  ? "[documento]"
                  : m.type === "sticker"
                    ? "[figurinha]"
                    : m.type === "location"
                      ? "[localização]"
                      : "[mídia]";
        const content =
          text.length > 0
            ? m.type === "image"
              ? `${text}\n${mediaHint}`
              : text
            : mediaHint;
        return { role: m.fromMe ? ("assistant" as const) : ("user" as const), content };
      });

      const llmRes = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          ...history,
        ],
        max_tokens: 400,
      });

      const raw = llmRes?.choices?.[0]?.message?.content;
      const text = typeof raw === "string"
        ? raw
        : Array.isArray(raw)
          ? raw.map((p) => (typeof p === "object" && p && (p as any).type === "text" ? (p as any).text : "")).join("\n")
          : "";
      aiContent = (text || "").trim();
      if (!aiContent) return { ok: false, skipped: "empty_response" };
    }

    // 8. Delay humanizado
    const delayMs = pickResponseDelayMs(cfg.responseDelayMin ?? 3500, cfg.responseDelayMax ?? 9000);
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));

    // 9. Reverificar aiEnabled (humano pode ter assumido durante o delay)
    const [recheckRows] = await db.execute<any[]>(
      `SELECT aiEnabled, remoteJid FROM wa_conversations WHERE id = ? LIMIT 1`,
      [conversationId]
    );
    if (!recheckRows.length || !recheckRows[0].aiEnabled) {
      return { ok: false, skipped: "ai_disabled_after_delay" };
    }
    const remoteJid: string = recheckRows[0].remoteJid;

    // Reverificar também que ainda somos a última resposta a dar (cliente pode ter enviado outra msg
    // e outra invocação já está cuidando)
    const [latestRows] = await db.execute<any[]>(
      `SELECT fromMe FROM wa_messages WHERE conversationId = ? ORDER BY timestamp DESC LIMIT 1`,
      [conversationId]
    );
    if (latestRows.length && latestRows[0].fromMe) {
      return { ok: false, skipped: "last_message_was_us" };
    }

    const now = new Date();
    const aiName = cfg.aiName || "Ju";

    // 10. Persistir resposta + atualizar conversa
    const [insertRes] = await db.execute(
      `INSERT INTO wa_messages
         (conversationId, instanceId, fromMe, senderType, senderName, type, content, status, timestamp)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [conversationId, instanceId, true, "ai", aiName, "text", aiContent, "pending", now]
    ) as any;
    const newMsgId: number = insertRes.insertId;

    await db.execute(
      `UPDATE wa_conversations SET lastMessage=?, lastMessageAt=? WHERE id=?`,
      [aiContent.substring(0, 100), now, conversationId]
    );

    // Enviar via wa-bridge (best-effort: erro aqui não desfaz a mensagem)
    try {
      await sendFn(instanceId, remoteJid, aiContent);
    } catch (e) {
      console.error("[waAiResponder] Erro ao enviar via wa-bridge:", e);
      await db.execute(
        `UPDATE wa_messages SET status='failed' WHERE id=?`,
        [newMsgId]
      ).catch(() => undefined);
    }

    // 11. Se IA escalou para humano ("Só um momento."), desligar aiEnabled na conversa
    const escalated = SO_UM_MOMENTO_PREFIX.some((p) => normalize(aiContent).startsWith(p));
    if (escalated) {
      await db.execute(
        `UPDATE wa_conversations
            SET aiEnabled = false, aiDisabledBy = ?, aiDisabledAt = ?
          WHERE id = ?`,
        [`ai_escalation${matchedKeyword ? `:${matchedKeyword}` : ""}`, now, conversationId]
      );
      await db.execute(
        `INSERT INTO wa_ai_logs (conversationId, action, performedBy, details) VALUES (?,?,?,?)`,
        [conversationId, "escalated_to_human", aiName, matchedKeyword
          ? `Escalado por palavra-chave: ${matchedKeyword}`
          : "Escalado pela IA (resposta indica necessidade de humano)"]
      );
    } else {
      await db.execute(
        `INSERT INTO wa_ai_logs (conversationId, action, performedBy, details) VALUES (?,?,?,?)`,
        [conversationId, "ai_responded", aiName, aiContent.substring(0, 250)]
      );
    }

    return { ok: true, messageId: newMsgId, content: aiContent, escalated };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[waAiResponder] Erro:", msg);
    try {
      await db.execute(
        `INSERT INTO wa_ai_logs (conversationId, action, performedBy, details) VALUES (?,?,?,?)`,
        [conversationId, "error", "system", `generateAiResponse: ${msg}`.substring(0, 500)]
      );
    } catch { /* ignore */ }
    return { ok: false, skipped: "error", error: msg };
  }
}
