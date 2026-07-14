/** Tipos da conciliação financeira (PDV × extrato). */

export type ExtractSource = "infinitepay" | "mercado_pago" | "generic";

export type ExtractLine = {
  id: string;
  source: ExtractSource;
  date: string; // YYYY-MM-DD (SP)
  time: string; // HH:mm
  datetimeIso: string; // ISO
  type: "PIX";
  direction: "in" | "out";
  payerNameRaw: string;
  payerNameNorm: string;
  amountCents: number;
  page: number;
  /** ID da operação (Mercado Pago) */
  operationId?: string;
  /** pix_in | liberacao | … */
  kindLabel?: string;
};

export type PdvPixPayment = {
  paymentId: number;
  pedidoId: string;
  status: string;
  clienteNome: string | null;
  nomePix: string | null;
  valorCents: number;
  pedidoCreatedAt: Date;
  paymentCreatedAt: Date;
};

export type MatchConfidence = "high" | "medium";
export type MatchKind = "1:1" | "split" | "card_1:1" | "card_lote";

export type MatchedPaymentRef = {
  pedidoId: string;
  paymentId: number;
  valorCents: number;
  nomePix: string | null;
  clienteNome: string | null;
  pedidoCreatedAt: string;
  status: string;
  formaPagamento?: string;
  valorLiquidoCents?: number;
  taxaCents?: number;
  matchBasis?: string;
};

export type MatchedItem = {
  kind: MatchKind;
  confidence: MatchConfidence;
  score: number;
  notes?: string;
  extract: ExtractLine[];
  payment: MatchedPaymentRef;
  /** Outros pagamentos do lote (card_lote). */
  relatedPayments?: MatchedPaymentRef[];
};

export type ReviewItem = {
  reason: string;
  extract?: ExtractLine[];
  payment?: MatchedItem["payment"];
  candidates?: Array<{
    paymentId: number;
    pedidoId: string;
    score: number;
    valorCents: number;
    clienteNome: string | null;
    nomePix: string | null;
  }>;
};

export type ReconcileTotals = {
  extractInCents: number;
  matchedCents: number;
  onlyExtractCents: number;
  onlyPdvCents: number;
  matchCount: number;
  reviewCount: number;
};

export type ReconcileResult = {
  source: ExtractSource;
  period: { start: string; end: string } | null;
  accountLabel: string | null;
  totals: ReconcileTotals;
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
  narrativeText: string;
  reportPdfBase64?: string;
};

export type ToleranceMs = {
  beforeMs: number;
  afterMs: number;
};

export const DEFAULT_TOLERANCE: ToleranceMs = {
  beforeMs: 36 * 60 * 60 * 1000,
  afterMs: 72 * 60 * 60 * 1000,
};

export const DEFAULT_CARD_TOLERANCE: ToleranceMs = {
  beforeMs: 48 * 60 * 60 * 1000,
  afterMs: 30 * 24 * 60 * 60 * 1000,
};
