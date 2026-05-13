/**
 * Aplica drizzle/0018_wa_intervencao_away_schedule.sql em produção de forma idempotente.
 * Uso: railway run -- node scripts/apply-0018-intervencao-awaySchedule.mjs
 */
import mysql from "mysql2/promise";

async function main() {
  const url =
    process.env.MYSQL_PUBLIC_URL ||
    process.env.MYSQL_URL ||
    process.env.DATABASE_URL;
  if (!url) {
    console.error("Defina MYSQL_PUBLIC_URL, MYSQL_URL ou DATABASE_URL.");
    process.exit(1);
  }

  const conn = await mysql.createConnection(url);

  try {
    const [[dbRow]] = await conn.query("SELECT DATABASE() AS db");
    const db = dbRow?.db;
    if (!db) throw new Error("Não foi possível resolver o nome do schema.");

    const [[en]] = await conn.query(
      `SELECT COLUMN_TYPE AS t FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'wa_conversations' AND COLUMN_NAME = 'status'`,
      [db]
    );
    const t = String(en?.t || "");
    if (!t.includes("intervencao")) {
      await conn.query(`
        ALTER TABLE \`wa_conversations\`
        MODIFY COLUMN \`status\` ENUM(
          'novo',
          'em_atendimento',
          'aguardando',
          'proposta_enviada',
          'finalizado',
          'spam',
          'intervencao'
        ) NOT NULL DEFAULT 'novo'
      `);
      console.log("0018: ENUM status atualizado com intervencao.");
    } else {
      console.log("0018: ENUM já contém intervencao — pulando.");
    }

    const [[col]] = await conn.query(
      `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'wa_ai_config' AND COLUMN_NAME = 'awaySchedule'`,
      [db]
    );

    if (!Number(col?.n)) {
      await conn.query(
        "ALTER TABLE `wa_ai_config` ADD COLUMN `awaySchedule` JSON NULL AFTER `awayEnd`"
      );
      console.log("0018: coluna awaySchedule criada.");
    } else {
      console.log("0018: coluna awaySchedule já existe — pulando.");
    }
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
