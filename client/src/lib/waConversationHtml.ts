/**
 * Visualização da conversa no formato do painel — com instância, áudio e vídeo.
 */
import {
  extractAudioTranscription,
  formatYmdBr,
  messageSenderLabel,
} from "@shared/waConversationHistory";

export type HistoryHtmlMessage = {
  id?: number | string;
  fromMe?: boolean | number | string;
  senderType?: string | null;
  type?: string | null;
  content?: string | null;
  mediaCaption?: string | null;
  timestamp?: string | Date | null;
  mediaUrl?: string | null;
  hasBlob?: boolean | number | string;
};

export type HistoryHtmlInput = {
  contactName?: string | null;
  contactPhone?: string | null;
  instanceName?: string | null;
  fromYmd?: string | null;
  toYmd?: string | null;
  messages: HistoryHtmlMessage[];
};

export function escHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isFromMe(msg: HistoryHtmlMessage): boolean {
  return msg.fromMe === true || msg.fromMe === 1 || msg.fromMe === "1";
}

function formatTime(ts?: string | Date | null): string {
  if (!ts) return "";
  const d = ts instanceof Date ? ts : new Date(ts);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDay(ts?: string | Date | null): string {
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

function firstName(name?: string | null, fallback = "Cliente"): string {
  const t = String(name ?? "").trim();
  if (!t) return fallback;
  return t.split(/\s+/)[0];
}

function mediaSrc(msg: HistoryHtmlMessage, resolve: (m: HistoryHtmlMessage) => string | null): string | null {
  const direct = resolve(msg);
  if (direct) return direct;
  const u = String(msg.mediaUrl ?? "").trim();
  return u || null;
}

function renderBody(msg: HistoryHtmlMessage, src: string | null): string {
  const type = String(msg.type ?? "text");
  const content = String(msg.content ?? "").trim();
  const caption = String(msg.mediaCaption ?? "").trim();
  const transcription = extractAudioTranscription(content);

  if (type === "audio" || type === "ptt") {
    const player = src
      ? `<audio controls preload="metadata" src="${escHtml(src)}" style="width:100%;margin-top:6px"></audio>`
      : `<p class="miss">Áudio indisponível</p>`;
    const text = transcription
      ? `<p class="tr">“${escHtml(transcription)}”</p>`
      : `<p class="miss">Sem transcrição</p>`;
    return `<p class="kind">ÁUDIO</p>${player}${text}`;
  }
  if (type === "video") {
    const player = src
      ? `<video controls preload="metadata" src="${escHtml(src)}" style="width:100%;max-height:280px;border-radius:10px;margin-top:6px;background:#000"></video>`
      : `<p class="miss">Vídeo indisponível</p>`;
    const cap = caption && caption !== "[video]" ? `<p class="cap">${escHtml(caption)}</p>` : "";
    return `<p class="kind">VÍDEO</p>${player}${cap}`;
  }
  if (type === "image" || type === "sticker") {
    const img = src
      ? `<img src="${escHtml(src)}" alt="${type === "sticker" ? "Figurinha" : "Imagem"}" style="max-width:100%;max-height:260px;border-radius:10px;margin-top:6px" />`
      : `<p class="miss">Imagem indisponível</p>`;
    const cap = caption && !caption.startsWith("[") ? `<p class="cap">${escHtml(caption)}</p>` : "";
    return img + cap;
  }
  if (type === "document") {
    const name = content && !content.startsWith("[") ? content : "Documento";
    if (src) {
      return `<a class="doc" href="${escHtml(src)}" target="_blank" rel="noopener">Documento: ${escHtml(name)}</a>`;
    }
    return `<p class="miss">Documento: ${escHtml(name)}</p>`;
  }
  if (!content || (content.startsWith("[") && content.endsWith("]"))) {
    return `<p class="miss">${escHtml(content || "mensagem")}</p>`;
  }
  return `<p class="txt">${escHtml(content)}</p>`;
}

export function buildConversationHistoryHtml(
  data: HistoryHtmlInput,
  resolveMedia: (msg: HistoryHtmlMessage) => string | null = () => null
): string {
  const contact = data.contactName || "Contato";
  const clientLabel = firstName(data.contactName);
  const period =
    data.fromYmd && data.toYmd
      ? `${formatYmdBr(data.fromYmd)} — ${formatYmdBr(data.toYmd)}`
      : "Histórico salvo";
  const inst = data.instanceName || "Instância";

  let lastDay = "";
  const bubbles: string[] = [];
  for (const msg of data.messages) {
    const day = formatDay(msg.timestamp);
    if (day && day !== lastDay) {
      lastDay = day;
      bubbles.push(`<div class="day"><span>${escHtml(day)}</span></div>`);
    }
    const mine = isFromMe(msg);
    const who = mine ? messageSenderLabel(msg) : clientLabel;
    const src = mediaSrc(msg, resolveMedia);
    bubbles.push(`
      <div class="row ${mine ? "me" : "them"}">
        <div class="bubble ${mine ? (String(msg.senderType ?? "") === "ai" ? "ai" : "loja") : "cli"}">
          <div class="meta">${escHtml(who)} · ${escHtml(formatTime(msg.timestamp))}</div>
          ${renderBody(msg, src)}
        </div>
      </div>`);
  }

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escHtml(contact)} · ${escHtml(inst)}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #0d0d0d; color: #e4e4e7; font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
  .wrap { max-width: 480px; margin: 0 auto; min-height: 100vh; background: #0d0d0d; }
  header { position: sticky; top: 0; z-index: 2; padding: 12px 16px; background: #161616; border-bottom: 1px solid #1e1e1e; }
  .brand { font-size: 11px; letter-spacing: .08em; color: #6b7280; font-weight: 700; }
  h1 { margin: 4px 0 0; font-size: 18px; color: #fff; }
  .sub { margin-top: 4px; font-size: 12px; color: #9ca3af; }
  .chip { display: inline-block; margin-top: 8px; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; color: #25D366; background: #25D36614; }
  .feed { padding: 14px 12px 28px; display: flex; flex-direction: column; gap: 8px; }
  .day { display: flex; justify-content: center; margin: 10px 0 4px; }
  .day span { background: #1a1a1a; color: #a1a1aa; font-size: 11px; font-weight: 600; padding: 4px 12px; border-radius: 999px; border: 1px solid #2a2a2a; }
  .row { display: flex; }
  .row.me { justify-content: flex-end; }
  .row.them { justify-content: flex-start; }
  .bubble { max-width: 82%; padding: 8px 10px 10px; border-radius: 14px; }
  .bubble.cli { background: #1a1a1a; border: 1px solid #252525; border-bottom-left-radius: 4px; }
  .bubble.loja { background: #1d3a2a; border-bottom-right-radius: 4px; }
  .bubble.ai { background: #0f2a1a; border: 1px solid #25D36633; border-bottom-right-radius: 4px; }
  .meta { font-size: 10px; font-weight: 700; color: #25D36699; margin-bottom: 4px; }
  .row.them .meta { color: #a1a1aa; }
  .txt, .cap, .tr { margin: 6px 0 0; font-size: 14px; line-height: 1.4; white-space: pre-wrap; word-break: break-word; }
  .tr { color: #d4d4d8; font-style: italic; }
  .kind { margin: 0; font-size: 10px; font-weight: 800; letter-spacing: .06em; color: #9ca3af; }
  .miss { margin: 6px 0 0; font-size: 12px; color: #71717a; }
  .doc { display: inline-block; margin-top: 6px; color: #93c5fd; font-size: 13px; }
  footer { padding: 16px; text-align: center; font-size: 11px; color: #52525b; }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <div class="brand">JUREMA SPORT · PAINEL WHATSAPP</div>
      <h1>${escHtml(contact)}</h1>
      <div class="sub">${escHtml(data.contactPhone || "")} · ${escHtml(period)} · ${data.messages.length} mensagens</div>
      <span class="chip">${escHtml(inst)}</span>
    </header>
    <div class="feed">
      ${bubbles.join("\n")}
    </div>
    <footer>Áudio e vídeo tocam aqui. O PDF é só texto.</footer>
  </div>
</body>
</html>`;
}

export function openConversationHistoryHtml(html: string): boolean {
  const w = window.open("", "_blank", "width=480,height=820");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
