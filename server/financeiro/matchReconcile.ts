/**
 * Matching determinístico extrato × pagamentos PIX do PDV.
 * Spec: docs/conciliacao-financeira-spec.md
 */
import { nameMatchSignals } from "./normalize";
import type {
  ExtractLine,
  MatchedItem,
  PdvPixPayment,
  ReconcileResult,
  ReviewItem,
  ToleranceMs,
} from "./types";
import { DEFAULT_TOLERANCE } from "./types";

function paymentDto(
  p: PdvPixPayment,
  matchBasis?: MatchedItem["payment"]["matchBasis"]
): MatchedItem["payment"] {
  return {
    pedidoId: p.pedidoId,
    paymentId: p.paymentId,
    valorCents: p.valorCents,
    nomePix: p.nomePix,
    obsPagamento: p.obsPagamento ?? null,
    clienteNome: p.clienteNome,
    pedidoCreatedAt: p.pedidoCreatedAt.toISOString(),
    status: p.status,
    matchBasis,
  };
}

export function withinWindow(
  pixAt: Date,
  pedidoAt: Date,
  tol: ToleranceMs = DEFAULT_TOLERANCE
): boolean {
  const t = pixAt.getTime();
  return t >= pedidoAt.getTime() - tol.beforeMs && t <= pedidoAt.getTime() + tol.afterMs;
}

function sameCalendarDaySp(a: Date, b: Date): boolean {
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  return fmt(a) === fmt(b);
}

export function scoreMatch(
  line: ExtractLine,
  pay: PdvPixPayment,
  sameValueOthers: number,
  tol: ToleranceMs = DEFAULT_TOLERANCE
): number {
  const pixAt = new Date(line.datetimeIso);
  if (!withinWindow(pixAt, pay.pedidoCreatedAt, tol)) return Number.NEGATIVE_INFINITY;

  let s = 50;
  if (sameCalendarDaySp(pixAt, pay.pedidoCreatedAt)) s += 20;

  const dt = Math.abs(pixAt.getTime() - pay.pedidoCreatedAt.getTime());
  if (dt <= 24 * 60 * 60 * 1000) s += 15;
  else if (dt <= 72 * 60 * 60 * 1000) s += 8;

  const names = nameMatchSignals(line.payerNameNorm, pay.nomePix, pay.clienteNome);
  // O titular informado no checkout é mais confiável que o nome do cliente.
  if (names.payerScore >= 0.85) s += 35;
  else if (names.payerScore >= 0.55) s += 18;
  else if (names.customerScore >= 0.85) s += 20;
  else if (names.customerScore >= 0.55) s += 10;

  if (sameValueOthers > 0) s -= 20;
  if (pay.status === "PENDENTE") s -= 10;

  return s;
}

function confidenceFor(score: number): "high" | "medium" {
  return score >= 80 ? "high" : "medium";
}

export type ReconcileInput = {
  source: ReconcileResult["source"];
  period: ReconcileResult["period"];
  accountLabel: string | null;
  lines: ExtractLine[];
  payments: PdvPixPayment[];
  tolerance?: ToleranceMs;
};

export function reconcileExtractToPayments(input: ReconcileInput): Omit<
  ReconcileResult,
  "narrativeText" | "reportPdfBase64"
> {
  const tol = input.tolerance ?? DEFAULT_TOLERANCE;
  const poolLines = new Map(input.lines.map((l) => [l.id, l]));
  const poolPays = new Map(input.payments.map((p) => [p.paymentId, p]));

  const matched: MatchedItem[] = [];
  const review: ReviewItem[] = [];

  const countSameValue = (payId: number, cents: number) => {
    let n = 0;
    for (const p of poolPays.values()) {
      if (p.paymentId !== payId && p.valorCents === cents) n++;
    }
    return n;
  };

  // Passada 1 — 1:1
  const sortedLines = [...poolLines.values()].sort((a, b) => {
    if (b.amountCents !== a.amountCents) return b.amountCents - a.amountCents;
    return a.datetimeIso.localeCompare(b.datetimeIso);
  });

  for (const line of sortedLines) {
    if (!poolLines.has(line.id)) continue;

    type Scored = { pay: PdvPixPayment; score: number };
    const scored: Scored[] = [];
    for (const pay of poolPays.values()) {
      if (pay.valorCents !== line.amountCents) continue;
      const sc = scoreMatch(line, pay, countSameValue(pay.paymentId, pay.valorCents), tol);
      if (sc === Number.NEGATIVE_INFINITY) continue;
      scored.push({ pay, score: sc });
    }
    scored.sort((a, b) => b.score - a.score);

    if (scored.length === 0) continue;

    const top = scored[0];
    const tied = scored.filter((s) => s.score === top.score);

    if (tied.length === 1 && top.score >= 55) {
      matched.push({
        kind: "1:1",
        confidence: confidenceFor(top.score),
        score: top.score,
        notes:
          top.score < 80
            ? "Casado por valor+janela; nome parcial ou ausente"
            : undefined,
        extract: [line],
        payment: paymentDto(
          top.pay,
          nameMatchSignals(line.payerNameNorm, top.pay.nomePix, top.pay.clienteNome).basis
        ),
      });
      poolLines.delete(line.id);
      poolPays.delete(top.pay.paymentId);
    } else {
      review.push({
        reason: tied.length > 1 ? "empate_mesmo_score" : "score_baixo",
        extract: [line],
        candidates: scored.slice(0, 3).map((s) => ({
          paymentId: s.pay.paymentId,
          pedidoId: s.pay.pedidoId,
          score: s.score,
          valorCents: s.pay.valorCents,
          clienteNome: s.pay.clienteNome,
          nomePix: s.pay.nomePix,
          obsPagamento: s.pay.obsPagamento ?? null,
        })),
      });
      // Não remove line do pool — ainda pode entrar em split; se ficou em review 1:1,
      // remove para não duplicar na lista onlyExtract:
      poolLines.delete(line.id);
    }
  }

  // Passada 2 — split: vários PIX mesmo pagador+dia = 1 payment
  const remainingLines = [...poolLines.values()];
  const groups = new Map<string, ExtractLine[]>();
  for (const line of remainingLines) {
    const key = `${line.payerNameNorm}|${line.date}`;
    const arr = groups.get(key) || [];
    arr.push(line);
    groups.set(key, arr);
  }

  for (const [, group] of groups) {
    if (group.length < 2) continue;
    const sum = group.reduce((s, l) => s + l.amountCents, 0);
    const payCands = [...poolPays.values()].filter((p) => p.valorCents === sum);
    if (payCands.length === 0) continue;

    const minPix = new Date(
      Math.min(...group.map((l) => new Date(l.datetimeIso).getTime()))
    );
    const maxPix = new Date(
      Math.max(...group.map((l) => new Date(l.datetimeIso).getTime()))
    );

    type Scored = { pay: PdvPixPayment; score: number; ns: number };
    const scored: Scored[] = [];
    for (const pay of payCands) {
      if (!withinWindow(minPix, pay.pedidoCreatedAt, tol) && !withinWindow(maxPix, pay.pedidoCreatedAt, tol)) {
        continue;
      }
      const names = nameMatchSignals(
        group[0].payerNameNorm,
        pay.nomePix,
        pay.clienteNome
      );
      const ns = names.bestScore;
      // score base split: valor ok + janela + nome
      let sc = 55;
      if (ns >= 0.55) sc += 15;
      if (ns >= 0.85) sc += 10;
      scored.push({ pay, score: sc, ns });
    }
    scored.sort((a, b) => b.score - a.score);
    if (scored.length === 0) continue;

    const top = scored[0];
    if (scored.length === 1 && (top.ns >= 0.55 || payCands.length === 1)) {
      matched.push({
        kind: "split",
        confidence: "medium",
        score: top.score,
        notes: `Soma de ${group.length} PIX do extrato`,
        extract: group,
        payment: paymentDto(
          top.pay,
          nameMatchSignals(
            group[0].payerNameNorm,
            top.pay.nomePix,
            top.pay.clienteNome
          ).basis
        ),
      });
      for (const l of group) poolLines.delete(l.id);
      poolPays.delete(top.pay.paymentId);
    } else {
      review.push({
        reason: "split_ambiguo",
        extract: group,
        candidates: scored.slice(0, 3).map((s) => ({
          paymentId: s.pay.paymentId,
          pedidoId: s.pay.pedidoId,
          score: s.score,
          valorCents: s.pay.valorCents,
          clienteNome: s.pay.clienteNome,
          nomePix: s.pay.nomePix,
          obsPagamento: s.pay.obsPagamento ?? null,
        })),
      });
      for (const l of group) poolLines.delete(l.id);
    }
  }

  const onlyExtract = [...poolLines.values()].sort((a, b) =>
    a.datetimeIso.localeCompare(b.datetimeIso)
  );
  const onlyPdv = [...poolPays.values()].map((p) => ({
    pedidoId: p.pedidoId,
    paymentId: p.paymentId,
    valorCents: p.valorCents,
    clienteNome: p.clienteNome,
    nomePix: p.nomePix,
    obsPagamento: p.obsPagamento ?? null,
    pedidoCreatedAt: p.pedidoCreatedAt.toISOString(),
    status: p.status,
  }));

  const matchedCents = matched.reduce((s, m) => s + m.payment.valorCents, 0);
  const extractInCents = input.lines.reduce((s, l) => s + l.amountCents, 0);

  return {
    source: input.source,
    period: input.period,
    accountLabel: input.accountLabel,
    totals: {
      extractInCents,
      matchedCents,
      onlyExtractCents: onlyExtract.reduce((s, l) => s + l.amountCents, 0),
      onlyPdvCents: onlyPdv.reduce((s, p) => s + p.valorCents, 0),
      matchCount: matched.length,
      reviewCount: review.length,
    },
    matched,
    review,
    onlyExtract,
    onlyPdv,
  };
}
