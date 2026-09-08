import { addCalendarDaysYmdSaoPaulo, formatYmdInTimeZone, SAO_PAULO_TZ } from "./spCalendar";

export const WA_HISTORY_EXPORT_MAX = 1500;
export const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

const MEDIA_LABELS: Record<string, string> = {
  image: "[Imagem]",
  video: "[Vídeo]",
  audio: "[Áudio]",
  ptt: "[Áudio]",
  document: "[Documento]",
  sticker: "[Figurinha]",
  location: "[Localização]",
};

export function isValidYmd(value: string | null | undefined): value is string {
  if (!value || !YMD_RE.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00-03:00`);
  if (!Number.isFinite(parsed.getTime())) return false;
  return formatYmdInTimeZone(parsed, SAO_PAULO_TZ) === value;
}

export function ymdRangeToUtcBounds(fromYmd: string, toYmd: string): { from: Date; toExclusive: Date } {
  if (!isValidYmd(fromYmd) || !isValidYmd(toYmd)) {
    throw new Error("Período inválido");
  }
  const start = fromYmd <= toYmd ? fromYmd : toYmd;
  const end = fromYmd <= toYmd ? toYmd : fromYmd;
  const from = new Date(`${start}T00:00:00-03:00`);
  const next = addCalendarDaysYmdSaoPaulo(end, 1);
  const toExclusive = new Date(`${next}T00:00:00-03:00`);
  return { from, toExclusive };
}

export function formatYmdBr(ymd: string): string {
  if (!isValidYmd(ymd)) return ymd;
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

export type ExportMessageBody = {
  kind: "text" | "audio" | "media";
  label?: string;
  text: string;
  transcription: string | null;
};

const AUDIO_TYPES = new Set(["audio", "ptt"]);

/** Tira o prefixo `[Áudio]` e devolve só o texto falado. */
export function extractAudioTranscription(content?: string | null): string | null {
  const raw = String(content ?? "").trim();
  if (!raw) return null;
  if (/^\[(?:á|a)udio\s+sem\s+transcri/i.test(raw)) return null;
  if (/^\[(?:á|a)udio\]$/i.test(raw)) return null;
  const prefixed = raw.match(/^\[(?:á|a)udio\]\s+(.+)$/i);
  if (prefixed) return prefixed[1].trim() || null;
  if (!raw.startsWith("[")) return raw;
  return null;
}

export function parseExportMessage(msg: {
  type?: string | null;
  content?: string | null;
  mediaCaption?: string | null;
}): ExportMessageBody {
  const type = String(msg.type ?? "text");
  const content = String(msg.content ?? "").trim();
  const caption = String(msg.mediaCaption ?? "").trim();

  if (AUDIO_TYPES.has(type) || /^\[(?:á|a)udio\]/i.test(content)) {
    const transcription = extractAudioTranscription(content) || extractAudioTranscription(caption);
    return {
      kind: "audio",
      label: "Áudio",
      text: transcription ? `Áudio: ${transcription}` : "Áudio (sem transcrição)",
      transcription,
    };
  }

  const label = MEDIA_LABELS[type];
  if (label) {
    const extra = caption || (content && !content.startsWith("[") ? content : "");
    return {
      kind: "media",
      label: label.replace(/^\[|\]$/g, ""),
      text: extra ? `${label} ${extra}` : label,
      transcription: null,
    };
  }

  if (!content) return { kind: "text", text: "(mensagem vazia)", transcription: null };
  if (content.startsWith("[") && content.endsWith("]")) {
    return { kind: "media", text: content, transcription: null };
  }
  return { kind: "text", text: content, transcription: null };
}

export function formatMessageExportText(msg: {
  type?: string | null;
  content?: string | null;
  mediaCaption?: string | null;
}): string {
  return parseExportMessage(msg).text;
}

export function messageSenderLabel(msg: { fromMe?: boolean | number | string; senderType?: string | null }): string {
  const fromMe = msg.fromMe === true || msg.fromMe === 1 || msg.fromMe === "1";
  if (!fromMe) return "Cliente";
  if (String(msg.senderType ?? "") === "ai") return "Ju (IA)";
  return "Atendente";
}

export function sanitizeFilenamePart(value: string, fallback = "contato"): string {
  const cleaned = value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .toLowerCase();
  return cleaned || fallback;
}

export function buildHistoryPdfFilename(opts: {
  contactName?: string | null;
  contactPhone?: string | null;
  fromYmd?: string | null;
  toYmd?: string | null;
}): string {
  const who = sanitizeFilenamePart(String(opts.contactName || opts.contactPhone || "contato"));
  if (opts.fromYmd && opts.toYmd && isValidYmd(opts.fromYmd) && isValidYmd(opts.toYmd)) {
    const a = opts.fromYmd <= opts.toYmd ? opts.fromYmd : opts.toYmd;
    const b = opts.fromYmd <= opts.toYmd ? opts.toYmd : opts.fromYmd;
    return `conversa-${who}-${a}-a-${b}.pdf`;
  }
  return `conversa-${who}.pdf`;
}
