/**
 * Aplica migração 0017 (pontosOffset / pontosOffsetMes) de forma idempotente.
 * Uso com variáveis do Railway: railway run node scripts/apply-0017-pdv-sellers.mjs
 */
import mysql from "mysql2/promise";

const url =
  process.env.MYSQL_PUBLIC_URL ||
  process.env.DATABASE_URL;
if (!url) {
  console.error(
    "Defina MYSQL_PUBLIC_URL ou DATABASE_URL. Ex.: railway run node scripts/apply-0017-pdv-sellers.mjs"
  );
  process.exit(1);
}

const db = await mysql.createConnection(url);
try {
  const [rows] = await db.execute(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pdv_sellers'
     AND COLUMN_NAME IN ('pontosOffset', 'pontosOffsetMes')`
  );
  const have = new Set(rows.map((r) => r.COLUMN_NAME));
  if (have.has("pontosOffset") && have.has("pontosOffsetMes")) {
    console.log("Colunas pontosOffset e pontosOffsetMes já existem — nada a fazer.");
    process.exit(0);
  }
  if (have.size > 0) {
    console.error("Estado parcial: existe só parte das colunas. Ajuste manualmente no MySQL.");
    process.exit(1);
  }
  await db.execute(`
    ALTER TABLE \`pdv_sellers\`
      ADD \`pontosOffset\` decimal(12,2) NOT NULL DEFAULT '0.00' AFTER \`isActive\`,
      ADD \`pontosOffsetMes\` varchar(7) NULL AFTER \`pontosOffset\`
  `);
  console.log("OK: colunas pontosOffset e pontosOffsetMes criadas em pdv_sellers.");
} finally {
  await db.end();
}
