/**
 * Limpa o banco do Railway das tabelas operacionais (pedidos, itens, pagamentos,
 * serviços, produtos, caixa, desconto folha, notificações), adiciona UNIQUE em
 * pdv_products.codigo e prepara para o sync.
 *
 * NÃO toca em: pdv_sellers, pdv_goals, pdv_sofia_config.
 *
 * Etapas:
 *   1) wipe          → apaga tabelas operacionais
 *   2) schema-fix    → ALTER TABLE pdv_products ADD UNIQUE(codigo)
 *   3) (chamado externamente) POST /api/scheduled/sync-products
 *   4) (chamado externamente) import-cashflow.mjs
 *
 * Uso:
 *   $env:DATABASE_URL = "<MYSQL_PUBLIC_URL>"
 *   node scripts/wipe-and-resync.mjs          # dry-run
 *   node scripts/wipe-and-resync.mjs --apply  # executa
 */
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) { console.error("Faltou DATABASE_URL"); process.exit(1); }
const apply = process.argv.includes("--apply");

const db = await mysql.createConnection({ uri: url, multipleStatements: false });

async function count(table) {
  const [r] = await db.execute(`SELECT COUNT(*) AS n FROM ${table}`);
  return Number(r[0].n);
}

const TABELAS_A_LIMPAR = [
  "pdv_order_services",
  "pdv_order_payments",
  "pdv_order_items",
  "pdv_orders",
  "pdv_desconto_folha",
  "pdv_cash_flow",
  "pdv_notifications",
  "pdv_products",
];

const TABELAS_PRESERVAR = ["pdv_sellers", "pdv_goals", "pdv_sofia_config"];

console.log("\n[1] Estado antes:");
for (const t of [...TABELAS_A_LIMPAR, ...TABELAS_PRESERVAR]) {
  try { console.log(`    ${t.padEnd(24)} → ${await count(t)}`); }
  catch (e) { console.log(`    ${t}: ERRO ${e.message}`); }
}

const [idxBefore] = await db.execute("SHOW INDEX FROM pdv_products WHERE Key_name = 'uniq_codigo'");
console.log("    UNIQUE uniq_codigo em pdv_products?", idxBefore.length > 0);

if (!apply) {
  console.log("\n--apply não passado — saindo sem alterar.");
  await db.end();
  process.exit(0);
}

console.log("\n[2] Apagando tabelas operacionais...");
for (const t of TABELAS_A_LIMPAR) {
  const n = await count(t);
  await db.execute(`DELETE FROM ${t}`);
  console.log(`    ${t.padEnd(24)} → DELETE (${n} linhas removidas)`);
}

console.log("\n[3] Resetando AUTO_INCREMENT...");
for (const t of TABELAS_A_LIMPAR) {
  await db.execute(`ALTER TABLE ${t} AUTO_INCREMENT = 1`);
}

console.log("\n[4] Adicionando UNIQUE(codigo) em pdv_products...");
const [existing] = await db.execute("SHOW INDEX FROM pdv_products WHERE Key_name = 'codigo'");
if (existing.length > 0) {
  console.log("    índice antigo `codigo` encontrado — removendo...");
  await db.execute("ALTER TABLE pdv_products DROP INDEX `codigo`");
}
const [existingUniq] = await db.execute("SHOW INDEX FROM pdv_products WHERE Key_name = 'uniq_codigo'");
if (existingUniq.length === 0) {
  await db.execute("ALTER TABLE pdv_products ADD UNIQUE INDEX uniq_codigo (codigo)");
  console.log("    UNIQUE uniq_codigo criado.");
} else {
  console.log("    UNIQUE uniq_codigo já existe.");
}

console.log("\n[5] Estado depois:");
for (const t of [...TABELAS_A_LIMPAR, ...TABELAS_PRESERVAR]) {
  try { console.log(`    ${t.padEnd(24)} → ${await count(t)}`); }
  catch (e) { console.log(`    ${t}: ERRO ${e.message}`); }
}
const [idxAfter] = await db.execute("SHOW INDEX FROM pdv_products WHERE Key_name = 'uniq_codigo'");
console.log("    UNIQUE uniq_codigo em pdv_products?", idxAfter.length > 0);

await db.end();
console.log("\nOK. Próximo: rodar sync de produtos + import de caixa.");
