/**
 * Lê a planilha PDV via Google Sheets API (key pública) e mostra contagens
 * das abas PRODUTOS / PEDIDOS / pedidos_itens / SOFIA_ITENS. Não altera nada.
 */
const SHEET_ID = "1SGUr5Sh2gZ5nkYg0km-QhllQS4Jm2_aVxy6PuyATsLU";
const apiKey = process.env.GOOGLE_SHEETS_API_KEY || process.argv[2];
if (!apiKey) {
  console.error("uso: GOOGLE_SHEETS_API_KEY=... node scripts/sheet-status.mjs");
  process.exit(1);
}

async function fetchRange(range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.values || [];
}

const produtos = await fetchRange("PRODUTOS!A2:P5000");
const codigosUnicos = new Set();
let produtosComCodigo = 0;
let produtosSemCodigo = 0;
let produtosAtivos = 0;
for (const row of produtos) {
  const time = (row[3] || "").trim();
  const tam = (row[5] || "").trim();
  if (!time && !tam) continue;
  const cod = (row[0] || "").trim();
  if (cod) {
    produtosComCodigo++;
    codigosUnicos.add(cod);
  } else produtosSemCodigo++;
  const ativoRaw = (row[11] || "").trim().toUpperCase();
  if (ativoRaw === "SIM" || ativoRaw === "1" || ativoRaw === "TRUE") produtosAtivos++;
}

const pedidos = await fetchRange("PEDIDOS!A2:W5000");
const idsPedidos = new Set();
for (const row of pedidos) {
  const id = (row[0] || "").trim();
  if (id) idsPedidos.add(id);
}

const itens = await fetchRange("pedidos_itens!A2:Q5000");
const sofia = await fetchRange("SOFIA_ITENS!A2:W5000");

console.log("\n=== PRODUTOS ===");
console.log("  linhas com dados:", produtos.filter(r => (r[3] || r[5]) && (r[3] || "").toString().trim() !== "").length);
console.log("  com código:", produtosComCodigo);
console.log("  sem código:", produtosSemCodigo);
console.log("  códigos únicos:", codigosUnicos.size);
console.log("  marcados ATIVO=SIM:", produtosAtivos);

console.log("\n=== PEDIDOS (aba) ===");
console.log("  linhas:", pedidos.filter(r => (r[0] || "").trim()).length);
console.log("  pedidoIds únicos:", idsPedidos.size);

console.log("\n=== pedidos_itens (aba) ===");
console.log("  linhas:", itens.filter(r => (r[0] || "").trim()).length);

console.log("\n=== SOFIA_ITENS (aba) ===");
console.log("  linhas:", sofia.filter(r => (r[0] || "").trim()).length);
