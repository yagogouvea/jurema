/** Inspeciona TODAS as tabelas PDV do Railway sem alterar nada. */
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) { console.error("Faltou DATABASE_URL"); process.exit(1); }
const db = await mysql.createConnection(url);

async function q(sql, p = []) {
  try { const [r] = await db.execute(sql, p); return r; }
  catch (e) { return { __err: e.message }; }
}

const tabelas = [
  "pdv_products", "pdv_orders", "pdv_order_items", "pdv_order_payments",
  "pdv_order_services", "pdv_cash_flow", "pdv_sellers", "pdv_goals",
  "pdv_desconto_folha", "pdv_sofia_config", "pdv_notifications",
];

for (const t of tabelas) {
  const r = await q(`SELECT COUNT(*) AS n FROM ${t}`);
  if (r.__err) { console.log(`  ${t}: ERRO → ${r.__err}`); continue; }
  console.log(`  ${t}: ${r[0].n} linhas`);
}

console.log("\nDetalhe pdv_sellers:");
const sellers = await q("SELECT id, name, username, role, isActive FROM pdv_sellers ORDER BY id");
if (sellers.__err) console.log("  erro:", sellers.__err);
else for (const s of sellers) console.log("  ", s);

console.log("\nDetalhe pdv_goals:");
const goals = await q("SELECT id, `key`, label, value FROM pdv_goals ORDER BY id");
if (goals.__err) console.log("  erro:", goals.__err);
else for (const g of goals) console.log("  ", g);

console.log("\nDetalhe pdv_sofia_config:");
const sofia = await q("SELECT id, comissaoLoja, updatedAt FROM pdv_sofia_config");
if (sofia.__err) console.log("  erro:", sofia.__err);
else for (const s of sofia) console.log("  ", s);

console.log("\nÍndices em pdv_products:");
const idx = await q("SHOW INDEX FROM pdv_products");
if (!idx.__err) for (const r of idx) console.log("  ", r.Key_name, "|", r.Column_name, "| unique:", r.Non_unique === 0);

await db.end();
