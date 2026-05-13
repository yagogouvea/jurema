/**
 * Zera dados de cadastro em wa_instances para reconfiguração (nome placeholder, sem telefone, sem vínculo wa-bridge).
 * Uso: railway run -- node scripts/clear-wa-instances-registration.mjs
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
    const [res] = await conn.query(`
      UPDATE wa_instances SET
        name = CONCAT('Instância ', id, ' (configurar)'),
        phone = '',
        instanceId = NULL,
        apiKey = NULL,
        webhookUrl = NULL,
        status = 'disconnected',
        active = 1,
        updatedAt = NOW()
    `);
    const info = res && typeof res === "object" && "affectedRows" in res ? res.affectedRows : res;
    console.log("wa_instances atualizadas:", info);
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
