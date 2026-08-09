/**
 * Casa "Liberação de dinheiro" (Mercado Pago) com pagamentos DÉBITO/CRÉDITO do PDV.
 *
 * No Mercado Pago não vem o nome de quem pagou — o match é por valor (+ data/hora).
 *
 * No PDV, débito (+3%) e crédito (+5%) gravam:
 *  - valor           → o que a loja digitou (recebe)
 *  - taxa            → 3% ou 5% sobre o valor
 *  - valorLiquido    → valor − taxa
 *  - valorMaquininha → valor + taxa (o que passou na maquininha)
 *
 * Âncoras de valor (nessa ordem — a maquininha reflete a taxa do pedido):
 *  1) valorMaquininha
 *  2) valor (bruto digitado)
 *  3) valorLiquido
 *  4) lote: soma de vários (maquininha / bruto / líquido) = liberação
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
  /** Titular / quem pagou (mesmo campo nomePix do PDV). */
  nomePix: string | null;
  obsPagamento?: string | null;
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

type ValueBasis = "maquininha" | "bruto" | "liquido";

const BASIS_ORDER: ValueBasis[] = ["maquininha", "bruto", "liquido"];

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
  if (basis === "maquininha") return p.valorMaquininhaCents;
  if (basis === "bruto") return p.valorCents;
  return p.valorLiquidoCents;
}

function basisScoreBoost(basis: ValueBasis): number {
  // maquininha = valor + 3%/5% → o que tipicamente bate com a liquidação
  if (basis === "maquininha") return 70;
  if (basis === "bruto") return 60;
  return 50;
}

function cardPaymentDto(
  p: PdvCardPayment,
  opts?: { matchBasis?: string; displayCents?: number }
): MatchedItem["payment"] {
  return {
    pedidoId: p.pedidoId,
    paymentId: p.paymentId,
    valorCents: opts?.displayCents ?? p.valorMaquininhaCents,
    nomePix: p.nomePix,
    obsPagamento: p.obsPagamento ?? null,
    clienteNome: p.clienteNome,
    pedidoCreatedAt: p.pedidoCreatedAt.toISOString(),
    status: p.status,
    formaPagamento: p.formaPagamento,
    valorLiquidoCents: p.valorLiquidoCents,
    taxaCents: p.taxaCents,
    matchBasis: opts?.matchBasis,
  };
}

function dateTimeBoost(liberacaoAt: Date, pedidoAt: Date): number {
  const dt = Math.abs(liberacaoAt.getTime() - pedidoAt.getTime());
  const hour = 60 * 60 * 1000;
  if (dt <= 2 * hour) return 20; // mesmo horário (~)
  if (dt <= 24 * hour) return 15; // mesmo dia
  if (dt <= 3 * 24 * hour) return 12;
  if (dt <= 7 * 24 * hour) return 8;
  if (dt <= 30 * 24 * hour) return 4;
  return 0;
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

  let s = basisScoreBoost(basis);
  s += dateTimeBoost(liberacaoAt, pay.pedidoCreatedAt);
  // Formas com taxa esperada reforçam a base maquininha
  if (basis === "maquininha" && pay.taxaCents > 0) s += 5;
  if (sameValueOthers > 0) s -= 20;
  if (pay.status === "PENDENTE") s -= 10;
  return s;
}

function confidenceFor(score: number): MatchConfidence {
  return score >= 75 ? "high" : "medium";
}

/** Subset sum (ids) que soma exatamente target; N pequeno. */
function findSubsetSum(
  items: Array<{ id: number; cents: number }>,
  target: number
): number[] | null {
  if (target <= 0 || items.length === 0) return null;
  let dp = new Map<number, number[]>();
  dp.set(0, []);
  for (const it of items) {
    const next = new Map(dp);
    for (const [sum, ids] of Array.from(dp.entries())) {
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
    obsPagamento?: string | null;
    pedidoCreatedAt: string;
    status: string;
    formaPagamento?: string;
  }>;
};

/**
 * @param liberacoes linhas kindLabel=liberacao (Mercado Pago / cartão)
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
    for (const p of Array.from(poolPays.values())) {
      if (p.paymentId !== payId && basisCents(p, basis) === cents) n++;
    }
    return n;
  };

  const sorted = Array.from(poolLines.values()).sort((a, b) => b.amountCents - a.amountCents);

  // Passada 1 — 1:1 por maquininha / bruto / líquido (valor é âncora; sem nome)
  for (const line of sorted) {
    if (!poolLines.has(line.id)) continue;

    type Scored = { pay: PdvCardPayment; score: number; basis: ValueBasis };
    const scored: Scored[] = [];
    for (const basis of BASIS_ORDER) {
      for (const pay of Array.from(poolPays.values())) {
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
    const unique = Array.from(bestByPay.values()).sort((a, b) => b.score - a.score);
    const top = unique[0];
    const tied = unique.filter((s) => s.score === top.score);

    if (tied.length === 1 && top.score >= 55) {
      matched.push({
        kind: "card_1:1",
        confidence: confidenceFor(top.score),
        score: top.score,
        notes: `Liberação × ${top.pay.formaPagamento} (base ${top.basis}; taxa PDV ${top.pay.taxaCents / 100})`,
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

  // Passada 2 — lote: soma (maquininha → bruto → líquido) = liberação
  for (const line of Array.from(poolLines.values()).sort((a, b) => b.amountCents - a.amountCents)) {
    if (!poolLines.has(line.id)) continue;
    const liberacaoAt = new Date(line.datetimeIso);

    const cands = Array.from(poolPays.values()).filter((p) =>
      withinCardWindow(liberacaoAt, p.pedidoCreatedAt, tol)
    );
    if (cands.length < 2) continue;

    const nearest = [...cands]
      .sort(
        (a, b) =>
          Math.abs(liberacaoAt.getTime() - a.pedidoCreatedAt.getTime()) -
          Math.abs(liberacaoAt.getTime() - b.pedidoCreatedAt.getTime())
      )
      .slice(0, 18);

    let subset: number[] | null = null;
    let loteBasis: ValueBasis | null = null;
    for (const basis of BASIS_ORDER) {
      subset = findSubsetSum(
        nearest.map((p) => ({ id: p.paymentId, cents: basisCents(p, basis) })),
        line.amountCents
      );
      if (subset && subset.length >= 2) {
        loteBasis = basis;
        break;
      }
    }
    if (!subset || !loteBasis || subset.length < 2) continue;

    const pays = subset.map((id) => poolPays.get(id)!).filter(Boolean);
    if (pays.length < 2) continue;

    matched.push({
      kind: "card_lote",
      confidence: "medium",
      score: 65,
      notes: `Liberação = soma de ${pays.length} cartões (${loteBasis}): ${pays
        .map((p) => p.pedidoId)
        .join(", ")}`,
      extract: [line],
      payment: cardPaymentDto(pays[0], {
        matchBasis: `lote_${loteBasis}`,
        displayCents: line.amountCents,
      }),
      relatedPayments: pays.slice(1).map((p) =>
        cardPaymentDto(p, {
          matchBasis: `lote_${loteBasis}`,
          displayCents: basisCents(p, loteBasis!),
        })
      ),
    });
    poolLines.delete(line.id);
    for (const p of pays) poolPays.delete(p.paymentId);
  }

  const onlyExtract = Array.from(poolLines.values()).sort((a, b) =>
    a.datetimeIso.localeCompare(b.datetimeIso)
  );
  const onlyPdv = Array.from(poolPays.values()).map((p) => ({
    pedidoId: p.pedidoId,
    paymentId: p.paymentId,
    valorCents: p.valorMaquininhaCents || p.valorCents,
    clienteNome: p.clienteNome,
    nomePix: p.nomePix,
    obsPagamento: p.obsPagamento ?? null,
    pedidoCreatedAt: p.pedidoCreatedAt.toISOString(),
    status: p.status,
    formaPagamento: p.formaPagamento,
  }));

  return { matched, review, onlyExtract, onlyPdv };
}
