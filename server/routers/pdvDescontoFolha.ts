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

async function requirePdvAuth(ctx: any) {
  const req = ctx.req as Request;
  const seller = await verifyPdvToken(req);
  if (!seller) throw new TRPCError({ code: "UNAUTHORIZED", message: "Faça login no PDV" });
  return seller;
}

async function requirePdvAdmin(ctx: any) {
  const seller = await requirePdvAuth(ctx);
  if (seller.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito ao administrador" });
  return seller;
}

export const pdvDescontoFolhaRouter = router({
  // Listar descontos em folha (admin vê todos, vendedor vê apenas os seus)
  list: publicProcedure
    .input(z.object({
      sellerId: z.number().optional(),
      quitado: z.boolean().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(50),
    }))
    .query(async ({ input, ctx }) => {
      const seller = await requirePdvAuth(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      try {
        let query = "SELECT * FROM pdv_desconto_folha WHERE 1=1";
        const params: any[] = [];

        // Vendedor comum só vê os seus
        if (seller.role !== "admin") {
          query += " AND sellerId = ?";
          params.push(seller.sellerId);
        } else if (input.sellerId) {
          query += " AND sellerId = ?";
          params.push(input.sellerId);
        }

        if (input.quitado !== undefined) {
          query += " AND quitado = ?";
          params.push(input.quitado ? 1 : 0);
        }
        if (input.startDate) { query += " AND DATE(createdAt) >= ?"; params.push(input.startDate); }
        if (input.endDate) { query += " AND DATE(createdAt) <= ?"; params.push(input.endDate); }

        const countQuery = query.replace("SELECT *", "SELECT COUNT(*) as total");
        const [countRows] = await db.execute(countQuery, params);
        const total = (countRows as any[])[0].total;

        query += " ORDER BY createdAt DESC";
        const offset = (input.page - 1) * input.limit;
        query += ` LIMIT ${Math.floor(input.limit)} OFFSET ${Math.floor(offset)}`;

        const [rows] = await db.execute(query, params);
        await db.end();

        return {
          items: rows as any[],
          total,
          page: input.page,
          totalPages: Math.ceil(total / input.limit),
        };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }
    }),

  // Resumo por vendedor (para o dashboard)
  resumoPorVendedor: publicProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      await requirePdvAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      try {
        let dateFilter = "";
        const params: any[] = [];
        if (input.startDate) { dateFilter += " AND DATE(createdAt) >= ?"; params.push(input.startDate); }
        if (input.endDate) { dateFilter += " AND DATE(createdAt) <= ?"; params.push(input.endDate); }

        const [rows] = await db.execute(
          `SELECT 
            sellerId,
            sellerName,
            COUNT(*) as totalItens,
            COALESCE(SUM(CASE WHEN quitado = 0 THEN valor ELSE 0 END), 0) as pendente,
            COALESCE(SUM(CASE WHEN quitado = 1 THEN valor ELSE 0 END), 0) as quitado,
            COALESCE(SUM(valor), 0) as totalGeral
          FROM pdv_desconto_folha
          WHERE 1=1 ${dateFilter}
          GROUP BY sellerId, sellerName
          ORDER BY pendente DESC`,
          params
        );

        // Total geral pendente
        const [totalRows] = await db.execute(
          `SELECT COALESCE(SUM(CASE WHEN quitado = 0 THEN valor ELSE 0 END), 0) as totalPendente
           FROM pdv_desconto_folha WHERE 1=1 ${dateFilter}`,
          params
        );

        await db.end();

        return {
          porVendedor: (rows as any[]).map(r => ({
            ...r,
            pendente: parseFloat(r.pendente),
            quitado: parseFloat(r.quitado),
            totalGeral: parseFloat(r.totalGeral),
          })),
          totalPendente: parseFloat((totalRows as any[])[0].totalPendente),
        };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }
    }),

  // Registrar desconto em folha (admin)
  create: publicProcedure
    .input(z.object({
      sellerId: z.number(),
      sellerName: z.string(),
      pedidoId: z.string().optional(),
      descricao: z.string().min(1),
      valor: z.number().min(0.01),
    }))
    .mutation(async ({ input, ctx }) => {
      await requirePdvAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db.execute(
        `INSERT INTO pdv_desconto_folha (sellerId, sellerName, pedidoId, descricao, valor)
         VALUES (?, ?, ?, ?, ?)`,
        [input.sellerId, input.sellerName, input.pedidoId || null, input.descricao, input.valor]
      );
      await db.end();
      return { success: true };
    }),

  // Quitar desconto (admin marca como pago)
  quitar: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const seller = await requirePdvAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db.execute(
        "UPDATE pdv_desconto_folha SET quitado = 1, quitadoEm = NOW(), quitadoPor = ? WHERE id = ?",
        [seller.name, input.id]
      );
      await db.end();
      return { success: true };
    }),

  // Quitar todos os pendentes de um vendedor (admin)
  quitarTodos: publicProcedure
    .input(z.object({ sellerId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const seller = await requirePdvAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [result] = await db.execute(
        "UPDATE pdv_desconto_folha SET quitado = 1, quitadoEm = NOW(), quitadoPor = ? WHERE sellerId = ? AND quitado = 0",
        [seller.name, input.sellerId]
      );
      await db.end();
      return { success: true, quitados: (result as any).affectedRows };
    }),

  // Deletar registro (admin)
  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await requirePdvAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db.execute("DELETE FROM pdv_desconto_folha WHERE id = ?", [input.id]);
      await db.end();
      return { success: true };
    }),
});
