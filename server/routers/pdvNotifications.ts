import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import mysql from "mysql2/promise";
import { verifyPdvToken } from "./pdvAuth";
import type { Request } from "express";

async function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return mysql.createConnection(url);
}

async function requirePdvAdmin(ctx: any) {
  const req = ctx.req as Request;
  const seller = await verifyPdvToken(req);
  if (!seller) throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
  if (seller.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito ao administrador" });
  return seller;
}

// Helper para salvar notificações — usado pelo pdvSync
export async function savePdvNotification(type: string, title: string, content: string) {
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(
      "INSERT INTO pdv_notifications (type, title, content) VALUES (?, ?, ?)",
      [type, title, content]
    );
  } catch (e) {
    console.error("[PDV Notifications] Erro ao salvar notificação:", e);
  } finally {
    await db.end();
  }
}

export const pdvNotificationsRouter = router({
  // Listar com paginação e filtros
  list: publicProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
      tipo: z.string().optional(),
      apenasNaoLidas: z.boolean().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      await requirePdvAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Garantir inteiros válidos para evitar "Incorrect arguments to LIMIT"
      const page = Math.max(1, Math.floor(Number(input?.page) || 1));
      const limit = Math.max(1, Math.floor(Number(input?.limit) || 20));
      const offset = (page - 1) * limit;

      const conditions: string[] = [];
      const params: any[] = [];

      if (input?.tipo) {
        conditions.push("type = ?");
        params.push(input.tipo);
      }
      if (input?.apenasNaoLidas) {
        conditions.push("isRead = 0");
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      try {
        const [rows] = await db.execute(
          `SELECT id, type, title, content, isRead, createdAt FROM pdv_notifications ${where} ORDER BY createdAt DESC LIMIT ${limit} OFFSET ${offset}`,
          params
        ) as any[];

        const [countRows] = await db.execute(
          `SELECT COUNT(*) as total FROM pdv_notifications ${where}`,
          params
        ) as any[];

        const [unreadRows] = await db.execute(
          "SELECT COUNT(*) as count FROM pdv_notifications WHERE isRead = 0"
        ) as any[];

        const total = Number((countRows as any[])[0]?.total ?? 0);
        const unreadCount = Number((unreadRows as any[])[0]?.count ?? 0);

        return {
          notifications: rows as Array<{
            id: number;
            type: string;
            title: string;
            content: string;
            isRead: number;
            createdAt: Date;
          }>,
          unreadCount,
          total,
          page,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        };
      } finally {
        await db.end();
      }
    }),

  // Contagem de não lidas (para badge no menu)
  unreadCount: publicProcedure.query(async ({ ctx }) => {
    await requirePdvAdmin(ctx);
    const db = await getDb();
    if (!db) return { count: 0 };

    try {
      const [rows] = await db.execute(
        "SELECT COUNT(*) as count FROM pdv_notifications WHERE isRead = 0"
      ) as any[];
      return { count: Number((rows as any[])[0]?.count ?? 0) };
    } finally {
      await db.end();
    }
  }),

  markRead: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requirePdvAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      try {
        await db.execute("UPDATE pdv_notifications SET isRead = 1 WHERE id = ?", [input.id]);
        return { success: true };
      } finally {
        await db.end();
      }
    }),

  markAllRead: publicProcedure
    .mutation(async ({ ctx }) => {
      await requirePdvAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      try {
        await db.execute("UPDATE pdv_notifications SET isRead = 1 WHERE isRead = 0");
        return { success: true };
      } finally {
        await db.end();
      }
    }),

  deleteAll: publicProcedure
    .mutation(async ({ ctx }) => {
      await requirePdvAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      try {
        await db.execute("DELETE FROM pdv_notifications");
        return { success: true };
      } finally {
        await db.end();
      }
    }),
});
