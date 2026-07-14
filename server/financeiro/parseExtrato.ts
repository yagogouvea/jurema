import { extractPdfText, parseInfinitePayText } from "./infinitePayParser";
import {
  looksLikeInfinitePay,
  looksLikeMercadoPago,
  parseMercadoPagoText,
} from "./mercadoPagoParser";
import type { ExtractLine, ExtractSource } from "./types";

export type ParsedExtrato = {
  source: ExtractSource;
  period: { start: string; end: string } | null;
  accountLabel: string | null;
  companyLabel: string | null;
  lines: ExtractLine[];
  ignoredOutCount: number;
  ignoredOtherCount?: number;
};

/** Se o cabeçalho do PDF não tiver período, usa min/max das datas dos lançamentos. */
export function ensurePeriodFromLines(parsed: ParsedExtrato): ParsedExtrato {
  if (parsed.period?.start && parsed.period?.end) return parsed;
  const dates = parsed.lines
    .map((l) => l.date)
    .filter((d): d is string => Boolean(d && /^\d{4}-\d{2}-\d{2}$/.test(d)))
    .sort();
  if (dates.length === 0) return parsed;
  return {
    ...parsed,
    period: { start: dates[0], end: dates[dates.length - 1] },
  };
}

function assertNotPdvSalesReport(text: string): void {
  const tl = text.toLowerCase();
  if (
    /relat[oó]rio de vendas/.test(tl) ||
    /jumera sport|jurema sport/.test(tl) ||
    (/ped-\d{5,}/.test(tl) && /faturamento|ticket m[eé]dio/.test(tl))
  ) {
    throw new Error(
      "Este PDF é o Relatório de Vendas do PDV, não o extrato do banco. Baixe o extrato na InfinitePay (Relatório de movimentações) ou no Mercado Pago (Extrato de conta) e envie esse arquivo."
    );
  }
}

export async function parseExtratoPdf(
  buffer: Buffer,
  sourceHint: ExtractSource | "auto" = "auto"
): Promise<ParsedExtrato> {
  const text = await extractPdfText(buffer);
  if (!text || text.replace(/\s+/g, "").length < 40) {
    throw new Error(
      "O PDF não tem texto legível (pode ser imagem/scan). Exporte o extrato em PDF com texto ou selecione a origem e tente outro arquivo."
    );
  }
  assertNotPdvSalesReport(text);

  let parsed: ParsedExtrato;

  if (sourceHint === "infinitepay") {
    parsed = { ...parseInfinitePayText(text), ignoredOtherCount: 0 };
  } else if (sourceHint === "mercado_pago") {
    parsed = parseMercadoPagoText(text);
  } else if (looksLikeMercadoPago(text)) {
    parsed = parseMercadoPagoText(text);
  } else if (looksLikeInfinitePay(text)) {
    parsed = { ...parseInfinitePayText(text), ignoredOtherCount: 0 };
  } else {
    const mp = parseMercadoPagoText(text);
    if (mp.lines.length > 0) parsed = mp;
    else {
      const ip = parseInfinitePayText(text);
      if (ip.lines.length > 0) parsed = { ...ip, ignoredOtherCount: 0 };
      else {
        const hint = text.replace(/\s+/g, " ").trim().slice(0, 120);
        throw new Error(
          `Não foi possível identificar o extrato (InfinitePay ou Mercado Pago). No campo Origem, escolha a plataforma e tente de novo. Início do PDF: “${hint}…”`
        );
      }
    }
  }

  return ensurePeriodFromLines(parsed);
}
