/**
 * Router tRPC — Módulo WhatsApp IA
 * Toda a lógica de instâncias, conversas, mensagens e configuração da IA.
 * Integrado ao wa-bridge (Baileys) para envio/recebimento real de mensagens.
 */

import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import mysql from "mysql2/promise";
import type { Request } from "express";
import { verifyPdvToken } from "./pdvAuth";
import { buildSystemPrompt, mergeDbRowWithDefaults } from "./waAiTrainingDefaults";
import { refineAiTrainingFromNaturalLanguage, refineTrainingInputSchema } from "./waAiTrainingRefine";

async function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DATABASE_URL não configurado" });
  return mysql.createConnection(url);
}

// ─── Helpers de permissão ─────────────────────────────────────────────────────

/** Aceita usuários Manus OAuth (admin) ou vendedores PDV autenticados */
async function requireWaAccess(ctx: any): Promise<{ name: string; role: string }> {
  const req = ctx.req as Request;
  // 1. Tenta cookie pdv_token
  const sellerFromCookie = await verifyPdvToken(req).catch(() => null);
  if (sellerFromCookie) return { name: sellerFromCookie.name, role: sellerFromCookie.role };
  // 2. Tenta header Authorization: Bearer <pdv_token>
  const authHeader = req.headers.authorization || "";
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    // Verificar se é token PDV (JWT)
    try {
      const { jwtVerify } = await import("jose");
      const secret = new TextEncoder().encode(process.env.JWT_SECRET || "pdv_jwt_secret_fallback");
      const { payload } = await jwtVerify(token, secret);
      const p = payload as any;
      if (p.sellerId) return { name: p.name, role: p.role };
    } catch { /* não é token PDV */ }
  }
  // 3. Fallback: usuário Manus OAuth
  if (ctx.user) return { name: ctx.user.name ?? "Atendente", role: ctx.user.role ?? "user" };
  throw new TRPCError({ code: "UNAUTHORIZED" });
}

async function requireWaAdmin(ctx: any): Promise<{ name: string; role: string }> {
  const user = await requireWaAccess(ctx);
  // Aceita: admin PDV, gerente PDV, ou owner Manus OAuth
  if (user.role !== "admin" && user.role !== "gerente" && user.role !== "owner") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem realizar esta ação." });
  }
  return user;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const waRouter = router({

  // ── Instâncias ──────────────────────────────────────────────────────────────

  listInstances: publicProcedure.query(async ({ ctx }) => {
    await requireWaAccess(ctx);
    const db = await getDb();
    try {
      const [rows] = await db.execute(
        `SELECT i.*, IFNULL(ac.\`enabled\`, 0) AS aiEnabledGlobal
         FROM wa_instances i
         LEFT JOIN wa_ai_config ac ON ac.instanceId = i.id
         ORDER BY i.id`
      );
      return rows as any[];
    } finally { await db.end(); }
  }),

  /** Liga/desliga a IA automática só para esta instância (wa_ai_config.enabled). */
  setInstanceAiEnabled: publicProcedure
    .input(z.object({ instanceId: z.number(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await requireWaAdmin(ctx);
      const db = await getDb();
      try {
        const [rows] = await db.execute("SELECT id FROM wa_ai_config WHERE instanceId=?", [input.instanceId]) as any;
        if (rows[0]) {
          await db.execute("UPDATE wa_ai_config SET `enabled`=? WHERE instanceId=?", [input.enabled, input.instanceId]);
        } else {
          await db.execute(
            "INSERT INTO wa_ai_config (instanceId, enabled, aiName) VALUES (?,?,?)",
            [input.instanceId, input.enabled, "Ju"]
          );
        }
        return { success: true };
      } finally { await db.end(); }
    }),

  /** Aplica mensagem de ausência + grade de horários a uma ou mais instâncias de uma vez. */
  saveAwayBatch: publicProcedure
    .input(z.object({
      instanceIds: z.array(z.number()).min(1),
      awayEnabled: z.boolean(),
      awayMessage: z.string().min(1),
      awayStart: z.string().optional(),
      awayEnd: z.string().optional(),
      awaySchedule: z.record(z.string(), z.unknown()).nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireWaAdmin(ctx);
      const db = await getDb();
      try {
        const schedJson =
          input.awaySchedule === null || input.awaySchedule === undefined
            ? null
            : JSON.stringify(input.awaySchedule);
        const aStart = input.awayStart ?? "15:00";
        const aEnd = input.awayEnd ?? "06:00";
        for (const iid of input.instanceIds) {
          const [ex] = await db.execute("SELECT id FROM wa_ai_config WHERE instanceId=?", [iid]) as any;
          if (ex[0]) {
            await db.execute(
              `UPDATE wa_ai_config SET awayEnabled=?, awayMessage=?, awayStart=?, awayEnd=?, awaySchedule=?, updatedAt=NOW() WHERE instanceId=?`,
              [input.awayEnabled, input.awayMessage, aStart, aEnd, schedJson, iid]
            );
          } else {
            await db.execute(
              `INSERT INTO wa_ai_config (instanceId, enabled, aiName, awayEnabled, awayMessage, awayStart, awayEnd, awaySchedule)
               VALUES (?, 0, 'Ju', ?, ?, ?, ?, ?)`,
              [iid, input.awayEnabled, input.awayMessage, aStart, aEnd, schedJson]
            );
          }
        }
        return { success: true };
      } finally { await db.end(); }
    }),

  upsertInstance: publicProcedure
    .input(z.object({
      id: z.number().optional(),
      name: z.string().min(1).max(100),
      phone: z.string().min(10).max(20),
      instanceId: z.string().optional(),
      apiKey: z.string().optional(),
      webhookUrl: z.string().optional(),
      active: z.union([z.boolean(), z.number()]).optional().transform(v => v === undefined ? undefined : Boolean(v)),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireWaAdmin(ctx);
      const db = await getDb();
      try {
        if (input.id) {
          await db.execute(
            "UPDATE wa_instances SET name=?, phone=?, instanceId=?, apiKey=?, webhookUrl=?, active=? WHERE id=?",
            [input.name, input.phone, input.instanceId ?? null, input.apiKey ?? null, input.webhookUrl ?? null, input.active ?? true, input.id]
          );
          return { success: true };
        }
        const [result] = await db.execute(
          "INSERT INTO wa_instances (name, phone, instanceId, apiKey, webhookUrl, active, status) VALUES (?,?,?,?,?,?,?)",
          [input.name, input.phone, input.instanceId ?? null, input.apiKey ?? null, input.webhookUrl ?? null, input.active ?? true, "disconnected"]
        ) as any;
        return { success: true, id: result.insertId };
      } finally { await db.end(); }
    }),

  updateInstanceStatus: publicProcedure
    .input(z.object({
      instanceId: z.number(),
      status: z.enum(["disconnected", "connecting", "connected", "error"]),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireWaAdmin(ctx);
      const db = await getDb();
      try {
        await db.execute("UPDATE wa_instances SET status=? WHERE id=?", [input.status, input.instanceId]);
        return { success: true };
      } finally { await db.end(); }
    }),

  // ── Conversas ───────────────────────────────────────────────────────────────

  listConversations: publicProcedure
    .input(z.object({
      instanceId: z.number().optional(), // 0 ou undefined = todos os números
      status: z.enum(["novo", "em_atendimento", "aguardando", "proposta_enviada", "finalizado", "spam", "intervencao"]).optional(),
      aiEnabled: z.boolean().optional(),
      unreadOnly: z.boolean().optional(),
      search: z.string().optional(),
      limit: z.number().min(1).max(200).default(100),
      offset: z.number().default(0),
    }))
    .query(async ({ ctx, input }) => {
      await requireWaAccess(ctx);
      const db = await getDb();
      try {
        let sql = `
          SELECT c.*, i.name AS instanceName, i.phone AS instancePhone
          FROM wa_conversations c
          LEFT JOIN wa_instances i ON i.instanceId = c.instanceId
          WHERE 1=1
        `;
        const params: any[] = [];
        if (input.instanceId && input.instanceId > 0) {
          sql += " AND c.instanceId=?";
          params.push(input.instanceId);
        }
        if (input.status) { sql += " AND c.status=?"; params.push(input.status); }
        if (input.aiEnabled !== undefined) { sql += " AND c.aiEnabled=?"; params.push(input.aiEnabled); }
        if (input.unreadOnly) { sql += " AND c.unreadCount > 0"; }
        if (input.search) {
          sql += " AND (c.contactName LIKE ? OR c.contactPhone LIKE ?)";
          params.push(`%${input.search}%`, `%${input.search}%`);
        }
        const safeLimit = Math.max(1, Math.min(200, Math.floor(input.limit)));
        const safeOffset = Math.max(0, Math.floor(input.offset ?? 0));
        sql += ` ORDER BY c.lastMessageAt DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`;
        const [rows] = await db.execute(sql, params);
        return rows as any[];
      } finally { await db.end(); }
    }),

  // Contagem de conversas por status (para badges nos filtros)
  countByStatus: publicProcedure
    .input(z.object({ instanceId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      await requireWaAccess(ctx);
      const db = await getDb();
      try {
        let sql = "SELECT status, COUNT(*) as count, SUM(unreadCount) as unread FROM wa_conversations WHERE 1=1";
        const params: any[] = [];
        if (input.instanceId && input.instanceId > 0) { sql += " AND instanceId=?"; params.push(input.instanceId); }
        sql += " GROUP BY status";
        const [rows] = await db.execute(sql, params) as any;
        const result: Record<string, { count: number; unread: number }> = {};
        for (const row of rows) {
          result[row.status] = { count: Number(row.count), unread: Number(row.unread ?? 0) };
        }
        return result;
      } finally { await db.end(); }
    }),

  getConversation: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireWaAccess(ctx);
      const db = await getDb();
      try {
        const [rows] = await db.execute("SELECT * FROM wa_conversations WHERE id=?", [input.id]) as any;
        if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND" });
        return rows[0];
      } finally { await db.end(); }
    }),

  markAsRead: publicProcedure
    .input(z.object({ conversationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireWaAccess(ctx);
      const db = await getDb();
      try {
        await db.execute("UPDATE wa_conversations SET unreadCount=0 WHERE id=?", [input.conversationId]);
        return { success: true };
      } finally { await db.end(); }
    }),

  toggleAi: publicProcedure
    .input(z.object({
      conversationId: z.number(),
      enabled: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await requireWaAccess(ctx);
      const db = await getDb();
      try {
        const now = new Date();
        if (input.enabled) {
          await db.execute(
            "UPDATE wa_conversations SET aiEnabled=true, aiDisabledBy=NULL, aiDisabledAt=NULL WHERE id=?",
            [input.conversationId]
          );
        } else {
          await db.execute(
            "UPDATE wa_conversations SET aiEnabled=false, aiDisabledBy=?, aiDisabledAt=? WHERE id=?",
            [user.name, now, input.conversationId]
          );
        }
        await db.execute(
          "INSERT INTO wa_ai_logs (conversationId, action, performedBy, details) VALUES (?,?,?,?)",
          [input.conversationId, input.enabled ? "ai_enabled" : "ai_disabled", user.name, input.enabled ? "IA reativada" : "IA desativada"]
        );
        return { success: true };
      } finally { await db.end(); }
    }),

  // Atualiza status (com lock de 30min) e/ou anotações de uma conversa
  updateConversation: publicProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["novo", "em_atendimento", "aguardando", "proposta_enviada", "finalizado", "spam", "intervencao"]).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireWaAccess(ctx);
      const db = await getDb();
      try {
        // Se status foi alterado manualmente, usar lockStatusByHuman (bloqueia IA por 30min)
        if (input.status !== undefined) {
          const { lockStatusByHuman } = await import("./waStatusClassifier");
          await lockStatusByHuman(db as any, input.id, input.status);
        }
        // Atualizar anotações separadamente (não afeta o lock de status)
        if (input.notes !== undefined) {
          await db.execute(
            "UPDATE wa_conversations SET notes=?, updatedAt=NOW() WHERE id=?",
            [input.notes, input.id]
          );
        }
        return { success: true };
      } finally { await db.end(); }
    }),

  // Libera o lock manual e devolve o controle de status para a IA
  unlockAiStatus: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireWaAccess(ctx);
      const db = await getDb();
      try {
        await db.execute(
          `UPDATE wa_conversations
           SET statusSetBy = 'ai', statusLockedUntil = NULL, updatedAt = NOW()
           WHERE id = ?`,
          [input.id]
        );
        // Reclassificar imediatamente via IA
        const { applyAiStatus } = await import("./waStatusClassifier");
        applyAiStatus(db as any, input.id).catch(e =>
          console.error("[unlockAiStatus] Erro ao reclassificar:", e)
        );
        return { success: true };
      } finally { await db.end(); }
    }),

  // ── Mensagens ───────────────────────────────────────────────────────────────
  listMessages: publicProcedure
    .input(z.object({
      conversationId: z.number(),
      limit: z.number().min(1).max(200).default(50),
      before: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await requireWaAccess(ctx);
      const db = await getDb();
      try {
        let sql = "SELECT * FROM wa_messages WHERE conversationId=?";
        const params: any[] = [input.conversationId];
        if (input.before) { sql += " AND id<?"; params.push(input.before); }
        const safeLimit2 = Math.max(1, Math.min(200, Math.floor(input.limit)));
        sql += ` ORDER BY timestamp DESC LIMIT ${safeLimit2}`;
        const [rows] = await db.execute(sql, params);
        return (rows as any[]).reverse(); // retorna em ordem cronológica
      } finally { await db.end(); }
    }),

  sendMessage: publicProcedure
    .input(z.object({
      conversationId: z.number(),
      content: z.string().min(1),
      type: z.enum(["text", "image", "audio", "video", "document"]).default("text"),
      mediaUrl: z.string().optional(),
      mediaCaption: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await requireWaAccess(ctx);
      const db = await getDb();
      try {
        const [convRows] = await db.execute("SELECT * FROM wa_conversations WHERE id=?", [input.conversationId]) as any;
        if (!convRows[0]) throw new TRPCError({ code: "NOT_FOUND" });
        const conv = convRows[0];
        const now = new Date();

        const [result] = await db.execute(
          "INSERT INTO wa_messages (conversationId, instanceId, fromMe, senderType, senderName, type, content, mediaUrl, mediaCaption, status, timestamp) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
          [input.conversationId, conv.instanceId, true, "human", user.name, input.type, input.content, input.mediaUrl ?? null, input.mediaCaption ?? null, "pending", now]
        ) as any;

        await db.execute(
          "UPDATE wa_conversations SET lastMessage=?, lastMessageAt=? WHERE id=?",
          [input.content.substring(0, 100), now, input.conversationId]
        );

        // Enviar via wa-bridge (Baileys) se configurado
        callWaBridge(conv.instanceId, conv.remoteJid, input.content).catch(e =>
          console.error("[sendMessage] Erro ao chamar wa-bridge:", e)
        );

        return { success: true, messageId: result.insertId };
      } finally { await db.end(); }
    }),

  // Webhook público para receber mensagens do evocloud.pro (sem autenticação)
  receiveWebhook: publicProcedure
    .input(z.object({
      instanceId: z.number(),
      remoteJid: z.string(),
      messageId: z.string(),
      fromMe: z.boolean(),
      type: z.string(),
      content: z.string().optional(),
      mediaUrl: z.string().optional(),
      mediaBase64: z.string().optional(),
      mediaMimeType: z.string().optional(),
      timestamp: z.number(),
      contactName: z.string().optional(),
      contactPhone: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      try {
        // Normalizar remoteJid: remover sufixo de device multi-device (ex: 5511999:1@s.whatsapp.net → 5511999@s.whatsapp.net)
        const normalizedJid = input.remoteJid.replace(/:(\d+)@/, "@");

        // Ignorar mensagens sem conteúdo real (segurança extra no servidor)
        const hasContent = input.content && input.content.trim().length > 0;
        const MEDIA_TYPES = ["image", "video", "audio", "document", "sticker", "location", "contact"];
        const isMediaType = MEDIA_TYPES.includes(input.type);
        if (!hasContent && !isMediaType) {
          return { ok: true, skipped: true, reason: "empty_content" };
        }

        // Ignorar mensagens duplicadas (mesmo messageId já existe)
        if (input.messageId) {
          const [existingMsg] = await db.execute(
            "SELECT id FROM wa_messages WHERE messageId=? LIMIT 1",
            [input.messageId]
          ) as any;
          if (existingMsg[0]) {
            return { ok: true, skipped: true, reason: "duplicate_message" };
          }
        }

        // Buscar conversa pelo JID normalizado (também tenta o JID original para retrocompatibilidade)
        const [convRows] = await db.execute(
          "SELECT * FROM wa_conversations WHERE instanceId=? AND (remoteJid=? OR remoteJid=?) ORDER BY id ASC LIMIT 1",
          [input.instanceId, normalizedJid, input.remoteJid]
        ) as any;

        const msgTimestamp = new Date(input.timestamp * 1000);
        let conversationId: number;

        if (!convRows[0]) {
          // Nova conversa — status inicial 'novo', classificado por IA
          const [newConv] = await db.execute(
            "INSERT INTO wa_conversations (instanceId, remoteJid, contactName, contactPhone, lastMessage, lastMessageAt, unreadCount, aiEnabled, status, statusSetBy) VALUES (?,?,?,?,?,?,?,?,?,?)",
            // Só usa contactName/Phone do payload quando a mensagem é do cliente (fromMe=false)
            [input.instanceId, normalizedJid, input.fromMe ? null : (input.contactName ?? null), input.fromMe ? null : (input.contactPhone ?? null), input.content?.substring(0, 100) ?? null, msgTimestamp, input.fromMe ? 0 : 1, true, "novo", "ai"]
          ) as any;
          conversationId = newConv.insertId;
        } else {
          const conv = convRows[0];
          conversationId = conv.id;
          // Se o JID armazenado não está normalizado, atualizar
          if (conv.remoteJid !== normalizedJid) {
            await db.execute("UPDATE wa_conversations SET remoteJid=? WHERE id=?", [normalizedJid, conv.id]);
          }
          // Atualizar nome: só atualiza contactName quando a mensagem é do CLIENTE (fromMe=false)
          // Mensagens do próprio número (fromMe=true) trazem o nome do atendente, não do contato
          const newName = !input.fromMe && input.contactName && input.contactName.trim() ? input.contactName.trim() : null;
          await db.execute(
            `UPDATE wa_conversations SET lastMessage=?, lastMessageAt=?, unreadCount=?,
             contactName=${newName ? '?' : 'COALESCE(?,contactName)'},
             contactPhone=${!input.fromMe && input.contactPhone ? '?' : 'COALESCE(?,contactPhone)'} WHERE id=?`,
            newName
              ? [input.content?.substring(0, 100) ?? null, msgTimestamp, input.fromMe ? conv.unreadCount : conv.unreadCount + 1, newName, !input.fromMe && input.contactPhone ? input.contactPhone : null, conv.id]
              : [input.content?.substring(0, 100) ?? null, msgTimestamp, input.fromMe ? conv.unreadCount : conv.unreadCount + 1, null, !input.fromMe && input.contactPhone ? input.contactPhone : null, conv.id]
          );
        }

        // Normalizar o type para os valores aceitos pelo ENUM do banco
        const VALID_MSG_TYPES = ["text", "image", "audio", "video", "document", "sticker", "location", "contact", "reaction"];
        const normalizeType = (t: string): string => {
          if (VALID_MSG_TYPES.includes(t)) return t;
          if (t.includes("image")) return "image";
          if (t.includes("video")) return "video";
          if (t.includes("audio")) return "audio";
          if (t.includes("document")) return "document";
          if (t.includes("sticker")) return "sticker";
          if (t.includes("location")) return "location";
          if (t.includes("contact")) return "contact";
          if (t.includes("reaction")) return "reaction";
          return "text"; // fallback: conversation, extendedTextMessage, etc.
        };
        const msgType = normalizeType(input.type);

        // Upload de mídia para S3 se vier base64 do wa-bridge
        let finalMediaUrl: string | null = input.mediaUrl ?? null;
        if (input.mediaBase64 && input.mediaMimeType) {
          try {
            const { storagePut } = await import("../storage");
            const buf = Buffer.from(input.mediaBase64, "base64");
            const ext = input.mediaMimeType.split("/")[1]?.split(";")[0] ?? "bin";
            const key = `wa-media/${input.instanceId}/${input.messageId ?? Date.now()}.${ext}`;
            const { url } = await storagePut(key, buf, input.mediaMimeType);
            finalMediaUrl = url;
          } catch (e) {
            console.error("[webhook] Erro ao fazer upload de mídia para S3:", e);
          }
        }

        const [insertedMsg] = await db.execute(
          "INSERT INTO wa_messages (conversationId, instanceId, messageId, fromMe, senderType, type, content, mediaUrl, status, timestamp) VALUES (?,?,?,?,?,?,?,?,?,?)",
          [conversationId, input.instanceId, input.messageId, input.fromMe, input.fromMe ? "human" : "customer", msgType, input.content ?? null, finalMediaUrl, "delivered", msgTimestamp]
        ) as any;
        const insertedMsgId = insertedMsg.insertId;

        // Transcrição assíncrona de áudio
        if (msgType === "audio" && finalMediaUrl) {
          setImmediate(async () => {
            const transcribeDb = await getDb();
            try {
              const { transcribeAudio } = await import("../_core/voiceTranscription");
              const result = await transcribeAudio({ audioUrl: finalMediaUrl! });
              if (result && !('error' in result) && result.text) {
                await transcribeDb.execute(
                  "UPDATE wa_messages SET content=? WHERE id=?",
                  [`[Áudio] ${result.text}`, insertedMsgId]
                );
                console.log(`[webhook] Transcrição de áudio salva para mensagem ${insertedMsgId}`);
              }
            } catch (e) {
              console.error("[webhook] Erro ao transcrever áudio:", e);
            } finally { await transcribeDb.end(); }
          });
        }

        const capturedConvId = conversationId;
        const capturedRemoteJid = input.remoteJid;
        const capturedInstanceId = input.instanceId;
        const capturedFromMe = input.fromMe;
        // Retornar imediatamente e processar de forma assíncrona com nova conexão
        setImmediate(async () => {
          if (capturedFromMe) return;
          const asyncDb = await getDb();
          try {
            const { applyAiStatus, checkAwayMessage } = await import("./waStatusClassifier");
            const awayMsg = await checkAwayMessage(asyncDb as any, capturedConvId, capturedInstanceId).catch(() => null);
            let awaySent = false;
            if (awayMsg) {
              await asyncDb.execute(
                "INSERT INTO wa_messages (conversationId, instanceId, fromMe, senderType, senderName, type, content, status, timestamp) VALUES (?,?,?,?,?,?,?,?,?)",
                [capturedConvId, capturedInstanceId, true, "ai", "Ju", "text", awayMsg, "delivered", new Date()]
              );
              await asyncDb.execute(
                "UPDATE wa_conversations SET lastMessage=?, lastMessageAt=NOW() WHERE id=?",
                [awayMsg.substring(0, 100), capturedConvId]
              );
              callWaBridge(capturedInstanceId, capturedRemoteJid, awayMsg).catch(e =>
                console.error("[webhook] Erro ao enviar ausência via wa-bridge:", e)
              );
              awaySent = true;
              console.log(`[webhook] Mensagem de ausência enviada para conversa ${capturedConvId}`);
            }
            await applyAiStatus(asyncDb as any, capturedConvId).catch(e =>
              console.error("[webhook] Erro ao classificar status via IA:", e)
            );
            // Geração de resposta automática pela IA
            // - Só dispara se não tivermos enviado a awayMessage (fora do horário)
            // - generateAiResponse já verifica enabled/aiEnabled/horário/escalação/anti-loop
            if (!awaySent) {
              try {
                const { generateAiResponse } = await import("./waAiResponder");
                const result = await generateAiResponse(
                  asyncDb as any,
                  capturedConvId,
                  capturedInstanceId,
                  (iid, jid, content) => callWaBridge(iid, jid, content)
                );
                if (result.ok) {
                  console.log(`[webhook] IA respondeu conversa ${capturedConvId}${result.escalated ? " (escalada)" : ""}: ${result.content.substring(0, 80)}`);
                } else if (result.skipped !== "last_message_was_us" && result.skipped !== "ai_disabled_after_delay") {
                  console.log(`[webhook] IA pulou conversa ${capturedConvId}: ${result.skipped}`);
                }
              } catch (e) {
                console.error("[webhook] Erro ao gerar resposta IA:", e);
              }
            }
          } finally { await asyncDb.end(); }
        });
        return { success: true, conversationId };
      } finally { await db.end(); }
    }),

  // ── Configuração da IA ──────────────────────────────────────────────────────

  getAiConfig: protectedProcedure
    .input(z.object({ instanceId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireWaAccess(ctx);
      const db = await getDb();
      try {
        const [rows] = await db.execute("SELECT * FROM wa_ai_config WHERE instanceId=?", [input.instanceId]) as any;
        return mergeDbRowWithDefaults(rows[0], input.instanceId);
      } finally { await db.end(); }
    }),

  /** Texto modelo completo (sem usar o banco) — botão "recarregar rascunho" no Treinamento IA. */
  getAiTrainingDefaults: protectedProcedure.query(async ({ ctx }) => {
    await requireWaAccess(ctx);
    return mergeDbRowWithDefaults(null, 0);
  }),

  /**
   * Lê o pedido em linguagem natural + treinamento atual e devolve proposta de alterações (ou recusa).
   * Só admin. Não grava no banco — o cliente confirma no painel e salva depois.
   */
  refineAiTrainingFromRequest: protectedProcedure
    .input(refineTrainingInputSchema)
    .mutation(async ({ ctx, input }) => {
      await requireWaAdmin(ctx);
      try {
        return await refineAiTrainingFromNaturalLanguage(input);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Erro ao consultar a IA";
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: msg });
      }
    }),

  saveAiConfig: protectedProcedure
    .input(z.object({
      instanceId: z.number(),
      enabled: z.boolean().optional(),
      aiName: z.string().optional(),
      personality: z.string().optional(),
      businessContext: z.string().optional(),
      greetingMessage: z.string().optional(),
      awayMessage: z.string().optional(),
      awayEnabled: z.boolean().optional(),
      awayStart: z.string().optional(),
      awayEnd: z.string().optional(),
      awaySchedule: z.record(z.string(), z.unknown()).optional().nullable(),
      catalogLink: z.string().optional(),
      groupLink: z.string().optional(),
      instagramLink: z.string().optional(),
      maxContextMessages: z.number().min(1).max(50).optional(),
      responseDelayMin: z.number().min(0).max(10000).optional(),
      responseDelayMax: z.number().min(0).max(30000).optional(),
      escalateKeywords: z.array(z.string()).optional(),
      /** Se preenchido, grava no banco como está (instruções avançadas). Se vazio, gera a partir dos demais campos. */
      systemPrompt: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireWaAdmin(ctx);
      const db = await getDb();
      try {
        const {
          instanceId,
          escalateKeywords,
          systemPrompt: systemPromptInput,
          awaySchedule: awayScheduleInput,
          ...dataRaw
        } = input;

        const systemPromptFinal =
          systemPromptInput !== undefined && String(systemPromptInput).trim().length > 0
            ? String(systemPromptInput).trim()
            : buildSystemPrompt(input);

        const keywordsJson = escalateKeywords ? JSON.stringify(escalateKeywords) : null;

        const data: Record<string, unknown> = { ...dataRaw };
        if (awayScheduleInput !== undefined) {
          data.awaySchedule =
            awayScheduleInput === null ? null : JSON.stringify(awayScheduleInput);
        }

        const [existing] = await db.execute("SELECT id FROM wa_ai_config WHERE instanceId=?", [instanceId]) as any;
        if (existing[0]) {
          const entries = Object.entries(data).filter(([, v]) => v !== undefined);
          const sets = entries.map(([k]) => `\`${k}\`=?`);
          const vals = entries.map(([, v]) => v);
          if (keywordsJson !== null) { sets.push("`escalateKeywords`=?"); vals.push(keywordsJson); }
          sets.push("`systemPrompt`=?"); vals.push(systemPromptFinal);
          vals.push(instanceId);
          await db.execute(`UPDATE wa_ai_config SET ${sets.join(",")} WHERE instanceId=?`, vals);
        } else {
          const d = data as any;
          await db.execute(
            "INSERT INTO wa_ai_config (instanceId, enabled, aiName, personality, businessContext, greetingMessage, awayMessage, awayEnabled, awayStart, awayEnd, awaySchedule, catalogLink, groupLink, instagramLink, maxContextMessages, responseDelayMin, responseDelayMax, escalateKeywords, systemPrompt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [
              instanceId,
              d.enabled ?? false,
              d.aiName ?? "Ju",
              d.personality ?? null,
              d.businessContext ?? null,
              d.greetingMessage ?? null,
              d.awayMessage ?? null,
              d.awayEnabled ?? false,
              d.awayStart ?? null,
              d.awayEnd ?? null,
              d.awaySchedule ?? null,
              d.catalogLink ?? null,
              d.groupLink ?? null,
              d.instagramLink ?? null,
              d.maxContextMessages ?? 10,
              d.responseDelayMin ?? 1000,
              d.responseDelayMax ?? 3000,
              keywordsJson,
              systemPromptFinal,
            ]
          );
        }
        return { success: true, systemPrompt: systemPromptFinal };
      } finally { await db.end(); }
    }),

  // ── Respostas Rápidas ───────────────────────────────────────────────────────

  listQuickReplies: protectedProcedure
    .input(z.object({ instanceId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      await requireWaAccess(ctx);
      const db = await getDb();
      try {
        let sql = "SELECT * FROM wa_quick_replies WHERE active=true";
        const params: any[] = [];
        if (input.instanceId) {
          sql += " AND (instanceId IS NULL OR instanceId=?)";
          params.push(input.instanceId);
        }
        sql += " ORDER BY category, title";
        const [rows] = await db.execute(sql, params);
        return rows as any[];
      } finally { await db.end(); }
    }),

  upsertQuickReply: protectedProcedure
    .input(z.object({
      id: z.number().optional(),
      instanceId: z.number().optional(),
      title: z.string().min(1).max(100),
      shortcut: z.string().optional(),
      content: z.string().min(1),
      category: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireWaAdmin(ctx);
      const db = await getDb();
      try {
        if (input.id) {
          await db.execute(
            "UPDATE wa_quick_replies SET title=?, shortcut=?, content=?, category=? WHERE id=?",
            [input.title, input.shortcut ?? null, input.content, input.category ?? null, input.id]
          );
          return { success: true };
        }
        const [result] = await db.execute(
          "INSERT INTO wa_quick_replies (instanceId, title, shortcut, content, category, active) VALUES (?,?,?,?,?,true)",
          [input.instanceId ?? null, input.title, input.shortcut ?? null, input.content, input.category ?? null]
        ) as any;
        return { success: true, id: result.insertId };
      } finally { await db.end(); }
    }),

  deleteQuickReply: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireWaAdmin(ctx);
      const db = await getDb();
      try {
        await db.execute("UPDATE wa_quick_replies SET active=false WHERE id=?", [input.id]);
        return { success: true };
      } finally { await db.end(); }
    }),

  // ── Métricas ─────────────────────────────────────────────────────────────────

  getMetrics: protectedProcedure
    .input(z.object({ instanceId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      await requireWaAccess(ctx);
      const db = await getDb();
      try {
        const cond = input.instanceId ? "WHERE instanceId=?" : "";
        const params = input.instanceId ? [input.instanceId] : [];
        const [[total]] = await db.execute(`SELECT COUNT(*) as cnt FROM wa_conversations ${cond}`, params) as any;
        const [[aiActive]] = await db.execute(`SELECT COUNT(*) as cnt FROM wa_conversations ${cond ? cond + " AND" : "WHERE"} aiEnabled=true`, params) as any;
        const [[unread]] = await db.execute(`SELECT COALESCE(SUM(unreadCount),0) as total FROM wa_conversations ${cond}`, params) as any;
        const [[novo]] = await db.execute(`SELECT COUNT(*) as cnt FROM wa_conversations ${cond ? cond + " AND" : "WHERE"} status='novo'`, params) as any;
        const [[emAtendimento]] = await db.execute(`SELECT COUNT(*) as cnt FROM wa_conversations ${cond ? cond + " AND" : "WHERE"} status='em_atendimento'`, params) as any;
        return {
          totalConversations: total.cnt,
          novoConversations: novo.cnt,
          emAtendimentoConversations: emAtendimento.cnt,
          aiActiveConversations: aiActive.cnt,
          totalUnread: unread.total,
        };
      } finally { await db.end(); }
    }),

  // ── Status real do wa-bridge ────────────────────────────────────────────────

  /**
   * Consulta o status real de todas as instâncias no wa-bridge (Railway).
   * Retorna array com { instanceId, name, status, phone, connectedAt, hasQr }
   */
  bridgeStatus: publicProcedure.query(async () => {
    // Status é público — não expõe dados sensíveis, apenas conectado/desconectado
    const bridgeUrl = process.env.WA_BRIDGE_URL;
    const bridgeKey = process.env.WA_BRIDGE_API_KEY;
    if (!bridgeUrl) return { available: false, sessions: [] };
    try {
      const res = await fetch(`${bridgeUrl}/status`, {
        headers: { "x-wa-bridge-key": bridgeKey ?? "" },
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) return { available: false, sessions: [] };
      const data = await res.json() as { sessions: any[] };
      return { available: true, sessions: data.sessions ?? [] };
    } catch {
      return { available: false, sessions: [] };
    }
  }),

  /**
   * Reseta uma sessão específica no wa-bridge (força novo QR Code).
   */
  bridgeReset: publicProcedure
    .input(z.object({ bridgeInstanceId: z.number().min(1).max(10) }))
    .mutation(async ({ ctx, input }) => {
      await requireWaAdmin(ctx);
      const bridgeUrl = process.env.WA_BRIDGE_URL;
      const bridgeKey = process.env.WA_BRIDGE_API_KEY;
      if (!bridgeUrl) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "WA_BRIDGE_URL não configurado" });
      const res = await fetch(`${bridgeUrl}/reset/${input.bridgeInstanceId}`, {
        method: "POST",
        headers: { "x-wa-bridge-key": bridgeKey ?? "" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `wa-bridge: ${text.substring(0, 200)}` });
      }
      return { success: true };
    }),

  /**
   * Inicia uma sessão no wa-bridge sem resetar arquivos (gera QR se não conectado).
   */
  bridgeStart: publicProcedure
    .input(z.object({ bridgeInstanceId: z.number().min(1).max(10) }))
    .mutation(async ({ ctx, input }) => {
      await requireWaAdmin(ctx);
      const bridgeUrl = process.env.WA_BRIDGE_URL;
      const bridgeKey = process.env.WA_BRIDGE_API_KEY;
      if (!bridgeUrl) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "WA_BRIDGE_URL não configurado" });
      const res = await fetch(`${bridgeUrl}/start/${input.bridgeInstanceId}`, {
        method: "POST",
        headers: { "x-wa-bridge-key": bridgeKey ?? "" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `wa-bridge: ${text.substring(0, 200)}` });
      }
      return { success: true };
    }),

  /**
   * Deduplica conversas com o mesmo instanceId+remoteJid, mesclando mensagens na mais antiga.
   * Admin only.
   */
  deduplicateConversations: protectedProcedure
    .mutation(async ({ ctx }) => {
      await requireWaAdmin(ctx);
      const db = await getDb();
      try {
        // Encontrar grupos de conversas duplicadas (mesmo instanceId + remoteJid normalizado)
        const [dupeGroups] = await db.execute(`
          SELECT instanceId,
                 REGEXP_REPLACE(remoteJid, ':(\\d+)@', '@') AS normJid,
                 COUNT(*) AS cnt,
                 MIN(id) AS keepId,
                 GROUP_CONCAT(id ORDER BY id ASC) AS allIds
          FROM wa_conversations
          GROUP BY instanceId, normJid
          HAVING cnt > 1
        `) as any;

        let merged = 0;
        let deleted = 0;

        for (const group of dupeGroups) {
          const ids: number[] = group.allIds.split(',').map(Number);
          const keepId: number = group.keepId;
          const removeIds = ids.filter(id => id !== keepId);

          // Mover mensagens das conversas duplicadas para a conversa mais antiga
          for (const removeId of removeIds) {
            await db.execute(
              "UPDATE wa_messages SET conversationId=? WHERE conversationId=?",
              [keepId, removeId]
            );
            merged++;
          }

          // Normalizar o remoteJid da conversa mantida
          const normJid = group.normJid;
          await db.execute("UPDATE wa_conversations SET remoteJid=? WHERE id=?", [normJid, keepId]);

          // Atualizar lastMessage e lastMessageAt com a mensagem mais recente
          await db.execute(`
            UPDATE wa_conversations c
            JOIN (
              SELECT conversationId, content, timestamp
              FROM wa_messages
              WHERE conversationId=?
              ORDER BY timestamp DESC
              LIMIT 1
            ) m ON c.id = m.conversationId
            SET c.lastMessage = SUBSTRING(m.content, 1, 100), c.lastMessageAt = m.timestamp
            WHERE c.id=?
          `, [keepId, keepId]);

          // Deletar as conversas duplicadas (mensagens já foram movidas)
          for (const removeId of removeIds) {
            await db.execute("DELETE FROM wa_conversations WHERE id=?", [removeId]);
            deleted++;
          }
        }

        return { success: true, groupsProcessed: dupeGroups.length, messagesMerged: merged, conversationsDeleted: deleted };
      } finally { await db.end(); }
    }),

  /**
   * Retorna o QR Code em base64 de uma instância específica (para embed no painel).
   */
  bridgeQrImage: publicProcedure
    .input(z.object({ bridgeInstanceId: z.number().min(1).max(10) }))
    .query(async ({ input }) => {
      // QR é público — necessário para escanear sem estar logado no OAuth
      const bridgeUrl = process.env.WA_BRIDGE_URL;
      const bridgeKey = process.env.WA_BRIDGE_API_KEY;
      if (!bridgeUrl) return { ok: false, qr: null, status: "unavailable", dashboardUrl: null };
      // Tentar endpoint /qr/:id/image (versão nova do wa-bridge)
      try {
        const res = await fetch(`${bridgeUrl}/qr/${input.bridgeInstanceId}/image`, {
          headers: { "x-wa-bridge-key": bridgeKey ?? "" },
          signal: AbortSignal.timeout(5_000),
        });
        if (res.ok) {
          const data = await res.json() as { ok: boolean; qr: string | null; status: string };
          if (data.ok && data.qr) return { ...data, dashboardUrl: null };
        }
      } catch { /* fallback abaixo */ }
      // Fallback: retornar URL do dashboard do wa-bridge para abrir em nova aba
      const dashboardUrl = `${bridgeUrl}/qr/${input.bridgeInstanceId}`;
      return { ok: false, qr: null, status: "use_dashboard", dashboardUrl };
    }),

});

// ─── Helper: wa-bridge ───────────────────────────────────────────────────────

/**
 * Envia uma mensagem via wa-bridge (microserviço Baileys no Railway).
 * Silencioso se WA_BRIDGE_URL não estiver configurado (modo desenvolvimento).
 */
async function callWaBridge(instanceId: number, remoteJid: string, content: string): Promise<void> {
  const bridgeUrl = process.env.WA_BRIDGE_URL;
  const bridgeKey = process.env.WA_BRIDGE_API_KEY;

  if (!bridgeUrl) {
    console.log(`[wa-bridge] WA_BRIDGE_URL não configurado — mensagem não enviada (instanceId=${instanceId}, jid=${remoteJid})`);
    return;
  }

  const res = await fetch(`${bridgeUrl}/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-wa-bridge-key": bridgeKey ?? "",
    },
    body: JSON.stringify({ instanceId, remoteJid, content }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`wa-bridge respondeu ${res.status}: ${text.substring(0, 200)}`);
  }
}
