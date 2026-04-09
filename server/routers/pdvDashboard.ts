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

export const pdvDashboardRouter = router({
  summary: publicProcedure
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
        
        if (input.startDate) {
          dateFilter += " AND DATE(createdAt) >= ?";
          params.push(input.startDate);
        }
        if (input.endDate) {
          dateFilter += " AND DATE(createdAt) <= ?";
          params.push(input.endDate);
        }
        
        const baseFilter = `WHERE status != 'CANCELADO'${dateFilter}`;
        
        // Total faturamento
        const [totalRows] = await db.execute(
          `SELECT 
            COUNT(*) as totalPedidos,
            COALESCE(SUM(totalAplicado), 0) as faturamento,
            COALESCE(AVG(totalAplicado), 0) as ticketMedio,
            COALESCE(SUM(CASE WHEN regime = 'ATACADO' THEN totalAplicado ELSE 0 END), 0) as faturamentoAtacado,
            COALESCE(SUM(CASE WHEN regime = 'VAREJO' THEN totalAplicado ELSE 0 END), 0) as faturamentoVarejo,
            COALESCE(SUM(CASE WHEN canal = 'BALCAO' THEN totalAplicado ELSE 0 END), 0) as faturamentoBalcao,
            COALESCE(SUM(CASE WHEN canal = 'WHATSAPP' THEN totalAplicado ELSE 0 END), 0) as faturamentoWhatsapp
           FROM pdv_orders ${baseFilter}`,
          params
        );
        
        // Por vendedor
        const [sellerRows] = await db.execute(
          `SELECT sellerName, 
            COUNT(*) as pedidos,
            COALESCE(SUM(totalAplicado), 0) as faturamento,
            COALESCE(AVG(totalAplicado), 0) as ticketMedio
           FROM pdv_orders ${baseFilter}
           GROUP BY sellerId, sellerName
           ORDER BY faturamento DESC`,
          params
        );
        
        // Por forma de pagamento
        const [paymentRows] = await db.execute(
          `SELECT p.formaPagamento, 
            COUNT(DISTINCT p.pedidoId) as pedidos,
            COALESCE(SUM(p.valor), 0) as total,
            COALESCE(SUM(p.taxa), 0) as totalTaxas,
            COALESCE(SUM(p.valorLiquido), 0) as totalLiquido
           FROM pdv_order_payments p
           INNER JOIN pdv_orders o ON p.pedidoId = o.pedidoId
           WHERE o.status != 'CANCELADO'${dateFilter}
           GROUP BY p.formaPagamento
           ORDER BY total DESC`,
          params
        );
        
        // Faturamento por dia (últimos 30 dias ou período)
        const [dailyRows] = await db.execute(
          `SELECT DATE(createdAt) as dia,
            COUNT(*) as pedidos,
            COALESCE(SUM(totalAplicado), 0) as faturamento
           FROM pdv_orders ${baseFilter}
           GROUP BY DATE(createdAt)
           ORDER BY dia ASC`,
          params
        );
        
        // Metas
        const [goalRows] = await db.execute("SELECT * FROM pdv_goals ORDER BY value ASC");
        
        await db.end();
        
        return {
          summary: (totalRows as any[])[0],
          bySeller: sellerRows as any[],
          byPayment: paymentRows as any[],
          byDay: dailyRows as any[],
          goals: goalRows as any[],
        };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        console.error("[PDV Dashboard] Error:", err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }
    }),

  cashFlow: publicProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(50),
    }))
    .query(async ({ input, ctx }) => {
      await requirePdvAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      
      try {
        let query = "SELECT * FROM pdv_cash_flow WHERE 1=1";
        const params: any[] = [];
        
        if (input.startDate) { query += " AND DATE(createdAt) >= ?"; params.push(input.startDate); }
        if (input.endDate) { query += " AND DATE(createdAt) <= ?"; params.push(input.endDate); }
        
        const countQuery = query.replace("SELECT *", "SELECT COUNT(*) as total");
        const [countRows] = await db.execute(countQuery, params);
        const total = (countRows as any[])[0].total;
        
        query += " ORDER BY createdAt DESC";
        const offset = (input.page - 1) * input.limit;
        query += ` LIMIT ${input.limit} OFFSET ${offset}`;
        
        const [rows] = await db.execute(query, params);
        
        // Saldo total
        const [balanceRows] = await db.execute(
          "SELECT COALESCE(SUM(CASE WHEN tipo = 'SUPRIMENTO' THEN valor ELSE -valor END), 0) as saldo FROM pdv_cash_flow"
        );
        
        await db.end();
        
        return {
          entries: rows as any[],
          total,
          saldo: (balanceRows as any[])[0].saldo,
          page: input.page,
          totalPages: Math.ceil(total / input.limit),
        };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }
    }),

  addCashFlow: publicProcedure
    .input(z.object({
      tipo: z.enum(["SUPRIMENTO", "SANGRIA"]),
      descricao: z.string().min(1),
      valor: z.number().min(0.01),
    }))
    .mutation(async ({ input, ctx }) => {
      const seller = await requirePdvAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      
      await db.execute(
        "INSERT INTO pdv_cash_flow (tipo, descricao, valor, usuario) VALUES (?, ?, ?, ?)",
        [input.tipo, input.descricao, input.valor, seller.name]
      );
      await db.end();
      return { success: true };
    }),

  updateGoals: publicProcedure
    .input(z.array(z.object({
      key: z.string(),
      value: z.number().min(0),
    })))
    .mutation(async ({ input, ctx }) => {
      await requirePdvAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      
      for (const goal of input) {
        await db.execute(
          "UPDATE pdv_goals SET value = ? WHERE `key` = ?",
          [goal.value, goal.key]
        );
      }
      await db.end();
      return { success: true };
    }),

  getGoals: publicProcedure.query(async ({ ctx }) => {
    await requirePdvAuth(ctx);
    const db = await getDb();
    if (!db) return [];
    
    const [rows] = await db.execute("SELECT * FROM pdv_goals ORDER BY value ASC");
    await db.end();
    return rows as any[];
  }),
});
