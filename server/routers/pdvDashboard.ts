import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { verifyPdvToken } from "./pdvAuth";
import {
  appendCashFlowToSheet,
  syncAllCashFlowToSheet,
  syncAllSalesToCashFlowSheet,
  readCashFlowFromSheet,
} from "./pdvSheetsWriter";
import type { Request } from "express";
import {
  firstOfMonthYmdSaoPaulo,
  todayYmdSaoPaulo,
  yesterdayYmdSaoPaulo,
} from "@shared/spCalendar";
import {
  createPdvMysqlConnection,
  orderDayDateExpr,
  orderDayYmdExpr,
  spLocalDateTimeExpr,
} from "../pdvMysql";

async function getDb() {
  return createPdvMysqlConnection();
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

/**
 * Mês (YYYY-MM) em que o `pontosOffset` do vendedor entra na query do dashboard.
 * Só devolve valor quando **início e fim do filtro** caem no **mesmo** mês; caso contrário
 * retorna `null` e o SQL **não soma** `pontosOffset` (evita aplicar calibragem de um mês
 * a um intervalo multi-mês).
 */
function pontosOffsetMesParam(startDate?: string, endDate?: string): string | null {
  if (!startDate || !endDate) return null;
  if (startDate.slice(0, 7) !== endDate.slice(0, 7)) return null;
  return startDate.slice(0, 7);
}

/**
 * Data fim usada na **soma** `pontosSistema` para gravar `pontosOffset`.
 * O print Manus não inclui o dia corrente em SP; se `requestedEnd` for hoje (ou futuro),
 * usa **ontem** para que o dashboard com data fim = hoje mostre Manus(…ontem) + PT(hoje).
 */
function manusCalibrationSumEndDate(requestedEnd: string): { sumEndDate: string; wasClamped: boolean } {
  const todaySp = todayYmdSaoPaulo();
  if (requestedEnd < todaySp) {
    return { sumEndDate: requestedEnd, wasClamped: false };
  }
  return { sumEndDate: yesterdayYmdSaoPaulo(), wasClamped: true };
}

/** Converte valor vindo do MySQL (string, Decimal, BigInt) para número estável no JSON/tRPC. */
function rowNumber(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v).trim());
  return Number.isFinite(n) ? n : 0;
}

/** Itens que entram em faturamento/PT de metas (import legado: NULL em isSofia = tratar como peça normal). */
const SQL_OI_NAO_SOFIA = "(COALESCE(oi.isSofia, 0) = 0)";
/** Mesmo critério na subquery sem alias de tabela. */
const SQL_ITEMS_NAO_SOFIA_WHERE = "COALESCE(isSofia, 0) = 0";

/** Migração 0017 ainda não aplicada no MySQL (Unknown column 'pontosOffset'). */
function isMissingPontosOffsetColumn(err: unknown): boolean {
  const e = err as { code?: string; errno?: number; message?: string };
  if (e?.errno === 1054) return true;
  if (e?.code === "ER_BAD_FIELD_ERROR") return true;
  const msg = typeof e?.message === "string" ? e.message : "";
  return msg.includes("Unknown column") && (msg.includes("pontosOffset") || msg.includes("pontosOffsetMes"));
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
        const dayCmp = orderDayDateExpr("o");
        const dayYmd = orderDayYmdExpr("o");
        let dateFilter = "";
        const params: any[] = [];

        if (input.startDate) {
          dateFilter += ` AND ${dayCmp} >= ?`;
          params.push(input.startDate);
        }
        if (input.endDate) {
          dateFilter += ` AND ${dayCmp} <= ?`;
          params.push(input.endDate);
        }

        // KPIs e R$ por vendedor/dia: mesmo critério do Manus — soma `totalItem` só de itens não-Sofia
        // (alinha com PT; `totalAplicado` do pedido inclui Sofia/serviços e infla o gráfico “Por vendedor”).
        const joinItensNaoSofia = `LEFT JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId AND ${SQL_OI_NAO_SOFIA}`;
        const [totalRows] = await db.execute(
          `SELECT 
            COUNT(DISTINCT o.id) as totalPedidos,
            COALESCE(SUM(oi.totalItem), 0) as faturamento,
            CASE WHEN COUNT(DISTINCT o.id) > 0
              THEN COALESCE(SUM(oi.totalItem), 0) / COUNT(DISTINCT o.id) ELSE 0 END as ticketMedio,
            COALESCE(SUM(CASE WHEN o.regime = 'ATACADO' THEN oi.totalItem ELSE 0 END), 0) as faturamentoAtacado,
            COALESCE(SUM(CASE WHEN o.regime = 'VAREJO' THEN oi.totalItem ELSE 0 END), 0) as faturamentoVarejo,
            COALESCE(SUM(CASE WHEN o.canal = 'BALCAO' THEN oi.totalItem ELSE 0 END), 0) as faturamentoBalcao,
            COALESCE(SUM(CASE WHEN o.canal = 'WHATSAPP' THEN oi.totalItem ELSE 0 END), 0) as faturamentoWhatsapp
           FROM pdv_orders o
           ${joinItensNaoSofia}
           WHERE o.status != 'CANCELADO' ${dateFilter}`,
          params
        );

        // Por vendedor: R$ = soma itens não-Sofia (Manus); PT = mesma base de itens (+ offset Manus no mês).
        const offsetYm = pontosOffsetMesParam(input.startDate, input.endDate);
        const sqlBySellerComOffset = `SELECT s.name as sellerName,
            COALESCE(m.pedidos, 0) as pedidos,
            COALESCE(m.faturamento, 0) as faturamento,
            COALESCE(m.ticketMedio, 0) as ticketMedio,
            COALESCE(pt.pontuacao, 0)
              + (CASE WHEN ? IS NOT NULL AND s.pontosOffsetMes = ? THEN COALESCE(s.pontosOffset, 0) ELSE 0 END) as pontuacao,
            COALESCE(s.pontosOffset, 0) as pontosOffset,
            s.pontosOffsetMes as pontosOffsetMes
           FROM pdv_sellers s
           LEFT JOIN (
             SELECT o.sellerId,
               COUNT(DISTINCT o.id) as pedidos,
               COALESCE(SUM(oi.totalItem), 0) as faturamento,
               CASE WHEN COUNT(DISTINCT o.id) > 0
                 THEN COALESCE(SUM(oi.totalItem), 0) / COUNT(DISTINCT o.id) ELSE 0 END as ticketMedio
             FROM pdv_orders o
             ${joinItensNaoSofia}
             WHERE o.status != 'CANCELADO' ${dateFilter}
             GROUP BY o.sellerId
           ) m ON m.sellerId = s.id
           LEFT JOIN (
             SELECT o.sellerId,
               COALESCE(SUM(
                 CASE WHEN o.regime = 'ATACADO' THEN oi.ptAtacado * oi.quantidade
                      ELSE oi.ptVarejo * oi.quantidade END
               ), 0) as pontuacao
             FROM pdv_orders o
             INNER JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId AND ${SQL_OI_NAO_SOFIA}
             WHERE o.status != 'CANCELADO' ${dateFilter}
             GROUP BY o.sellerId
           ) pt ON pt.sellerId = s.id
           WHERE s.isActive = 1
           ORDER BY COALESCE(m.faturamento, 0) DESC, s.name`;
        const sqlBySellerLegacy = `SELECT s.name as sellerName,
            COALESCE(m.pedidos, 0) as pedidos,
            COALESCE(m.faturamento, 0) as faturamento,
            COALESCE(m.ticketMedio, 0) as ticketMedio,
            COALESCE(pt.pontuacao, 0) as pontuacao
           FROM pdv_sellers s
           LEFT JOIN (
             SELECT o.sellerId,
               COUNT(DISTINCT o.id) as pedidos,
               COALESCE(SUM(oi.totalItem), 0) as faturamento,
               CASE WHEN COUNT(DISTINCT o.id) > 0
                 THEN COALESCE(SUM(oi.totalItem), 0) / COUNT(DISTINCT o.id) ELSE 0 END as ticketMedio
             FROM pdv_orders o
             ${joinItensNaoSofia}
             WHERE o.status != 'CANCELADO' ${dateFilter}
             GROUP BY o.sellerId
           ) m ON m.sellerId = s.id
           LEFT JOIN (
             SELECT o.sellerId,
               COALESCE(SUM(
                 CASE WHEN o.regime = 'ATACADO' THEN oi.ptAtacado * oi.quantidade
                      ELSE oi.ptVarejo * oi.quantidade END
               ), 0) as pontuacao
             FROM pdv_orders o
             INNER JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId AND ${SQL_OI_NAO_SOFIA}
             WHERE o.status != 'CANCELADO' ${dateFilter}
             GROUP BY o.sellerId
           ) pt ON pt.sellerId = s.id
           WHERE s.isActive = 1
           ORDER BY COALESCE(m.faturamento, 0) DESC, s.name`;
        // dateFilter aparece em duas subqueries (m e pt); cada uma precisa da mesma lista de params.
        const sellerDateParams = [...params, ...params];
        let sellerRows: any[];
        try {
          const [r] = await db.execute(sqlBySellerComOffset, [offsetYm, offsetYm, ...sellerDateParams]);
          sellerRows = r as any[];
        } catch (e) {
          if (!isMissingPontosOffsetColumn(e)) throw e;
          const [r] = await db.execute(sqlBySellerLegacy, sellerDateParams);
          sellerRows = r as any[];
        }

        // Por forma de pagamento — inclui pedidos Sofia (o dinheiro entrou no caixa).
        const excludeSofiaPayments = process.env.PDV_DASHBOARD_PAYMENTS_EXCLUDE_SOFIA === "1";
        const paymentSofiaFilter = excludeSofiaPayments ? " AND o.isSofia = 0" : "";
        const [paymentRows] = await db.execute(
          `SELECT p.formaPagamento, 
            COUNT(DISTINCT p.pedidoId) as pedidos,
            COALESCE(SUM(p.valor), 0) as total,
            COALESCE(SUM(p.taxa), 0) as totalTaxas,
            COALESCE(SUM(p.valorLiquido), 0) as totalLiquido
           FROM pdv_order_payments p
           INNER JOIN pdv_orders o ON p.pedidoId = o.pedidoId
           WHERE o.status != 'CANCELADO'${paymentSofiaFilter} ${dateFilter}
           GROUP BY p.formaPagamento
           ORDER BY total DESC`,
          params
        );

        // Faturamento por dia — itens não-Sofia (igual KPI / Manus).
        const [dailyRows] = await db.execute(
          `SELECT ${dayYmd} as dia,
            COUNT(DISTINCT o.id) as pedidos,
            COALESCE(SUM(oi.totalItem), 0) as faturamento
           FROM pdv_orders o
           ${joinItensNaoSofia}
           WHERE o.status != 'CANCELADO' ${dateFilter}
           GROUP BY ${dayYmd}
           ORDER BY dia ASC`,
          params
        );

        // Metas
        const [goalRows] = await db.execute("SELECT * FROM pdv_goals ORDER BY value ASC");

        await db.end();

        const rawSummary = (totalRows as any[])[0] || {};
        const summary = {
          totalPedidos: rowNumber(rawSummary.totalPedidos),
          faturamento: rowNumber(rawSummary.faturamento),
          ticketMedio: rowNumber(rawSummary.ticketMedio),
          faturamentoAtacado: rowNumber(rawSummary.faturamentoAtacado),
          faturamentoVarejo: rowNumber(rawSummary.faturamentoVarejo),
          faturamentoBalcao: rowNumber(rawSummary.faturamentoBalcao),
          faturamentoWhatsapp: rowNumber(rawSummary.faturamentoWhatsapp),
        };

        if (summary.totalPedidos === 0) {
          console.warn("[pdvDashboard.summary] zero pedidos no período", {
            startDate: input.startDate,
            endDate: input.endDate,
            orderDayMode: process.env.PDV_DASHBOARD_ORDER_DAY_MODE || "convert_tz",
          });
        }

        const bySeller = (sellerRows as any[]).map((r) => ({
          sellerName: String(r.sellerName ?? ""),
          pedidos: rowNumber(r.pedidos),
          faturamento: rowNumber(r.faturamento),
          ticketMedio: rowNumber(r.ticketMedio),
          pontuacao: rowNumber(r.pontuacao),
          pontosOffset: rowNumber(r.pontosOffset),
          pontosOffsetMes: r.pontosOffsetMes != null && r.pontosOffsetMes !== "" ? String(r.pontosOffsetMes) : null,
        }));

        const byPayment = (paymentRows as any[]).map((r) => ({
          formaPagamento: r.formaPagamento,
          pedidos: rowNumber(r.pedidos),
          total: rowNumber(r.total),
          totalTaxas: rowNumber(r.totalTaxas),
          totalLiquido: rowNumber(r.totalLiquido),
        }));

        const byDay = (dailyRows as any[]).map((r) => ({
          dia: r.dia,
          pedidos: rowNumber(r.pedidos),
          faturamento: rowNumber(r.faturamento),
        }));

        const goals = (goalRows as any[]).map((g: any) => ({
          ...g,
          value: rowNumber(g.value),
        }));

        return {
          summary,
          bySeller,
          byPayment,
          byDay,
          goals,
          meta: {
            orderDayMode: process.env.PDV_DASHBOARD_ORDER_DAY_MODE || "convert_tz",
            startDate: input.startDate ?? null,
            endDate: input.endDate ?? null,
            /** Quando não é null, o PT soma `pontosOffset` só nos vendedores com `pontosOffsetMes` igual a este YYYY-MM. */
            pontosOffsetYm: offsetYm,
          },
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
        
        if (input.startDate) { query += ` AND DATE(${spLocalDateTimeExpr("createdAt")}) >= ?`; params.push(input.startDate); }
        if (input.endDate) { query += ` AND DATE(${spLocalDateTimeExpr("createdAt")}) <= ?`; params.push(input.endDate); }
        
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

  /**
   * Alinha PT ao Manus no mês do período: grava em cada vendedor `pontosOffset` e `pontosOffsetMes`
   * como (pontuacaoManus − soma atual de PT no período). Novas vendas somam em cima desse total.
   * Período deve ser inteiro dentro de um único YYYY-MM.
   *
   * A soma de PT usada no offset **nunca inclui o dia atual em America/Sao_Paulo** (igual ao Manus):
   * se `endDate` for hoje ou futuro, o servidor usa **ontem** como fim da soma. Assim, com filtro
   * do dashboard até **hoje**, o PT exibido fica Manus(até ontem) + vendas de hoje no Railway.
   *
   * O **dashboard** só soma esse offset no PT quando o filtro de datas tem início e fim no **mesmo**
   * mês e esse mês é igual a `pontosOffsetMes` do vendedor (ver `pontosOffsetMesParam`).
   */
  syncPontosManusOffsets: publicProcedure
    .input(z.object({
      startDate: z.string(),
      endDate: z.string(),
      targets: z.array(z.object({
        sellerName: z.string().min(1),
        pontuacaoManus: z.number(),
      })).min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      await requirePdvAdmin(ctx);
      if (input.startDate.slice(0, 7) !== input.endDate.slice(0, 7)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Use um período contido em um único mês (ex.: 2026-05-01 a 2026-05-31).",
        });
      }
      const ym = input.startDate.slice(0, 7);
      const { sumEndDate, wasClamped } = manusCalibrationSumEndDate(input.endDate);
      if (sumEndDate < input.startDate) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            `Calibragem inválida: com fim efetivo ${sumEndDate} antes do início ${input.startDate} ` +
            `(hoje SP=${todayYmdSaoPaulo()}). No 1º dia do mês use explicitamente o último dia útil do Manus no mês passado ou aguarde.`,
        });
      }
      if (sumEndDate.slice(0, 7) !== input.startDate.slice(0, 7)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            `Após ajuste para não incluir hoje em SP, o fim (${sumEndDate}) não fica no mês ${ym}. ` +
            `Ajuste start/end ou rode após o dia 1.`,
        });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const dayCmp = orderDayDateExpr("o");
      let dateFilter = "";
      const params: any[] = [];
      dateFilter += ` AND ${dayCmp} >= ?`;
      params.push(input.startDate);
      dateFilter += ` AND ${dayCmp} <= ?`;
      params.push(sumEndDate);

      const results: { sellerName: string; pontosSistema: number; pontuacaoManus: number; offset: number }[] = [];

      try {
        for (const t of input.targets) {
          const [sellerRows] = await db.execute(
            `SELECT id, name FROM pdv_sellers WHERE isActive = 1 AND UPPER(TRIM(name)) = ?`,
            [t.sellerName.toUpperCase().trim()]
          );
          const sellers = sellerRows as any[];
          if (sellers.length === 0) {
            throw new TRPCError({ code: "NOT_FOUND", message: `Vendedor não encontrado: ${t.sellerName}` });
          }
          const sellerId = sellers[0].id as number;

          const [sumRows] = await db.execute(
            `SELECT COALESCE(SUM(
              CASE WHEN o.regime = 'ATACADO' THEN oi.ptAtacado * oi.quantidade
                   ELSE oi.ptVarejo * oi.quantidade END
            ), 0) as pontuacao
            FROM pdv_orders o
            JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId AND (COALESCE(oi.isSofia, 0) = 0)
            WHERE o.sellerId = ? AND o.status != 'CANCELADO' ${dateFilter}`,
            [sellerId, ...params]
          );
          const pontosSistema = parseFloat((sumRows as any[])[0]?.pontuacao ?? "0");
          const offset = Math.round((t.pontuacaoManus - pontosSistema) * 100) / 100;

          try {
            await db.execute(
              `UPDATE pdv_sellers SET pontosOffset = ?, pontosOffsetMes = ? WHERE id = ?`,
              [offset, ym, sellerId]
            );
          } catch (e) {
            if (isMissingPontosOffsetColumn(e)) {
              throw new TRPCError({
                code: "PRECONDITION_FAILED",
                message:
                  "Colunas pontosOffset/pontosOffsetMes inexistentes. Execute no MySQL o arquivo drizzle/0017_pdv_sellers_pontos_manus.sql (ou o ALTER equivalente) e tente de novo.",
              });
            }
            throw e;
          }
          results.push({
            sellerName: sellers[0].name,
            pontosSistema,
            pontuacaoManus: t.pontuacaoManus,
            offset,
          });
        }
        return {
          ok: true as const,
          mes: ym,
          sumEndDate,
          endDateRequested: input.endDate,
          calibrationClampedToYesterday: wasClamped,
          results,
        };
      } finally {
        await db.end();
      }
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
    // Pontuação do período (padrão: 1º do mês em SP → hoje em SP — Railway UTC não deve “voltar” o dia)
    const startDate = input?.startDate ?? firstOfMonthYmdSaoPaulo();
    const endDate = input?.endDate ?? todayYmdSaoPaulo();
    const offsetYm = pontosOffsetMesParam(startDate, endDate);

    try {
      let rows: any[];
      const dayCmp = orderDayDateExpr("o");
      try {
        const [r] = await db.execute(
          `SELECT
          COALESCE(SUM(
            CASE WHEN o.regime = 'ATACADO' THEN oi.ptAtacado * oi.quantidade
                 ELSE oi.ptVarejo * oi.quantidade END
          ), 0)
          + (CASE WHEN ? IS NOT NULL AND se.pontosOffsetMes = ? THEN COALESCE(se.pontosOffset, 0) ELSE 0 END) as pontuacao,
          COALESCE(SUM(CASE WHEN (COALESCE(oi.isSofia, 0) = 0) THEN oi.quantidade ELSE 0 END), 0) as totalPecas,
          COALESCE(SUM(CASE WHEN (COALESCE(oi.isSofia, 0) = 0) THEN oi.totalItem ELSE 0 END), 0) as faturamento,
          COALESCE(SUM(oi.comissaoUnitaria * oi.quantidade), 0) as totalBonus
        FROM pdv_sellers se
        LEFT JOIN pdv_orders o ON o.sellerId = se.id
          AND o.status != 'CANCELADO'
          AND ${dayCmp} >= ?
          AND ${dayCmp} <= ?
        LEFT JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId AND (COALESCE(oi.isSofia, 0) = 0) AND o.id IS NOT NULL
        WHERE se.id = ?
        GROUP BY se.id, se.pontosOffset, se.pontosOffsetMes`,
          [offsetYm, offsetYm, startDate, endDate, seller.sellerId]
        );
        rows = r as any[];
      } catch (e) {
        if (!isMissingPontosOffsetColumn(e)) throw e;
        const [r] = await db.execute(
          `SELECT
          COALESCE(SUM(
            CASE WHEN o.regime = 'ATACADO' THEN oi.ptAtacado * oi.quantidade
                 ELSE oi.ptVarejo * oi.quantidade END
          ), 0) as pontuacao,
          COALESCE(SUM(CASE WHEN (COALESCE(oi.isSofia, 0) = 0) THEN oi.quantidade ELSE 0 END), 0) as totalPecas,
          COALESCE(SUM(CASE WHEN (COALESCE(oi.isSofia, 0) = 0) THEN oi.totalItem ELSE 0 END), 0) as faturamento,
          COALESCE(SUM(oi.comissaoUnitaria * oi.quantidade), 0) as totalBonus
        FROM pdv_orders o
        JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId AND (COALESCE(oi.isSofia, 0) = 0)
        WHERE o.status != 'CANCELADO'
          AND o.sellerId = ?
          AND ${dayCmp} >= ?
          AND ${dayCmp} <= ?`,
          [seller.sellerId, startDate, endDate]
        );
        rows = r as any[];
      }

      // Buscar total de caixinhas no período (em horário BR)
      const [caixRows] = await db.execute(
        `SELECT COALESCE(SUM(s.valor), 0) as totalCaixinha, COUNT(s.id) as qtdCaixinha
         FROM pdv_order_services s
         JOIN pdv_orders o ON o.pedidoId = s.pedidoId
         WHERE s.tipo = 'CAIXINHA'
           AND o.sellerId = ?
           AND DATE(${spLocalDateTimeExpr("s.createdAt")}) >= ?
           AND DATE(${spLocalDateTimeExpr("s.createdAt")}) <= ?`,
        [seller.sellerId, startDate, endDate]
      );

      // Metas configuradas
      const [goalRows] = await db.execute("SELECT `key`, value FROM pdv_goals");
      const goals: Record<string, number> = {};
      (goalRows as any[]).forEach((g: any) => { goals[g.key] = parseFloat(g.value); });

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
      console.error("[pdvDashboard.getMyProgress]", err);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    } finally {
      await db.end();
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
        const dayCmp = orderDayDateExpr("o");
        let dateFilter = '';
        if (input.startDate) { dateFilter += ` AND ${dayCmp} >= ?`; params.push(input.startDate); }
        if (input.endDate) { dateFilter += ` AND ${dayCmp} <= ?`; params.push(input.endDate); }

        const countParams = [...params];
        const [countRows] = await db.execute(
          `SELECT COUNT(*) as total FROM pdv_orders o WHERE o.sellerId = ? AND o.status != 'CANCELADO'${dateFilter}`,
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
          LEFT JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId AND (COALESCE(oi.isSofia, 0) = 0)
          WHERE o.sellerId = ? AND o.status != 'CANCELADO'${dateFilter}
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
        const dayCmpO = orderDayDateExpr("o");
        const dayYmdO = orderDayYmdExpr("o");
        // Cada query recebe seu próprio array de parâmetros para evitar reutilização
        const mkParams = () => [...sellerIds, input.startDate, input.endDate];

        // KPIs consolidados para os vendedores selecionados
        const [kpiRows] = await db.execute(
          `SELECT
            COUNT(DISTINCT o.id) as totalPedidos,
            COALESCE(SUM(CASE WHEN (COALESCE(oi.isSofia, 0) = 0) THEN oi.quantidade ELSE 0 END), 0) as totalPecas,
            COALESCE(SUM(CASE WHEN (COALESCE(oi.isSofia, 0) = 0) THEN oi.totalItem ELSE 0 END), 0) as faturamento,
            COALESCE(SUM(CASE WHEN (COALESCE(oi.isSofia, 0) = 0) THEN oi.quantidade * oi.comissaoUnitaria ELSE 0 END), 0) as totalBonus,
            COALESCE(SUM(CASE WHEN o.regime = 'ATACADO' AND (COALESCE(oi.isSofia, 0) = 0) THEN oi.totalItem ELSE 0 END), 0) as faturamentoAtacado,
            COALESCE(SUM(CASE WHEN o.regime = 'VAREJO' AND (COALESCE(oi.isSofia, 0) = 0) THEN oi.totalItem ELSE 0 END), 0) as faturamentoVarejo,
            COALESCE(SUM(CASE WHEN o.canal = 'BALCAO' AND (COALESCE(oi.isSofia, 0) = 0) THEN oi.totalItem ELSE 0 END), 0) as faturamentoBalcao,
            COALESCE(SUM(CASE WHEN o.canal = 'WHATSAPP' AND (COALESCE(oi.isSofia, 0) = 0) THEN oi.totalItem ELSE 0 END), 0) as faturamentoWhatsapp,
            COUNT(CASE WHEN o.status = 'CANCELADO' THEN 1 END) as pedidosCancelados
          FROM pdv_orders o
          LEFT JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId
          WHERE o.sellerId IN (${placeholders})
            AND o.status != 'CANCELADO'
            AND ${dayCmpO} >= ?
            AND ${dayCmpO} <= ?`,
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
            AND ${dayCmpO} >= ?
            AND ${dayCmpO} <= ?`,
          mkParams()
        );

        // Sofia: faturamento, comissão da loja e reembolso do vendedor
        // (faturamento - comissaoLoja). Mesma fórmula usada em pdvSofia/pdvRelatorio.
        const [sofiaRows] = await db.execute(
          `SELECT
            COUNT(DISTINCT o.id) as totalPedidosSofia,
            COALESCE(SUM(oi.quantidade), 0) as totalPecasSofia,
            COALESCE(SUM(oi.totalItem), 0) as faturamentoSofia,
            COALESCE(SUM(COALESCE(oi.comissaoLojaSofia, 0) * oi.quantidade), 0) as comissaoLojaSofia
          FROM pdv_orders o
          JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId AND oi.isSofia = 1
          WHERE o.status != 'CANCELADO'
            AND o.sellerId IN (${placeholders})
            AND ${dayCmpO} >= ?
            AND ${dayCmpO} <= ?`,
          mkParams()
        );

        // Faturamento por dia (dia em horário de Brasília, retorno como string YYYY-MM-DD)
        const [dailyRows] = await db.execute(
          `SELECT
            ${dayYmdO} as dia,
            COUNT(DISTINCT o.id) as pedidos,
            COALESCE(SUM(CASE WHEN (COALESCE(oi.isSofia, 0) = 0) THEN oi.quantidade ELSE 0 END), 0) as pecas,
            COALESCE(SUM(CASE WHEN (COALESCE(oi.isSofia, 0) = 0) THEN oi.totalItem ELSE 0 END), 0) as faturamento,
            COALESCE(SUM(CASE WHEN (COALESCE(oi.isSofia, 0) = 0) THEN oi.quantidade * oi.comissaoUnitaria ELSE 0 END), 0) as bonus
          FROM pdv_orders o
          LEFT JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId
          WHERE o.sellerId IN (${placeholders})
            AND o.status != 'CANCELADO'
            AND ${dayCmpO} >= ?
            AND ${dayCmpO} <= ?
          GROUP BY ${dayYmdO}
          ORDER BY dia ASC`,
          mkParams()
        );

        // Pedidos recentes (50 mais recentes)
        const [orderRows] = await db.execute(
          `SELECT
            o.pedidoId, o.createdAt, o.clienteNome, o.regime, o.canal,
            o.status, o.totalAplicado, o.sellerName,
            COALESCE(SUM(CASE WHEN (COALESCE(oi.isSofia, 0) = 0) THEN oi.quantidade ELSE 0 END), 0) as totalPecas,
            COALESCE(SUM(CASE WHEN (COALESCE(oi.isSofia, 0) = 0) THEN oi.quantidade * oi.comissaoUnitaria ELSE 0 END), 0) as bonusTotal,
            COALESCE((SELECT SUM(os2.valor) FROM pdv_order_services os2 WHERE os2.pedidoId = o.pedidoId AND os2.tipo = 'CAIXINHA'), 0) as caixinhaTotal
          FROM pdv_orders o
          LEFT JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId
          WHERE o.sellerId IN (${placeholders})
            AND ${dayCmpO} >= ?
            AND ${dayCmpO} <= ?
          GROUP BY o.pedidoId, o.createdAt, o.clienteNome, o.regime, o.canal, o.status, o.totalAplicado, o.sellerName
          ORDER BY o.createdAt DESC
          LIMIT 50`,
          mkParams()
        );

        // PT (pontuação) — soma ptAtacado*qtd ou ptVarejo*qtd (itens não-Sofia, pedidos não-cancelados)
        // Reusa exatamente a lógica do summary do dashboard, calibrando com pontosOffset Manus
        // quando o filtro do período é um único mês (YYYY-MM) e o vendedor tem pontosOffsetMes
        // igual a esse mês.
        const offsetYm = pontosOffsetMesParam(input.startDate, input.endDate);
        const sqlPtComOffset = `
          SELECT COALESCE(SUM(
            CASE WHEN o.regime = 'ATACADO' THEN oi.ptAtacado * oi.quantidade
                 ELSE oi.ptVarejo * oi.quantidade END
          ), 0) AS pontuacaoBase,
          (
            SELECT COALESCE(SUM(s2.pontosOffset), 0)
            FROM pdv_sellers s2
            WHERE s2.id IN (${placeholders})
              AND ? IS NOT NULL
              AND s2.pontosOffsetMes = ?
          ) AS pontosOffsetTotal
          FROM pdv_orders o
          INNER JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId AND ${SQL_OI_NAO_SOFIA}
          WHERE o.sellerId IN (${placeholders})
            AND o.status != 'CANCELADO'
            AND ${dayCmpO} >= ?
            AND ${dayCmpO} <= ?`;
        const sqlPtLegacy = `
          SELECT COALESCE(SUM(
            CASE WHEN o.regime = 'ATACADO' THEN oi.ptAtacado * oi.quantidade
                 ELSE oi.ptVarejo * oi.quantidade END
          ), 0) AS pontuacaoBase,
          0 AS pontosOffsetTotal
          FROM pdv_orders o
          INNER JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId AND ${SQL_OI_NAO_SOFIA}
          WHERE o.sellerId IN (${placeholders})
            AND o.status != 'CANCELADO'
            AND ${dayCmpO} >= ?
            AND ${dayCmpO} <= ?`;

        let pontuacaoBase = 0;
        let pontosOffsetTotal = 0;
        try {
          const [ptRows] = await db.execute(sqlPtComOffset, [
            ...sellerIds, offsetYm, offsetYm,
            ...sellerIds, input.startDate, input.endDate,
          ]);
          const r = (ptRows as any[])[0] || {};
          pontuacaoBase = parseFloat(r.pontuacaoBase || '0');
          pontosOffsetTotal = parseFloat(r.pontosOffsetTotal || '0');
        } catch (e) {
          if (!isMissingPontosOffsetColumn(e)) throw e;
          const [ptRows] = await db.execute(sqlPtLegacy, mkParams());
          const r = (ptRows as any[])[0] || {};
          pontuacaoBase = parseFloat(r.pontuacaoBase || '0');
          pontosOffsetTotal = 0;
        }
        const pontuacao = pontuacaoBase + pontosOffsetTotal;

        // Metas
        const [goalRows] = await db.execute("SELECT \`key\`, value FROM pdv_goals");
        const goals: Record<string, number> = {};
        (goalRows as any[]).forEach((g: any) => { goals[g.key] = parseFloat(g.value); });

        await db.end();

        const kpi = (kpiRows as any[])[0];
        const faturamento = parseFloat(kpi.faturamento || '0');
        const totalBonus = parseFloat(kpi.totalBonus || '0');
        const totalCaixinha = parseFloat((caixRows as any[])[0]?.totalCaixinha || '0');

        const sofia = (sofiaRows as any[])[0] || {};
        const totalPedidosSofia = parseInt(sofia.totalPedidosSofia || '0');
        const totalPecasSofia = parseInt(sofia.totalPecasSofia || '0');
        const faturamentoSofia = parseFloat(sofia.faturamentoSofia || '0');
        const comissaoLojaSofia = parseFloat(sofia.comissaoLojaSofia || '0');
        const reembolsoSofia = Math.max(0, faturamentoSofia - comissaoLojaSofia);

        // Meta atingida agora compara PONTOS, não R$ — alinhado com Bronze/Prata/Ouro do Manus
        const metaAtingida = pontuacao >= (goals.OURO || 0) && goals.OURO
          ? 'OURO'
          : pontuacao >= (goals.PRATA || 0) && goals.PRATA
            ? 'PRATA'
            : pontuacao >= (goals.BRONZE || 0) && goals.BRONZE
              ? 'BRONZE'
              : null;

        return {
          sellers,
          kpis: {
            totalPedidos: parseInt(kpi.totalPedidos || '0'),
            totalPecas: parseInt(kpi.totalPecas || '0'),
            faturamento,
            totalBonus,
            totalCaixinha,
            pontuacao,
            pontuacaoBase,
            pontosOffsetTotal,
            totalPedidosSofia,
            totalPecasSofia,
            faturamentoSofia,
            comissaoLojaSofia,
            reembolsoSofia,
            faturamentoAtacado: parseFloat(kpi.faturamentoAtacado || '0'),
            faturamentoVarejo: parseFloat(kpi.faturamentoVarejo || '0'),
            faturamentoBalcao: parseFloat(kpi.faturamentoBalcao || '0'),
            faturamentoWhatsapp: parseFloat(kpi.faturamentoWhatsapp || '0'),
            pedidosCancelados: parseInt(kpi.pedidosCancelados || '0'),
            metaAtingida,
          },
          meta: {
            startDate: input.startDate,
            endDate: input.endDate,
            /** Quando não é null, o PT soma `pontosOffset` apenas nos vendedores cujo `pontosOffsetMes` é igual a este YYYY-MM. */
            pontosOffsetYm: offsetYm,
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
