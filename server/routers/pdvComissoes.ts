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
  if (!seller) throw new TRPCError({ code: "UNAUTHORIZED", message: "Faça login no PDV" });
  if (seller.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito ao administrador" });
  return seller;
}

export const pdvComissoesRouter = router({
  // Relatório de comissões por vendedor em um período
  relatorio: publicProcedure
    .input(z.object({
      startDate: z.string(),
      endDate: z.string(),
      taxaComissao: z.number().min(0).max(100).default(5), // % de comissão padrão
    }))
    .query(async ({ input, ctx }) => {
      await requirePdvAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      try {
        // Resumo por vendedor
        const [sellerRows] = await db.execute(
          `SELECT 
            s.id as sellerId,
            s.name as sellerName,
            s.username,
            COUNT(o.id) as totalPedidos,
            COALESCE(SUM(CASE WHEN o.status != 'CANCELADO' THEN o.totalAplicado ELSE 0 END), 0) as faturamento,
            COALESCE(SUM(CASE WHEN o.status != 'CANCELADO' AND o.regime = 'ATACADO' THEN o.totalAplicado ELSE 0 END), 0) as faturamentoAtacado,
            COALESCE(SUM(CASE WHEN o.status != 'CANCELADO' AND o.regime = 'VAREJO' THEN o.totalAplicado ELSE 0 END), 0) as faturamentoVarejo,
            COALESCE(SUM(CASE WHEN o.status != 'CANCELADO' AND o.canal = 'BALCAO' THEN o.totalAplicado ELSE 0 END), 0) as faturamentoBalcao,
            COALESCE(SUM(CASE WHEN o.status != 'CANCELADO' AND o.canal = 'WHATSAPP' THEN o.totalAplicado ELSE 0 END), 0) as faturamentoWhatsapp,
            COUNT(CASE WHEN o.status = 'CANCELADO' THEN 1 END) as pedidosCancelados,
            COALESCE(AVG(CASE WHEN o.status != 'CANCELADO' THEN o.totalAplicado END), 0) as ticketMedio
          FROM pdv_sellers s
          LEFT JOIN pdv_orders o ON o.sellerId = s.id AND DATE(o.createdAt) >= ? AND DATE(o.createdAt) <= ?
          WHERE s.isActive = 1
          GROUP BY s.id, s.name, s.username
          ORDER BY faturamento DESC`,
          [input.startDate, input.endDate]
        );

        // Detalhamento diário por vendedor
        const [dailyRows] = await db.execute(
          `SELECT 
            s.id as sellerId,
            s.name as sellerName,
            DATE(o.createdAt) as dia,
            COUNT(o.id) as pedidos,
            COALESCE(SUM(o.totalAplicado), 0) as faturamento
          FROM pdv_orders o
          JOIN pdv_sellers s ON s.id = o.sellerId
          WHERE o.status != 'CANCELADO'
            AND DATE(o.createdAt) >= ?
            AND DATE(o.createdAt) <= ?
          GROUP BY s.id, s.name, DATE(o.createdAt)
          ORDER BY dia ASC, faturamento DESC`,
          [input.startDate, input.endDate]
        );

        // Metas para comparação
        const [goalRows] = await db.execute("SELECT `key`, value FROM pdv_goals");
        const goals: Record<string, number> = {};
        (goalRows as any[]).forEach((g: any) => { goals[g.key] = parseFloat(g.value); });

        await db.end();

        const sellers = (sellerRows as any[]).map(s => ({
          ...s,
          faturamento: parseFloat(s.faturamento),
          faturamentoAtacado: parseFloat(s.faturamentoAtacado),
          faturamentoVarejo: parseFloat(s.faturamentoVarejo),
          faturamentoBalcao: parseFloat(s.faturamentoBalcao),
          faturamentoWhatsapp: parseFloat(s.faturamentoWhatsapp),
          ticketMedio: parseFloat(s.ticketMedio),
          comissao: parseFloat(s.faturamento) * (input.taxaComissao / 100),
          metaAtingida: parseFloat(s.faturamento) >= (goals.BRONZE || 0)
            ? parseFloat(s.faturamento) >= (goals.OURO || 0)
              ? "OURO"
              : parseFloat(s.faturamento) >= (goals.PRATA || 0)
                ? "PRATA"
                : "BRONZE"
            : null,
          percentualMeta: goals.META_LOJA
            ? Math.min(100, (parseFloat(s.faturamento) / goals.META_LOJA) * 100)
            : 0,
        }));

        const totalFaturamento = sellers.reduce((acc, s) => acc + s.faturamento, 0);
        const totalComissoes = sellers.reduce((acc, s) => acc + s.comissao, 0);
        const totalPedidos = sellers.reduce((acc, s) => acc + parseInt(s.totalPedidos), 0);

        return {
          sellers,
          daily: dailyRows as any[],
          goals,
          summary: {
            totalFaturamento,
            totalComissoes,
            totalPedidos,
            taxaComissao: input.taxaComissao,
            periodo: { startDate: input.startDate, endDate: input.endDate },
          },
        };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao gerar relatório" });
      }
    }),

  // Ranking de vendedores (resumo rápido para o dashboard)
  ranking: publicProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      await requirePdvAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      let dateFilter = "";
      const params: any[] = [];
      if (input.startDate) { dateFilter += " AND DATE(o.createdAt) >= ?"; params.push(input.startDate); }
      if (input.endDate) { dateFilter += " AND DATE(o.createdAt) <= ?"; params.push(input.endDate); }

      const [rows] = await db.execute(
        `SELECT 
          s.name as sellerName,
          COUNT(o.id) as totalPedidos,
          COALESCE(SUM(CASE WHEN o.status != 'CANCELADO' THEN o.totalAplicado ELSE 0 END), 0) as faturamento
        FROM pdv_sellers s
        LEFT JOIN pdv_orders o ON o.sellerId = s.id ${dateFilter}
        WHERE s.isActive = 1
        GROUP BY s.id, s.name
        ORDER BY faturamento DESC`,
        params
      );
      await db.end();
      return (rows as any[]).map(r => ({
        ...r,
        faturamento: parseFloat(r.faturamento),
      }));
    }),
});
