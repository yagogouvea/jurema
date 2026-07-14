/**
 * Casa "Liberação de dinheiro" (Mercado Pago) com pagamentos DÉBITO/CRÉDITO do PDV.
 *
 * Âncoras de valor (nessa ordem de preferência):
 *  1) valorLiquido  (o que a loja costuma receber após taxa)
 *  2) valor         (digitado no PDV como “recebido”)
 *  3) valor+taxa    (valorMaquininha)
 *  4) lote: soma de vários liquidos = liberação
 *
 * Janela típica de liquidação: pedido até 30 dias antes da liberação (e 48h depois).
 */
import type {
  ExtractLine,
  MatchConfidence,
  MatchedItem,
  ReviewItem,
  ToleranceMs,
} from "./types";
import { DEFAULT_CARD_TOLERANCE } from "./types";

export type PdvCardPayment = {
  paymentId: number;
  pedidoId: string;
  status: string;
  clienteNome: string | null;
  formaPagamento: "DEBITO" | "CREDITO";
  valorCents: number;
  taxaCents: number;
  valorLiquidoCents: number;
  /** valor + taxa (maquininha) */
  valorMaquininhaCents: number;
  pedidoCreatedAt: Date;
  paymentCreatedAt: Date;
};

export { DEFAULT_CARD_TOLERANCE };

type ValueBasis = "liquido" | "bruto" | "maquininha";

function withinCardWindow(
  liberacaoAt: Date,
  pedidoAt: Date,
  tol: ToleranceMs
): boolean {
  // liberação geralmente DEPOIS do pedido: pedidoAt ∈ [lib - after … lib + before]
  const t = liberacaoAt.getTime();
  return t >= pedidoAt.getTime() - tol.beforeMs && t <= pedidoAt.getTime() + tol.afterMs;
}

function basisCents(p: PdvCardPayment, basis: ValueBasis): number {
  if (basis === "liquido") return p.valorLiquidoCents;
  if (basis === "bruto") return p.valorCents;
  return p.valorMaquininhaCents;
}

function cardPaymentDto(
  p: PdvCardPayment,
  opts?: { matchBasis?: string; displayCents?: number }
): MatchedItem["payment"] {
  return {
    pedidoId: p.pedidoId,
    paymentId: p.paymentId,
    valorCents: opts?.displayCents ?? p.valorLiquidoCents,
    nomePix: null,
    clienteNome: p.clienteNome,
    pedidoCreatedAt: p.pedidoCreatedAt.toISOString(),
    status: p.status,
    formaPagamento: p.formaPagamento,
    valorLiquidoCents: p.valorLiquidoCents,
    taxaCents: p.taxaCents,
    matchBasis: opts?.matchBasis,
  };
}

function scoreCard1to1(
  line: ExtractLine,
  pay: PdvCardPayment,
  basis: ValueBasis,
  sameValueOthers: number,
  tol: ToleranceMs
): number {
  const liberacaoAt = new Date(line.datetimeIso);
  if (!withinCardWindow(liberacaoAt, pay.pedidoCreatedAt, tol)) {
    return Number.NEGATIVE_INFINITY;
  }
  if (basisCents(pay, basis) !== line.amountCents) return Number.NEGATIVE_INFINITY;

  let s = basis === "liquido" ? 60 : basis === "bruto" ? 50 : 45;
  const dt = Math.abs(liberacaoAt.getTime() - pay.pedidoCreatedAt.getTime());
  if (dt <= 24 * 60 * 60 * 1000) s += 15;
  else if (dt <= 7 * 24 * 60 * 60 * 1000) s += 10;
  else if (dt <= 30 * 24 * 60 * 60 * 1000) s += 5;
  if (sameValueOthers > 0) s -= 20;
  if (pay.status === "PENDENTE") s -= 10;
  return s;
}

function confidenceFor(score: number): MatchConfidence {
  return score >= 70 ? "high" : "medium";
}

/** Subset sum (ids) que soma exatamente target; N pequeno. */
function findSubsetSum(
  items: Array<{ id: number; cents: number }>,
  target: number
): number[] | null {
  if (target <= 0 || items.length === 0) return null;
  // DP: map sum -> list of ids
  let dp = new Map<number, number[]>();
  dp.set(0, []);
  for (const it of items) {
    const next = new Map(dp);
    for (const [sum, ids] of dp) {
      const ns = sum + it.cents;
      if (ns > target) continue;
      if (!next.has(ns)) next.set(ns, [...ids, it.id]);
    }
    dp = next;
    if (dp.has(target)) return dp.get(target)!;
  }
  return dp.get(target) ?? null;
}

export type CardLiberacaoResult = {
  matched: MatchedItem[];
  review: ReviewItem[];
  onlyExtract: ExtractLine[];
  onlyPdv: Array<{
    pedidoId: string;
    paymentId: number;
    valorCents: number;
    clienteNome: string | null;
    nomePix: string | null;
    pedidoCreatedAt: string;
    status: string;
    formaPagamento?: string;
  }>;
};

/**
 * @param liberacoes linhas kindLabel=liberacao
 * @param cardPayments pagamentos DEBITO/CREDITO candidatos
 */
export function reconcileCardLiberations(params: {
  liberacoes: ExtractLine[];
  cardPayments: PdvCardPayment[];
  tolerance?: ToleranceMs;
}): CardLiberacaoResult {
  const tol = params.tolerance ?? DEFAULT_CARD_TOLERANCE;
  const poolLines = new Map(params.liberacoes.map((l) => [l.id, l]));
  const poolPays = new Map(params.cardPayments.map((p) => [p.paymentId, p]));

  const matched: MatchedItem[] = [];
  const review: ReviewItem[] = [];

  const countSameBasis = (payId: number, cents: number, basis: ValueBasis) => {
    let n = 0;
    for (const p of poolPays.values()) {
      if (p.paymentId !== payId && basisCents(p, basis) === cents) n++;
    }
    return n;
  };

  const sorted = [...poolLines.values()].sort((a, b) => b.amountCents - a.amountCents);

  // Passada 1 — 1:1 por liquido / bruto / maquininha
  for (const line of sorted) {
    if (!poolLines.has(line.id)) continue;

    type Scored = { pay: PdvCardPayment; score: number; basis: ValueBasis };
    const scored: Scored[] = [];
    for (const basis of ["liquido", "bruto", "maquininha"] as ValueBasis[]) {
      for (const pay of poolPays.values()) {
        const sc = scoreCard1to1(
          line,
          pay,
          basis,
          countSameBasis(pay.paymentId, line.amountCents, basis),
          tol
        );
        if (sc === Number.NEGATIVE_INFINITY) continue;
        scored.push({ pay, score: sc, basis });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    if (scored.length === 0) continue;

    // Dedup: mesmo payment pode aparecer em 2 bases — fica a melhor
    const bestByPay = new Map<number, Scored>();
    for (const s of scored) {
      const prev = bestByPay.get(s.pay.paymentId);
      if (!prev || s.score > prev.score) bestByPay.set(s.pay.paymentId, s);
    }
    const unique = [...bestByPay.values()].sort((a, b) => b.score - a.score);
    const top = unique[0];
    const tied = unique.filter((s) => s.score === top.score);

    if (tied.length === 1 && top.score >= 55) {
      matched.push({
        kind: "card_1:1",
        confidence: confidenceFor(top.score),
        score: top.score,
        notes: `Liberação × ${top.pay.formaPagamento} (base ${top.basis})`,
        extract: [line],
        payment: cardPaymentDto(top.pay, {
          matchBasis: top.basis,
          displayCents: line.amountCents,
        }),
      });
      poolLines.delete(line.id);
      poolPays.delete(top.pay.paymentId);
    } else if (unique.length > 0) {
      review.push({
        reason: tied.length > 1 ? "card_empate" : "card_score_baixo",
        extract: [line],
        candidates: unique.slice(0, 5).map((s) => ({
          paymentId: s.pay.paymentId,
          pedidoId: s.pay.pedidoId,
          score: s.score,
          valorCents: basisCents(s.pay, s.basis),
          clienteNome: s.pay.clienteNome,
          nomePix: s.basis,
        })),
      });
      poolLines.delete(line.id);
    }
  }

  // Passada 2 — lote: soma de liquidos = liberação
  for (const line of [...poolLines.values()].sort((a, b) => b.amountCents - a.amountCents)) {
    if (!poolLines.has(line.id)) continue;
    const liberacaoAt = new Date(line.datetimeIso);

    const cands = [...poolPays.values()].filter((p) =>
      withinCardWindow(liberacaoAt, p.pedidoCreatedAt, tol)
    );
    if (cands.length < 2) continue;

    // Limita DP a 18 pagamentos mais próximos da data da liberação
    const nearest = [...cands]
      .sort(
        (a, b) =>
          Math.abs(liberacaoAt.getTime() - a.pedidoCreatedAt.getTime()) -
          Math.abs(liberacaoAt.getTime() - b.pedidoCreatedAt.getTime())
      )
      .slice(0, 18);

    const subset = findSubsetSum(
      nearest.map((p) => ({ id: p.paymentId, cents: p.valorLiquidoCents })),
      line.amountCents
    );
    if (!subset || subset.length < 2) continue;

    const pays = subset.map((id) => poolPays.get(id)!).filter(Boolean);
    if (pays.length < 2) continue;

    matched.push({
      kind: "card_lote",
      confidence: "medium",
      score: 65,
      notes: `Liberação = soma de ${pays.length} cartões (líquido): ${pays
        .map((p) => p.pedidoId)
        .join(", ")}`,
      extract: [line],
      payment: cardPaymentDto(pays[0], {
        matchBasis: "lote_liquido",
        displayCents: line.amountCents,
      }),
      relatedPayments: pays.slice(1).map((p) =>
        cardPaymentDto(p, { matchBasis: "lote_liquido", displayCents: p.valorLiquidoCents })
      ),
    });
    poolLines.delete(line.id);
    for (const p of pays) poolPays.delete(p.paymentId);
  }

  const onlyExtract = [...poolLines.values()].sort((a, b) =>
    a.datetimeIso.localeCompare(b.datetimeIso)
  );
  const onlyPdv = [...poolPays.values()].map((p) => ({
    pedidoId: p.pedidoId,
    paymentId: p.paymentId,
    valorCents: p.valorLiquidoCents,
    clienteNome: p.clienteNome,
    nomePix: null as string | null,
    pedidoCreatedAt: p.pedidoCreatedAt.toISOString(),
    status: p.status,
    formaPagamento: p.formaPagamento,
  }));

  return { matched, review, onlyExtract, onlyPdv };
}
