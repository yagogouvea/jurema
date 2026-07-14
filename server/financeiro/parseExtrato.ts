import { extractPdfText, parseInfinitePayPdf, parseInfinitePayText } from "./infinitePayParser";
import {
  looksLikeInfinitePay,
  looksLikeMercadoPago,
  parseMercadoPagoPdf,
  parseMercadoPagoText,
} from "./mercadoPagoParser";
import type { ExtractSource } from "./types";

export type ParsedExtrato = {
  source: ExtractSource;
  period: { start: string; end: string } | null;
  accountLabel: string | null;
  companyLabel: string | null;
  lines: import("./types").ExtractLine[];
  ignoredOutCount: number;
  ignoredOtherCount?: number;
};

export async function parseExtratoPdf(
  buffer: Buffer,
  sourceHint: ExtractSource | "auto" = "auto"
): Promise<ParsedExtrato> {
  if (sourceHint === "infinitepay") {
    const p = await parseInfinitePayPdf(buffer);
    return { ...p, ignoredOtherCount: 0 };
  }
  if (sourceHint === "mercado_pago") {
    return parseMercadoPagoPdf(buffer);
  }

  const text = await extractPdfText(buffer);
  if (!text || text.replace(/\s+/g, "").length < 40) {
    throw new Error(
      "O PDF não tem texto legível (pode ser imagem/scan). Exporte o extrato em PDF com texto ou selecione a origem e tente outro arquivo."
    );
  }
  if (looksLikeMercadoPago(text)) {
    return parseMercadoPagoText(text);
  }
  if (looksLikeInfinitePay(text)) {
    const p = parseInfinitePayText(text);
    return { ...p, ignoredOtherCount: 0 };
  }
  // tenta MP primeiro (tem ID de operação), senão InfinitePay
  const mp = parseMercadoPagoText(text);
  if (mp.lines.length > 0) return mp;
  const ip = parseInfinitePayText(text);
  if (ip.lines.length > 0) return { ...ip, ignoredOtherCount: 0 };
  throw new Error(
    "Não foi possível identificar o extrato (InfinitePay ou Mercado Pago). No campo Origem, escolha a plataforma e tente de novo."
  );
}
