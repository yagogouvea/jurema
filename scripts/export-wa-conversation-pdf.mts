/**
 * Gera PDF de uma conversa com histórico no período.
 * Uso: DATABASE_URL=... npx tsx scripts/export-wa-conversation-pdf.mts 2026-09-03 2026-09-08
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { buildConversationHistoryPdf } from "../client/src/lib/waConversationPdf";
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

const fromYmd = process.argv[2] && isValidYmd(process.argv[2]) ? process.argv[2] : "2026-09-03";
const toYmd = process.argv[3] && isValidYmd(process.argv[3]) ? process.argv[3] : todayYmdSaoPaulo();
const { from, toExclusive } = ymdRangeToUtcBounds(fromYmd, toYmd);

const db = await mysql.createConnection({ uri: url, ssl: { rejectUnauthorized: false } });
try {
  const [candidates] = (await db.execute(
    `SELECT c.id, c.contactName, c.contactPhone, i.name AS instanceName, COUNT(m.id) AS msgCount
     FROM wa_conversations c
     JOIN wa_messages m ON m.conversationId = c.id
       AND m.timestamp >= ? AND m.timestamp < ?
     LEFT JOIN wa_instances i ON i.instanceId = c.instanceId
     GROUP BY c.id, c.contactName, c.contactPhone, i.name
     HAVING msgCount >= 20
     ORDER BY msgCount DESC
     LIMIT 8`,
    [from, toExclusive]
  )) as any;

  const forcedId = Number(process.argv[4]);
  let pick = candidates[0];
  if (Number.isFinite(forcedId) && forcedId > 0) {
    pick = candidates.find((c: any) => Number(c.id) === forcedId) ?? null;
    if (!pick) {
      const [forced] = (await db.execute(
        `SELECT c.id, c.contactName, c.contactPhone, i.name AS instanceName, COUNT(m.id) AS msgCount
         FROM wa_conversations c
         JOIN wa_messages m ON m.conversationId = c.id
           AND m.timestamp >= ? AND m.timestamp < ?
         LEFT JOIN wa_instances i ON i.instanceId = c.instanceId
         WHERE c.id = ?
         GROUP BY c.id, c.contactName, c.contactPhone, i.name`,
        [from, toExclusive, forcedId]
      )) as any;
      pick = forced[0] ?? null;
    }
  }

  if (!pick) {
    console.error("Nenhuma conversa com histórico suficiente nesse período");
    process.exit(2);
  }
  const [rows] = (await db.execute(
    `SELECT fromMe, senderType, type, content, mediaCaption, timestamp
     FROM wa_messages
     WHERE conversationId=? AND timestamp >= ? AND timestamp < ?
     ORDER BY timestamp DESC
     LIMIT ${WA_HISTORY_EXPORT_MAX + 1}`,
    [pick.id, from, toExclusive]
  )) as any;

  const truncated = rows.length > WA_HISTORY_EXPORT_MAX;
  const messages = (truncated ? rows.slice(0, WA_HISTORY_EXPORT_MAX) : rows).reverse();
  const doc = buildConversationHistoryPdf({
    contactName: pick.contactName,
    contactPhone: pick.contactPhone,
    instanceName: pick.instanceName,
    fromYmd,
    toYmd,
    truncated,
    limit: WA_HISTORY_EXPORT_MAX,
    messages,
  });
  const bytes = Buffer.from(doc.output("arraybuffer"));
  const filename = buildHistoryPdfFilename({
    contactName: pick.contactName,
    contactPhone: pick.contactPhone,
    fromYmd,
    toYmd,
  });
  const out = join(dirname(fileURLToPath(import.meta.url)), "..", filename);
  writeFileSync(out, bytes);
  console.log(JSON.stringify({
    ok: bytes.subarray(0, 5).toString("latin1") === "%PDF-",
    file: out,
    conversationId: Number(pick.id),
    contact: String(pick.contactName || pick.contactPhone || ""),
    instance: pick.instanceName || null,
    fromYmd,
    toYmd,
    messages: messages.length,
    candidates: candidates.map((c: any) => ({
      id: Number(c.id),
      name: String(c.contactName || "").slice(0, 40),
      n: Number(c.msgCount),
    })),
    pdfBytes: bytes.length,
  }, null, 2));
} finally {
  await db.end();
}
