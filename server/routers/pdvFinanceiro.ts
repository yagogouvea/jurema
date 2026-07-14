/**
 * Financeiro → Conciliação de extrato (InfinitePay MVP).
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { Request } from "express";
import { router, publicProcedure } from "../_core/trpc";
import { verifyPdvToken } from "./pdvAuth";
import { createPdvMysqlConnection } from "../pdvMysql";
import { parseInfinitePayText } from "../financeiro/infinitePayParser";
import { parseMercadoPagoText } from "../financeiro/mercadoPagoParser";
import { parseExtratoPdf } from "../financeiro/parseExtrato";
import { reconcileExtractToPayments } from "../financeiro/matchReconcile";
import {
  reconcileCardLiberations,
  type PdvCardPayment,
} from "../financeiro/matchCardLiberations";
import { generateReconcileNarrative } from "../financeiro/narrative";
import { buildReconcileReportPdf } from "../financeiro/reportPdf";
import {
  DEFAULT_CARD_TOLERANCE,
  DEFAULT_TOLERANCE,
  type PdvPixPayment,
  type ReconcileResult,
} from "../financeiro/types";
import { toCents } from "../financeiro/normalize";

async function getDb() {
  return createPdvMysqlConnection();
}

async function requirePdvAdmin(ctx: any) {
  const seller = await verifyPdvToken(ctx.req as Request);
  if (!seller) throw new TRPCError({ code: "UNAUTHORIZED", message: "Faça login no PDV" });
  if (seller.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito ao administrador" });
  }
  return seller;
}

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS pdv_reconciliations (
  id INT AUTO_INCREMENT NOT NULL,
  source VARCHAR(40) NOT NULL,
  periodStart DATE NULL,
  periodEnd DATE NULL,
  accountLabel VARCHAR(255) NULL,
  createdBy VARCHAR(255) NULL,
  totalsJson JSON NOT NULL,
  resultJson LONGTEXT NOT NULL,
  narrativeText MEDIUMTEXT NULL,
  reportPdf LONGBLOB NULL,
  originalFileName VARCHAR(255) NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pdv_reconciliations_id PRIMARY KEY(id)
)`;

export async function ensureFinanceiroTables(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) return;
  try {
    const db = await createPdvMysqlConnection();
    try {
      await db.execute(CREATE_TABLE_SQL);
    } finally {
      await db.end();
    }
  } catch (e) {
    console.warn("[financeiro] ensure tables:", e);
  }
}

async function loadPdvPixPayments(
  db: Awaited<ReturnType<typeof getDb>>,
  periodStart: string | null,
  periodEnd: string | null,
  beforeMs: number,
  afterMs: number
): Promise<PdvPixPayment[]> {
  // Expande o período do extrato pela tolerância (em dias aproximados).
  const beforeDays = Math.ceil(beforeMs / (24 * 60 * 60 * 1000));
  const afterDays = Math.ceil(afterMs / (24 * 60 * 60 * 1000));

  let start = periodStart;
  let end = periodEnd;
  if (!start || !end) {
    // Sem período: últimos 45 dias
    const [rows] = await db.execute(
      `SELECT
         p.id AS paymentId, o.pedidoId, o.status, o.clienteNome, p.nomePix, p.valor,
         o.createdAt AS pedidoCreatedAt, p.createdAt AS paymentCreatedAt
       FROM pdv_order_payments p
       JOIN pdv_orders o ON o.pedidoId = p.pedidoId
       WHERE p.formaPagamento = 'PIX'
         AND o.status <> 'CANCELADO'
         AND o.createdAt >= DATE_SUB(NOW(), INTERVAL 45 DAY)
       ORDER BY o.createdAt ASC`
    );
    return mapPaymentRows(rows as any[]);
  }

  // mysql2: INTERVAL/LIMIT não podem ser placeholders (mysqld_stmt_execute).
  const before = Math.max(0, Math.min(365, Math.floor(beforeDays + 1)));
  const after = Math.max(0, Math.min(365, Math.floor(afterDays + 1)));
  const [rows] = await db.execute(
    `SELECT
       p.id AS paymentId, o.pedidoId, o.status, o.clienteNome, p.nomePix, p.valor,
       o.createdAt AS pedidoCreatedAt, p.createdAt AS paymentCreatedAt
     FROM pdv_order_payments p
     JOIN pdv_orders o ON o.pedidoId = p.pedidoId
     WHERE p.formaPagamento = 'PIX'
       AND o.status <> 'CANCELADO'
       AND DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00'))
           BETWEEN DATE_SUB(?, INTERVAL ${before} DAY) AND DATE_ADD(?, INTERVAL ${after} DAY)
     ORDER BY o.createdAt ASC`,
    [start, end]
  );
  return mapPaymentRows(rows as any[]);
}

function mapPaymentRows(rows: any[]): PdvPixPayment[] {
  return rows.map((r) => ({
    paymentId: Number(r.paymentId),
    pedidoId: String(r.pedidoId),
    status: String(r.status || "PAGO"),
    clienteNome: r.clienteNome == null ? null : String(r.clienteNome),
    nomePix: r.nomePix == null ? null : String(r.nomePix),
    valorCents: toCents(r.valor),
    pedidoCreatedAt: new Date(r.pedidoCreatedAt),
    paymentCreatedAt: new Date(r.paymentCreatedAt),
  }));
}

async function loadPdvCardPayments(
  db: Awaited<ReturnType<typeof getDb>>,
  periodStart: string | null,
  periodEnd: string | null,
  beforeMs: number,
  afterMs: number
): Promise<PdvCardPayment[]> {
  const beforeDays = Math.ceil(beforeMs / (24 * 60 * 60 * 1000));
  const afterDays = Math.ceil(afterMs / (24 * 60 * 60 * 1000));

  const select = `SELECT
       p.id AS paymentId, o.pedidoId, o.status, o.clienteNome,
       p.formaPagamento, p.valor, p.taxa, p.valorLiquido,
       o.createdAt AS pedidoCreatedAt, p.createdAt AS paymentCreatedAt
     FROM pdv_order_payments p
     JOIN pdv_orders o ON o.pedidoId = p.pedidoId
     WHERE p.formaPagamento IN ('DEBITO','CREDITO')
       AND o.status <> 'CANCELADO'`;

  let rows: any[];
  if (!periodStart || !periodEnd) {
    const [r] = await db.execute(
      `${select} AND o.createdAt >= DATE_SUB(NOW(), INTERVAL 90 DAY) ORDER BY o.createdAt ASC`
    );
    rows = r as any[];
  } else {
    const before = Math.max(0, Math.min(365, Math.floor(beforeDays + 1)));
    const after = Math.max(0, Math.min(365, Math.floor(afterDays + 1)));
    const [r] = await db.execute(
      `${select}
       AND DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00'))
           BETWEEN DATE_SUB(?, INTERVAL ${before} DAY) AND DATE_ADD(?, INTERVAL ${after} DAY)
       ORDER BY o.createdAt ASC`,
      [periodStart, periodEnd]
    );
    rows = r as any[];
  }

  return rows.map((r) => {
    const valorCents = toCents(r.valor);
    const taxaCents = toCents(r.taxa);
    let valorLiquidoCents = toCents(r.valorLiquido);
    if (!valorLiquidoCents && valorCents) {
      valorLiquidoCents = Math.max(0, valorCents - taxaCents);
    }
    return {
      paymentId: Number(r.paymentId),
      pedidoId: String(r.pedidoId),
      status: String(r.status || "PAGO"),
      clienteNome: r.clienteNome == null ? null : String(r.clienteNome),
      formaPagamento: String(r.formaPagamento) as "DEBITO" | "CREDITO",
      valorCents,
      taxaCents,
      valorLiquidoCents,
      valorMaquininhaCents: valorCents + taxaCents,
      pedidoCreatedAt: new Date(r.pedidoCreatedAt),
      paymentCreatedAt: new Date(r.paymentCreatedAt),
    };
  });
}

export const pdvFinanceiroRouter = router({
  /** Concilia PDF InfinitePay ou Mercado Pago (auto-detect). */
  reconcile: publicProcedure
    .input(
      z.object({
        pdfBase64: z.string().min(20).max(12_000_000),
        fileName: z.string().max(255).optional(),
        source: z.enum(["auto", "infinitepay", "mercado_pago"]).default("auto"),
        /** Override do período (YYYY-MM-DD); se omitido, usa o do PDF. */
        periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        beforeHours: z.number().min(0).max(168).default(36),
        afterHours: z.number().min(0).max(168).default(72),
        persist: z.boolean().default(true),
        generatePdf: z.boolean().default(true),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const admin = await requirePdvAdmin(ctx);
      await ensureFinanceiroTables();

      let buffer: Buffer;
      try {
        const raw = input.pdfBase64.includes(",")
          ? input.pdfBase64.split(",").pop()!
          : input.pdfBase64;
        buffer = Buffer.from(raw, "base64");
      } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "PDF inválido (base64)" });
      }
      if (buffer.length < 100 || buffer.length > 8_000_000) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Tamanho do PDF fora do limite (máx. 8 MB)" });
      }
      if (buffer.slice(0, 4).toString("utf8") !== "%PDF") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo não parece ser PDF" });
      }

      let parsed;
      try {
        parsed = await parseExtratoPdf(buffer, input.source);
      } catch (e: any) {
        console.error("[financeiro] parse PDF:", e);
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Não foi possível ler o extrato: ${e?.message || e}`,
        });
      }

      const liberacoes = parsed.lines.filter((l) => l.kindLabel === "liberacao");
      const matchableLines = parsed.lines.filter((l) => l.kindLabel !== "liberacao");

      if (matchableLines.length === 0 && liberacoes.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Nenhuma entrada útil encontrada (Pix / liberação). Confirme InfinitePay ou Mercado Pago.",
        });
      }

      const period = {
        start: input.periodStart || parsed.period?.start || null,
        end: input.periodEnd || parsed.period?.end || null,
      };

      const tolerance = {
        beforeMs: input.beforeHours * 60 * 60 * 1000,
        afterMs: input.afterHours * 60 * 60 * 1000,
      };

      const db = await getDb();
      let payments: PdvPixPayment[] = [];
      let cardPayments: PdvCardPayment[] = [];
      try {
        payments = await loadPdvPixPayments(
          db,
          period.start,
          period.end,
          tolerance.beforeMs,
          tolerance.afterMs
        );
        // Cartão: janela mais larga (liquidação pode demorar)
        cardPayments = await loadPdvCardPayments(
          db,
          period.start,
          period.end,
          DEFAULT_CARD_TOLERANCE.beforeMs,
          DEFAULT_CARD_TOLERANCE.afterMs
        );
      } finally {
        await db.end();
      }

      const core = reconcileExtractToPayments({
        source: parsed.source,
        period: period.start && period.end ? { start: period.start, end: period.end } : null,
        accountLabel: parsed.accountLabel,
        lines: matchableLines,
        payments,
        tolerance,
      });

      // Liberação de dinheiro × DÉBITO/CRÉDITO
      if (liberacoes.length > 0) {
        const cardResult = reconcileCardLiberations({
          liberacoes,
          cardPayments,
          tolerance: DEFAULT_CARD_TOLERANCE,
        });
        core.matched.push(...cardResult.matched);
        core.review.push(...cardResult.review);
        core.onlyExtract = [...core.onlyExtract, ...cardResult.onlyExtract].sort((a, b) =>
          a.datetimeIso.localeCompare(b.datetimeIso)
        );
        core.onlyPdv = [...core.onlyPdv, ...cardResult.onlyPdv];
      } else if (cardPayments.length > 0) {
        // Sem liberação no extrato: cartões ficam em só PDV para o período
        core.onlyPdv = [
          ...core.onlyPdv,
          ...cardPayments.map((p) => ({
            pedidoId: p.pedidoId,
            paymentId: p.paymentId,
            valorCents: p.valorLiquidoCents,
            clienteNome: p.clienteNome,
            nomePix: null as string | null,
            pedidoCreatedAt: p.pedidoCreatedAt.toISOString(),
            status: p.status,
            formaPagamento: p.formaPagamento,
          })),
        ];
      }

      core.totals.extractInCents =
        matchableLines.reduce((s, l) => s + l.amountCents, 0) +
        liberacoes.reduce((s, l) => s + l.amountCents, 0);
      core.totals.matchedCents = core.matched.reduce((s, m) => s + m.payment.valorCents, 0);
      core.totals.onlyExtractCents = core.onlyExtract.reduce((s, l) => s + l.amountCents, 0);
      core.totals.onlyPdvCents = core.onlyPdv.reduce((s, p) => s + p.valorCents, 0);
      core.totals.matchCount = core.matched.length;
      core.totals.reviewCount = core.review.length;

      const narrativeText = await generateReconcileNarrative(core);
      let reportPdfBase64: string | undefined;
      let reportPdf: Buffer | undefined;
      if (input.generatePdf) {
        reportPdf = buildReconcileReportPdf(
          { ...core, narrativeText },
          { generatedBy: admin.name }
        );
        reportPdfBase64 = reportPdf.toString("base64");
      }

      const full: ReconcileResult = { ...core, narrativeText, reportPdfBase64 };
      let reconciliationId: number | null = null;

      if (input.persist) {
        const db2 = await getDb();
        try {
          const [ins] = await db2.execute(
            `INSERT INTO pdv_reconciliations
              (source, periodStart, periodEnd, accountLabel, createdBy, totalsJson, resultJson, narrativeText, reportPdf, originalFileName)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              full.source,
              period.start,
              period.end,
              parsed.accountLabel,
              admin.name,
              JSON.stringify(full.totals),
              JSON.stringify({
                matched: full.matched,
                review: full.review,
                onlyExtract: full.onlyExtract,
                onlyPdv: full.onlyPdv,
                ignoredOutCount: parsed.ignoredOutCount,
                ignoredOtherCount: parsed.ignoredOtherCount ?? 0,
                liberacoes: liberacoes.length,
              }),
              narrativeText,
              reportPdf ?? null,
              input.fileName || null,
            ]
          );
          reconciliationId = Number((ins as any).insertId || 0) || null;
        } finally {
          await db2.end();
        }
      }

      return {
        reconciliationId,
        ignoredOutCount: parsed.ignoredOutCount,
        ignoredOtherCount: parsed.ignoredOtherCount ?? 0,
        liberacaoCount: liberacoes.length,
        extractLineCount: parsed.lines.length,
        pdvPaymentCount: payments.length,
        pdvCardPaymentCount: cardPayments.length,
        ...full,
      };
    }),

  /** Útil para testes: concilia a partir de texto já extraído. */
  reconcileFromText: publicProcedure
    .input(
      z.object({
        text: z.string().min(50).max(2_000_000),
        source: z.enum(["auto", "infinitepay", "mercado_pago"]).default("auto"),
        beforeHours: z.number().min(0).max(168).default(36),
        afterHours: z.number().min(0).max(168).default(72),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requirePdvAdmin(ctx);
      let parsed;
      if (input.source === "mercado_pago") parsed = parseMercadoPagoText(input.text);
      else if (input.source === "infinitepay") {
        parsed = { ...parseInfinitePayText(input.text), ignoredOtherCount: 0 };
      } else {
        const mp = parseMercadoPagoText(input.text);
        parsed =
          mp.lines.length > 0
            ? mp
            : { ...parseInfinitePayText(input.text), ignoredOtherCount: 0 };
      }
      const liberacoes = parsed.lines.filter((l) => l.kindLabel === "liberacao");
      const matchable = parsed.lines.filter((l) => l.kindLabel !== "liberacao");
      const tolerance = {
        beforeMs: input.beforeHours * 60 * 60 * 1000 || DEFAULT_TOLERANCE.beforeMs,
        afterMs: input.afterHours * 60 * 60 * 1000 || DEFAULT_TOLERANCE.afterMs,
      };
      const db = await getDb();
      let payments: PdvPixPayment[] = [];
      let cards: PdvCardPayment[] = [];
      try {
        payments = await loadPdvPixPayments(
          db,
          parsed.period?.start || null,
          parsed.period?.end || null,
          tolerance.beforeMs,
          tolerance.afterMs
        );
        cards = await loadPdvCardPayments(
          db,
          parsed.period?.start || null,
          parsed.period?.end || null,
          DEFAULT_CARD_TOLERANCE.beforeMs,
          DEFAULT_CARD_TOLERANCE.afterMs
        );
      } finally {
        await db.end();
      }
      const core = reconcileExtractToPayments({
        source: parsed.source,
        period: parsed.period,
        accountLabel: parsed.accountLabel,
        lines: matchable,
        payments,
        tolerance,
      });
      if (liberacoes.length) {
        const cardResult = reconcileCardLiberations({
          liberacoes,
          cardPayments: cards,
          tolerance: DEFAULT_CARD_TOLERANCE,
        });
        core.matched.push(...cardResult.matched);
        core.review.push(...cardResult.review);
        core.onlyExtract = [...core.onlyExtract, ...cardResult.onlyExtract];
        core.onlyPdv = [...core.onlyPdv, ...cardResult.onlyPdv];
        core.totals.matchCount = core.matched.length;
        core.totals.reviewCount = core.review.length;
        core.totals.matchedCents = core.matched.reduce((s, m) => s + m.payment.valorCents, 0);
        core.totals.onlyExtractCents = core.onlyExtract.reduce((s, l) => s + l.amountCents, 0);
        core.totals.onlyPdvCents = core.onlyPdv.reduce((s, p) => s + p.valorCents, 0);
      }
      const narrativeText = await generateReconcileNarrative(core);
      return { ...core, narrativeText, extractLineCount: parsed.lines.length };
    }),

  list: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(20) }).optional())
    .query(async ({ input, ctx }) => {
      await requirePdvAdmin(ctx);
      await ensureFinanceiroTables();
      const db = await getDb();
      try {
        const limit = Math.max(1, Math.min(50, Math.floor(input?.limit ?? 20)));
        const [rows] = await db.execute(
          `SELECT id, source, periodStart, periodEnd, accountLabel, createdBy, totalsJson, originalFileName, createdAt
           FROM pdv_reconciliations
           ORDER BY id DESC
           LIMIT ${limit}`
        );
        return (rows as any[]).map((r) => ({
          id: r.id,
          source: r.source,
          periodStart: r.periodStart,
          periodEnd: r.periodEnd,
          accountLabel: r.accountLabel,
          createdBy: r.createdBy,
          totals: typeof r.totalsJson === "string" ? JSON.parse(r.totalsJson) : r.totalsJson,
          originalFileName: r.originalFileName,
          createdAt: r.createdAt,
        }));
      } finally {
        await db.end();
      }
    }),

  get: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      await requirePdvAdmin(ctx);
      const db = await getDb();
      try {
        const [rows] = await db.execute(
          `SELECT id, source, periodStart, periodEnd, accountLabel, createdBy, totalsJson, resultJson, narrativeText, originalFileName, createdAt,
                  (reportPdf IS NOT NULL) AS hasPdf
           FROM pdv_reconciliations WHERE id = ? LIMIT 1`,
          [input.id]
        );
        const r = (rows as any[])[0];
        if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Conciliação não encontrada" });
        return {
          id: r.id,
          source: r.source,
          periodStart: r.periodStart,
          periodEnd: r.periodEnd,
          accountLabel: r.accountLabel,
          createdBy: r.createdBy,
          totals: typeof r.totalsJson === "string" ? JSON.parse(r.totalsJson) : r.totalsJson,
          result: typeof r.resultJson === "string" ? JSON.parse(r.resultJson) : r.resultJson,
          narrativeText: r.narrativeText,
          originalFileName: r.originalFileName,
          createdAt: r.createdAt,
          hasPdf: Boolean(r.hasPdf),
        };
      } finally {
        await db.end();
      }
    }),

  getReportPdf: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      await requirePdvAdmin(ctx);
      const db = await getDb();
      try {
        const [rows] = await db.execute(
          `SELECT reportPdf FROM pdv_reconciliations WHERE id = ? LIMIT 1`,
          [input.id]
        );
        const r = (rows as any[])[0];
        if (!r?.reportPdf) throw new TRPCError({ code: "NOT_FOUND", message: "PDF não disponível" });
        const buf: Buffer = Buffer.isBuffer(r.reportPdf) ? r.reportPdf : Buffer.from(r.reportPdf);
        return { base64: buf.toString("base64"), mimeType: "application/pdf" };
      } finally {
        await db.end();
      }
    }),

  /**
   * Confirma manualmente um item de "Revisar":
   * move para Localizados com o paymentId escolhido (ou dispensa para Só extrato).
   */
  confirmReview: publicProcedure
    .input(
      z.object({
        reconciliationId: z.number(),
        reviewIndex: z.number().min(0),
        /** Se omitido / null → remove da revisão e mantém só no extrato (sem match). */
        paymentId: z.number().optional().nullable(),
        action: z.enum(["confirm", "dismiss"]).default("confirm"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const admin = await requirePdvAdmin(ctx);
      const db = await getDb();
      try {
        const [rows] = await db.execute(
          `SELECT id, source, periodStart, periodEnd, accountLabel, totalsJson, resultJson, narrativeText
           FROM pdv_reconciliations WHERE id = ? LIMIT 1`,
          [input.reconciliationId]
        );
        const row = (rows as any[])[0];
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Conciliação não encontrada" });

        const result =
          typeof row.resultJson === "string" ? JSON.parse(row.resultJson) : row.resultJson;
        const review: any[] = Array.isArray(result.review) ? [...result.review] : [];
        const matched: any[] = Array.isArray(result.matched) ? [...result.matched] : [];
        let onlyExtract: any[] = Array.isArray(result.onlyExtract) ? [...result.onlyExtract] : [];
        let onlyPdv: any[] = Array.isArray(result.onlyPdv) ? [...result.onlyPdv] : [];

        if (input.reviewIndex >= review.length) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Índice de revisão inválido" });
        }
        const item = review[input.reviewIndex];
        const extractLines = item.extract || [];

        if (input.action === "dismiss" || input.paymentId == null) {
          review.splice(input.reviewIndex, 1);
          for (const line of extractLines) {
            if (!onlyExtract.some((e) => e.id === line.id)) onlyExtract.push(line);
          }
        } else {
          const paymentId = input.paymentId;
          const [payRows] = await db.execute(
            `SELECT p.id AS paymentId, o.pedidoId, o.status, o.clienteNome, p.nomePix,
                    p.formaPagamento, p.valor, p.taxa, p.valorLiquido, o.createdAt AS pedidoCreatedAt
             FROM pdv_order_payments p
             JOIN pdv_orders o ON o.pedidoId = p.pedidoId
             WHERE p.id = ? LIMIT 1`,
            [paymentId]
          );
          const pay = (payRows as any[])[0];
          if (!pay) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Pagamento do PDV não encontrado" });
          }

          const forma = String(pay.formaPagamento || "PIX");
          const valorCents =
            forma === "DEBITO" || forma === "CREDITO"
              ? toCents(pay.valorLiquido) || toCents(pay.valor)
              : toCents(pay.valor);
          const extractCents = extractLines.reduce(
            (s: number, l: any) => s + (Number(l.amountCents) || 0),
            0
          );

          const isCard = forma === "DEBITO" || forma === "CREDITO";
          matched.push({
            kind: isCard ? "card_1:1" : extractLines.length > 1 ? "split" : "1:1",
            confidence: "high",
            score: 100,
            notes: `Confirmado manualmente por ${admin.name}`,
            extract: extractLines,
            payment: {
              pedidoId: String(pay.pedidoId),
              paymentId: Number(pay.paymentId),
              valorCents: extractCents || valorCents,
              nomePix: pay.nomePix == null ? null : String(pay.nomePix),
              clienteNome: pay.clienteNome == null ? null : String(pay.clienteNome),
              pedidoCreatedAt: new Date(pay.pedidoCreatedAt).toISOString(),
              status: String(pay.status || "PAGO"),
              formaPagamento: forma,
              valorLiquidoCents: toCents(pay.valorLiquido) || undefined,
              taxaCents: toCents(pay.taxa) || undefined,
              matchBasis: "manual",
            },
          });

          review.splice(input.reviewIndex, 1);
          onlyPdv = onlyPdv.filter((p) => Number(p.paymentId) !== paymentId);
          // linha do extrato sai de onlyExtract se estiver lá
          const extractIds = new Set(extractLines.map((e: any) => e.id));
          onlyExtract = onlyExtract.filter((e) => !extractIds.has(e.id));
        }

        const totals = {
          extractInCents:
            typeof row.totalsJson === "string"
              ? JSON.parse(row.totalsJson).extractInCents
              : row.totalsJson?.extractInCents ?? 0,
          matchedCents: matched.reduce((s, m) => s + (Number(m.payment?.valorCents) || 0), 0),
          onlyExtractCents: onlyExtract.reduce((s, l) => s + (Number(l.amountCents) || 0), 0),
          onlyPdvCents: onlyPdv.reduce((s, p) => s + (Number(p.valorCents) || 0), 0),
          matchCount: matched.length,
          reviewCount: review.length,
        };

        const newResult = {
          ...result,
          matched,
          review,
          onlyExtract,
          onlyPdv,
        };

        let narrativeText = String(row.narrativeText || "");
        if (input.action === "confirm" && input.paymentId != null) {
          narrativeText += `\n\n[Manual] ${admin.name} confirmou match com payment #${input.paymentId}.`;
        } else {
          narrativeText += `\n\n[Manual] ${admin.name} dispensou um item da revisão.`;
        }

        await db.execute(
          `UPDATE pdv_reconciliations
           SET totalsJson = ?, resultJson = ?, narrativeText = ?
           WHERE id = ?`,
          [JSON.stringify(totals), JSON.stringify(newResult), narrativeText, input.reconciliationId]
        );

        return {
          reconciliationId: input.reconciliationId,
          source: row.source,
          period:
            row.periodStart && row.periodEnd
              ? {
                  start: String(row.periodStart).slice(0, 10),
                  end: String(row.periodEnd).slice(0, 10),
                }
              : null,
          accountLabel: row.accountLabel,
          totals,
          matched,
          review,
          onlyExtract,
          onlyPdv,
          narrativeText,
        };
      } finally {
        await db.end();
      }
    }),
});
