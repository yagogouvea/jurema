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
import { ensurePeriodFromLines, parseExtratoPdf } from "../financeiro/parseExtrato";
import { reconcileExtractToPayments } from "../financeiro/matchReconcile";
import {
  reconcileCardLiberations,
  type PdvCardPayment,
} from "../financeiro/matchCardLiberations";
import { generateReconcileNarrative } from "../financeiro/narrative";
import { buildReconcileReportPdf } from "../financeiro/reportPdf";
import { buildReconcileReportExcel } from "../financeiro/reportExcel";
import {
  buildOrderCentricView,
  collectPedidoIdsFromCore,
  filterOnlyPdvToPeriod,
  loadOrderSnapshots,
  sheetsLabelForStatus,
} from "../financeiro/orderView";
import {
  DEFAULT_CARD_TOLERANCE,
  DEFAULT_TOLERANCE,
  type PdvPixPayment,
  type ReconcileResult,
  type ReconcileStatus,
} from "../financeiro/types";
import { toCents } from "../financeiro/normalize";
import { updateSaleReconcileInCashFlowSheet } from "./pdvSheetsWriter";

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
  reportExcel LONGBLOB NULL,
  originalFileName VARCHAR(255) NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pdv_reconciliations_id PRIMARY KEY(id)
)`;

async function ensurePaymentReconcileColumns(
  db: Awaited<ReturnType<typeof getDb>>
): Promise<void> {
  const alters = [
    `ALTER TABLE pdv_order_payments ADD COLUMN reconcileStatus ENUM('pending','confirmed','rejected','unmatched') NULL`,
    `ALTER TABLE pdv_order_payments ADD COLUMN reconcileSource VARCHAR(40) NULL`,
    `ALTER TABLE pdv_order_payments ADD COLUMN reconcileExtractRef VARCHAR(255) NULL`,
    `ALTER TABLE pdv_order_payments ADD COLUMN reconciledAt TIMESTAMP NULL`,
    `ALTER TABLE pdv_order_payments ADD COLUMN reconciledBy VARCHAR(255) NULL`,
  ];
  for (const sql of alters) {
    try {
      await db.execute(sql);
    } catch (e: any) {
      // 1060 = Duplicate column name
      if (e?.errno !== 1060 && !String(e?.message || "").includes("Duplicate")) {
        console.warn("[financeiro] alter payment reconcile:", e?.message || e);
      }
    }
  }
}

export async function ensureFinanceiroTables(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) return;
  try {
    const db = await createPdvMysqlConnection();
    try {
      await db.execute(CREATE_TABLE_SQL);
      await ensurePaymentReconcileColumns(db);
      try {
        await db.execute(
          `ALTER TABLE pdv_reconciliations ADD COLUMN reportExcel LONGBLOB NULL`
        );
      } catch (e: any) {
        if (e?.errno !== 1060 && !String(e?.message || "").includes("Duplicate")) {
          console.warn("[financeiro] alter reconciliation excel:", e?.message || e);
        }
      }
    } finally {
      await db.end();
    }
  } catch (e) {
    console.warn("[financeiro] ensure tables:", e);
  }
}

async function setPaymentReconcileStatus(
  db: Awaited<ReturnType<typeof getDb>>,
  paymentId: number,
  status: ReconcileStatus,
  meta: {
    source?: string | null;
    extractRef?: string | null;
    by?: string | null;
    pedidoId?: string | null;
    syncSheet?: boolean;
  }
): Promise<void> {
  try {
    await db.execute(
      `UPDATE pdv_order_payments
       SET reconcileStatus = ?, reconcileSource = ?, reconcileExtractRef = ?,
           reconciledAt = NOW(), reconciledBy = ?
       WHERE id = ?`,
      [
        status,
        meta.source || null,
        meta.extractRef || null,
        meta.by || null,
        paymentId,
      ]
    );
  } catch (e) {
    console.warn("[financeiro] setPaymentReconcileStatus:", e);
  }
  if (meta.syncSheet !== false && meta.pedidoId) {
    updateSaleReconcileInCashFlowSheet(
      meta.pedidoId,
      sheetsLabelForStatus(status)
    ).catch((err) => console.warn("[financeiro] sheets reconcile:", err));
  }
}

async function persistReconcileStatusesFromCore(
  db: Awaited<ReturnType<typeof getDb>>,
  core: Pick<ReconcileResult, "matched" | "review" | "onlyPdv">,
  source: string,
  by: string
): Promise<void> {
  for (const m of core.matched || []) {
    const ref = (m.extract || []).map((e) => e.id).join(",").slice(0, 250);
    await setPaymentReconcileStatus(db, m.payment.paymentId, "confirmed", {
      source,
      extractRef: ref,
      by,
      pedidoId: m.payment.pedidoId,
      syncSheet: true,
    });
    for (const rel of m.relatedPayments || []) {
      await setPaymentReconcileStatus(db, rel.paymentId, "confirmed", {
        source,
        extractRef: ref,
        by,
        pedidoId: rel.pedidoId,
        syncSheet: true,
      });
    }
  }
  const pendingPayIds = new Set<number>();
  for (const r of core.review || []) {
    for (const c of r.candidates || []) {
      if (!pendingPayIds.has(c.paymentId)) {
        pendingPayIds.add(c.paymentId);
        await setPaymentReconcileStatus(db, c.paymentId, "pending", {
          source,
          extractRef: (r.extract || []).map((e) => e.id).join(",").slice(0, 250),
          by,
          pedidoId: c.pedidoId,
          syncSheet: true,
        });
      }
    }
    if (r.payment && !pendingPayIds.has(r.payment.paymentId)) {
      pendingPayIds.add(r.payment.paymentId);
      await setPaymentReconcileStatus(db, r.payment.paymentId, "pending", {
        source,
        by,
        pedidoId: r.payment.pedidoId,
        syncSheet: true,
      });
    }
  }
  for (const p of core.onlyPdv || []) {
    if (pendingPayIds.has(p.paymentId)) continue;
    await setPaymentReconcileStatus(db, p.paymentId, "unmatched", {
      source,
      by,
      pedidoId: p.pedidoId,
      syncSheet: true,
    });
  }
}

async function attachOrderViews(
  db: Awaited<ReturnType<typeof getDb>>,
  core: Pick<ReconcileResult, "matched" | "review" | "onlyPdv" | "onlyExtract" | "totals">
) {
  const snaps = await loadOrderSnapshots(db, collectPedidoIdsFromCore(core));
  const view = buildOrderCentricView(core, snaps);
  core.totals.orderConfirmedCount = view.ordersConfirmed.length;
  core.totals.orderReviewCount = view.ordersReview.length;
  core.totals.orderUnmatchedCount = view.ordersUnmatched.length;
  core.totals.orderUnmatchedPedidoCount = new Set(
    view.ordersUnmatched.map((o) => o.order.pedidoId)
  ).size;
  return view;
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
         p.id AS paymentId, o.pedidoId, o.status, o.clienteNome, p.nomePix, p.obsPagamento, p.valor,
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
       p.id AS paymentId, o.pedidoId, o.status, o.clienteNome, p.nomePix, p.obsPagamento, p.valor,
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
    obsPagamento: r.obsPagamento == null ? null : String(r.obsPagamento),
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
       p.id AS paymentId, o.pedidoId, o.status, o.clienteNome, p.nomePix, p.obsPagamento,
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
      nomePix: r.nomePix == null ? null : String(r.nomePix),
      obsPagamento: r.obsPagamento == null ? null : String(r.obsPagamento),
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
        /** Legado: um único PDF. */
        pdfBase64: z.string().min(20).max(12_000_000).optional(),
        fileName: z.string().max(255).optional(),
        /** Um ou dois extratos analisados como um único conjunto. */
        files: z
          .array(
            z.object({
              pdfBase64: z.string().min(20).max(12_000_000),
              fileName: z.string().max(255).optional(),
            })
          )
          .min(1)
          .max(2)
          .optional(),
        source: z.enum(["auto", "infinitepay", "mercado_pago"]).default("auto"),
        /** Override do período (YYYY-MM-DD); se omitido, usa o do PDF. */
        periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        beforeHours: z.number().min(0).max(168).default(36),
        afterHours: z.number().min(0).max(168).default(72),
        persist: z.boolean().default(true),
        generatePdf: z.boolean().default(true),
      }).refine((value) => Boolean(value.pdfBase64 || value.files?.length), {
        message: "Anexe ao menos um extrato",
      })
    )
    .mutation(async ({ input, ctx }) => {
      const admin = await requirePdvAdmin(ctx);
      await ensureFinanceiroTables();

      const uploadedFiles = input.files?.length
        ? input.files
        : [{ pdfBase64: input.pdfBase64!, fileName: input.fileName }];
      const parsedFiles: Array<Awaited<ReturnType<typeof parseExtratoPdf>> & {
        fileName: string;
      }> = [];

      for (const [index, file] of uploadedFiles.entries()) {
        let buffer: Buffer;
        try {
          const raw = file.pdfBase64.includes(",")
            ? file.pdfBase64.split(",").pop()!
            : file.pdfBase64;
          buffer = Buffer.from(raw, "base64");
        } catch {
          throw new TRPCError({ code: "BAD_REQUEST", message: "PDF inválido (base64)" });
        }
        if (buffer.length < 100 || buffer.length > 8_000_000) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `O extrato ${index + 1} está fora do limite de 8 MB`,
          });
        }
        if (buffer.slice(0, 4).toString("utf8") !== "%PDF") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `O arquivo ${index + 1} não parece ser PDF`,
          });
        }

        try {
          const fileName = file.fileName || `extrato-${index + 1}.pdf`;
          const one = await parseExtratoPdf(buffer, input.source);
          parsedFiles.push({
            ...one,
            fileName,
            lines: one.lines.map((line) => ({
              ...line,
              // Evita colisão de IDs entre dois arquivos, mantendo conciliação 1:1 global.
              id: `arquivo-${index + 1}|${line.id}`,
              extractFileName: fileName,
            })),
          });
        } catch (e: any) {
          console.error("[financeiro] parse PDF:", e);
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Não foi possível ler o extrato ${index + 1}: ${e?.message || e}`,
          });
        }
      }

      const starts = parsedFiles.map((p) => p.period?.start).filter(Boolean).sort() as string[];
      const ends = parsedFiles.map((p) => p.period?.end).filter(Boolean).sort() as string[];
      const sources = [...new Set(parsedFiles.map((p) => p.source))];
      const accountLabels = [
        ...new Set(parsedFiles.map((p) => p.accountLabel).filter(Boolean)),
      ] as string[];
      const parsed = {
        source: sources.length === 1 ? sources[0] : ("generic" as const),
        period:
          starts.length && ends.length
            ? { start: starts[0], end: ends[ends.length - 1] }
            : null,
        accountLabel: accountLabels.join(" + ") || null,
        companyLabel: null,
        lines: parsedFiles.flatMap((p) => p.lines),
        ignoredOutCount: parsedFiles.reduce((sum, p) => sum + p.ignoredOutCount, 0),
        ignoredOtherCount: parsedFiles.reduce(
          (sum, p) => sum + (p.ignoredOtherCount || 0),
          0
        ),
      };

      // Mercado Pago = só cartão (liberação). Pix do MP não casa com PIX do PDV
      // (não traz nome confiável e a conta mistura transferências).
      const liberacoes = parsed.lines.filter((l) => l.kindLabel === "liberacao");
      const mpIgnoredLines = parsed.lines.filter(
        (l) => l.source === "mercado_pago" && l.kindLabel !== "liberacao"
      );
      const matchableLines = parsed.lines.filter(
        (l) => l.kindLabel !== "liberacao" && l.source !== "mercado_pago"
      );

      if (matchableLines.length === 0 && liberacoes.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Nenhuma entrada útil encontrada. InfinitePay: Pix recebido · Mercado Pago: Liberação de dinheiro (débito/crédito).",
        });
      }

      const period = {
        start: input.periodStart || parsed.period?.start || null,
        end: input.periodEnd || parsed.period?.end || null,
      };

      if (!period.start || !period.end) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Não foi possível identificar o período do extrato. Informe Data início e Data fim na tela e analise de novo.",
        });
      }

      const tolerance = {
        beforeMs: input.beforeHours * 60 * 60 * 1000,
        afterMs: input.afterHours * 60 * 60 * 1000,
      };

      const db = await getDb();
      let payments: PdvPixPayment[] = [];
      let cardPayments: PdvCardPayment[] = [];
      try {
        // PIX só entra se houver linhas de InfinitePay (MP não casa Pix por nome)
        if (matchableLines.length > 0) {
          payments = await loadPdvPixPayments(
            db,
            period.start,
            period.end,
            tolerance.beforeMs,
            tolerance.afterMs
          );
        }
        // Cartão: casa com liberação MP (considera taxa 3% débito / 5% crédito)
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

      // Pix/outros do Mercado Pago não entram no match de pedidos
      if (mpIgnoredLines.length > 0) {
        core.onlyExtract = [...core.onlyExtract, ...mpIgnoredLines].sort((a, b) =>
          a.datetimeIso.localeCompare(b.datetimeIso)
        );
      }

      // Liberação de dinheiro × DÉBITO/CRÉDITO (valor ± taxa + data/hora)
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
            valorCents: p.valorMaquininhaCents || p.valorCents,
            clienteNome: p.clienteNome,
            nomePix: null as string | null,
            pedidoCreatedAt: p.pedidoCreatedAt.toISOString(),
            status: p.status,
            formaPagamento: p.formaPagamento,
          })),
        ];
      }

      core.onlyPdv = filterOnlyPdvToPeriod(core.onlyPdv, period.start, period.end);

      core.totals.extractInCents =
        matchableLines.reduce((s, l) => s + l.amountCents, 0) +
        liberacoes.reduce((s, l) => s + l.amountCents, 0);
      core.totals.matchedCents = core.matched.reduce((s, m) => s + m.payment.valorCents, 0);
      core.totals.onlyExtractCents = core.onlyExtract.reduce((s, l) => s + l.amountCents, 0);
      core.totals.onlyPdvCents = core.onlyPdv.reduce((s, p) => s + p.valorCents, 0);
      core.totals.matchCount = core.matched.length;
      core.totals.reviewCount = core.review.length;

      const dbView = await getDb();
      let orderView;
      try {
        await ensurePaymentReconcileColumns(dbView);
        orderView = await attachOrderViews(dbView, core);
        if (input.persist) {
          await persistReconcileStatusesFromCore(
            dbView,
            core,
            parsed.source,
            admin.name
          );
        }
      } finally {
        await dbView.end();
      }

      // Narrativa só para PDF/cópia opcional (não é o retorno principal da UI)
      let narrativeText = "";
      let reportPdfBase64: string | undefined;
      let reportPdf: Buffer | undefined;
      if (input.generatePdf) {
        narrativeText = await generateReconcileNarrative(core);
        reportPdf = buildReconcileReportPdf(
          { ...core, narrativeText },
          { generatedBy: admin.name }
        );
        reportPdfBase64 = reportPdf.toString("base64");
      }

      const full: ReconcileResult = {
        ...core,
        ...orderView,
        narrativeText,
        reportPdfBase64,
      };
      const reportExcel = await buildReconcileReportExcel(full, {
        generatedBy: admin.name,
      });
      full.reportExcelBase64 = reportExcel.toString("base64");
      let reconciliationId: number | null = null;

      if (input.persist) {
        const db2 = await getDb();
        try {
          const [ins] = await db2.execute(
            `INSERT INTO pdv_reconciliations
              (source, periodStart, periodEnd, accountLabel, createdBy, totalsJson, resultJson, narrativeText, reportPdf, reportExcel, originalFileName)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
                ordersConfirmed: full.ordersConfirmed,
                ordersReview: full.ordersReview,
                ordersUnmatched: full.ordersUnmatched,
                extractUnmatched: full.extractUnmatched,
                ignoredOutCount: parsed.ignoredOutCount,
                ignoredOtherCount: parsed.ignoredOtherCount ?? 0,
                liberacoes: liberacoes.length,
              }),
              narrativeText || null,
              reportPdf ?? null,
              reportExcel,
              uploadedFiles.map((file) => file.fileName).filter(Boolean).join(" + ") || null,
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
        extractFiles: parsedFiles.map((file) => ({
          fileName: file.fileName,
          source: file.source,
          lineCount: file.lines.length,
        })),
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
      parsed = ensurePeriodFromLines(parsed);
      if (!parsed.period?.start || !parsed.period?.end) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Não foi possível identificar o período do extrato no texto.",
        });
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
          parsed.period.start,
          parsed.period.end,
          tolerance.beforeMs,
          tolerance.afterMs
        );
        cards = await loadPdvCardPayments(
          db,
          parsed.period.start,
          parsed.period.end,
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
                  (reportPdf IS NOT NULL) AS hasPdf,
                  (reportExcel IS NOT NULL) AS hasExcel
           FROM pdv_reconciliations WHERE id = ? LIMIT 1`,
          [input.id]
        );
        const r = (rows as any[])[0];
        if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Conciliação não encontrada" });
        const result =
          typeof r.resultJson === "string" ? JSON.parse(r.resultJson) : r.resultJson || {};
        let totals =
          typeof r.totalsJson === "string" ? JSON.parse(r.totalsJson) : r.totalsJson;
        // Rebuild order view se conciliação antiga não tiver
        if (!result.ordersConfirmed) {
          const view = await attachOrderViews(db, {
            matched: result.matched || [],
            review: result.review || [],
            onlyPdv: result.onlyPdv || [],
            onlyExtract: result.onlyExtract || [],
            totals: totals || {},
          });
          Object.assign(result, view);
          totals = {
            ...totals,
            orderConfirmedCount: view.ordersConfirmed.length,
            orderReviewCount: view.ordersReview.length,
            orderUnmatchedCount: view.ordersUnmatched.length,
          };
        }
        return {
          id: r.id,
          source: r.source,
          periodStart: r.periodStart,
          periodEnd: r.periodEnd,
          accountLabel: r.accountLabel,
          createdBy: r.createdBy,
          totals,
          result,
          narrativeText: r.narrativeText,
          originalFileName: r.originalFileName,
          createdAt: r.createdAt,
          hasPdf: Boolean(r.hasPdf),
          hasExcel: Boolean(r.hasExcel),
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

  getReportExcel: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      await requirePdvAdmin(ctx);
      const db = await getDb();
      try {
        const [rows] = await db.execute(
          `SELECT reportExcel FROM pdv_reconciliations WHERE id = ? LIMIT 1`,
          [input.id]
        );
        const r = (rows as any[])[0];
        if (!r?.reportExcel) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Planilha não disponível" });
        }
        const buf: Buffer = Buffer.isBuffer(r.reportExcel)
          ? r.reportExcel
          : Buffer.from(r.reportExcel);
        return {
          base64: buf.toString("base64"),
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        };
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

        const rejectedCandidateIds: number[] = [];
        if (input.action === "dismiss" || input.paymentId == null) {
          for (const c of item.candidates || []) {
            rejectedCandidateIds.push(Number(c.paymentId));
          }
          review.splice(input.reviewIndex, 1);
          for (const line of extractLines) {
            if (!onlyExtract.some((e) => e.id === line.id)) onlyExtract.push(line);
          }
          // candidatos vão para só PDV se ainda não estiverem
          for (const c of item.candidates || []) {
            if (!onlyPdv.some((p) => Number(p.paymentId) === Number(c.paymentId))) {
              onlyPdv.push({
                pedidoId: String(c.pedidoId),
                paymentId: Number(c.paymentId),
                valorCents: Number(c.valorCents) || 0,
                clienteNome: c.clienteNome ?? null,
                nomePix: c.nomePix ?? null,
                pedidoCreatedAt: new Date().toISOString(),
                status: "PAGO",
              });
            }
          }
        } else {
          const paymentId = input.paymentId;
          const [payRows] = await db.execute(
            `SELECT p.id AS paymentId, o.pedidoId, o.status, o.clienteNome, p.nomePix, p.obsPagamento,
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
              obsPagamento: pay.obsPagamento == null ? null : String(pay.obsPagamento),
              clienteNome: pay.clienteNome == null ? null : String(pay.clienteNome),
              pedidoCreatedAt: new Date(pay.pedidoCreatedAt).toISOString(),
              status: String(pay.status || "PAGO"),
              formaPagamento: forma,
              valorLiquidoCents: toCents(pay.valorLiquido) || undefined,
              taxaCents: toCents(pay.taxa) || undefined,
              matchBasis: "manual",
            },
          });

          // Outros candidatos da dúvida → não localizado
          for (const c of item.candidates || []) {
            if (Number(c.paymentId) !== paymentId) {
              rejectedCandidateIds.push(Number(c.paymentId));
              if (!onlyPdv.some((p) => Number(p.paymentId) === Number(c.paymentId))) {
                onlyPdv.push({
                  pedidoId: String(c.pedidoId),
                  paymentId: Number(c.paymentId),
                  valorCents: Number(c.valorCents) || 0,
                  clienteNome: c.clienteNome ?? null,
                  nomePix: c.nomePix ?? null,
                  pedidoCreatedAt: new Date().toISOString(),
                  status: "PAGO",
                });
              }
            }
          }

          review.splice(input.reviewIndex, 1);
          onlyPdv = onlyPdv.filter((p) => Number(p.paymentId) !== paymentId);
          const extractIds = new Set(extractLines.map((e: any) => e.id));
          onlyExtract = onlyExtract.filter((e) => !extractIds.has(e.id));

          await setPaymentReconcileStatus(db, paymentId, "confirmed", {
            source: row.source,
            extractRef: extractLines.map((e: any) => e.id).join(",").slice(0, 250),
            by: admin.name,
            pedidoId: String(pay.pedidoId),
            syncSheet: true,
          });
        }

        for (const pid of rejectedCandidateIds) {
          const cand = (item.candidates || []).find((c: any) => Number(c.paymentId) === pid);
          await setPaymentReconcileStatus(db, pid, "unmatched", {
            source: row.source,
            by: admin.name,
            pedidoId: cand?.pedidoId ? String(cand.pedidoId) : null,
            syncSheet: true,
          });
        }

        const totalsBase = {
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

        const orderView = await attachOrderViews(db, {
          matched,
          review,
          onlyExtract,
          onlyPdv,
          totals: totalsBase,
        });

        const totals = {
          ...totalsBase,
          orderConfirmedCount: orderView.ordersConfirmed.length,
          orderReviewCount: orderView.ordersReview.length,
          orderUnmatchedCount: orderView.ordersUnmatched.length,
          orderUnmatchedPedidoCount: new Set(
            orderView.ordersUnmatched.map((o) => o.order.pedidoId)
          ).size,
        };

        const newResult = {
          ...result,
          matched,
          review,
          onlyExtract,
          onlyPdv,
          ...orderView,
        };

        let narrativeText = String(row.narrativeText || "");
        if (input.action === "confirm" && input.paymentId != null) {
          narrativeText += `\n\n[Manual] ${admin.name} confirmou match com payment #${input.paymentId}.`;
        } else {
          narrativeText += `\n\n[Manual] ${admin.name} dispensou um item da revisão.`;
        }

        const updatedFull: ReconcileResult = {
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
          ...orderView,
          narrativeText,
        };
        const reportExcel = await buildReconcileReportExcel(updatedFull, {
          generatedBy: admin.name,
        });

        await db.execute(
          `UPDATE pdv_reconciliations
           SET totalsJson = ?, resultJson = ?, narrativeText = ?, reportExcel = ?
           WHERE id = ?`,
          [
            JSON.stringify(totals),
            JSON.stringify(newResult),
            narrativeText,
            reportExcel,
            input.reconciliationId,
          ]
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
          ...orderView,
          narrativeText,
          reportExcelBase64: reportExcel.toString("base64"),
        };
      } finally {
        await db.end();
      }
    }),
});
