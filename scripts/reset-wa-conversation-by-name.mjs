/**
 * Remove uma conversa WhatsApp do PDV (mensagens + wa_ai_logs + conversa).
 * Uso: node --import dotenv/config scripts/reset-wa-conversation-by-name.mjs "Yago Gouvea"
 */
import { createConnection } from "mysql2/promise";

const needle = (process.argv[2] || "").trim();
if (!needle) {
  console.error('Informe o nome, ex.: node --import dotenv/config scripts/reset-wa-conversation-by-name.mjs "Yago Gouvea"');
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url?.trim()) {
  console.error("DATABASE_URL não definido.");
  process.exit(1);
}

const conn = await createConnection(url);
try {
  const like = `%${needle.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
  const [rows] = await conn.query(
    `SELECT id, instanceId, remoteJid, contactName, contactPhone, status, lastMessageAt
     FROM wa_conversations
     WHERE contactName LIKE ? COLLATE utf8mb4_unicode_ci`,
    [like]
  );

  if (!rows.length) {
    console.log(JSON.stringify({ ok: true, deleted: 0, reason: "no_match", needle }, null, 2));
    process.exit(0);
  }

  const ids = rows.map((r) => r.id);
  const placeholders = ids.map(() => "?").join(",");

  const [rLog] = await conn.query(`DELETE FROM wa_ai_logs WHERE conversationId IN (${placeholders})`, ids);
  const [rMsg] = await conn.query(`DELETE FROM wa_messages WHERE conversationId IN (${placeholders})`, ids);
  const [rConv] = await conn.query(`DELETE FROM wa_conversations WHERE id IN (${placeholders})`, ids);

  console.log(
    JSON.stringify(
      {
        ok: true,
        needle,
        matchedConversations: rows,
        deleted: {
          wa_ai_logs: rLog.affectedRows ?? rLog,
          wa_messages: rMsg.affectedRows ?? rMsg,
          wa_conversations: rConv.affectedRows ?? rConv,
        },
      },
      null,
      2
    )
  );
} finally {
  await conn.end();
}
