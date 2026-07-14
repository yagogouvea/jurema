/**
 * Parser do Relatório de movimentações InfinitePay (CloudWalk).
 * Entrada: texto extraído do PDF (páginas concatenadas).
 */
import { createHash } from "crypto";
import {
  normalizeName,
  parseBrlAmountToCents,
  stableLineId,
} from "./normalize";
import type { ExtractLine } from "./types";

const MONTHS: Record<string, string> = {
  jan: "01",
  fev: "02",
  mar: "03",
  abr: "04",
  mai: "05",
  jun: "06",
  jul: "07",
  ago: "08",
  set: "09",
  out: "10",
  nov: "11",
  dez: "12",
};

export type InfinitePayParseResult = {
  source: "infinitepay";
  period: { start: string; end: string } | null;
  accountLabel: string | null;
  companyLabel: string | null;
  lines: ExtractLine[];
  ignoredOutCount: number;
};

function parsePtDateToken(token: string): string | null {
  // "01 Jul, 2026" | "02 Jul, 2026"
  const m = token
    .trim()
    .match(/^(\d{1,2})\s+([A-Za-zÀ-ú]{3}),?\s+(\d{4})$/i);
  if (!m) return null;
  const day = m[1].padStart(2, "0");
  const monKey = m[2]
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .slice(0, 3)
    .toLowerCase();
  const month = MONTHS[monKey];
  if (!month) return null;
  return `${m[3]}-${month}-${day}`;
}

function parsePeriod(text: string): { start: string; end: string } | null {
  const m = text.match(
    /(\d{1,2}\s+[A-Za-zÀ-ú]{3},?\s+\d{4})\s*[-–]\s*(\d{1,2}\s+[A-Za-zÀ-ú]{3},?\s+\d{4})/i
  );
  if (!m) return null;
  const start = parsePtDateToken(m[1]);
  const end = parsePtDateToken(m[2]);
  if (!start || !end) return null;
  return { start, end };
}

function extractAccount(text: string): string | null {
  const m = text.match(/CLOUDWALK[^\n]{0,80}/i);
  return m ? m[0].trim() : null;
}

function extractCompany(text: string): string | null {
  const m = text.match(
    /^([A-Z0-9 .,&/-]+LTDA[^\n]*CNPJ:[^\n]+)/im
  );
  if (m) return m[1].trim();
  const m2 = text.match(/([^\n]+CNPJ:\s*[\d./-]+)/i);
  return m2 ? m2[1].trim() : null;
}

/**
 * InfinitePay imprime a data do dia no rodapé, antes de "Página X de Y".
 * Associa essa data à página que está terminando.
 */
function findPageDates(text: string): Map<number, string> {
  const map = new Map<number, string>();
  let pendingDate: string | null = null;
  for (const line of text.split(/\r?\n/)) {
    const dm = line.match(/^(\d{1,2}\s+[A-Za-zÀ-ú]{3},?\s+\d{4})\b/);
    if (dm && !/\s[-–]\s/.test(line)) {
      const ymd = parsePtDateToken(dm[1]);
      if (ymd) pendingDate = ymd;
    }
    const pageM = line.match(/P[áa]gina\s+(\d+)\s+de\s+\d+/i);
    if (pageM && pendingDate) {
      map.set(Number(pageM[1]), pendingDate);
      pendingDate = null;
    }
  }
  // Texto colado (sem \n): "… +180,00 01 Jul, 2026 A Central… Página 1 de 9"
  if (map.size === 0) {
    const re =
      /(\d{1,2}\s+[A-Za-zÀ-ú]{3},?\s+\d{4})\s+(?:A\s+Central|Central de Ajuda)?[^]*?P[áa]gina\s+(\d+)\s+de\s+\d+/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const ymd = parsePtDateToken(m[1]);
      if (ymd) map.set(Number(m[2]), ymd);
    }
  }
  return map;
}

const TX_COLLAPSED_RE =
  /(\d{1,2}:\d{2})\s+Pix\s+(.+?)\s+(Recebido|Enviado)\s+([+\-−]?\d{1,3}(?:\.\d{3})*,\d{2})/gi;

/** Extrai movimentos no formato de uma linha (como o unpdf devolve). */
function extractCollapsedMoves(
  text: string,
  periodStart: string | null,
  pageDates: Map<number, string>
): { lines: ExtractLine[]; ignoredOutCount: number } {
  const lines: ExtractLine[] = [];
  let ignoredOutCount = 0;
  // Marca posições de "Página N" → conteúdo seguinte é página N+1
  const pageMarks: { idx: number; page: number }[] = [{ idx: 0, page: 1 }];
  const pageRe = /P[áa]gina\s+(\d+)\s+de\s+\d+/gi;
  let pm: RegExpExecArray | null;
  while ((pm = pageRe.exec(text))) {
    pageMarks.push({ idx: pm.index + pm[0].length, page: Number(pm[1]) + 1 });
  }

  const pageAt = (idx: number): number => {
    let p = 1;
    for (const mark of pageMarks) {
      if (mark.idx <= idx) p = mark.page;
      else break;
    }
    return p;
  };

  TX_COLLAPSED_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TX_COLLAPSED_RE.exec(text))) {
    const time = m[1].padStart(5, "0");
    const detail = /^Recebido$/i.test(m[3]) ? "Recebido" : "Enviado";
    const centsSigned = parseBrlAmountToCents(m[4]);
    if (detail === "Enviado") {
      ignoredOutCount++;
      continue;
    }
    if (centsSigned <= 0) continue;
    const page = pageAt(m.index);
    const date = pageDates.get(page) || pageDates.get(page - 1) || periodStart;
    if (!date) continue;
    const payerNameRaw = m[2]
      .replace(/^Pix\s+/i, "")
      .replace(/\s+/g, " ")
      .trim();
    const payerNameNorm = normalizeName(payerNameRaw);
    const idSrc = stableLineId([date, time, payerNameNorm, centsSigned, page]);
    lines.push({
      id: hashId(idSrc),
      source: "infinitepay",
      date,
      time,
      datetimeIso: `${date}T${time}:00-03:00`,
      type: "PIX",
      direction: "in",
      payerNameRaw,
      payerNameNorm,
      amountCents: centsSigned,
      page,
    });
  }
  return { lines, ignoredOutCount };
}

function hashId(s: string): string {
  return createHash("sha1").update(s).digest("hex").slice(0, 16);
}

/**
 * Detecta linhas de movimento. O texto do PDF às vezes vem "quebrado"
 * (hora / Pix / nome / Recebido / valor em linhas distintas).
 */
export function parseInfinitePayText(rawText: string): InfinitePayParseResult {
  const text = rawText.replace(/\u00a0/g, " ");
  const period = parsePeriod(text);
  const accountLabel = extractAccount(text);
  const companyLabel = extractCompany(text);
  const pageDates = findPageDates(text);

  // Preferir formato colapsado (unpdf: "05:50 Pix Pix NOME Recebido +180,00")
  const collapsed = extractCollapsedMoves(text, period?.start || null, pageDates);

  const lines: ExtractLine[] = [];
  let ignoredOutCount = 0;
  let currentPage = 1;
  let currentDate =
    pageDates.get(1) ||
    period?.start ||
    null;

  // Acumulador de um lançamento multi-linha
  type Acc = {
    time?: string;
    nameParts: string[];
    detail?: "Recebido" | "Enviado";
    page: number;
    date: string | null;
  };
  let acc: Acc | null = null;

  const flushImpossible = () => {
    acc = null;
  };

  const commit = (amountRaw: string) => {
    if (!acc?.time || !acc.detail || !acc.date) {
      flushImpossible();
      return;
    }
    const centsSigned = parseBrlAmountToCents(amountRaw);
    const isIn = acc.detail === "Recebido";
    if (!isIn) {
      ignoredOutCount++;
      flushImpossible();
      return;
    }
    if (centsSigned <= 0) {
      flushImpossible();
      return;
    }
    const payerNameRaw = acc.nameParts
      .join(" ")
      .replace(/^Pix\s+/i, "")
      .replace(/\s+/g, " ")
      .trim();
    const payerNameNorm = normalizeName(payerNameRaw);
    const idSrc = stableLineId([
      acc.date,
      acc.time,
      payerNameNorm,
      centsSigned,
      acc.page,
    ]);
    lines.push({
      id: hashId(idSrc),
      source: "infinitepay",
      date: acc.date,
      time: acc.time,
      datetimeIso: `${acc.date}T${acc.time}:00-03:00`,
      type: "PIX",
      direction: "in",
      payerNameRaw,
      payerNameNorm,
      amountCents: centsSigned,
      page: acc.page,
    });
    flushImpossible();
  };

  const timeRe = /^(\d{1,2}:\d{2})$/;
  const amountRe = /^[+\-−]?\s*\d{1,3}(?:\.\d{3})*,\d{2}$/;
  const detailRe = /^(Recebido|Enviado)$/i;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const pageM = line.match(/P[áa]gina\s+(\d+)\s+de\s+\d+/i);
    if (pageM) {
      // Rodapé da página N → próximos lançamentos são da página N+1
      currentPage = Number(pageM[1]) + 1;
      currentDate =
        pageDates.get(currentPage) ||
        pageDates.get(Number(pageM[1])) ||
        currentDate;
      continue;
    }

    const dateOnly = parsePtDateToken(line);
    if (dateOnly && !line.includes("-") && line.length < 20) {
      currentDate = dateOnly;
      continue;
    }

    // "Saldo do dia" etc. — limpa acumulador
    if (/^Saldo/i.test(line) || /^Data$/i.test(line) || /^Hora$/i.test(line)) {
      flushImpossible();
      continue;
    }
    if (/Central de Ajuda|infinitepay|Relat[oó]rio de movimenta/i.test(line)) {
      continue;
    }
    if (/^(Tipo de transa|Nome|Detalhe|Valor)/i.test(line)) continue;

    if (timeRe.test(line)) {
      acc = {
        time: line.padStart(5, "0"),
        nameParts: [],
        page: currentPage,
        date: currentDate,
      };
      continue;
    }

    if (!acc) continue;

    if (/^Pix$/i.test(line)) continue;

    if (detailRe.test(line)) {
      acc.detail = /^Recebido$/i.test(line) ? "Recebido" : "Enviado";
      continue;
    }

    if (amountRe.test(line.replace(/\s/g, ""))) {
      commit(line.replace(/\s/g, ""));
      continue;
    }

    // Linha colapsada (raro): "05:50 Pix Nome Recebido +180,00"
    const collapsed = line.match(
      /^(\d{1,2}:\d{2})\s+Pix\s+(.+?)\s+(Recebido|Enviado)\s+([+\-−]?\d{1,3}(?:\.\d{3})*,\d{2})$/i
    );
    if (collapsed) {
      acc = {
        time: collapsed[1].padStart(5, "0"),
        nameParts: [collapsed[2]],
        detail: /^Recebido$/i.test(collapsed[3]) ? "Recebido" : "Enviado",
        page: currentPage,
        date: currentDate,
      };
      commit(collapsed[4]);
      continue;
    }

    // Nome (pode ter continuação em outra linha, ex. CPF)
    if (/^Pix\s+/i.test(line) || acc.nameParts.length > 0 || /^[A-Za-zÀ-ú0-9]/.test(line)) {
      const cleaned = line.replace(/^Pix\s+/i, "").trim();
      if (cleaned && !detailRe.test(cleaned) && !amountRe.test(cleaned.replace(/\s/g, ""))) {
        acc.nameParts.push(cleaned);
      }
    }
  }

  // Multiline antigo (hora / Pix / nome / Recebido em linhas separadas)
  const multiline = { lines, ignoredOutCount };
  const best =
    collapsed.lines.length >= multiline.lines.length ? collapsed : multiline;

  return {
    source: "infinitepay",
    period,
    accountLabel,
    companyLabel,
    lines: best.lines,
    ignoredOutCount: best.ignoredOutCount,
  };
}

/** Fallback: extrai literais de texto de PDFs simples (quando unpdf não está disponível). */
function extractPdfTextNaive(buffer: Buffer): string {
  const raw = buffer.toString("latin1");
  const chunks: string[] = [];
  const re = /\((?:\\.|[^\\)])*\)\s*Tj|\[(?:[^\]]*)]\s*TJ/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const token = m[0];
    if (token.endsWith("Tj")) {
      const inner = token.slice(1, token.lastIndexOf(")"));
      chunks.push(
        inner
          .replace(/\\n/g, "\n")
          .replace(/\\r/g, "")
          .replace(/\\t/g, " ")
          .replace(/\\\(/g, "(")
          .replace(/\\\)/g, ")")
          .replace(/\\\\/g, "\\")
      );
    } else {
      const inner = token.slice(1, token.lastIndexOf("]"));
      const parts = [...inner.matchAll(/\((?:\\.|[^\\)])*\)/g)].map((p) =>
        p[0]
          .slice(1, -1)
          .replace(/\\n/g, "\n")
          .replace(/\\\(/g, "(")
          .replace(/\\\)/g, ")")
          .replace(/\\\\/g, "\\")
      );
      chunks.push(parts.join(""));
    }
  }
  return chunks.join("\n");
}

export async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const mod = await import("unpdf");
    const getDocumentProxy = (mod as any).getDocumentProxy;
    const extractText = (mod as any).extractText;
    if (typeof getDocumentProxy === "function" && typeof extractText === "function") {
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      // mergePages:true cola tudo sem \n e quebra parsers; preferir páginas separadas.
      const { text } = await extractText(pdf, { mergePages: false });
      const joined = Array.isArray(text)
        ? text.map((p: unknown) => String(p ?? "")).join("\n")
        : String(text ?? "");
      if (joined.trim().length > 80) return joined;
      const merged = await extractText(pdf, { mergePages: true });
      const mergedText = Array.isArray(merged.text)
        ? merged.text.join("\n")
        : String(merged.text ?? "");
      if (mergedText.trim().length > 80) return mergedText;
    }
  } catch (e) {
    console.warn("[financeiro] unpdf indisponível, usando extrator simples:", e);
  }
  const naive = extractPdfTextNaive(buffer);
  if (naive.trim().length < 40) {
    throw new Error("Falha ao extrair texto do PDF. Instale a dependência unpdf ou envie outro arquivo.");
  }
  return naive;
}

export async function parseInfinitePayPdf(buffer: Buffer): Promise<InfinitePayParseResult> {
  const text = await extractPdfText(buffer);
  return parseInfinitePayText(text);
}
