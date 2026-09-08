/**
 * HTML da conversa no formato do painel, com áudio/vídeo embutidos.
 * Uso: DATABASE_URL=... npx tsx scripts/export-wa-conversation-html.mts 2026-09-03 2026-09-08 117
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { buildConversationHistoryHtml } from "../client/src/lib/waConversationHtml";
import {
  buildHistoryPdfFilename,
  isValidYmd,
  WA_HISTORY_EXPORT_MAX,
  ymdRangeToUtcBounds,
} from "../shared/waConversationHistory";
import { todayYmdSaoPaulo } from "../shared/spCalendar";

const url = process.env.DATABASE_URL || process.env.MYSQL_PUBLIC_URL;
if (!url) {
  console.error("FALHOU: DATABASE_URL ausente");
  process.exit(1);
}

function guessMime(type: string, raw?: string | null): string {
  if (raw && String(raw).trim()) return String(raw).split(";")[0].trim();
  if (type === "audio" || type === "ptt") return "audio/ogg";
  if (type === "video") return "video/mp4";
  if (type === "image") return "image/jpeg";
  if (type === "sticker") return "image/webp";
  return "application/octet-stream";
}

const fromYmd = process.argv[2] && isValidYmd(process.argv[2]) ? process.argv[2] : "2026-09-03";
const toYmd = process.argv[3] && isValidYmd(process.argv[3]) ? process.argv[3] : todayYmdSaoPaulo();
const forcedId = Number(process.argv[4] || 117);
const { from, toExclusive } = ymdRangeToUtcBounds(fromYmd, toYmd);

const db = await mysql.createConnection({ uri: url, ssl: { rejectUnauthorized: false } });
try {
  const [convRows] = (await db.execute(
    `SELECT c.id, c.contactName, c.contactPhone, i.name AS instanceName
     FROM wa_conversations c
     LEFT JOIN wa_instances i ON i.instanceId = c.instanceId
     WHERE c.id = ? LIMIT 1`,
    [forcedId]
  )) as any;
  const conv = convRows[0];
  if (!conv) {
    console.error("Conversa não encontrada");
    process.exit(2);
  }

  const [rows] = (await db.execute(
    `SELECT id, fromMe, senderType, type, content, mediaCaption, timestamp,
            mediaMimeType, mediaBlob
     FROM wa_messages
     WHERE conversationId=? AND timestamp >= ? AND timestamp < ?
     ORDER BY timestamp ASC
     LIMIT ${WA_HISTORY_EXPORT_MAX}`,
    [forcedId, from, toExclusive]
  )) as any;

  const media = new Map<number, string>();
  for (const row of rows) {
    if (!row.mediaBlob) continue;
    const buf = Buffer.isBuffer(row.mediaBlob) ? row.mediaBlob : Buffer.from(row.mediaBlob);
    if (!buf.length) continue;
    const mime = guessMime(String(row.type || "text"), row.mediaMimeType);
    media.set(Number(row.id), `data:${mime};base64,${buf.toString("base64")}`);
  }

  const html = buildConversationHistoryHtml(
    {
      contactName: conv.contactName,
      contactPhone: conv.contactPhone,
      instanceName: conv.instanceName,
      fromYmd,
      toYmd,
      messages: rows,
    },
    (msg) => media.get(Number(msg.id)) || null
  );

  const filename = buildHistoryPdfFilename({
    contactName: conv.contactName,
    contactPhone: conv.contactPhone,
    fromYmd,
    toYmd,
  }).replace(/\.pdf$/i, ".html");
  const out = join(dirname(fileURLToPath(import.meta.url)), "..", filename);
  writeFileSync(out, html, "utf8");
  console.log(JSON.stringify({
    ok: html.includes("<audio") || html.includes("<video"),
    file: out,
    contact: conv.contactName,
    instance: conv.instanceName,
    messages: rows.length,
    mediaEmbedded: media.size,
    bytes: Buffer.byteLength(html),
  }, null, 2));
} finally {
  await db.end();
}
