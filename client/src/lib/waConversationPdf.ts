/**
 * PDF de histórico — bolhas de conversa, data no meio, transcrição de áudio.
 */
import { jsPDF } from "jspdf";
import {
  buildHistoryPdfFilename,
  formatYmdBr,
  messageSenderLabel,
  parseExportMessage,
} from "@shared/waConversationHistory";

export type HistoryPdfMessage = {
  fromMe?: boolean | number | string;
  senderType?: string | null;
  type?: string | null;
  content?: string | null;
  mediaCaption?: string | null;
  timestamp?: string | Date | null;
};

export type HistoryPdfInput = {
  contactName?: string | null;
  contactPhone?: string | null;
  instanceName?: string | null;
  fromYmd?: string | null;
  toYmd?: string | null;
  truncated?: boolean;
  limit?: number;
  messages: HistoryPdfMessage[];
};

const GREEN: [number, number, number] = [18, 140, 80];
const GREEN_SOFT: [number, number, number] = [220, 248, 228];
const BLUE_SOFT: [number, number, number] = [219, 234, 254];
const GRAY_BUBBLE: [number, number, number] = [244, 244, 245];
const INK: [number, number, number] = [24, 24, 27];
const MUTED: [number, number, number] = [113, 113, 122];

function isFromMe(msg: HistoryPdfMessage): boolean {
  return msg.fromMe === true || msg.fromMe === 1 || msg.fromMe === "1";
}

function formatMsgTime(ts?: string | Date | null): string {
  if (!ts) return "";
  const d = ts instanceof Date ? ts : new Date(ts);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMsgDay(ts?: string | Date | null): string {
  if (!ts) return "";
  const d = ts instanceof Date ? ts : new Date(ts);
  if (!Number.isFinite(d.getTime())) return "";
  const raw = d.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function formatPhone(phone?: string | null): string {
  if (!phone) return "";
  const clean = String(phone).replace(/@s\.whatsapp\.net$/i, "").replace(/\D/g, "");
  if (clean.length === 13 && clean.startsWith("55")) {
    return `+55 (${clean.slice(2, 4)}) ${clean.slice(4, 9)}-${clean.slice(9)}`;
  }
  if (clean.length === 12 && clean.startsWith("55")) {
    return `+55 (${clean.slice(2, 4)}) ${clean.slice(4, 8)}-${clean.slice(8)}`;
  }
  return phone;
}

function firstName(name?: string | null, fallback = "Cliente"): string {
  const t = String(name ?? "").trim();
  if (!t) return fallback;
  return t.split(/\s+/)[0];
}

export function buildConversationHistoryPdf(data: HistoryPdfInput): InstanceType<typeof jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 12;
  const maxBubble = 118;
  const lineH = 4.2;
  let y = M;

  const ensure = (h: number) => {
    if (y + h <= pageH - 16) return;
    doc.addPage();
    y = M;
  };

  const wrap = (value: string, width: number, size: number, style: "normal" | "bold" = "normal") => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    return doc.splitTextToSize(value, width) as string[];
  };

  const period =
    data.fromYmd && data.toYmd
      ? `${formatYmdBr(data.fromYmd)}  —  ${formatYmdBr(data.toYmd)}`
      : "Todo o histórico salvo no painel";
  const contact = data.contactName || "Contato";
  const phone = formatPhone(data.contactPhone);
  const clientLabel = firstName(data.contactName);

  // Cabeçalho
  const headerH = data.truncated ? 42 : 38;
  doc.setFillColor(18, 28, 22);
  doc.roundedRect(M, y, pageW - M * 2, headerH, 3, 3, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("JUREMA SPORT", M + 6, y + 8);
  doc.setFontSize(14);
  doc.text("Historico do WhatsApp", M + 6, y + 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(190, 210, 196);
  const meta = [contact, phone, data.instanceName, period, `${data.messages.length} mensagens`]
    .filter(Boolean)
    .join("   ·   ");
  const metaLines = wrap(meta, pageW - M * 2 - 12, 8.5);
  doc.text(metaLines, M + 6, y + 23);
  if (data.truncated) {
    doc.setTextColor(250, 204, 120);
    doc.text(`Mostrando as ${data.limit} mais recentes deste periodo.`, M + 6, y + 36);
  }
  y += headerH + 5;

  // Legenda
  doc.setFillColor(...GRAY_BUBBLE);
  doc.roundedRect(M, y, 52, 7, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...INK);
  doc.text(`${clientLabel}  (esquerda)`, M + 3, y + 4.6);

  doc.setFillColor(...GREEN_SOFT);
  doc.roundedRect(M + 56, y, 58, 7, 2, 2, "F");
  doc.setTextColor(...GREEN);
  doc.text("Loja / Ju  (direita)", M + 59, y + 4.6);
  y += 12;

  let lastDay = "";
  for (const msg of data.messages) {
    const mine = isFromMe(msg);
    const body = parseExportMessage(msg);
    const who = mine
      ? messageSenderLabel(msg)
      : clientLabel;
    const when = formatMsgTime(msg.timestamp);
    const day = formatMsgDay(msg.timestamp);

    if (day && day !== lastDay) {
      lastDay = day;
      ensure(10);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      const dw = Math.min(130, doc.getTextWidth(day) + 10);
      const dx = (pageW - dw) / 2;
      doc.setFillColor(232, 232, 234);
      doc.roundedRect(dx, y, dw, 6.5, 3, 3, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(82, 82, 91);
      doc.text(day, pageW / 2, y + 4.4, { align: "center" });
      y += 10;
    }

    const innerW = maxBubble - 8;
    const nameLine = `${who}   ${when}`;
    const nameLines = wrap(nameLine, innerW, 7.5, "bold");
    let bodyLines: string[] = [];
    let quoteLines: string[] = [];
    let mediaLine: string | null = null;

    if (body.kind === "audio") {
      mediaLine = "Audio";
      if (body.transcription) {
        quoteLines = wrap(`"${body.transcription}"`, innerW, 9);
      } else {
        bodyLines = wrap("sem transcricao neste audio", innerW, 8);
      }
    } else if (body.kind === "media") {
      mediaLine = body.label || "Midia";
      if (body.text && body.text !== `[${body.label}]`) {
        const extra = body.text.replace(/^\[[^\]]+\]\s*/, "");
        if (extra) bodyLines = wrap(extra, innerW, 9);
      }
    } else {
      bodyLines = wrap(body.text, innerW, 9);
    }

    const contentH =
      nameLines.length * 3.4
      + (mediaLine ? 5 : 0)
      + bodyLines.length * lineH
      + quoteLines.length * lineH
      + 7;
    const bubbleH = Math.max(14, contentH);
    const bubbleW = maxBubble;
    ensure(bubbleH + 3);

    const x = mine ? pageW - M - bubbleW : M;
    const fill = mine
      ? (String(msg.senderType ?? "") === "ai" ? BLUE_SOFT : GREEN_SOFT)
      : GRAY_BUBBLE;
    doc.setFillColor(fill[0], fill[1], fill[2]);
    doc.roundedRect(x, y, bubbleW, bubbleH, 2.2, 2.2, "F");
    if (mine) {
      doc.setFillColor(...GREEN);
      doc.rect(x + bubbleW - 1.2, y + 2, 1.2, bubbleH - 4, "F");
    } else {
      doc.setFillColor(160, 160, 168);
      doc.rect(x, y + 2, 1.2, bubbleH - 4, "F");
    }

    let ty = y + 5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(mine ? GREEN[0] : 82, mine ? GREEN[1] : 82, mine ? GREEN[2] : 91);
    doc.text(nameLines, x + 4, ty);
    ty += nameLines.length * 3.4 + 1.2;

    if (mediaLine) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(82, 82, 91);
      doc.text(mediaLine.toUpperCase(), x + 4, ty);
      ty += 4.4;
    }

    if (quoteLines.length) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(...INK);
      doc.text(quoteLines, x + 4, ty);
      ty += quoteLines.length * lineH;
    }

    if (bodyLines.length) {
      doc.setFont("helvetica", body.kind === "audio" ? "italic" : "normal");
      doc.setFontSize(body.kind === "audio" ? 8 : 9);
      doc.setTextColor(...(body.kind === "audio" ? MUTED : INK));
      doc.text(bodyLines, x + 4, ty);
    }

    y += bubbleH + 2.4;
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(160, 160, 168);
    doc.text(
      `Pagina ${i} de ${pages}   ·   Somente o que ja estava salvo no sistema`,
      pageW / 2,
      pageH - 8,
      { align: "center" }
    );
  }

  return doc;
}

export function downloadConversationHistoryPdf(data: HistoryPdfInput): void {
  const doc = buildConversationHistoryPdf(data);
  doc.save(
    buildHistoryPdfFilename({
      contactName: data.contactName,
      contactPhone: data.contactPhone,
      fromYmd: data.fromYmd,
      toYmd: data.toYmd,
    })
  );
}
