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

export const pdvSofiaRouter = router({
  // Dashboard Sofia: vendas diárias de produtos Sofia
  dashboard: publicProcedure
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
        if (input.startDate) { dateFilter += " AND DATE(o.createdAt) >= ?"; params.push(input.startDate); }
        if (input.endDate) { dateFilter += " AND DATE(o.createdAt) <= ?"; params.push(input.endDate); }

        // Resumo geral de vendas Sofia
        const [summaryRows] = await db.execute(
          `SELECT 
            COUNT(*) as totalPedidos,
            COALESCE(SUM(o.totalAplicado), 0) as faturamento,
            COALESCE(SUM(
              (SELECT SUM(oi.quantidade) FROM pdv_order_items oi WHERE oi.pedidoId = o.pedidoId)
            ), 0) as totalPecas
          FROM pdv_orders o
          WHERE o.isSofia = 1 AND o.status != 'CANCELADO' ${dateFilter}`,
          params
        );

        // Por vendedor
        const [sellerRows] = await db.execute(
          `SELECT 
            o.sellerId,
            o.sellerName,
            COUNT(*) as pedidos,
            COALESCE(SUM(o.totalAplicado), 0) as faturamento,
            COALESCE(SUM(
              (SELECT SUM(oi.quantidade) FROM pdv_order_items oi WHERE oi.pedidoId = o.pedidoId)
            ), 0) as pecas
          FROM pdv_orders o
          WHERE o.isSofia = 1 AND o.status != 'CANCELADO' ${dateFilter}
          GROUP BY o.sellerId, o.sellerName
          ORDER BY faturamento DESC`,
          params
        );

        // Por dia
        const [dailyRows] = await db.execute(
          `SELECT 
            DATE(o.createdAt) as dia,
            COUNT(*) as pedidos,
            COALESCE(SUM(o.totalAplicado), 0) as faturamento,
            COALESCE(SUM(
              (SELECT SUM(oi.quantidade) FROM pdv_order_items oi WHERE oi.pedidoId = o.pedidoId)
            ), 0) as pecas
          FROM pdv_orders o
          WHERE o.isSofia = 1 AND o.status != 'CANCELADO' ${dateFilter}
          GROUP BY DATE(o.createdAt)
          ORDER BY dia DESC`,
          params
        );

        // Comissão da loja
        const [configRows] = await db.execute("SELECT comissaoLoja FROM pdv_sofia_config LIMIT 1");
        const comissaoLoja = (configRows as any[])[0]?.comissaoLoja ? parseFloat((configRows as any[])[0].comissaoLoja) : 10;

        const summary = (summaryRows as any[])[0];
        const totalPecas = parseInt(summary.totalPecas) || 0;
        const faturamento = parseFloat(summary.faturamento) || 0;
        const comissaoTotal = totalPecas * comissaoLoja;
        const reembolsoTotal = faturamento - comissaoTotal;

        await db.end();

        return {
          summary: {
            totalPedidos: parseInt(summary.totalPedidos) || 0,
            totalPecas,
            faturamento,
            comissaoLoja,
            comissaoTotal,
            reembolsoTotal: Math.max(0, reembolsoTotal),
          },
          porVendedor: (sellerRows as any[]).map(r => {
            const pecas = parseInt(r.pecas) || 0;
            const fat = parseFloat(r.faturamento) || 0;
            const comissao = pecas * comissaoLoja;
            return {
              ...r,
              pecas,
              faturamento: fat,
              comissao,
              reembolso: Math.max(0, fat - comissao),
            };
          }),
          porDia: (dailyRows as any[]).map(r => ({
            ...r,
            faturamento: parseFloat(r.faturamento) || 0,
            pecas: parseInt(r.pecas) || 0,
          })),
        };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        console.error("[PDV Sofia] Error:", err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }
    }),

  // Listar pedidos Sofia
  pedidos: publicProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      sellerId: z.number().optional(),
      page: z.number().default(1),
      limit: z.number().default(20),
    }))
    .query(async ({ input, ctx }) => {
      await requirePdvAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      try {
        let query = "SELECT * FROM pdv_orders WHERE isSofia = 1";
        const params: any[] = [];

        if (input.sellerId) { query += " AND sellerId = ?"; params.push(input.sellerId); }
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
          orders: rows as any[],
          total,
          page: input.page,
          totalPages: Math.ceil(total / input.limit),
        };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }
    }),

  // Configuração: obter comissão da loja
  getConfig: publicProcedure.query(async ({ ctx }) => {
    await requirePdvAdmin(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const [rows] = await db.execute("SELECT * FROM pdv_sofia_config LIMIT 1");
    await db.end();
    const config = (rows as any[])[0];
    return {
      comissaoLoja: config ? parseFloat(config.comissaoLoja) : 10,
    };
  }),

  // Configuração: atualizar comissão da loja
  updateConfig: publicProcedure
    .input(z.object({
      comissaoLoja: z.number().min(0),
    }))
    .mutation(async ({ input, ctx }) => {
      await requirePdvAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db.execute(
        "UPDATE pdv_sofia_config SET comissaoLoja = ? WHERE id = 1",
        [input.comissaoLoja]
      );
      await db.end();
      return { success: true };
    }),
});
