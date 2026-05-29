/**
 * Lê a planilha PRODUTOS e corrige o campo `tipo` no banco para cada código.
 * Útil enquanto o deploy da correção do bug do `tipo` em pdvSync.ts/pdvAutoSync.ts
 * não terminou. Idempotente.
 */
import mysql from "mysql2/promise";

const SHEET_ID = "1SGUr5Sh2gZ5nkYg0km-QhllQS4Jm2_aVxy6PuyATsLU";
const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
const dbUrl = process.env.DATABASE_URL;
if (!apiKey || !dbUrl) { console.error("Faltou GOOGLE_SHEETS_API_KEY ou DATABASE_URL"); process.exit(1); }

const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent("PRODUTOS!A2:P2000")}?key=${apiKey}`;
const r = await fetch(url);
if (!r.ok) { console.error("Sheets", r.status); process.exit(1); }
const rows = (await r.json()).values || [];

const map = new Map();
for (const row of rows) {
  const codigo = (row[0] || "").trim();
  const tipo = (row[6] || "").trim();
  if (codigo && tipo) map.set(codigo, tipo);
}

const db = await mysql.createConnection(dbUrl);
let updated = 0, sameAsBefore = 0;
for (const [codigo, tipo] of map) {
  const [res] = await db.execute(
    "UPDATE pdv_products SET tipo = ?, updatedAt = NOW() WHERE codigo = ? AND tipo <> ?",
    [tipo, codigo, tipo]
  );
  if (res.affectedRows > 0) {
    updated++;
    console.log(`  atualizado ${codigo} → tipo="${tipo}"`);
  } else {
    sameAsBefore++;
  }
}
await db.end();
console.log(`\nTotal: ${updated} atualizados, ${sameAsBefore} já corretos.`);
