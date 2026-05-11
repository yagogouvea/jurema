import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import mysql from "mysql2/promise";
import { verifyPdvToken } from "./pdvAuth";
import {
  appendCashFlowToSheet,
  syncAllCashFlowToSheet,
  syncAllSalesToCashFlowSheet,
  readCashFlowFromSheet,
} from "./pdvSheetsWriter";
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
        
        // Filtra por data no horário de Brasília (createdAt é gravado em UTC).
        if (input.startDate) {
          dateFilter += " AND DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00')) >= ?";
          params.push(input.startDate);
        }
        if (input.endDate) {
          dateFilter += " AND DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00')) <= ?";
          params.push(input.endDate);
        }
        
        // Dashboard geral: exclui pedidos 100% Sofia (isSofia=1)
        // Para pedidos mistos (isSofia=0 mas com alguns itens Sofia), 
        // contabiliza apenas os itens NÃO-Sofia via JOIN com pdv_order_items
        const [totalRows] = await db.execute(
          `SELECT 
            COUNT(DISTINCT o.id) as totalPedidos,
            COALESCE(SUM(oi.totalItem), 0) as faturamento,
            COALESCE(AVG(oi_totals.totalNaoSofia), 0) as ticketMedio,
            COALESCE(SUM(CASE WHEN o.regime = 'ATACADO' THEN oi.totalItem ELSE 0 END), 0) as faturamentoAtacado,
            COALESCE(SUM(CASE WHEN o.regime = 'VAREJO' THEN oi.totalItem ELSE 0 END), 0) as faturamentoVarejo,
            COALESCE(SUM(CASE WHEN o.canal = 'BALCAO' THEN oi.totalItem ELSE 0 END), 0) as faturamentoBalcao,
            COALESCE(SUM(CASE WHEN o.canal = 'WHATSAPP' THEN oi.totalItem ELSE 0 END), 0) as faturamentoWhatsapp
           FROM pdv_orders o
           JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId AND oi.isSofia = 0
           LEFT JOIN (
             SELECT pedidoId, SUM(totalItem) as totalNaoSofia
             FROM pdv_order_items WHERE isSofia = 0
             GROUP BY pedidoId
           ) oi_totals ON oi_totals.pedidoId = o.pedidoId
           WHERE o.status != 'CANCELADO' AND o.isSofia = 0 ${dateFilter}`,
          params
        );
        
        // Por vendedor — apenas itens não-Sofia, com pontuação por regime
        const [sellerRows] = await db.execute(
          `SELECT o.sellerName, 
            COUNT(DISTINCT o.id) as pedidos,
            COALESCE(SUM(oi.totalItem), 0) as faturamento,
            COALESCE(AVG(oi_totals.totalNaoSofia), 0) as ticketMedio,
            COALESCE(SUM(
              CASE WHEN o.regime = 'ATACADO' THEN oi.ptAtacado * oi.quantidade
                   ELSE oi.ptVarejo * oi.quantidade END
            ), 0) as pontuacao
           FROM pdv_orders o
           JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId AND oi.isSofia = 0
           LEFT JOIN (
             SELECT pedidoId, SUM(totalItem) as totalNaoSofia
             FROM pdv_order_items WHERE isSofia = 0
             GROUP BY pedidoId
           ) oi_totals ON oi_totals.pedidoId = o.pedidoId
           WHERE o.status != 'CANCELADO' AND o.isSofia = 0 ${dateFilter}
           GROUP BY o.sellerId, o.sellerName
           ORDER BY pontuacao DESC`,
          params
        );
        
        // Por forma de pagamento — exclui pedidos 100% Sofia
        const [paymentRows] = await db.execute(
          `SELECT p.formaPagamento, 
            COUNT(DISTINCT p.pedidoId) as pedidos,
            COALESCE(SUM(p.valor), 0) as total,
            COALESCE(SUM(p.taxa), 0) as totalTaxas,
            COALESCE(SUM(p.valorLiquido), 0) as totalLiquido
           FROM pdv_order_payments p
           INNER JOIN pdv_orders o ON p.pedidoId = o.pedidoId
           WHERE o.status != 'CANCELADO' AND o.isSofia = 0 ${dateFilter}
           GROUP BY p.formaPagamento
           ORDER BY total DESC`,
          params
        );
        
        // Faturamento por dia — apenas itens não-Sofia, exclui pedidos 100% Sofia.
        // Usa DATE_FORMAT para retornar string YYYY-MM-DD (evita "Invalid Date" no frontend)
        // e CONVERT_TZ para que pedidos noturnos caiam no dia correto em horário BR.
        const [dailyRows] = await db.execute(
          `SELECT DATE_FORMAT(CONVERT_TZ(o.createdAt, '+00:00', '-03:00'), '%Y-%m-%d') as dia,
            COUNT(DISTINCT o.id) as pedidos,
            COALESCE(SUM(oi.totalItem), 0) as faturamento
           FROM pdv_orders o
           JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId AND oi.isSofia = 0
           WHERE o.status != 'CANCELADO' AND o.isSofia = 0 ${dateFilter}
           GROUP BY DATE_FORMAT(CONVERT_TZ(o.createdAt, '+00:00', '-03:00'), '%Y-%m-%d')
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
      
      const [result] = await db.execute(
        "INSERT INTO pdv_cash_flow (tipo, descricao, valor, usuario) VALUES (?, ?, ?, ?)",
        [input.tipo, input.descricao, input.valor, seller.name]
      ) as any;
      const newId = result.insertId;
      await db.end();

      // Sync automático para a planilha (fire-and-forget)
      appendCashFlowToSheet({
        id: newId,
        tipo: input.tipo,
        descricao: input.descricao,
        valor: input.valor,
        usuario: seller.name,
        createdAt: new Date(),
      }).catch(err => console.error('[CashFlow] Erro ao sincronizar com planilha:', err));

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

  // ─── Sync Fluxo de Caixa ↔ Planilha ────────────────────────────────────────

  /** Exporta TODOS os suprimentos/sangrias do banco para a aba FLUXO_CAIXA da planilha */
  syncCashFlowToSheet: publicProcedure.mutation(async ({ ctx }) => {
    await requirePdvAdmin(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    try {
      const [rows] = await db.execute(
        "SELECT id, tipo, descricao, valor, usuario, createdAt FROM pdv_cash_flow ORDER BY createdAt ASC"
      );
      await db.end();
      const entries = (rows as any[]).map(r => ({
        id: r.id,
        tipo: r.tipo as 'SUPRIMENTO' | 'SANGRIA',
        descricao: r.descricao,
        valor: parseFloat(r.valor),
        usuario: r.usuario || '',
        createdAt: r.createdAt,
      }));
      const ok = await syncAllCashFlowToSheet(entries);
      return { success: ok, count: entries.length };
    } catch (err) {
      if (err instanceof TRPCError) throw err;
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    }
  }),

  /** Exporta TODOS os pedidos fechados para a aba VENDAS_CAIXA da planilha */
  syncSalesToSheet: publicProcedure.mutation(async ({ ctx }) => {
    await requirePdvAdmin(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    try {
      const [rows] = await db.execute(`
        SELECT o.id, o.createdAt, s.name as sellerName, o.canal, o.clienteNome,
               o.regime, o.totalComTaxa, o.formaPagamento, o.status, o.justificativa,
               COUNT(oi.id) as qtdItens,
               SUM(oi.quantidade) as totalPecas
        FROM pdv_orders o
        LEFT JOIN pdv_sellers s ON o.sellerId = s.id
        LEFT JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId
        WHERE o.isSofia = 0
        GROUP BY o.id
        ORDER BY o.createdAt ASC
      `);
      await db.end();
      const pedidos = (rows as any[]).map(r => {
        const isAtacadoMenos6 = r.regime === 'ATACADO' && parseInt(r.totalPecas || '0') < 6;
        return {
          id: r.id,
          createdAt: r.createdAt,
          sellerName: r.sellerName || '',
          canal: r.canal || '',
          clienteNome: r.clienteNome || '',
          regime: r.regime || '',
          totalComTaxa: parseFloat(r.totalComTaxa || '0'),
          formaPagamento: r.formaPagamento || '',
          status: r.status || '',
          qtdItens: parseInt(r.qtdItens || '0'),
          justificativaAtacado: isAtacadoMenos6 ? (r.justificativa || '') : undefined,
        };
      });
      const ok = await syncAllSalesToCashFlowSheet(pedidos);
      return { success: ok, count: pedidos.length };
    } catch (err) {
      if (err instanceof TRPCError) throw err;
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    }
  }),

  /** Importa movimentações da planilha FLUXO_CAIXA para o banco (apenas novas, por ID) */
  syncCashFlowFromSheet: publicProcedure.mutation(async ({ ctx }) => {
    await requirePdvAdmin(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    try {
      const sheetEntries = await readCashFlowFromSheet();
      // Filtrar apenas entradas sem ID (criadas diretamente na planilha)
      const novasEntradas = sheetEntries.filter(e => !e.id || isNaN(parseInt(e.id)));
      let inseridos = 0;
      for (const entry of novasEntradas) {
        if (!entry.tipo || !entry.descricao || !entry.valor) continue;
        const tipo = entry.tipo === 'SUPRIMENTO' ? 'SUPRIMENTO' : 'SANGRIA';
        await db.execute(
          "INSERT INTO pdv_cash_flow (tipo, descricao, valor, usuario) VALUES (?, ?, ?, ?)",
          [tipo, entry.descricao, entry.valor, entry.usuario || 'Planilha']
        );
        inseridos++;
      }
      await db.end();
      return { success: true, inseridos };
    } catch (err) {
      if (err instanceof TRPCError) throw err;
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    }
  }),

  /**
   * Retorna a pontuação do mês atual do vendedor logado + metas configuradas.
   * Usado na tela de funcionários para exibir a barra de progresso de metas.
   */
  getMyProgress: publicProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
    const seller = await requirePdvAuth(ctx);
    const db = await getDb();
    if (!db) return null;
    try {
      // Pontuação do período (padrão: mês atual)
      const now = new Date();
      const startDate = input?.startDate || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const endDate = input?.endDate || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, '0')}`;

      const [rows] = await db.execute(
        `SELECT
          COALESCE(SUM(
            CASE WHEN o.regime = 'ATACADO' THEN oi.ptAtacado * oi.quantidade
                 ELSE oi.ptVarejo * oi.quantidade END
          ), 0) as pontuacao,
          COALESCE(SUM(CASE WHEN oi.isSofia = 0 THEN oi.quantidade ELSE 0 END), 0) as totalPecas,
          COALESCE(SUM(CASE WHEN oi.isSofia = 0 THEN oi.totalItem ELSE 0 END), 0) as faturamento,
          COALESCE(SUM(oi.comissaoUnitaria * oi.quantidade), 0) as totalBonus
        FROM pdv_orders o
        JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId AND oi.isSofia = 0
        WHERE o.status != 'CANCELADO'
          AND o.isSofia = 0
          AND o.sellerId = ?
          AND DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00')) >= ?
          AND DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00')) <= ?`,
        [seller.sellerId, startDate, endDate]
      );

      // Buscar total de caixinhas no período (em horário BR)
      const [caixRows] = await db.execute(
        `SELECT COALESCE(SUM(s.valor), 0) as totalCaixinha, COUNT(s.id) as qtdCaixinha
         FROM pdv_order_services s
         JOIN pdv_orders o ON o.pedidoId = s.pedidoId
         WHERE s.tipo = 'CAIXINHA'
           AND o.sellerId = ?
           AND DATE(CONVERT_TZ(s.createdAt, '+00:00', '-03:00')) >= ?
           AND DATE(CONVERT_TZ(s.createdAt, '+00:00', '-03:00')) <= ?`,
        [seller.sellerId, startDate, endDate]
      );

      // Metas configuradas
      const [goalRows] = await db.execute("SELECT `key`, value FROM pdv_goals");
      const goals: Record<string, number> = {};
      (goalRows as any[]).forEach((g: any) => { goals[g.key] = parseFloat(g.value); });

      await db.end();

      const result = (rows as any[])[0];
      const caixResult = (caixRows as any[])[0];
      const pontuacao = parseFloat(result?.pontuacao || '0');
      const totalPecas = parseInt(result?.totalPecas || '0');
      const faturamento = parseFloat(result?.faturamento || '0');
      const totalBonus = parseFloat(result?.totalBonus || '0');
      const totalCaixinha = parseFloat(caixResult?.totalCaixinha || '0');
      const qtdCaixinha = parseInt(caixResult?.qtdCaixinha || '0');

      // Determinar nível de meta atingido
      const metaAtingida = pontuacao >= (goals.OURO || 0) && goals.OURO
        ? 'OURO'
        : pontuacao >= (goals.PRATA || 0) && goals.PRATA
          ? 'PRATA'
          : pontuacao >= (goals.BRONZE || 0) && goals.BRONZE
            ? 'BRONZE'
            : null;

      return {
        pontuacao,
        totalPecas,
        faturamento,
        totalBonus,
        totalCaixinha,
        qtdCaixinha,
        goals,
        metaAtingida,
        sellerName: seller.name,
        periodo: { startDate, endDate },
      };
    } catch (err) {
      if (err instanceof TRPCError) throw err;
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    }
  }),

  // Histórico de vendas do vendedor logado com pontuação por pedido
  getMyHistory: publicProcedure
    .input(z.object({
      page: z.number().default(1),
      limit: z.number().default(20),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const seller = await requirePdvAuth(ctx);
      const db = await getDb();
      if (!db) return { orders: [], total: 0, pages: 0 };
      try {
        const params: any[] = [seller.sellerId];
        let dateFilter = '';
        if (input.startDate) { dateFilter += " AND DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00')) >= ?"; params.push(input.startDate); }
        if (input.endDate) { dateFilter += " AND DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00')) <= ?"; params.push(input.endDate); }

        const countParams = [...params];
        const [countRows] = await db.execute(
          `SELECT COUNT(*) as total FROM pdv_orders o WHERE o.sellerId = ? AND o.isSofia = 0 AND o.status != 'CANCELADO'${dateFilter}`,
          countParams
        );
        const total = (countRows as any[])[0].total;
        const pages = Math.ceil(total / input.limit);
        const offset = (input.page - 1) * input.limit;

        const [rows] = await db.execute(
          `SELECT
            o.pedidoId,
            o.createdAt,
            o.clienteNome,
            o.regime,
            o.status,
            o.totalAplicado,
            COALESCE(SUM(oi.quantidade), 0) as totalPecas,
            COALESCE(SUM(
              CASE WHEN o.regime = 'ATACADO' THEN oi.ptAtacado * oi.quantidade
                   ELSE oi.ptVarejo * oi.quantidade END
            ), 0) as pontuacao,
            COALESCE(SUM(oi.comissaoUnitaria * oi.quantidade), 0) as bonusTotal,
            COALESCE((
              SELECT SUM(s.valor) FROM pdv_order_services s
              WHERE s.pedidoId = o.pedidoId AND s.tipo = 'CAIXINHA'
            ), 0) as caixinhaTotal
          FROM pdv_orders o
          LEFT JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId AND oi.isSofia = 0
          WHERE o.sellerId = ? AND o.isSofia = 0 AND o.status != 'CANCELADO'${dateFilter}
          GROUP BY o.pedidoId, o.createdAt, o.clienteNome, o.regime, o.status, o.totalAplicado
          ORDER BY o.createdAt DESC
          LIMIT ${input.limit} OFFSET ${offset}`,
          params
        );
        await db.end();
        return {
          orders: (rows as any[]).map(r => ({
            pedidoId: r.pedidoId,
            createdAt: r.createdAt,
            clienteNome: r.clienteNome,
            regime: r.regime,
            status: r.status,
            totalAplicado: parseFloat(r.totalAplicado || '0'),
            totalPecas: parseInt(r.totalPecas || '0'),
            pontuacao: parseFloat(r.pontuacao || '0'),
            bonusTotal: parseFloat(r.bonusTotal || '0'),
            caixinhaTotal: parseFloat(r.caixinhaTotal || '0'),
          })),
          total,
          pages,
        };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }
    }),

  // Painel por vendedor (admin only) — consolida vendas, bônus, metas e histórico de pedidos
  sellerPanel: publicProcedure
    .input(z.object({
      sellerId: z.number().optional(), // undefined = todos os vendedores
      startDate: z.string(),
      endDate: z.string(),
    }))
    .query(async ({ input, ctx }) => {
      await requirePdvAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      try {
        const sellerFilter = input.sellerId ? " AND id = ?" : "";
        const sellerParams: any[] = input.sellerId ? [input.sellerId] : [];

        // Lista de vendedores ativos (filtrada ou todos)
        const [sellerRows] = await db.execute(
          `SELECT id, name, username FROM pdv_sellers WHERE isActive = 1${sellerFilter} ORDER BY name`,
          sellerParams
        );
        const sellers = sellerRows as any[];

        if (sellers.length === 0) {
          await db.end();
          return { sellers: [], kpis: null, daily: [], recentOrders: [], goals: {} };
        }

        const sellerIds = sellers.map((s: any) => s.id);
        const placeholders = sellerIds.map(() => "?").join(",");
        // Cada query recebe seu próprio array de parâmetros para evitar reutilização
        const mkParams = () => [...sellerIds, input.startDate, input.endDate];

        // KPIs consolidados para os vendedores selecionados
        const [kpiRows] = await db.execute(
          `SELECT
            COUNT(DISTINCT o.id) as totalPedidos,
            COALESCE(SUM(CASE WHEN oi.isSofia = 0 THEN oi.quantidade ELSE 0 END), 0) as totalPecas,
            COALESCE(SUM(CASE WHEN oi.isSofia = 0 THEN oi.totalItem ELSE 0 END), 0) as faturamento,
            COALESCE(SUM(CASE WHEN oi.isSofia = 0 THEN oi.quantidade * oi.comissaoUnitaria ELSE 0 END), 0) as totalBonus,
            COALESCE(SUM(CASE WHEN o.regime = 'ATACADO' AND oi.isSofia = 0 THEN oi.totalItem ELSE 0 END), 0) as faturamentoAtacado,
            COALESCE(SUM(CASE WHEN o.regime = 'VAREJO' AND oi.isSofia = 0 THEN oi.totalItem ELSE 0 END), 0) as faturamentoVarejo,
            COALESCE(SUM(CASE WHEN o.canal = 'BALCAO' AND oi.isSofia = 0 THEN oi.totalItem ELSE 0 END), 0) as faturamentoBalcao,
            COALESCE(SUM(CASE WHEN o.canal = 'WHATSAPP' AND oi.isSofia = 0 THEN oi.totalItem ELSE 0 END), 0) as faturamentoWhatsapp,
            COUNT(CASE WHEN o.status = 'CANCELADO' THEN 1 END) as pedidosCancelados
          FROM pdv_orders o
          LEFT JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId
          WHERE o.sellerId IN (${placeholders})
            AND o.status != 'CANCELADO'
            AND DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00')) >= ?
            AND DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00')) <= ?`,
          mkParams()
        );

        // Caixinha total (serviços do tipo CAIXINHA)
        const [caixRows] = await db.execute(
          `SELECT COALESCE(SUM(os.valor), 0) as totalCaixinha
          FROM pdv_order_services os
          JOIN pdv_orders o ON o.pedidoId = os.pedidoId
          WHERE os.tipo = 'CAIXINHA'
            AND o.status != 'CANCELADO'
            AND o.sellerId IN (${placeholders})
            AND DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00')) >= ?
            AND DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00')) <= ?`,
          mkParams()
        );

        // Faturamento por dia (dia em horário de Brasília, retorno como string YYYY-MM-DD)
        const [dailyRows] = await db.execute(
          `SELECT
            DATE_FORMAT(CONVERT_TZ(o.createdAt, '+00:00', '-03:00'), '%Y-%m-%d') as dia,
            COUNT(DISTINCT o.id) as pedidos,
            COALESCE(SUM(CASE WHEN oi.isSofia = 0 THEN oi.quantidade ELSE 0 END), 0) as pecas,
            COALESCE(SUM(CASE WHEN oi.isSofia = 0 THEN oi.totalItem ELSE 0 END), 0) as faturamento,
            COALESCE(SUM(CASE WHEN oi.isSofia = 0 THEN oi.quantidade * oi.comissaoUnitaria ELSE 0 END), 0) as bonus
          FROM pdv_orders o
          LEFT JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId
          WHERE o.sellerId IN (${placeholders})
            AND o.status != 'CANCELADO'
            AND DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00')) >= ?
            AND DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00')) <= ?
          GROUP BY DATE_FORMAT(CONVERT_TZ(o.createdAt, '+00:00', '-03:00'), '%Y-%m-%d')
          ORDER BY dia ASC`,
          mkParams()
        );

        // Pedidos recentes (50 mais recentes)
        const [orderRows] = await db.execute(
          `SELECT
            o.pedidoId, o.createdAt, o.clienteNome, o.regime, o.canal,
            o.status, o.totalAplicado, o.sellerName,
            COALESCE(SUM(CASE WHEN oi.isSofia = 0 THEN oi.quantidade ELSE 0 END), 0) as totalPecas,
            COALESCE(SUM(CASE WHEN oi.isSofia = 0 THEN oi.quantidade * oi.comissaoUnitaria ELSE 0 END), 0) as bonusTotal,
            COALESCE((SELECT SUM(os2.valor) FROM pdv_order_services os2 WHERE os2.pedidoId = o.pedidoId AND os2.tipo = 'CAIXINHA'), 0) as caixinhaTotal
          FROM pdv_orders o
          LEFT JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId
          WHERE o.sellerId IN (${placeholders})
            AND DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00')) >= ?
            AND DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00')) <= ?
          GROUP BY o.pedidoId, o.createdAt, o.clienteNome, o.regime, o.canal, o.status, o.totalAplicado, o.sellerName
          ORDER BY o.createdAt DESC
          LIMIT 50`,
          mkParams()
        );

        // Metas
        const [goalRows] = await db.execute("SELECT \`key\`, value FROM pdv_goals");
        const goals: Record<string, number> = {};
        (goalRows as any[]).forEach((g: any) => { goals[g.key] = parseFloat(g.value); });

        await db.end();

        const kpi = (kpiRows as any[])[0];
        const faturamento = parseFloat(kpi.faturamento || '0');
        const totalBonus = parseFloat(kpi.totalBonus || '0');
        const totalCaixinha = parseFloat((caixRows as any[])[0]?.totalCaixinha || '0');

        return {
          sellers,
          kpis: {
            totalPedidos: parseInt(kpi.totalPedidos || '0'),
            totalPecas: parseInt(kpi.totalPecas || '0'),
            faturamento,
            totalBonus,
            totalCaixinha,
            faturamentoAtacado: parseFloat(kpi.faturamentoAtacado || '0'),
            faturamentoVarejo: parseFloat(kpi.faturamentoVarejo || '0'),
            faturamentoBalcao: parseFloat(kpi.faturamentoBalcao || '0'),
            faturamentoWhatsapp: parseFloat(kpi.faturamentoWhatsapp || '0'),
            pedidosCancelados: parseInt(kpi.pedidosCancelados || '0'),
            metaAtingida: faturamento >= (goals.BRONZE || 0)
              ? faturamento >= (goals.OURO || 0) ? 'OURO'
                : faturamento >= (goals.PRATA || 0) ? 'PRATA' : 'BRONZE'
              : null,
          },
          daily: (dailyRows as any[]).map(d => ({
            dia: d.dia,
            pedidos: parseInt(d.pedidos || '0'),
            pecas: parseInt(d.pecas || '0'),
            faturamento: parseFloat(d.faturamento || '0'),
            bonus: parseFloat(d.bonus || '0'),
          })),
          recentOrders: (orderRows as any[]).map(r => ({
            pedidoId: r.pedidoId,
            createdAt: r.createdAt,
            clienteNome: r.clienteNome,
            regime: r.regime,
            canal: r.canal,
            status: r.status,
            sellerName: r.sellerName,
            totalAplicado: parseFloat(r.totalAplicado || '0'),
            totalPecas: parseInt(r.totalPecas || '0'),
            bonusTotal: parseFloat(r.bonusTotal || '0'),
            caixinhaTotal: parseFloat(r.caixinhaTotal || '0'),
          })),
          goals,
        };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        console.error("[PDV SellerPanel] Error:", err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }
    }),
});
