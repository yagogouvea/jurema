/**
 * waStatusClassifier.ts
 * Classificador automático de status de conversa via IA (GPT-4o mini)
 *
 * 4 regras de controle de custo:
 * 1. Analisa apenas mensagens do CLIENTE (não as da IA/atendente)
 * 2. Limita o histórico a 20 mensagens mais recentes
 * 3. Respeita alterações manuais por 30 minutos (statusLockedUntil)
 * 4. Usa GPT-4o mini (20x mais barato que GPT-4o)
 */

import { invokeLLM } from "../_core/llm";
import mysql from "mysql2/promise";
import { isWithinBusinessHoursSp, isStoreOpenNowSaoPaulo, parseAwaySchedule } from "./waHours";

export type ConvStatus = string;

interface Message {
  fromMe: boolean;
  content: string;
  createdAt: Date | string;
}

interface PresetRow {
  key: string;
  label: string;
  description: string | null;
  blocksAi: number | boolean;
  isActive: number | boolean;
}

async function loadActivePresets(db: mysql.Connection): Promise<PresetRow[]> {
  try {
    const [rows] = await db.execute<any[]>(
      `SELECT \`key\`, \`label\`, \`description\`, \`blocksAi\`, \`isActive\`
         FROM wa_status_presets
         WHERE isActive = 1
         ORDER BY sortOrder ASC, id ASC`
    );
    return (rows as PresetRow[]) || [];
  } catch (e) {
    console.warn("[waStatusClassifier] loadActivePresets falhou (fallback hardcoded):", e);
    return [];
  }
}

/** Pega o flag blocksAi de um preset; default false se não existir. */
export async function isStatusBlocking(db: mysql.Connection, statusKey: string): Promise<boolean> {
  try {
    const [rows] = await db.execute<any[]>(
      `SELECT blocksAi FROM wa_status_presets WHERE \`key\` = ? AND isActive = 1 LIMIT 1`,
      [statusKey]
    );
    if (!rows.length) {
      // Fallback para chaves do sistema antigo se a tabela não existir/preset removido.
      return statusKey === "spam" || statusKey === "finalizado" || statusKey === "intervencao";
    }
    return !!rows[0].blocksAi;
  } catch {
    return statusKey === "spam" || statusKey === "finalizado" || statusKey === "intervencao";
  }
}

/**
 * Classifica o status de uma conversa analisando o histórico de mensagens.
 * Devolve a chave do preset escolhido + resumo livre da IA em até 3 palavras (aiStatus).
 * Retorna null se o status não deve ser alterado (ex: bloqueio manual ativo).
 */
export async function classifyConversationStatus(
  db: mysql.Connection,
  conversationId: number
): Promise<{ status: ConvStatus; aiStatus: string; confidence: number } | null> {
  // 1. Verificar se o status está bloqueado por alteração manual
  const [convRows] = await db.execute<any[]>(
    `SELECT status, statusSetBy, statusLockedUntil FROM wa_conversations WHERE id = ?`,
    [conversationId]
  );

  if (!convRows.length) return null;

  const conv = convRows[0];

  // Regra 3: Respeitar bloqueio manual por 30 minutos
  if (conv.statusSetBy === "human" && conv.statusLockedUntil) {
    const lockedUntil = new Date(conv.statusLockedUntil);
    if (lockedUntil > new Date()) {
      return null; // Ainda bloqueado — não classificar
    }
  }

  // Regra 4: Não reclassificar "finalizado" automaticamente
  if (conv.status === "finalizado" && conv.statusSetBy === "human") {
    return null;
  }

  // Regra 1 + 2: Buscar apenas mensagens do cliente, máximo 20 mais recentes
  const [msgRows] = await db.execute<any[]>(
    `SELECT content, fromMe, createdAt
     FROM wa_messages
     WHERE conversationId = ?
     ORDER BY createdAt DESC
     LIMIT 20`,
    [conversationId]
  );

  if (!msgRows.length) return null;

  // Inverter para ordem cronológica
  const messages: Message[] = msgRows.reverse();

  // Filtrar apenas mensagens do cliente para análise (regra 1)
  const clientMessages = messages.filter((m) => !m.fromMe);
  if (!clientMessages.length) return null;

  // Montar histórico para o prompt (inclui contexto das respostas também)
  const historyText = messages
    .map((m) => {
      const role = m.fromMe ? "[ATENDENTE]" : "[CLIENTE]";
      const content = m.content ?? "";
      // Se for áudio com transcrição, exibir a transcrição
      if (content.startsWith("[Áudio]")) return `${role}: ${content}`;
      // Se for tipo de mídia sem conteúdo, indicar o tipo
      if (!content || content.startsWith("[")) return `${role}: [mídia]`;
      return `${role}: ${content}`;
    })
    .join("\n");

  const presets = await loadActivePresets(db);
  const fallbackKeys = ["novo", "em_atendimento", "aguardando", "proposta_enviada", "finalizado", "spam", "intervencao"];
  const enumKeys = presets.length > 0 ? presets.map((p) => p.key) : fallbackKeys;
  const statusOptions = presets.length > 0
    ? presets
        .map((p) => `- ${p.key} (${p.label})${p.description ? `: ${p.description}` : ""}${p.blocksAi ? " [BLOQUEIA IA]" : ""}`)
        .join("\n")
    : fallbackKeys.map((k) => `- ${k}`).join("\n");

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `Você é um classificador de status de conversas de atendimento ao cliente da Jurema Sport (loja de camisas de times). Analise TODO o histórico abaixo e devolva DOIS campos:

1) "status": escolha UMA CHAVE da lista abaixo, que melhor representa a categoria atual da conversa.
2) "aiStatus": um resumo LIVRE em PORTUGUÊS, ATÉ 3 PALAVRAS, descrevendo a situação real desta conversa neste momento. Exemplos: "Negociando atacado", "Pedindo medidas", "Aguardando pagamento", "Cliente novo curioso", "Comprando 6 camisas", "Conferindo preço".

Categorias disponíveis:
${statusOptions}

REGRAS CRÍTICAS:
- NUNCA classifique uma saudação ("Bom dia", "Oi", "Tudo bem?") como categoria que bloqueia a IA. Saudação é cliente fazendo contato — categoria "novo" ou "em_atendimento".
- "spam" SÓ para propaganda explícita de terceiros, links de concorrência, ofensas ou mensagem em massa. Em dúvida, NUNCA escolha spam.
- "intervencao" SÓ quando humano precisa assumir já: reclamação séria, pedido de gerente, erro grave, disputa, ou pedido explícito para falar com humano. Dúvidas de preço/produto NÃO são intervenção.
- "aiStatus" tem 3 palavras NO MÁXIMO, em português, sem aspas, sem pontuação final. Use verbos no gerúndio quando descrever ação ("Negociando", "Aguardando", "Comprando").

Responda APENAS com JSON no formato:
{"status": "<chave>", "aiStatus": "Resumo até 3 palavras", "confidence": 0.0}
onde confidence é um número entre 0 e 1.`,
        },
        {
          role: "user",
          content: `Classifique o status desta conversa:\n\n${historyText}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "status_classification",
          strict: true,
          schema: {
            type: "object",
            properties: {
              status: { type: "string", enum: enumKeys },
              aiStatus: { type: "string" },
              confidence: { type: "number" },
            },
            required: ["status", "aiStatus", "confidence"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = response?.choices?.[0]?.message?.content;
    if (!rawContent) return null;
    const content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
    const parsed = JSON.parse(content);

    if (!parsed.status || !enumKeys.includes(String(parsed.status))) {
      return null;
    }
    const aiStatus = String(parsed.aiStatus ?? "")
      .replace(/[\n\r"]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .slice(0, 3)
      .join(" ")
      .slice(0, 60);

    return {
      status: String(parsed.status) as ConvStatus,
      aiStatus: aiStatus || "",
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.8,
    };
  } catch (err) {
    console.error("[waStatusClassifier] Erro ao classificar status:", err);
    return null;
  }
}

/**
 * Aplica o status classificado pela IA na conversa.
 * Só atualiza se a confiança for >= 0.6.
 */
export async function applyAiStatus(
  db: mysql.Connection,
  conversationId: number
): Promise<void> {
  const result = await classifyConversationStatus(db, conversationId);
  if (!result) return;

  // Status que DESLIGAM a IA (blocksAi) exigem confiança alta para evitar falso positivo.
  const willBlock = await isStatusBlocking(db, result.status);
  const minConfidence = willBlock ? 0.85 : 0.6;
  if (result.confidence < minConfidence) {
    console.log(
      `[statusClassifier] conv=${conversationId} status=${result.status} aiStatus="${result.aiStatus}" confidence=${result.confidence.toFixed(2)} abaixo do limiar ${minConfidence} — mantendo status, mas salvando aiStatus.`
    );
    // Mesmo sem trocar o status fixo, atualiza o resumo livre da IA.
    if (result.aiStatus) {
      await db.execute(
        `UPDATE wa_conversations SET aiStatus = ?, aiStatusUpdatedAt = NOW() WHERE id = ?`,
        [result.aiStatus, conversationId]
      ).catch(() => undefined);
    }
    return;
  }

  await db.execute(
    `UPDATE wa_conversations
     SET status = ?, statusSetBy = 'ai', aiStatus = ?, aiStatusUpdatedAt = NOW(), updatedAt = NOW()
     WHERE id = ?`,
    [result.status, result.aiStatus, conversationId]
  );

  // Se o preset bloqueia a IA, desativa também aiEnabled para evidência visual no painel.
  if (willBlock) {
    await db.execute(
      `UPDATE wa_conversations
       SET aiEnabled = false, aiDisabledBy = ?, aiDisabledAt = NOW()
       WHERE id = ?`,
      [`status_${result.status}`, conversationId]
    );
    await db.execute(
      `INSERT INTO wa_ai_logs (conversationId, action, performedBy, details) VALUES (?,?,?,?)`,
      [conversationId, "escalated_to_human", "system", `Status classificado como "${result.status}" (${result.aiStatus}) — IA desativada nesta conversa.`]
    ).catch(() => undefined);
  }
}

/**
 * Verifica se o horário atual está dentro do período de atendimento (relógio de São Paulo).
 * awayStart = horário em que a loja FECHA (ex: "15:00")
 * awayEnd   = horário em que a loja ABRE  (ex: "06:00")
 */
export function isWithinBusinessHours(awayStart: string, awayEnd: string): boolean {
  return isWithinBusinessHoursSp(awayStart, awayEnd);
}

/**
 * Verifica se deve enviar mensagem de ausência para esta conversa.
 * Retorna a mensagem de ausência se deve ser enviada, ou null caso contrário.
 *
 * Regras:
 * 1. awayEnabled deve ser true
 * 2. Deve estar fora do horário de atendimento
 * 3. A última mensagem enviada (fromMe) não deve ser de ausência (evita reenvio)
 */
export async function checkAwayMessage(
  db: mysql.Connection,
  conversationId: number,
  instanceId: number
): Promise<string | null> {
  // Buscar config da IA para esta instância
  const [configRows] = await db.execute<any[]>(
    `SELECT awayEnabled, awayStart, awayEnd, awayMessage, awaySchedule FROM wa_ai_config WHERE instanceId = ?`,
    [instanceId]
  );
  if (!configRows.length) return null;
  const config = configRows[0];
  if (!config.awayEnabled || !config.awayMessage) return null;

  const sched = parseAwaySchedule(config.awaySchedule);
  const hasCustomSchedule =
    sched &&
    Object.keys(sched).length > 0 &&
    Object.values(sched).some((r: any) => r && typeof r === "object" && "mode" in r);
  if (!hasCustomSchedule && (!config.awayStart || !config.awayEnd)) return null;

  const isOpen = isStoreOpenNowSaoPaulo({
    awayEnabled: true,
    awayStart: config.awayStart,
    awayEnd: config.awayEnd,
    awaySchedule: config.awaySchedule,
  });
  if (isOpen) return null; // Dentro do horário — IA responde normalmente

  // Verificar se a última mensagem enviada já foi a de ausência (evita spam)
  const [lastMsgRows] = await db.execute<any[]>(
    `SELECT content FROM wa_messages
     WHERE conversationId = ? AND fromMe = 1
     ORDER BY timestamp DESC LIMIT 1`,
    [conversationId]
  );
  if (lastMsgRows.length && lastMsgRows[0].content === config.awayMessage) {
    return null; // Já enviou a mensagem de ausência recentemente
  }

  return config.awayMessage as string;
}

/**
 * Marca o status como definido por humano e bloqueia por 30 minutos.
 */
export async function lockStatusByHuman(
  db: mysql.Connection,
  conversationId: number,
  status: ConvStatus
): Promise<void> {
  const lockedUntil = new Date(Date.now() + 30 * 60 * 1000); // +30 minutos

  await db.execute(
    `UPDATE wa_conversations
     SET status = ?, statusSetBy = 'human', statusLockedUntil = ?, updatedAt = NOW()
     WHERE id = ?`,
    [status, lockedUntil, conversationId]
  );
}
