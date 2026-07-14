/**
 * Parser do Extrato de Conta Mercado Pago (PDF).
 *
 * Aceita texto com quebras de linha (fitz) OU texto “colado” (unpdf mergePages).
 * Colunas: Data | Descrição | ID da operação | Valor | Saldo
 */
import { createHash } from "crypto";
import { normalizeName, parseBrlAmountToCents, stableLineId } from "./normalize";
import type { ExtractLine } from "./types";
import { extractPdfText } from "./infinitePayParser";

export type MercadoPagoParseResult = {
  source: "mercado_pago";
  period: { start: string; end: string } | null;
  accountLabel: string | null;
  companyLabel: string | null;
  lines: ExtractLine[];
  ignoredOutCount: number;
  ignoredOtherCount: number;
};

function dmyToYmd(dmy: string): string | null {
  const m = dmy.trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function parsePeriod(text: string): { start: string; end: string } | null {
  const m = text.match(
    /De\s+(\d{2}-\d{2}-\d{4})\s+(?:al|a|até|ate)\s+(\d{2}-\d{2}-\d{4})/i
  );
  if (!m) return null;
  const start = dmyToYmd(m[1]);
  const end = dmyToYmd(m[2]);
  if (!start || !end) return null;
  return { start, end };
}

function extractCompany(text: string): string | null {
  const m = text.match(
    /EXTRATO DE CONTA\s+([A-Z0-9 .,&/-]+?(?:LTDA|ME|EIRELI|SA))\b/i
  );
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}

function extractAccount(text: string): string | null {
  const ag = text.match(/Ag[eê]ncia:\s*(\d+)/i);
  const ct = text.match(/Conta:\s*(\d+)/i);
  // unpdf às vezes cola "46759574423Agência:"
  const ctLoose = text.match(/(\d{8,})\s*Ag[eê]ncia/i);
  if (!ag && !ct && !ctLoose) return "Mercado Pago";
  return `Mercado Pago · Ag ${ag?.[1] || "?"} · Conta ${ct?.[1] || ctLoose?.[1] || "?"}`;
}

function hashId(s: string): string {
  return createHash("sha1").update(s).digest("hex").slice(0, 16);
}

type Kind = "pix_in" | "liberacao" | "out" | "other";

function classifyDescription(desc: string): { kind: Kind; payerNameRaw: string } {
  const d = desc.replace(/\s+/g, " ").trim();

  if (/pix\s+enviado/i.test(d)) {
    const name = d.replace(/^.*Pix\s+enviado\s+/i, "").trim() || d;
    return { kind: "out", payerNameRaw: name };
  }
  if (/libera[cç][aã]o\s+de\s+dinheiro/i.test(d)) {
    return { kind: "liberacao", payerNameRaw: "Liberação de dinheiro" };
  }
  if (/d[eé]bito\s+por\s+d[ií]vida|empr[eé]stimos?\s+mercado\s+pago/i.test(d)) {
    return { kind: "other", payerNameRaw: d };
  }
  if (/pix/i.test(d)) {
    let name = d.replace(/^Pagamento com C[oó]digo QR\s+/i, "");
    name = name.replace(/^Pix\s+/i, "").trim();
    return { kind: "pix_in", payerNameRaw: name || d };
  }
  return { kind: "other", payerNameRaw: d };
}

type RawMove = {
  dateDmy: string;
  desc: string;
  operationId: string;
  amountRaw: string;
};

/** Recorta a partir do detalhe (o PDF às vezes coloca página 2 depois do rodapé). */
function movementsBody(text: string): string {
  const det = text.search(/DETALHE DOS MOVIMENTOS/i);
  return det >= 0 ? text.slice(det) : text;
}

/** Estratégia A: texto colado / parcialmente colado (unpdf). */
function extractMovesCollapsed(text: string): RawMove[] {
  const flat = movementsBody(text).replace(/\s+/g, " ");
  // Ordem: Pix enviado antes de Pix; descrição curta até o ID da operação.
  const re =
    /(\d{2}-\d{2}-\d{4})\s+(Pagamento com C[oó]digo QR\s+Pix .+?|Pix enviado .+?|Pix (?!enviado).+?|Libera[cç][aã]o de dinheiro|D[eé]bito por d[ií]vida .+?)\s+(\d{6,})\s+R\$\s*([+\-−]?[\d.]+,\d{2})\s+R\$\s*([+\-−]?[\d.]+,\d{2})/gi;
  const out: RawMove[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(flat))) {
    out.push({
      dateDmy: m[1],
      desc: m[2].trim(),
      operationId: m[3],
      amountRaw: m[4].replace(/\s/g, ""),
    });
  }
  return out;
}

/** Estratégia B: linhas separadas (útil em testes / OCR bom). */
function extractMovesLineBased(text: string): RawMove[] {
  const out: RawMove[] = [];
  const dateRe = /^(\d{2}-\d{2}-\d{4})$/;
  const idRe = /^(\d{6,})$/;
  const moneyRe = /^R\$\s*([+\-−]?\s*\d{1,3}(?:\.\d{3})*,\d{2})$/i;

  let date: string | null = null;
  let descParts: string[] = [];
  let pendingId: string | null = null;
  let expectingAmount = false;

  const flush = () => {
    date = null;
    descParts = [];
    pendingId = null;
    expectingAmount = false;
  };

  for (const rawLine of movementsBody(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (dateRe.test(line)) {
      date = line;
      descParts = [];
      pendingId = null;
      expectingAmount = false;
      continue;
    }
    if (!date) continue;
    if (idRe.test(line) && descParts.length > 0) {
      pendingId = line;
      expectingAmount = true;
      continue;
    }
    if (expectingAmount && pendingId && moneyRe.test(line)) {
      const mm = line.match(moneyRe)!;
      out.push({
        dateDmy: date,
        desc: descParts.join(" "),
        operationId: pendingId,
        amountRaw: mm[1].replace(/\s/g, ""),
      });
      flush();
      continue;
    }
    if (!expectingAmount) descParts.push(line);
  }
  return out;
}

function toExtractLines(moves: RawMove[]): {
  lines: ExtractLine[];
  ignoredOutCount: number;
  ignoredOtherCount: number;
} {
  const lines: ExtractLine[] = [];
  let ignoredOutCount = 0;
  let ignoredOtherCount = 0;
  const seen = new Set<string>();

  for (const mv of moves) {
    if (seen.has(mv.operationId)) continue;
    seen.add(mv.operationId);

    const ymd = dmyToYmd(mv.dateDmy);
    if (!ymd) continue;
    const { kind, payerNameRaw } = classifyDescription(mv.desc);
    const centsSigned = parseBrlAmountToCents(mv.amountRaw);

    if (kind === "out" || centsSigned < 0) {
      ignoredOutCount++;
      continue;
    }
    if (kind === "other" || centsSigned <= 0) {
      ignoredOtherCount++;
      continue;
    }

    const payerNameNorm = normalizeName(payerNameRaw);
    const idSrc = stableLineId([ymd, mv.operationId, centsSigned, payerNameNorm]);
    lines.push({
      id: hashId(idSrc),
      source: "mercado_pago",
      date: ymd,
      time: "12:00",
      datetimeIso: `${ymd}T12:00:00-03:00`,
      type: "PIX",
      direction: "in",
      payerNameRaw:
        kind === "liberacao" ? `Liberação de dinheiro (#${mv.operationId})` : payerNameRaw,
      payerNameNorm: kind === "liberacao" ? "LIBERACAO DE DINHEIRO" : payerNameNorm,
      amountCents: Math.abs(centsSigned),
      page: 1,
      operationId: mv.operationId,
      kindLabel: kind,
    });
  }

  return { lines, ignoredOutCount, ignoredOtherCount };
}

export function parseMercadoPagoText(rawText: string): MercadoPagoParseResult {
  const text = rawText.replace(/\u00a0/g, " ");
  const period = parsePeriod(text);
  const companyLabel = extractCompany(text);
  const accountLabel = extractAccount(text);

  const collapsed = extractMovesCollapsed(text);
  const lineBased = extractMovesLineBased(text);
  // Preferir o que achar mais movimentos (unpdf costuma ser collapsed)
  const moves = collapsed.length >= lineBased.length ? collapsed : lineBased;
  const { lines, ignoredOutCount, ignoredOtherCount } = toExtractLines(moves);

  return {
    source: "mercado_pago",
    period,
    accountLabel,
    companyLabel,
    lines,
    ignoredOutCount,
    ignoredOtherCount,
  };
}

export async function parseMercadoPagoPdf(buffer: Buffer): Promise<MercadoPagoParseResult> {
  const text = await extractPdfText(buffer);
  return parseMercadoPagoText(text);
}

export function looksLikeMercadoPago(text: string): boolean {
  const t = text.toLowerCase();
  const hasMp =
    t.includes("mercado pago") ||
    t.includes("mercadopago") ||
    t.includes("id da opera") ||
    t.includes("id de opera");
  const hasExtrato =
    t.includes("extrato de conta") ||
    t.includes("libera") ||
    t.includes("pagamento com codigo qr") ||
    t.includes("pagamento com código qr") ||
    /pix\s+/i.test(text);
  return hasMp && hasExtrato;
}

export function looksLikeInfinitePay(text: string): boolean {
  const t = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return (
    t.includes("cloudwalk") ||
    t.includes("infinitepay") ||
    t.includes("infinite pay") ||
    t.includes("relatorio de movimentacoes") ||
    (t.includes("recebido de") && t.includes("transferencia"))
  );
}
