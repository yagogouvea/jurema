/**
 * Apaga TODO o histórico de conversas WhatsApp IA (mensagens, logs e conversas).
 * Mantém: wa_instances, wa_ai_config, wa_quick_replies, wa_status_presets.
 *
 * Uso: node --import dotenv/config scripts/clear-all-wa-conversations.mjs
 *      node --import dotenv/config scripts/clear-all-wa-conversations.mjs --apply
 */
import { createConnection } from "mysql2/promise";

const apply = process.argv.includes("--apply");
const url = process.env.DATABASE_URL || process.env.MYSQL_PUBLIC_URL || process.env.MYSQL_URL;
if (!url?.trim()) {
  console.error("Defina DATABASE_URL (ou MYSQL_PUBLIC_URL).");
  process.exit(1);
}

const conn = await createConnection(url);
try {
  const count = async (table) => {
    const [r] = await conn.query(`SELECT COUNT(*) AS n FROM ${table}`);
    return Number(r[0]?.n ?? 0);
  };

  const before = {
    wa_conversations: await count("wa_conversations"),
    wa_messages: await count("wa_messages"),
    wa_ai_logs: await count("wa_ai_logs"),
  };

  console.log("Estado atual:", before);

  if (!apply) {
    console.log("\nDry-run. Passe --apply para apagar de verdade.");
    process.exit(0);
  }

  const [rLog] = await conn.query("DELETE FROM wa_ai_logs");
  const [rMsg] = await conn.query("DELETE FROM wa_messages");
  const [rConv] = await conn.query("DELETE FROM wa_conversations");

  for (const table of ["wa_ai_logs", "wa_messages", "wa_conversations"]) {
    try {
      await conn.query(`ALTER TABLE ${table} AUTO_INCREMENT = 1`);
    } catch {
      /* ignore */
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        before,
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
