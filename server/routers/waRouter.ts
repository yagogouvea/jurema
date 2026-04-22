/**
 * Router tRPC — Módulo WhatsApp IA
 * Toda a lógica de instâncias, conversas, mensagens e configuração da IA.
 * As chamadas reais à Evolution API (evocloud.pro) e OpenAI serão ativadas
 * quando as credenciais estiverem disponíveis.
 */

import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import mysql from "mysql2/promise";
import type { Request } from "express";
import { verifyPdvToken } from "./pdvAuth";

async function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DATABASE_URL não configurado" });
  return mysql.createConnection(url);
}

// ─── Helpers de permissão ─────────────────────────────────────────────────────

/** Aceita usuários Manus OAuth (admin) ou vendedores PDV autenticados */
async function requireWaAccess(ctx: any): Promise<{ name: string; role: string }> {
  // Tenta autenticação PDV primeiro
  const req = ctx.req as Request;
  const seller = await verifyPdvToken(req).catch(() => null);
  if (seller) return { name: seller.name, role: seller.role };
  // Fallback: usuário Manus OAuth
  if (ctx.user) return { name: ctx.user.name ?? "Atendente", role: ctx.user.role ?? "user" };
  throw new TRPCError({ code: "UNAUTHORIZED" });
}

async function requireWaAdmin(ctx: any): Promise<{ name: string; role: string }> {
  const user = await requireWaAccess(ctx);
  if (user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem realizar esta ação." });
  }
  return user;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const waRouter = router({

  // ── Instâncias ──────────────────────────────────────────────────────────────

  listInstances: protectedProcedure.query(async ({ ctx }) => {
    await requireWaAccess(ctx);
    const db = await getDb();
    try {
      const [rows] = await db.execute("SELECT * FROM wa_instances ORDER BY id");
      return rows as any[];
    } finally { await db.end(); }
  }),

  upsertInstance: protectedProcedure
    .input(z.object({
      id: z.number().optional(),
      name: z.string().min(1).max(100),
      phone: z.string().min(10).max(20),
      instanceId: z.string().optional(),
      apiKey: z.string().optional(),
      webhookUrl: z.string().optional(),
      active: z.boolean().optional(),
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

  updateInstanceStatus: protectedProcedure
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

  listConversations: protectedProcedure
    .input(z.object({
      instanceId: z.number().optional(), // 0 ou undefined = todos os números
      status: z.enum(["novo", "em_atendimento", "aguardando", "proposta_enviada", "finalizado", "spam"]).optional(),
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
          LEFT JOIN wa_instances i ON i.id = c.instanceId
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
        sql += " ORDER BY c.lastMessageAt DESC LIMIT ? OFFSET ?";
        params.push(input.limit, input.offset);
        const [rows] = await db.execute(sql, params);
        return rows as any[];
      } finally { await db.end(); }
    }),

  // Contagem de conversas por status (para badges nos filtros)
  countByStatus: protectedProcedure
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

  getConversation: protectedProcedure
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

  markAsRead: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireWaAccess(ctx);
      const db = await getDb();
      try {
        await db.execute("UPDATE wa_conversations SET unreadCount=0 WHERE id=?", [input.conversationId]);
        return { success: true };
      } finally { await db.end(); }
    }),

  toggleAi: protectedProcedure
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
  updateConversation: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["novo", "em_atendimento", "aguardando", "proposta_enviada", "finalizado", "spam"]).optional(),
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
  unlockAiStatus: protectedProcedure
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
  listMessages: protectedProcedure
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
        sql += " ORDER BY timestamp DESC LIMIT ?";
        params.push(input.limit);
        const [rows] = await db.execute(sql, params);
        return (rows as any[]).reverse(); // retorna em ordem cronológica
      } finally { await db.end(); }
    }),

  sendMessage: protectedProcedure
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

        // TODO: Chamar Evolution API para enviar a mensagem de verdade
        // await evolutionSendMessage({ instanceId: conv.instanceId, remoteJid: conv.remoteJid, content: input.content });

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
      timestamp: z.number(),
      contactName: z.string().optional(),
      contactPhone: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      try {
        const [convRows] = await db.execute(
          "SELECT * FROM wa_conversations WHERE instanceId=? AND remoteJid=?",
          [input.instanceId, input.remoteJid]
        ) as any;

        const msgTimestamp = new Date(input.timestamp * 1000);
        let conversationId: number;

        if (!convRows[0]) {
          // Nova conversa — status inicial 'novo', classificado por IA
          const [newConv] = await db.execute(
            "INSERT INTO wa_conversations (instanceId, remoteJid, contactName, contactPhone, lastMessage, lastMessageAt, unreadCount, aiEnabled, status, statusSetBy) VALUES (?,?,?,?,?,?,?,?,?,?)",
            [input.instanceId, input.remoteJid, input.contactName ?? null, input.contactPhone ?? null, input.content?.substring(0, 100) ?? null, msgTimestamp, input.fromMe ? 0 : 1, true, "novo", "ai"]
          ) as any;
          conversationId = newConv.insertId;
        } else {
          const conv = convRows[0];
          conversationId = conv.id;
          await db.execute(
            "UPDATE wa_conversations SET lastMessage=?, lastMessageAt=?, unreadCount=?, contactName=COALESCE(?,contactName), contactPhone=COALESCE(?,contactPhone) WHERE id=?",
            [input.content?.substring(0, 100) ?? null, msgTimestamp, input.fromMe ? conv.unreadCount : conv.unreadCount + 1, input.contactName ?? null, input.contactPhone ?? null, conv.id]
          );
        }

        await db.execute(
          "INSERT INTO wa_messages (conversationId, instanceId, messageId, fromMe, senderType, type, content, mediaUrl, status, timestamp) VALUES (?,?,?,?,?,?,?,?,?,?)",
          [conversationId, input.instanceId, input.messageId, input.fromMe, input.fromMe ? "human" : "customer", input.type, input.content ?? null, input.mediaUrl ?? null, "delivered", msgTimestamp]
        );

        // Classificar status via IA de forma assíncrona (não bloqueia a resposta ao evocloud)
        if (!input.fromMe) {
          const { applyAiStatus } = await import("./waStatusClassifier");
          applyAiStatus(db as any, conversationId).catch(e =>
            console.error("[webhook] Erro ao classificar status via IA:", e)
          );
        }

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
        return rows[0] ?? null;
      } finally { await db.end(); }
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
      catalogLink: z.string().optional(),
      groupLink: z.string().optional(),
      instagramLink: z.string().optional(),
      maxContextMessages: z.number().min(1).max(50).optional(),
      responseDelayMin: z.number().min(0).max(10000).optional(),
      responseDelayMax: z.number().min(0).max(30000).optional(),
      escalateKeywords: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireWaAdmin(ctx);
      const db = await getDb();
      try {
        const { instanceId, escalateKeywords, ...data } = input;
        const systemPrompt = buildSystemPrompt(input);
        const keywordsJson = escalateKeywords ? JSON.stringify(escalateKeywords) : null;

        const [existing] = await db.execute("SELECT id FROM wa_ai_config WHERE instanceId=?", [instanceId]) as any;
        if (existing[0]) {
          const sets = Object.entries(data).filter(([, v]) => v !== undefined).map(([k]) => `\`${k}\`=?`);
          const vals = Object.entries(data).filter(([, v]) => v !== undefined).map(([, v]) => v);
          if (keywordsJson !== null) { sets.push("`escalateKeywords`=?"); vals.push(keywordsJson); }
          sets.push("`systemPrompt`=?"); vals.push(systemPrompt);
          vals.push(instanceId);
          await db.execute(`UPDATE wa_ai_config SET ${sets.join(",")} WHERE instanceId=?`, vals);
        } else {
          await db.execute(
            "INSERT INTO wa_ai_config (instanceId, enabled, aiName, personality, businessContext, greetingMessage, awayMessage, awayEnabled, awayStart, awayEnd, catalogLink, groupLink, instagramLink, maxContextMessages, responseDelayMin, responseDelayMax, escalateKeywords, systemPrompt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [instanceId, data.enabled ?? false, data.aiName ?? "Ju", data.personality ?? null, data.businessContext ?? null, data.greetingMessage ?? null, data.awayMessage ?? null, data.awayEnabled ?? false, data.awayStart ?? null, data.awayEnd ?? null, data.catalogLink ?? null, data.groupLink ?? null, data.instagramLink ?? null, data.maxContextMessages ?? 10, data.responseDelayMin ?? 1000, data.responseDelayMax ?? 3000, keywordsJson, systemPrompt]
          );
        }
        return { success: true, systemPrompt };
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
});

// ─── Helper: Gerador de System Prompt ─────────────────────────────────────────

function buildSystemPrompt(config: {
  aiName?: string;
  personality?: string;
  businessContext?: string;
  catalogLink?: string;
  groupLink?: string;
  instagramLink?: string;
  escalateKeywords?: string[];
}): string {
  const name = config.aiName ?? "Ju";
  const personality = config.personality ?? "Sou uma atendente simpática, prestativa e bem-humorada. Uso linguagem informal mas profissional, com emojis moderados.";
  const business = config.businessContext ?? "Trabalho na Jumera Sport, loja especializada em camisas de times de futebol, seleções e produtos esportivos. Vendemos no atacado e varejo.";

  let prompt = `Você é ${name}, atendente virtual da Jumera Sport.

PERSONALIDADE E TOM:
${personality}

SOBRE A EMPRESA:
${business}

REGRAS IMPORTANTES:
- Responda SEMPRE em português brasileiro
- Seja natural e humanizada — nunca revele que é uma IA
- Use emojis com moderação (1-2 por mensagem)
- Respostas curtas e objetivas (máximo 3 parágrafos)
- Se não souber algo, diga que vai verificar e peça para aguardar
- Nunca invente informações sobre produtos, preços ou prazos
- Sempre pergunte o nome do cliente se ainda não souber`;

  if (config.catalogLink) {
    prompt += `\n\nCATÁLOGO DE PRODUTOS: ${config.catalogLink}\n- Quando o cliente pedir para ver produtos, envie este link`;
  }
  if (config.groupLink) {
    prompt += `\n\nGRUPO WHATSAPP: ${config.groupLink}\n- Quando o cliente quiser entrar no grupo de novidades, envie este link`;
  }
  if (config.instagramLink) {
    prompt += `\n\nINSTAGRAM: ${config.instagramLink}\n- Mencione o Instagram quando relevante`;
  }
  if (config.escalateKeywords?.length) {
    prompt += `\n\nESCALAMENTO PARA HUMANO:\n- Se o cliente mencionar: ${config.escalateKeywords.join(", ")}\n- Diga: "Só um momento."`;
  }

  return prompt;
}
