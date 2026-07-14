import { extractPdfText, parseInfinitePayPdf, parseInfinitePayText } from "./infinitePayParser";
import {
  looksLikeInfinitePay,
  looksLikeMercadoPago,
  parseMercadoPagoPdf,
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

export async function parseExtratoPdf(
  buffer: Buffer,
  sourceHint: ExtractSource | "auto" = "auto"
): Promise<ParsedExtrato> {
  let parsed: ParsedExtrato;

  if (sourceHint === "infinitepay") {
    const p = await parseInfinitePayPdf(buffer);
    parsed = { ...p, ignoredOtherCount: 0 };
  } else if (sourceHint === "mercado_pago") {
    parsed = await parseMercadoPagoPdf(buffer);
  } else {
    const text = await extractPdfText(buffer);
    if (!text || text.replace(/\s+/g, "").length < 40) {
      throw new Error(
        "O PDF não tem texto legível (pode ser imagem/scan). Exporte o extrato em PDF com texto ou selecione a origem e tente outro arquivo."
      );
    }
    if (looksLikeMercadoPago(text)) {
      parsed = parseMercadoPagoText(text);
    } else if (looksLikeInfinitePay(text)) {
      const p = parseInfinitePayText(text);
      parsed = { ...p, ignoredOtherCount: 0 };
    } else {
      // tenta MP primeiro (tem ID de operação), senão InfinitePay
      const mp = parseMercadoPagoText(text);
      if (mp.lines.length > 0) parsed = mp;
      else {
        const ip = parseInfinitePayText(text);
        if (ip.lines.length > 0) parsed = { ...ip, ignoredOtherCount: 0 };
        else {
          throw new Error(
            "Não foi possível identificar o extrato (InfinitePay ou Mercado Pago). No campo Origem, escolha a plataforma e tente de novo."
          );
        }
      }
    }
  }

  return ensurePeriodFromLines(parsed);
}
