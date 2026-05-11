/**
 * Reset completo do banco PDV no Railway + sincronização das abas para as quais
 * existe lógica pronta no sistema (PRODUTOS, FLUXO_CAIXA).
 *
 * O QUE FAZ:
 *   1) Zera as tabelas de dados (mantém sellers/goals/sofia_config intactos)
 *   2) Adiciona UNIQUE(codigo) em pdv_products (corrige bug de duplicatas)
 *   3) Sincroniza PRODUTOS via POST /api/scheduled/sync-products
 *   4) Importa FLUXO_CAIXA da planilha (replica readCashFlowFromSheet)
 *
 * O QUE NÃO FAZ (limitação do sistema atual):
 *   - PEDIDOS, pedidos_itens, SOFIA_ITENS, VENDAS_CAIXA, Lucro_produtos
 *     ficam só na planilha (não há importador da planilha → banco).
 *
 * Uso:
 *   $env:DATABASE_URL = "<MYSQL_PUBLIC_URL>"
 *   $env:GOOGLE_SHEETS_API_KEY = "<API_KEY>"
 *   node scripts/reset-and-sync.mjs               # dry-run
 *   node scripts/reset-and-sync.mjs --apply       # executa
 */
import mysql from "mysql2/promise";

const dbUrl = process.env.DATABASE_URL;
const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
const SHEET_ID = "1SGUr5Sh2gZ5nkYg0km-QhllQS4Jm2_aVxy6PuyATsLU";
const APP_URL = process.env.APP_URL || "https://jurema-production.up.railway.app";

if (!dbUrl) { console.error("Faltou DATABASE_URL"); process.exit(1); }
if (!apiKey) { console.error("Faltou GOOGLE_SHEETS_API_KEY"); process.exit(1); }
const apply = process.argv.includes("--apply");

const db = await mysql.createConnection(dbUrl);

async function q(sql, p = []) {
  const [r] = await db.execute(sql, p);
  return r;
}
async function count(t) { return Number((await q(`SELECT COUNT(*) AS n FROM ${t}`))[0].n); }
async function fetchRange(range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?key=${apiKey}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Sheets ${r.status}: ${await r.text()}`);
  return (await r.json()).values || [];
}

function parseMoney(s) {
  if (s == null) return 0;
  const t = String(s).trim().replace(/[R$\s]/g, "").replace(/\u00a0/g, "");
  if (!t) return 0;
  let n;
  if (t.includes(",")) n = parseFloat(t.replace(/\./g, "").replace(",", "."));
  else n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}
function parseDataPt(s) {
  if (!s) return null;
  const t = String(s).trim();
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const [, d, mo, y, h = "0", mi = "0", se = "0"] = m;
    return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se));
  }
  m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const [, y, mo, d, h = "0", mi = "0", se = "0"] = m;
    return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se));
  }
  const x = new Date(t);
  return isNaN(x.getTime()) ? null : x;
}

const DATA_TABLES = [
  "pdv_order_services",
  "pdv_order_payments",
  "pdv_order_items",
  "pdv_orders",
  "pdv_cash_flow",
  "pdv_desconto_folha",
  "pdv_notifications",
  "pdv_products",
];
const KEEP_TABLES = ["pdv_sellers", "pdv_goals", "pdv_sofia_config"];

console.log("=== ANTES ===");
for (const t of [...DATA_TABLES, ...KEEP_TABLES]) console.log(`  ${t}: ${await count(t)}`);

if (!apply) {
  console.log("\n--apply não passado — saindo sem alterar.");
  await db.end(); process.exit(0);
}

console.log("\n──── 1) ZERANDO TABELAS DE DADOS ────");
for (const t of DATA_TABLES) {
  await q(`DELETE FROM ${t}`);
  try { await q(`ALTER TABLE ${t} AUTO_INCREMENT = 1`); } catch {}
  console.log(`  ${t} zerada`);
}

console.log("\n──── 2) AJUSTE DE SCHEMA: UNIQUE(codigo) em pdv_products ────");
const existing = await q("SHOW INDEX FROM pdv_products WHERE Column_name = 'codigo'");
for (const idx of existing) {
  if (idx.Key_name !== "PRIMARY") {
    console.log(`  removendo índice antigo ${idx.Key_name}`);
    await q(`ALTER TABLE pdv_products DROP INDEX \`${idx.Key_name}\``);
  }
}
await q("ALTER TABLE pdv_products ADD UNIQUE INDEX uniq_codigo (codigo)");
console.log("  UNIQUE uniq_codigo(codigo) criado");

console.log("\n──── 3) SINCRONIZANDO PRODUTOS DA PLANILHA ────");
const syncRes = await fetch(`${APP_URL}/api/scheduled/sync-products`, { method: "POST" });
const syncJson = await syncRes.json().catch(() => null);
console.log("  resposta:", syncJson || "(sem json)");

console.log("\n──── 4) IMPORTANDO FLUXO_CAIXA DA PLANILHA ────");
const rows = await fetchRange("FLUXO_CAIXA!A2:F5000");
let cashInserted = 0, cashSkipped = 0, cashErr = 0;
for (const row of rows) {
  try {
    const idCell = (row[0] || "").toString().trim();
    const dataCell = (row[1] || "").toString().trim();
    const tipo = (row[2] || "").toString().trim().toUpperCase();
    const descricao = (row[3] || "").toString().trim();
    const valor = Math.abs(parseMoney(row[4]));
    const usuario = (row[5] || "").toString().trim() || null;

    if (!idCell && !tipo) { cashSkipped++; continue; }
    if (tipo !== "SUPRIMENTO" && tipo !== "SANGRIA") { cashSkipped++; continue; }
    if (valor <= 0) { cashSkipped++; continue; }

    const dataParsed = parseDataPt(dataCell);
    const created = dataParsed && !isNaN(dataParsed.getTime()) ? dataParsed : new Date();

    await q(
      "INSERT INTO pdv_cash_flow (tipo, descricao, valor, usuario, createdAt) VALUES (?, ?, ?, ?, ?)",
      [tipo, descricao || tipo, valor, usuario, created]
    );
    cashInserted++;
  } catch (e) {
    cashErr++;
    if (cashErr <= 3) console.log("  erro:", e.message, "row:", row.slice(0, 6));
  }
}
console.log(`  FLUXO_CAIXA: ${cashInserted} inseridos, ${cashSkipped} pulados, ${cashErr} erros`);

console.log("\n=== DEPOIS ===");
for (const t of [...DATA_TABLES, ...KEEP_TABLES]) console.log(`  ${t}: ${await count(t)}`);

const finalIdx = await q("SHOW INDEX FROM pdv_products WHERE Key_name = 'uniq_codigo'");
console.log("\n  UNIQUE uniq_codigo ativo?", finalIdx.length > 0 && finalIdx[0].Non_unique === 0);

await db.end();
console.log("\nPronto.");
