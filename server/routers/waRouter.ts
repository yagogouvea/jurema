/**
 * Router tRPC — Módulo WhatsApp IA
 * Toda a lógica de instâncias, conversas, mensagens e configuração da IA.
 * Integrado ao wa-bridge (Baileys) para envio/recebimento real de mensagens.
 */

import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import mysql from "mysql2/promise";
import type { Request } from "express";
import { verifyPdvToken } from "./pdvAuth";
import { buildSystemPrompt, mergeDbRowWithDefaults } from "./waAiTrainingDefaults";
import { detectBusinessContextRegression } from "./waAiTrainingGuard";
import { refineAiTrainingFromNaturalLanguage, refineTrainingInputSchema } from "./waAiTrainingRefine";
import { manusStoragePublicPath, resolveStoredMediaToViewUrl } from "../waMediaResolve";

async function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DATABASE_URL não configurado" });
  return mysql.createConnection(url);
}

/** mysql2 em alguns hosts devolve nomes de colunas só em minúsculas — evita mediaUrl/id vazios no painel. */
function getMysqlRowField(row: Record<string, unknown>, name: string): unknown {
  if (row == null || typeof row !== "object") return undefined;
  if (Object.prototype.hasOwnProperty.call(row, name)) return (row as any)[name];
  const want = name.toLowerCase();
  for (const key of Object.keys(row)) {
    if (key.toLowerCase() === want) return (row as any)[key];
  }
  return undefined;
}

function coerceFiniteNumber(v: unknown): number {
  if (typeof v === "bigint") return Number(v);
  const n = Number(v);
  if (Number.isFinite(n)) return n;
  const p = Number.parseInt(String(v ?? "").trim(), 10);
  return Number.isFinite(p) ? p : NaN;
}

function normalizeWaMessageRow(row: Record<string, unknown>) {
  const g = (n: string) => getMysqlRowField(row, n);
  const fromRaw = g("fromMe");
  const fromMe = fromRaw === true || fromRaw === 1 || fromRaw === "1";
  const id = coerceFiniteNumber(g("id"));
  const mu = g("mediaUrl");
  const mk = g("mediaStorageKey");
  return {
    id,
    conversationId: coerceFiniteNumber(g("conversationId")) || 0,
    instanceId: coerceFiniteNumber(g("instanceId")) || 0,
    messageId: g("messageId") == null || g("messageId") === "" ? null : String(g("messageId")),
    fromMe,
    senderType: String(g("senderType") ?? "customer"),
    senderName: g("senderName") == null ? null : String(g("senderName")),
    type: String(g("type") ?? "text"),
    content: g("content") == null ? null : String(g("content")),
    mediaUrl: mu == null || mu === "" ? null : String(mu),
    mediaStorageKey: mk == null || mk === "" ? null : String(mk),
    mediaCaption: g("mediaCaption") == null ? null : String(g("mediaCaption")),
    quotedMessageId: g("quotedMessageId") == null ? null : String(g("quotedMessageId")),
    status: String(g("status") ?? "pending"),
    timestamp: g("timestamp"),
    createdAt: g("createdAt"),
  };
}

const WEBHOOK_MEDIA_MAX_BYTES = 20 * 1024 * 1024;

const WA_DB_MSG_TYPES = new Set([
  "text",
  "image",
  "audio",
  "video",
  "document",
  "sticker",
  "location",
  "contact",
  "reaction",
]);

/** Alinha `type` do webhook (ex.: imageMessage) com o ENUM `wa_messages.type`. */
function normalizeIncomingWaMessageType(t: string): string {
  if (WA_DB_MSG_TYPES.has(t)) return t;
  const s = String(t || "");
  if (s.includes("image")) return "image";
  if (s.includes("video")) return "video";
  if (s.includes("audio")) return "audio";
  if (s.includes("document")) return "document";
  if (s.includes("sticker")) return "sticker";
  if (s.includes("location")) return "location";
  if (s.includes("contact")) return "contact";
  if (s.includes("reaction")) return "reaction";
  return "text";
}

function firstWebhookString(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

/**
 * Espera o cliente terminar de enviar mensagens em sequência antes de chamar a IA.
 * Cada nova mensagem do cliente reinicia o temporizador (debounce por conversa).
 * Variável de ambiente: WA_AI_CUSTOMER_SEQUENCE_WAIT_MS (500–120000, padrão 6000).
 */
const iaSequenceTimers = new Map<number, ReturnType<typeof setTimeout>>();

function getCustomerSequenceQuietMs(): number {
  const raw = process.env.WA_AI_CUSTOMER_SEQUENCE_WAIT_MS?.trim();
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  if (Number.isFinite(n) && n >= 500 && n <= 120_000) return n;
  return 6_000;
}

async function logAiAttempt(
  db: mysql.Connection,
  conversationId: number,
  action: string,
  details: unknown
): Promise<void> {
  try {
    await db.execute(
      "INSERT INTO wa_ai_logs (conversationId, action, performedBy, details) VALUES (?,?,?,?)",
      [conversationId, action, "ai", typeof details === "string" ? details : JSON.stringify(details).slice(0, 1500)]
    );
  } catch (e) {
    console.warn("[logAiAttempt] falha ao registrar:", e);
  }
}

function scheduleIaReplyAfterCustomerSequence(params: { conversationId: number; instanceId: number }): void {
  const { conversationId, instanceId } = params;
  const prev = iaSequenceTimers.get(conversationId);
  if (prev !== undefined) clearTimeout(prev);
  const quietMs = getCustomerSequenceQuietMs();
  console.log(`[ai-debounce] agendada conv=${conversationId} em ${quietMs}ms`);
  const tid = setTimeout(() => {
    iaSequenceTimers.delete(conversationId);
    console.log(`[ai-debounce] disparando conv=${conversationId}`);
    void (async () => {
      const asyncDb = await getDb();
      try {
        const { generateAiResponse } = await import("./waAiResponder");
        const result = await generateAiResponse(asyncDb as any, conversationId, instanceId, (iid, jid, content) =>
          callWaBridge(iid, jid, content)
        );
        if (result.ok) {
          console.log(
            `[ai] OK conv=${conversationId}${result.escalated ? " (escalated)" : ""}: ${result.content.substring(0, 100)}`
          );
          await logAiAttempt(asyncDb as any, conversationId, "ai_replied", {
            content: result.content.substring(0, 200),
            escalated: result.escalated,
          });
        } else {
          console.log(`[ai] SKIP conv=${conversationId} reason=${result.skipped}${"error" in result && result.error ? ` err=${result.error}` : ""}`);
          await logAiAttempt(asyncDb as any, conversationId, `ai_skipped:${result.skipped}`, {
            error: "error" in result ? result.error : null,
          });
        }
      } catch (e) {
        console.error("[ai] erro inesperado:", e);
        try {
          await logAiAttempt(asyncDb as any, conversationId, "ai_exception", String(e instanceof Error ? e.message : e));
        } catch { /* ignore */ }
      } finally {
        await asyncDb.end();
      }
    })();
  }, quietMs);
  iaSequenceTimers.set(conversationId, tid);
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
      // Slot wa-bridge: somente 1, 2 ou 3 (evita entradas inválidas como "jurema 4").
      let bridgeSlot: string | null = input.instanceId?.trim() || null;
      if (bridgeSlot) {
        if (!/^[1-3]$/.test(bridgeSlot)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "ID da instância wa-bridge deve ser 1, 2 ou 3.",
          });
        }
      }
      const phone = (input.phone || "").replace(/\D/g, "");
      const db = await getDb();
      try {
        if (input.id) {
          await db.execute(
            "UPDATE wa_instances SET name=?, phone=?, instanceId=?, apiKey=?, webhookUrl=?, active=? WHERE id=?",
            [input.name, phone, bridgeSlot, input.apiKey ?? null, input.webhookUrl ?? null, input.active ?? true, input.id]
          );
          return { success: true };
        }
        const [result] = await db.execute(
          "INSERT INTO wa_instances (name, phone, instanceId, apiKey, webhookUrl, active, status) VALUES (?,?,?,?,?,?,?)",
          [input.name, phone, bridgeSlot, input.apiKey ?? null, input.webhookUrl ?? null, input.active ?? true, "disconnected"]
        ) as any;
        return { success: true, id: result.insertId };
      } finally { await db.end(); }
    }),

  /** Remove um número cadastrado (ex.: entrada duplicada ou inválida). */
  deleteInstance: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireWaAdmin(ctx);
      const db = await getDb();
      try {
        const [rows] = await db.execute("SELECT id, instanceId FROM wa_instances WHERE id = ?", [input.id]);
        const row = (rows as any[])[0];
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Instância não encontrada" });

        await db.execute("DELETE FROM wa_ai_config WHERE instanceId = ?", [input.id]);
        await db.execute("DELETE FROM wa_instances WHERE id = ?", [input.id]);
        return { success: true };
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
      // status agora é livre (preset key — pode ser custom).
      status: z.string().max(50).optional(),
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
      // status agora é livre (preset key — sistema ou customizado pelo usuário).
      status: z.string().min(1).max(50).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireWaAccess(ctx);
      const db = await getDb();
      try {
        if (input.status !== undefined) {
          // Valida que o preset existe (ou aceita keys sistema legadas como fallback).
          const [presetRows] = (await db.execute(
            "SELECT `key` FROM wa_status_presets WHERE `key` = ? AND isActive = 1 LIMIT 1",
            [input.status]
          )) as any;
          const isLegacySystemKey = [
            "novo", "em_atendimento", "aguardando", "proposta_enviada", "finalizado", "spam", "intervencao",
          ].includes(input.status);
          if (!(presetRows as any[]).length && !isLegacySystemKey) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Status inválido" });
          }
          const { lockStatusByHuman } = await import("./waStatusClassifier");
          await lockStatusByHuman(db as any, input.id, input.status as any);
        }
        if (input.notes !== undefined) {
          await db.execute(
            "UPDATE wa_conversations SET notes=?, updatedAt=NOW() WHERE id=?",
            [input.notes, input.id]
          );
        }
        return { success: true };
      } finally { await db.end(); }
    }),

  // ── Indicação de Influenciador / Canal de aquisição ───────────────────────
  /** Devolve opções agrupadas (Influenciadores, Canais digitais, Outros). */
  listInfluencerOptions: publicProcedure.query(async ({ ctx }) => {
    await requireWaAccess(ctx);
    const mod = await import("@shared/waInfluencerReferral");
    return {
      groups: mod.REFERRAL_OPTION_GROUPS,
      flat: [...mod.INFLUENCER_CANONICALS, ...mod.CHANNEL_CANONICALS, ...mod.GENERIC_CANONICALS],
    };
  }),

  /** Define ou limpa manualmente a origem da lead. Aceita qualquer string. */
  setReferralSource: publicProcedure
    .input(z.object({
      conversationId: z.number().int().positive(),
      source: z.string().min(1).max(60).nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireWaAccess(ctx);
      const db = await getDb();
      try {
        const mod = await import("@shared/waInfluencerReferral");
        const all = [...mod.INFLUENCER_CANONICALS, ...mod.CHANNEL_CANONICALS, ...mod.GENERIC_CANONICALS];
        const trimmed = input.source == null ? null : input.source.trim();
        const final =
          trimmed == null || trimmed === ""
            ? null
            : all.find((c) => c.toLowerCase() === trimmed.toLowerCase()) ?? trimmed;
        await db.execute(
          "UPDATE wa_conversations SET referralSource = ?, referralSetBy = ? WHERE id = ?",
          [final, final ? "human" : null, input.conversationId]
        );
        return { success: true, referralSource: final };
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
        let sql = `
          SELECT
            id, conversationId, instanceId, messageId, fromMe, senderType, senderName,
            type, content, mediaUrl, mediaStorageKey, mediaCaption, quotedMessageId,
            status, timestamp, createdAt,
            (mediaBlob IS NOT NULL AND OCTET_LENGTH(mediaBlob) > 0) AS hasBlob,
            mediaMimeType, mediaSizeBytes
          FROM wa_messages
          WHERE conversationId=?`;
        const params: any[] = [input.conversationId];
        if (input.before) { sql += " AND id<?"; params.push(input.before); }
        const safeLimit2 = Math.max(1, Math.min(200, Math.floor(input.limit)));
        sql += ` ORDER BY timestamp DESC LIMIT ${safeLimit2}`;
        const [rows] = await db.execute(sql, params);
        const list = (rows as any[]).reverse() as Record<string, unknown>[];
        return list.map((r) => {
          const base = normalizeWaMessageRow(r);
          const hasBlobRaw = getMysqlRowField(r, "hasBlob");
          const hasBlob = hasBlobRaw === 1 || hasBlobRaw === true || hasBlobRaw === "1";
          const mime = getMysqlRowField(r, "mediaMimeType");
          return {
            ...base,
            hasBlob,
            mediaMimeType: mime == null ? null : String(mime),
          };
        });
      } finally { await db.end(); }
    }),

  /**
   * Resolve URLs de mídia antigas (ex.: presign expirado) para uma URL de leitura atual.
   * Chamado em lote pelo painel só para mensagens cujo mediaUrl ainda é https absoluto.
   */
  resolveMediaViewUrls: publicProcedure
    .input(z.object({ messageIds: z.array(z.number().int()).min(1).max(100) }))
    .query(async ({ ctx, input }) => {
      await requireWaAccess(ctx);
      const unique = Array.from(new Set(input.messageIds));
      const db = await getDb();
      try {
        const placeholders = unique.map(() => "?").join(",");
        const [rows] = await db.execute(
          `SELECT id, mediaUrl, mediaStorageKey FROM wa_messages WHERE id IN (${placeholders})`,
          unique
        ) as any;
        const results: { messageId: number; url: string }[] = [];
        for (const raw of rows as Record<string, unknown>[]) {
          const rid = getMysqlRowField(raw, "id");
          const idNum = coerceFiniteNumber(rid);
          const mediaUrl = getMysqlRowField(raw, "mediaUrl") as string | null | undefined;
          const mediaStorageKey = getMysqlRowField(raw, "mediaStorageKey") as string | null | undefined;
          const resolved = await resolveStoredMediaToViewUrl(
            mediaUrl == null ? null : String(mediaUrl),
            mediaStorageKey == null ? null : String(mediaStorageKey)
          ).catch((e) => {
            console.warn(`[resolveMediaViewUrls] falha id=${rid}:`, e);
            return null;
          });
          if (resolved && Number.isFinite(idNum)) {
            results.push({ messageId: idNum, url: resolved });
          }
        }
        return { results };
      } finally {
        await db.end();
      }
    }),

  /**
   * Reabre uma conversa bloqueada (spam/finalizado/intervencao) — força status='em_atendimento',
   * reativa aiEnabled e dispara nova resposta da IA.
   */
  reopenConversation: publicProcedure
    .input(z.object({ conversationId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const user = await requireWaAccess(ctx);
      const db = await getDb();
      try {
        const [convRows] = (await db.execute(
          "SELECT id, instanceId, status, aiEnabled FROM wa_conversations WHERE id = ? LIMIT 1",
          [input.conversationId]
        )) as any;
        const conv = (convRows as any[])[0];
        if (!conv) throw new TRPCError({ code: "NOT_FOUND" });

        await db.execute(
          `UPDATE wa_conversations
             SET status = 'em_atendimento',
                 statusSetBy = 'human',
                 statusLockedUntil = NULL,
                 aiEnabled = 1,
                 aiDisabledBy = NULL,
                 aiDisabledAt = NULL,
                 updatedAt = NOW()
           WHERE id = ?`,
          [input.conversationId]
        );

        await logAiAttempt(db, input.conversationId, "conv_reopened", {
          by: user.name,
          prevStatus: String(conv.status),
        });

        // Dispara IA imediatamente (sem debounce, já que foi ação manual).
        scheduleIaReplyAfterCustomerSequence({
          conversationId: input.conversationId,
          instanceId: Number(conv.instanceId),
        });

        return { success: true };
      } finally {
        await db.end();
      }
    }),

  /**
   * Diagnóstico: últimas tentativas da IA para essa conversa.
   * Inclui o tipo da ação (ai_replied / ai_skipped:<reason> / ai_exception) e o detalhe.
   */
  lastAiAttempts: publicProcedure
    .input(z.object({ conversationId: z.number().int().positive(), limit: z.number().int().min(1).max(20).default(8) }))
    .query(async ({ ctx, input }) => {
      await requireWaAccess(ctx);
      const db = await getDb();
      try {
        const [rows] = (await db.execute(
          `SELECT id, action, performedBy, details, createdAt
             FROM wa_ai_logs
             WHERE conversationId = ?
             ORDER BY id DESC
             LIMIT ${Math.max(1, Math.min(20, Math.floor(input.limit)))}`,
          [input.conversationId]
        )) as any;
        return (rows as any[]).map((r) => ({
          id: Number(r.id),
          action: String(r.action),
          performedBy: r.performedBy == null ? null : String(r.performedBy),
          details: r.details == null ? null : String(r.details).slice(0, 1000),
          createdAt: r.createdAt,
        }));
      } finally {
        await db.end();
      }
    }),

  /**
   * Diagnóstico: devolve campos de mídia de uma mensagem + tentativa de presign.
   * Usado pelo painel para descobrir POR QUE uma imagem cai em 404.
   */
  debugMessageMedia: publicProcedure
    .input(z.object({ messageId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await requireWaAccess(ctx);
      const db = await getDb();
      try {
        const [rows] = (await db.execute("SELECT * FROM wa_messages WHERE id = ? LIMIT 1", [input.messageId])) as any;
        const raw = (rows as Record<string, unknown>[])[0];
        if (!raw) {
          return { found: false as const, messageId: input.messageId };
        }
        const type = String(getMysqlRowField(raw, "type") ?? "text");
        const mediaUrl = getMysqlRowField(raw, "mediaUrl");
        const mediaStorageKey = getMysqlRowField(raw, "mediaStorageKey");
        const mediaUrlStr = mediaUrl == null ? "" : String(mediaUrl);
        const mediaKeyStr = mediaStorageKey == null ? "" : String(mediaStorageKey);

        let resolved: string | null = null;
        let resolveError: string | null = null;
        try {
          resolved = await resolveStoredMediaToViewUrl(mediaUrlStr || null, mediaKeyStr || null);
        } catch (e) {
          resolveError = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
        }

        const blobRaw = getMysqlRowField(raw, "mediaBlob");
        const blobLength = Buffer.isBuffer(blobRaw)
          ? blobRaw.length
          : blobRaw == null
            ? 0
            : (() => {
                try {
                  return Buffer.from(blobRaw as any).length;
                } catch {
                  return 0;
                }
              })();
        const mimeRaw = getMysqlRowField(raw, "mediaMimeType");

        return {
          found: true as const,
          messageId: input.messageId,
          type,
          fromMe: !!getMysqlRowField(raw, "fromMe"),
          contentPreview: String(getMysqlRowField(raw, "content") ?? "").slice(0, 80),
          mediaUrl: mediaUrlStr,
          mediaUrlLength: mediaUrlStr.length,
          mediaStorageKey: mediaKeyStr,
          mediaStorageKeyLength: mediaKeyStr.length,
          mediaBlobBytes: blobLength,
          mediaMimeType: mimeRaw == null ? null : String(mimeRaw),
          resolvedUrl: resolved ? resolved.slice(0, 200) + (resolved.length > 200 ? "…" : "") : null,
          resolveError,
          forgeConfigured: !!process.env.BUILT_IN_FORGE_API_URL && !!process.env.BUILT_IN_FORGE_API_KEY,
        };
      } finally {
        await db.end();
      }
    }),

  /**
   * Transcreve manualmente um áudio existente (usa o LONGBLOB salvo em wa_messages).
   * Atualiza `content` para `[Áudio] <texto>` e devolve a transcrição.
   */
  transcribeMessageAudio: publicProcedure
    .input(z.object({ messageId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await requireWaAccess(ctx);
      const db = await getDb();
      try {
        const [rows] = (await db.execute(
          "SELECT id, type, mediaBlob, mediaMimeType, mediaUrl FROM wa_messages WHERE id = ? LIMIT 1",
          [input.messageId]
        )) as any;
        const raw = (rows as Record<string, unknown>[])[0];
        if (!raw) throw new TRPCError({ code: "NOT_FOUND", message: "Mensagem não encontrada" });
        const type = String(getMysqlRowField(raw, "type") ?? "text");
        if (type !== "audio") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Mensagem não é áudio" });
        }

        const blobRaw = getMysqlRowField(raw, "mediaBlob");
        const mime = String(getMysqlRowField(raw, "mediaMimeType") ?? "audio/ogg");

        const { transcribeAudio, transcribeAudioBuffer } = await import("../_core/voiceTranscription");
        let result: Awaited<ReturnType<typeof transcribeAudioBuffer>>;
        if (blobRaw) {
          const buf = Buffer.isBuffer(blobRaw) ? blobRaw : Buffer.from(blobRaw as any);
          result = await transcribeAudioBuffer({ audioBuffer: buf, mimeType: mime, language: "pt" });
        } else {
          const url = String(getMysqlRowField(raw, "mediaUrl") ?? "");
          if (!/^https?:\/\//i.test(url)) {
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Áudio sem bytes salvos no servidor" });
          }
          result = await transcribeAudio({ audioUrl: url });
        }

        if ("error" in result) {
          const msg = `${result.error}${(result as any).details ? ` — ${(result as any).details}` : ""}`;
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: msg });
        }

        const newContent = `[Áudio] ${result.text}`.slice(0, 8000);
        await db.execute("UPDATE wa_messages SET content = ? WHERE id = ?", [newContent, input.messageId]);
        return { text: result.text, content: newContent };
      } finally {
        await db.end();
      }
    }),

  /**
   * JWT curto para anexar em `/api/pdv/wa-media/:id?t=...`.
   * `<img>` e `<audio>` não enviam `Authorization: Bearer`; muitos vendedores só têm `pdv_token` no localStorage.
   */
  getMediaViewTokens: publicProcedure
    .input(z.object({ messageIds: z.array(z.number().int()).min(1).max(100) }))
    .query(async ({ ctx, input }) => {
      await requireWaAccess(ctx);
      const unique = Array.from(
        new Set(input.messageIds.filter((id) => Number.isFinite(id) && id > 0))
      );
      if (unique.length === 0) return { tokens: [] as { messageId: number; token: string }[] };
      const secret = new TextEncoder().encode(process.env.JWT_SECRET || "pdv_jwt_secret_fallback");
      const { SignJWT } = await import("jose");
      const tokens: { messageId: number; token: string }[] = [];
      for (const mid of unique) {
        const token = await new SignJWT({ mid, p: "wa_media" })
          .setProtectedHeader({ alg: "HS256" })
          .setExpirationTime("45m")
          .sign(secret);
        tokens.push({ messageId: mid, token });
      }
      return { tokens };
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
      mediaCaption: z.string().optional(),
      timestamp: z.number(),
      contactName: z.string().optional(),
      contactPhone: z.string().optional(),
    }).passthrough())
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const raw = input as typeof input & Record<string, unknown>;
      try {
        // Normalizar remoteJid: remover sufixo de device multi-device (ex: 5511999:1@s.whatsapp.net → 5511999@s.whatsapp.net)
        const normalizedJid = input.remoteJid.replace(/:(\d+)@/, "@");

        const msgType = normalizeIncomingWaMessageType(input.type);

        // Diagnóstico: logar todos os campos que o wa-bridge mandou para mídia.
        if (["image", "video", "audio", "document", "sticker"].includes(msgType)) {
          const summary: Record<string, unknown> = {};
          for (const k of Object.keys(raw)) {
            const v = (raw as any)[k];
            if (v == null) {
              summary[k] = null;
            } else if (typeof v === "string") {
              summary[k] = v.length > 80 ? `${v.slice(0, 80)}...[${v.length} chars]` : v;
            } else if (typeof v === "number" || typeof v === "boolean") {
              summary[k] = v;
            } else {
              summary[k] = `[${typeof v}]`;
            }
          }
          console.log(
            `[webhook-media-in] type=${input.type} norm=${msgType} jid=${normalizedJid} payload=`,
            JSON.stringify(summary)
          );
        }
        const hasContent = !!(input.content && input.content.trim().length > 0);
        const MEDIA_TYPES = ["image", "video", "audio", "document", "sticker", "location", "contact", "reaction"];
        const isMediaType = MEDIA_TYPES.includes(msgType);
        if (!hasContent && !isMediaType) {
          return { ok: true, skipped: true, reason: "empty_content" };
        }

        const mediaBase64Payload = firstWebhookString(
          input.mediaBase64,
          raw.media_base64,
          raw.base64,
          raw.data,
          raw.imageBase64
        );
        const mediaMimePayload = firstWebhookString(
          input.mediaMimeType,
          raw.media_mime_type,
          raw.mimeType,
          raw.mimetype,
          raw.contentType
        );
        const mediaUrlPayload = firstWebhookString(
          input.mediaUrl,
          raw.media_url,
          raw.url,
          raw.imageUrl,
          raw.link
        );

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

        // ─── Mídia ──────────────────────────────────────────────────────────────
        // Estratégia: SEMPRE tentar gravar bytes em wa_messages.mediaBlob (independe de storage Manus).
        // Como bônus, se storage Manus estiver configurado, também faz upload e guarda mediaStorageKey.
        let finalMediaUrl: string | null = mediaUrlPayload ?? null;
        let audioTranscribeUrl: string | null = null;
        let mediaStorageKey: string | null = null;
        let mediaBlob: Buffer | null = null;
        let mediaMimeFinal: string | null = mediaMimePayload ?? null;

        const isMediaBinary = ["image", "video", "audio", "document", "sticker"].includes(msgType);
        const forgeReady = !!process.env.BUILT_IN_FORGE_API_URL && !!process.env.BUILT_IN_FORGE_API_KEY;

        const tryStorageMirror = async (buf: Buffer, mime: string) => {
          if (!forgeReady) return null;
          try {
            const { storagePut } = await import("../storage");
            const ext = mime.split("/")[1]?.split(";")[0]?.split("+")[0] ?? "bin";
            const key = `wa-media/${input.instanceId}/${input.messageId ?? Date.now()}.${ext}`;
            const { url } = await storagePut(key, buf, mime);
            return { key, forgeUrl: url, proxyPath: manusStoragePublicPath(key) };
          } catch (e) {
            console.warn("[webhook] storagePut falhou (storage Manus indisponível):", e);
            return null;
          }
        };

        if (isMediaBinary && mediaBase64Payload) {
          try {
            const buf = Buffer.from(mediaBase64Payload, "base64");
            if (buf.length > 0 && buf.length <= WEBHOOK_MEDIA_MAX_BYTES) {
              mediaBlob = buf;
              if (!mediaMimeFinal) mediaMimeFinal = "application/octet-stream";
              const mirror = await tryStorageMirror(buf, mediaMimeFinal);
              if (mirror) {
                mediaStorageKey = mirror.key;
                audioTranscribeUrl = mirror.forgeUrl;
                finalMediaUrl = mirror.proxyPath;
              }
            } else if (buf.length > WEBHOOK_MEDIA_MAX_BYTES) {
              console.warn(`[webhook] media base64 excede ${WEBHOOK_MEDIA_MAX_BYTES} bytes; descartado.`);
            }
          } catch (e) {
            console.error("[webhook] Erro ao decodificar mediaBase64:", e);
          }
        }

        if (isMediaBinary && !mediaBlob && finalMediaUrl) {
          const bridgeBase = process.env.WA_BRIDGE_URL?.replace(/\/+$/, "") ?? "";
          const proto =
            String((ctx.req.headers["x-forwarded-proto"] as string) || "")
              .split(",")[0]
              .trim() || "https";
          const host =
            String((ctx.req.headers["x-forwarded-host"] as string) || ctx.req.headers.host || "")
              .split(",")[0]
              .trim();
          const appOrigin = host ? `${proto}://${host}` : "";

          const resolveFetchUrl = (u: string): string | null => {
            const s = u.trim();
            if (/^https?:\/\//i.test(s)) return s;
            if (!s.startsWith("/")) return null;
            if (s.startsWith("/manus-storage") && appOrigin) return `${appOrigin}${s}`;
            if (bridgeBase) return `${bridgeBase}${s}`;
            if (appOrigin) return `${appOrigin}${s}`;
            return null;
          };

          const fetchUrl = resolveFetchUrl(finalMediaUrl);
          if (fetchUrl) {
            try {
              const ctrl = new AbortController();
              const tid = setTimeout(() => ctrl.abort(), 30000);
              const headers: Record<string, string> = {};
              if (process.env.WA_BRIDGE_API_KEY) headers["x-wa-bridge-key"] = process.env.WA_BRIDGE_API_KEY;
              const r = await fetch(fetchUrl, { signal: ctrl.signal, redirect: "follow", headers });
              clearTimeout(tid);
              if (r.ok) {
                const buf = Buffer.from(await r.arrayBuffer());
                if (buf.length > 0 && buf.length <= WEBHOOK_MEDIA_MAX_BYTES) {
                  const ct =
                    r.headers.get("content-type")?.split(";")[0]?.trim()
                    || mediaMimeFinal
                    || "application/octet-stream";
                  mediaBlob = buf;
                  mediaMimeFinal = ct;
                  const mirror = await tryStorageMirror(buf, ct);
                  if (mirror) {
                    mediaStorageKey = mirror.key;
                    audioTranscribeUrl = mirror.forgeUrl;
                    finalMediaUrl = mirror.proxyPath;
                  }
                }
              } else {
                console.warn(`[webhook] Download de mídia falhou status=${r.status} url=${fetchUrl}`);
              }
            } catch (e) {
              console.warn("[webhook] Download de mídia falhou:", e);
            }
          }
        }

        if (isMediaBinary && !mediaBlob) {
          console.warn(
            `[webhook] Mensagem ${input.messageId} (type=${msgType}) recebida SEM base64 e SEM URL utilizável. Painel ficará com placeholder.`
          );
        }

        const transcribeAudioUrl =
          audioTranscribeUrl
          || (finalMediaUrl && /^https?:\/\//i.test(finalMediaUrl) ? finalMediaUrl : null);

        const [insertedMsg] = await db.execute(
          `INSERT INTO wa_messages (
             conversationId, instanceId, messageId, fromMe, senderType, type, content,
             mediaUrl, mediaStorageKey, mediaBlob, mediaMimeType, mediaSizeBytes,
             mediaCaption, status, timestamp
           ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            conversationId,
            input.instanceId,
            input.messageId,
            input.fromMe,
            input.fromMe ? "human" : "customer",
            msgType,
            input.content ?? null,
            finalMediaUrl,
            mediaStorageKey,
            mediaBlob,
            mediaBlob ? (mediaMimeFinal ?? "application/octet-stream") : null,
            mediaBlob ? mediaBlob.length : null,
            input.mediaCaption?.trim() || null,
            "delivered",
            msgTimestamp,
          ]
        ) as any;
        const insertedMsgId = insertedMsg.insertId;

        // Transcrição assíncrona de áudio:
        //  - Prefere os bytes em memória (mediaBlob recém-decodificado/baixado).
        //  - Cai para URL https se existir (storage Manus configurado).
        if (msgType === "audio" && (mediaBlob || transcribeAudioUrl)) {
          const blobCopy = mediaBlob ? Buffer.from(mediaBlob) : null;
          const mimeCopy = mediaMimeFinal ?? null;
          setImmediate(async () => {
            const transcribeDb = await getDb();
            try {
              const { transcribeAudio, transcribeAudioBuffer } = await import("../_core/voiceTranscription");
              const result = blobCopy
                ? await transcribeAudioBuffer({
                    audioBuffer: blobCopy,
                    mimeType: mimeCopy ?? undefined,
                    language: "pt",
                  })
                : await transcribeAudio({ audioUrl: transcribeAudioUrl! });
              if (result && !("error" in result) && result.text) {
                await transcribeDb.execute(
                  "UPDATE wa_messages SET content=? WHERE id=?",
                  [`[Áudio] ${result.text}`, insertedMsgId]
                );
                console.log(`[webhook] Transcrição salva mid=${insertedMsgId} chars=${result.text.length}`);
              } else if (result && "error" in result) {
                console.error(`[webhook] Whisper falhou mid=${insertedMsgId}:`, result);
              }
            } catch (e) {
              console.error("[webhook] Erro ao transcrever áudio:", e);
            } finally {
              await transcribeDb.end();
            }
          });
        }

        const capturedConvId = conversationId;
        const capturedRemoteJid = input.remoteJid;
        const capturedInstanceId = input.instanceId;
        const capturedFromMe = input.fromMe;
        const capturedContent = input.content ?? "";
        // Retornar imediatamente e processar de forma assíncrona com nova conexão
        setImmediate(async () => {
          if (capturedFromMe) return;
          const asyncDb = await getDb();
          try {
            // Detecção de indicação de influenciador (rapido, antes da IA).
            // Só sobrescreve se ainda não estiver setado (lock contra flapping).
            try {
              const { detectInfluencerReferral } = await import("@shared/waInfluencerReferral");
              const match = detectInfluencerReferral(capturedContent);
              if (match) {
                const [refRows] = (await asyncDb.execute(
                  "SELECT referralSource, referralSetBy FROM wa_conversations WHERE id = ? LIMIT 1",
                  [capturedConvId]
                )) as any;
                const cur = (refRows as any[])[0];
                const lockedByHuman = cur && cur.referralSetBy === "human";
                if (!lockedByHuman && (!cur?.referralSource || cur.referralSource !== match.source)) {
                  await asyncDb.execute(
                    "UPDATE wa_conversations SET referralSource = ?, referralSetBy = 'ai' WHERE id = ?",
                    [match.source, capturedConvId]
                  );
                  console.log(
                    `[webhook] Indicação detectada conv=${capturedConvId} source=${match.source} matchedAs="${match.matchedAs}"`
                  );
                }
              }
            } catch (e) {
              console.warn("[webhook] Erro ao detectar indicação:", e);
            }

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
              scheduleIaReplyAfterCustomerSequence({
                conversationId: capturedConvId,
                instanceId: capturedInstanceId,
              });
            }
          } finally { await asyncDb.end(); }
        });
        return { success: true, conversationId };
      } finally { await db.end(); }
    }),

  // ── Configuração da IA ──────────────────────────────────────────────────────

  getAiConfig: publicProcedure
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
  getAiTrainingDefaults: publicProcedure.query(async ({ ctx }) => {
    await requireWaAccess(ctx);
    return mergeDbRowWithDefaults(null, 0);
  }),

  /**
   * Lê o pedido em linguagem natural + treinamento atual e devolve proposta de alterações (ou recusa).
   * Só admin. Não grava no banco — o cliente confirma no painel e salva depois.
   */
  refineAiTrainingFromRequest: publicProcedure
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

  saveAiConfig: publicProcedure
    .input(z.object({
      instanceId: z.number(),
      enabled: z.boolean().optional(),
      aiName: z.string().optional(),
      personality: z.string().optional(),
      businessContext: z.string().optional(),
      /** Regras de preço editáveis (texto livre). Quando preenchido substitui o bloco default. */
      pricingRules: z.string().optional(),
      greetingMessage: z.string().optional(),
      awayMessage: z.string().optional(),
      awayEnabled: z.boolean().optional(),
      awayStart: z.string().optional(),
      awayEnd: z.string().optional(),
      awaySchedule: z.record(z.string(), z.unknown()).optional().nullable(),
      catalogLink: z.string().optional(),
      groupLink: z.string().optional(),
      instagramLink: z.string().optional(),
      /** Links extras (rótulo + URL), além dos três campos fixos. Máx. 20. */
      extraLinks: z
        .array(z.object({ label: z.string().max(120), url: z.string().max(2000) }))
        .max(20)
        .optional(),
      maxContextMessages: z.number().min(1).max(50).optional(),
      responseDelayMin: z.number().min(0).max(60000).optional(),
      responseDelayMax: z.number().min(0).max(120000).optional(),
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

        if (input.businessContext !== undefined) {
          const [prevRows] = (await db.execute(
            "SELECT businessContext FROM wa_ai_config WHERE instanceId=? LIMIT 1",
            [instanceId]
          )) as any;
          const prevBc = String(prevRows[0]?.businessContext ?? "");
          const regression = detectBusinessContextRegression(prevBc, String(input.businessContext ?? ""));
          if (regression) {
            throw new TRPCError({ code: "BAD_REQUEST", message: regression });
          }
        }

        const systemPromptFinal =
          systemPromptInput !== undefined && String(systemPromptInput).trim().length > 0
            ? String(systemPromptInput).trim()
            : buildSystemPrompt({
                aiName: input.aiName,
                personality: input.personality,
                businessContext: input.businessContext,
                pricingRules: input.pricingRules,
                greetingMessage: input.greetingMessage,
                catalogLink: input.catalogLink,
                groupLink: input.groupLink,
                instagramLink: input.instagramLink,
                extraLinks: input.extraLinks?.length ? input.extraLinks : undefined,
                escalateKeywords: input.escalateKeywords,
              });

        const keywordsJson = escalateKeywords ? JSON.stringify(escalateKeywords) : null;

        const data: Record<string, unknown> = { ...dataRaw };
        if (awayScheduleInput !== undefined) {
          data.awaySchedule =
            awayScheduleInput === null ? null : JSON.stringify(awayScheduleInput);
        }
        if (Array.isArray(data.extraLinks)) {
          data.extraLinks =
            (data.extraLinks as unknown[]).length > 0 ? JSON.stringify(data.extraLinks) : null;
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
            "INSERT INTO wa_ai_config (instanceId, enabled, aiName, personality, businessContext, pricingRules, greetingMessage, awayMessage, awayEnabled, awayStart, awayEnd, awaySchedule, catalogLink, groupLink, instagramLink, extraLinks, maxContextMessages, responseDelayMin, responseDelayMax, escalateKeywords, systemPrompt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [
              instanceId,
              d.enabled ?? false,
              d.aiName ?? "Ju",
              d.personality ?? null,
              d.businessContext ?? null,
              d.pricingRules ?? null,
              d.greetingMessage ?? null,
              d.awayMessage ?? null,
              d.awayEnabled ?? false,
              d.awayStart ?? null,
              d.awayEnd ?? null,
              d.awaySchedule ?? null,
              d.catalogLink ?? null,
              d.groupLink ?? null,
              d.instagramLink ?? null,
              Array.isArray(d.extraLinks) && d.extraLinks.length ? JSON.stringify(d.extraLinks) : null,
              d.maxContextMessages ?? 10,
              d.responseDelayMin ?? 3500,
              d.responseDelayMax ?? 9000,
              keywordsJson,
              systemPromptFinal,
            ]
          );
        }
        return { success: true, systemPrompt: systemPromptFinal };
      } finally { await db.end(); }
    }),

  // ── Respostas Rápidas ───────────────────────────────────────────────────────

  listQuickReplies: publicProcedure
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

  upsertQuickReply: publicProcedure
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

  deleteQuickReply: publicProcedure
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

  getMetrics: publicProcedure
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
  deduplicateConversations: publicProcedure
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

  // ─── Status presets configuráveis ──────────────────────────────────────────
  /** Lista presets de status (sistema + customizados). */
  listStatusPresets: publicProcedure
    .input(z.object({ includeInactive: z.boolean().optional() }).optional())
    .query(async ({ ctx, input }) => {
      await requireWaAccess(ctx);
      const db = await getDb();
      try {
        const where = input?.includeInactive ? "" : "WHERE isActive = 1";
        const [rows] = (await db.execute(
          `SELECT id, \`key\`, \`label\`, color, emoji, description, blocksAi, sortOrder, isSystem, isActive
             FROM wa_status_presets
             ${where}
             ORDER BY sortOrder ASC, id ASC`
        )) as any;
        return (rows as any[]).map((r) => ({
          id: Number(r.id),
          key: String(r.key),
          label: String(r.label),
          color: String(r.color ?? "#60a5fa"),
          emoji: r.emoji == null ? null : String(r.emoji),
          description: r.description == null ? null : String(r.description),
          blocksAi: !!r.blocksAi,
          sortOrder: Number(r.sortOrder ?? 0),
          isSystem: !!r.isSystem,
          isActive: !!r.isActive,
        }));
      } finally {
        await db.end();
      }
    }),

  /** Cria ou atualiza um preset (admin). Para presets de sistema só permite label/color/emoji/blocksAi/sortOrder/isActive. */
  upsertStatusPreset: publicProcedure
    .input(z.object({
      id: z.number().int().positive().optional(),
      key: z.string().min(1).max(50).regex(/^[a-z0-9_]+$/, "Use apenas letras minúsculas, números e _").optional(),
      label: z.string().min(1).max(100),
      color: z.string().min(4).max(20),
      emoji: z.string().max(8).optional().nullable(),
      description: z.string().max(255).optional().nullable(),
      blocksAi: z.boolean().optional(),
      sortOrder: z.number().int().min(0).max(9999).optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireWaAdmin(ctx);
      const db = await getDb();
      try {
        if (input.id) {
          const [existing] = (await db.execute(
            "SELECT * FROM wa_status_presets WHERE id = ? LIMIT 1",
            [input.id]
          )) as any;
          if (!(existing as any[]).length) {
            throw new TRPCError({ code: "NOT_FOUND" });
          }
          await db.execute(
            `UPDATE wa_status_presets
               SET label = ?, color = ?, emoji = ?, description = ?,
                   blocksAi = ?, sortOrder = ?, isActive = ?,
                   updatedAt = NOW()
             WHERE id = ?`,
            [
              input.label,
              input.color,
              input.emoji ?? null,
              input.description ?? null,
              input.blocksAi ? 1 : 0,
              input.sortOrder ?? 100,
              input.isActive === false ? 0 : 1,
              input.id,
            ]
          );
          return { success: true, id: input.id };
        }

        if (!input.key) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "'key' é obrigatório para criação." });
        }
        const [result] = (await db.execute(
          `INSERT INTO wa_status_presets
             (\`key\`, label, color, emoji, description, blocksAi, sortOrder, isSystem, isActive)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
          [
            input.key,
            input.label,
            input.color,
            input.emoji ?? null,
            input.description ?? null,
            input.blocksAi ? 1 : 0,
            input.sortOrder ?? 100,
            input.isActive === false ? 0 : 1,
          ]
        )) as any;
        return { success: true, id: Number((result as any).insertId) };
      } finally {
        await db.end();
      }
    }),

  /** Remove um preset não-sistema. Presets de sistema só podem ser inativados, não deletados. */
  deleteStatusPreset: publicProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await requireWaAdmin(ctx);
      const db = await getDb();
      try {
        const [existing] = (await db.execute(
          "SELECT isSystem FROM wa_status_presets WHERE id = ? LIMIT 1",
          [input.id]
        )) as any;
        const row = (existing as any[])[0];
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        if (row.isSystem) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Preset do sistema não pode ser deletado. Use 'inativar'." });
        }
        await db.execute("DELETE FROM wa_status_presets WHERE id = ?", [input.id]);
        return { success: true };
      } finally {
        await db.end();
      }
    }),

  /** Apaga todo o histórico de conversas e mensagens (admin). Mantém instâncias e configurações da IA. */
  clearAllConversations: publicProcedure.mutation(async ({ ctx }) => {
    await requireWaAdmin(ctx);
    const db = await getDb();
    try {
      const { clearAllWaConversationHistory } = await import("../waClearHistory");
      const result = await clearAllWaConversationHistory(db);
      return { success: true, ...result };
    } finally {
      await db.end();
    }
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
