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

export const pdvComissoesRouter = router({
  // Relatório de comissões por vendedor — conta por PEÇA (quantidade de itens vendidos)
  // Usa comissaoUnitaria registrada no momento da venda (sem retroatividade)
  // Exclui itens Sofia (oi.isSofia=1) da comissão — por ITEM, não por pedido
  relatorio: publicProcedure
    .input(z.object({
      startDate: z.string(),
      endDate: z.string(),
    }))
    .query(async ({ input, ctx }) => {
      await requirePdvAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      try {
        // Resumo por vendedor — comissão = SUM(quantidade * comissaoUnitaria) para itens não-Sofia
        const [sellerRows] = await db.execute(
          `SELECT 
            s.id as sellerId,
            s.name as sellerName,
            s.username,
            COUNT(DISTINCT o.id) as totalPedidos,
            COALESCE(SUM(CASE WHEN o.status != 'CANCELADO' AND oi.isSofia = 0 THEN oi.quantidade ELSE 0 END), 0) as totalPecas,
            COALESCE(SUM(CASE WHEN o.status != 'CANCELADO' AND oi.isSofia = 0 THEN oi.totalItem ELSE 0 END), 0) as faturamento,
            COALESCE(SUM(CASE WHEN o.status != 'CANCELADO' AND oi.isSofia = 0 THEN oi.quantidade * oi.comissaoUnitaria ELSE 0 END), 0) as comissao,
            COALESCE(SUM(CASE WHEN o.status != 'CANCELADO' AND oi.isSofia = 0 AND o.regime = 'ATACADO' THEN oi.totalItem ELSE 0 END), 0) as faturamentoAtacado,
            COALESCE(SUM(CASE WHEN o.status != 'CANCELADO' AND oi.isSofia = 0 AND o.regime = 'VAREJO' THEN oi.totalItem ELSE 0 END), 0) as faturamentoVarejo,
            COALESCE(SUM(CASE WHEN o.status != 'CANCELADO' AND oi.isSofia = 0 AND o.canal = 'BALCAO' THEN oi.totalItem ELSE 0 END), 0) as faturamentoBalcao,
            COALESCE(SUM(CASE WHEN o.status != 'CANCELADO' AND oi.isSofia = 0 AND o.canal = 'WHATSAPP' THEN oi.totalItem ELSE 0 END), 0) as faturamentoWhatsapp,
            COUNT(CASE WHEN o.status = 'CANCELADO' THEN 1 END) as pedidosCancelados,
            COALESCE(AVG(CASE WHEN o.status != 'CANCELADO' THEN o.totalAplicado END), 0) as ticketMedio
          FROM pdv_sellers s
          LEFT JOIN pdv_orders o ON o.sellerId = s.id AND DATE(o.createdAt) >= ? AND DATE(o.createdAt) <= ?
          LEFT JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId AND o.status != 'CANCELADO'
          WHERE s.isActive = 1
          GROUP BY s.id, s.name, s.username
          ORDER BY totalPecas DESC`,
          [input.startDate, input.endDate]
        );

        // Detalhamento diário por vendedor (com peças não-Sofia)
        const [dailyRows] = await db.execute(
          `SELECT 
            s.id as sellerId,
            s.name as sellerName,
            DATE(o.createdAt) as dia,
            COUNT(DISTINCT o.id) as pedidos,
            COALESCE(SUM(CASE WHEN oi.isSofia = 0 THEN oi.quantidade ELSE 0 END), 0) as pecas,
            COALESCE(SUM(CASE WHEN oi.isSofia = 0 THEN oi.totalItem ELSE 0 END), 0) as faturamento,
            COALESCE(SUM(CASE WHEN oi.isSofia = 0 THEN oi.quantidade * oi.comissaoUnitaria ELSE 0 END), 0) as comissao
          FROM pdv_orders o
          JOIN pdv_sellers s ON s.id = o.sellerId
          LEFT JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId
          WHERE o.status != 'CANCELADO'
            AND DATE(o.createdAt) >= ?
            AND DATE(o.createdAt) <= ?
          GROUP BY s.id, s.name, DATE(o.createdAt)
          HAVING pecas > 0
          ORDER BY dia ASC, pecas DESC`,
          [input.startDate, input.endDate]
        );

        // Metas para comparação
        const [goalRows] = await db.execute("SELECT `key`, value FROM pdv_goals");
        const goals: Record<string, number> = {};
        (goalRows as any[]).forEach((g: any) => { goals[g.key] = parseFloat(g.value); });

        // Comissão atual configurada (para exibição na UI)
        const [cfgRows] = await db.execute("SELECT value FROM pdv_config WHERE `key` = 'comissao_peca' LIMIT 1");
        const taxaAtual = parseFloat((cfgRows as any[])[0]?.value || '0.50');

        await db.end();

        const sellers = (sellerRows as any[]).map(s => {
          const totalPecas = parseInt(s.totalPecas) || 0;
          const faturamento = parseFloat(s.faturamento);
          const comissao = parseFloat(s.comissao) || 0;
          return {
            ...s,
            totalPecas,
            faturamento,
            comissao,
            faturamentoAtacado: parseFloat(s.faturamentoAtacado),
            faturamentoVarejo: parseFloat(s.faturamentoVarejo),
            faturamentoBalcao: parseFloat(s.faturamentoBalcao),
            faturamentoWhatsapp: parseFloat(s.faturamentoWhatsapp),
            ticketMedio: parseFloat(s.ticketMedio),
            metaAtingida: faturamento >= (goals.BRONZE || 0)
              ? faturamento >= (goals.OURO || 0)
                ? "OURO"
                : faturamento >= (goals.PRATA || 0)
                  ? "PRATA"
                  : "BRONZE"
              : null,
            percentualMeta: goals.META_LOJA
              ? Math.min(100, (faturamento / goals.META_LOJA) * 100)
              : 0,
          };
        });

        const totalFaturamento = sellers.reduce((acc, s) => acc + s.faturamento, 0);
        const totalPecas = sellers.reduce((acc, s) => acc + s.totalPecas, 0);
        const totalComissoes = sellers.reduce((acc, s) => acc + s.comissao, 0);
        const totalPedidos = sellers.reduce((acc, s) => acc + parseInt(s.totalPedidos), 0);

        return {
          sellers,
          daily: (dailyRows as any[]).map(d => ({
            ...d,
            pecas: parseInt(d.pecas) || 0,
            faturamento: parseFloat(d.faturamento),
            comissao: parseFloat(d.comissao) || 0,
          })),
          goals,
          summary: {
            totalFaturamento,
            totalPecas,
            totalComissoes,
            totalPedidos,
            taxaAtual,
            periodo: { startDate: input.startDate, endDate: input.endDate },
          },
        };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        console.error("[PDV Comissões] Error:", err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao gerar relatório" });
      }
    }),

  // Minhas comissões (para vendedor comum — só vê as próprias, sem taxa configurável)
  minhasComissoes: publicProcedure
    .input(z.object({
      startDate: z.string(),
      endDate: z.string(),
    }))
    .query(async ({ input, ctx }) => {
      const seller = await requirePdvAuth(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      try {
        // Peças vendidas pelo vendedor (excluindo itens Sofia por item)
        // Comissão calculada pelo valor registrado no momento da venda (sem retroatividade)
        const [rows] = await db.execute(
          `SELECT 
            COUNT(DISTINCT o.id) as totalPedidos,
            COALESCE(SUM(CASE WHEN o.status != 'CANCELADO' AND oi.isSofia = 0 THEN oi.quantidade ELSE 0 END), 0) as totalPecas,
            COALESCE(SUM(CASE WHEN o.status != 'CANCELADO' AND oi.isSofia = 0 THEN oi.totalItem ELSE 0 END), 0) as faturamento,
            COALESCE(SUM(CASE WHEN o.status != 'CANCELADO' AND oi.isSofia = 0 THEN oi.quantidade * oi.comissaoUnitaria ELSE 0 END), 0) as comissao,
            COUNT(CASE WHEN o.status = 'CANCELADO' THEN 1 END) as pedidosCancelados
          FROM pdv_orders o
          LEFT JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId AND o.status != 'CANCELADO'
          WHERE o.sellerId = ?
            AND DATE(o.createdAt) >= ?
            AND DATE(o.createdAt) <= ?`,
          [seller.sellerId, input.startDate, input.endDate]
        );

        // Detalhamento diário
        const [dailyRows] = await db.execute(
          `SELECT 
            DATE(o.createdAt) as dia,
            COUNT(DISTINCT o.id) as pedidos,
            COALESCE(SUM(CASE WHEN oi.isSofia = 0 THEN oi.quantidade ELSE 0 END), 0) as pecas,
            COALESCE(SUM(CASE WHEN oi.isSofia = 0 THEN oi.totalItem ELSE 0 END), 0) as faturamento,
            COALESCE(SUM(CASE WHEN oi.isSofia = 0 THEN oi.quantidade * oi.comissaoUnitaria ELSE 0 END), 0) as comissao
          FROM pdv_orders o
          LEFT JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId
          WHERE o.sellerId = ?
            AND o.status != 'CANCELADO'
            AND DATE(o.createdAt) >= ?
            AND DATE(o.createdAt) <= ?
          GROUP BY DATE(o.createdAt)
          HAVING pecas > 0
          ORDER BY dia ASC`,
          [seller.sellerId, input.startDate, input.endDate]
        );

        // Metas
        const [goalRows] = await db.execute("SELECT `key`, value FROM pdv_goals");
        const goals: Record<string, number> = {};
        (goalRows as any[]).forEach((g: any) => { goals[g.key] = parseFloat(g.value); });

        await db.end();

        const data = (rows as any[])[0];
        const totalPecas = parseInt(data.totalPecas) || 0;
        const faturamento = parseFloat(data.faturamento) || 0;
        const comissao = parseFloat(data.comissao) || 0;

        return {
          sellerName: seller.name,
          totalPedidos: parseInt(data.totalPedidos) || 0,
          totalPecas,
          faturamento,
          comissao,
          pedidosCancelados: parseInt(data.pedidosCancelados) || 0,
          metaAtingida: faturamento >= (goals.BRONZE || 0)
            ? faturamento >= (goals.OURO || 0)
              ? "OURO"
              : faturamento >= (goals.PRATA || 0)
                ? "PRATA"
                : "BRONZE"
            : null,
          daily: (dailyRows as any[]).map(d => ({
            ...d,
            pecas: parseInt(d.pecas) || 0,
            faturamento: parseFloat(d.faturamento),
            comissao: parseFloat(d.comissao) || 0,
          })),
          goals,
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
          COUNT(DISTINCT o.id) as totalPedidos,
          COALESCE(SUM(CASE WHEN o.status != 'CANCELADO' AND oi.isSofia = 0 THEN oi.quantidade ELSE 0 END), 0) as totalPecas,
          COALESCE(SUM(CASE WHEN o.status != 'CANCELADO' AND oi.isSofia = 0 THEN oi.totalItem ELSE 0 END), 0) as faturamento,
          COALESCE(SUM(CASE WHEN o.status != 'CANCELADO' AND oi.isSofia = 0 THEN oi.quantidade * oi.comissaoUnitaria ELSE 0 END), 0) as comissao
        FROM pdv_sellers s
        LEFT JOIN pdv_orders o ON o.sellerId = s.id ${dateFilter}
        LEFT JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId AND o.status != 'CANCELADO'
        WHERE s.isActive = 1
        GROUP BY s.id, s.name
        ORDER BY totalPecas DESC`,
        params
      );
      await db.end();
      return (rows as any[]).map(r => ({
        ...r,
        totalPecas: parseInt(r.totalPecas) || 0,
        faturamento: parseFloat(r.faturamento),
        comissao: parseFloat(r.comissao) || 0,
      }));
    }),
});
