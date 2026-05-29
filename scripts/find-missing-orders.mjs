// Encontra pedidos que estão em VENDAS_CAIXA mas não no banco Railway, e
// reconstrói via cruzamento com pedidos_itens / SOFIA_ITENS.
import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;
const SHEET_ID = '1SGUr5Sh2gZ5nkYg0km-QhllQS4Jm2_aVxy6PuyATsLU';
const API_KEY = process.env.GOOGLE_SHEETS_API_KEY;

const url = new URL(DATABASE_URL);
const db = await mysql.createConnection({
  host: url.hostname, port: Number(url.port), user: url.username, password: url.password,
  database: url.pathname.slice(1), ssl: { rejectUnauthorized: false },
});

async function readSheet(range) {
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?key=${API_KEY}`);
  const j = await r.json();
  if (j.error) { console.log(`[ERRO ${range}] ${j.error.message}`); return []; }
  return j.values || [];
}
function parseMoney(s) { return parseFloat(String(s || '').replace('R$', '').replace(/\./g, '').replace(',', '.').trim()) || 0; }

// 1) Lê VENDAS_CAIXA e separa pedidos do mês com PED- prefix
const vcRows = await readSheet('VENDAS_CAIXA!A2:Z10000');

function parseId(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  // Normaliza para 8 dígitos zero-padded
  const num = s.replace(/\D/g, '');
  if (!num) return null;
  return `PED-${num.padStart(8, '0')}`;
}

const vendasCaixa = new Map();
for (const row of vcRows) {
  const id = parseId(row[0]);
  if (!id) continue;
  const dataStr = (row[1] || '').toString();
  const m = dataStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) continue;
  const dia = parseInt(m[1]), mes = parseInt(m[2]), ano = parseInt(m[3]);
  if (ano !== 2026 || mes !== 5 || dia < 1 || dia > 11) continue;
  const vendedor = (row[2] || '').toString().toUpperCase().trim();
  vendasCaixa.set(id, { id, dataStr, vendedor, total: parseMoney(row[6]), status: row[8] || '' });
}

// 2) Lê PEDIDOS para saber quais pedidos JÁ estão na planilha PEDIDOS
const pedRows = await readSheet('PEDIDOS!A2:Z5000');
const pedidosSheet = new Set();
for (const row of pedRows) {
  const id = (row[0] || '').toString().trim();
  if (id) pedidosSheet.add(id);
}

// 3) Pedidos do banco no período
const [bancoRows] = await db.execute(`
  SELECT pedidoId FROM pdv_orders
  WHERE DATE(CONVERT_TZ(createdAt, '+00:00', '-03:00')) >= '2026-05-01'
    AND DATE(CONVERT_TZ(createdAt, '+00:00', '-03:00')) <= '2026-05-11'
`);
const bancoSet = new Set(bancoRows.map(r => r.pedidoId));

// 4) Identifica os pedidos que estão em VENDAS_CAIXA mas NÃO no banco nem em PEDIDOS
const faltantes = [];
for (const [id, v] of vendasCaixa.entries()) {
  if (!bancoSet.has(id) && !pedidosSheet.has(id)) {
    faltantes.push(v);
  }
}

console.log(`═══ Pedidos que estão SÓ em VENDAS_CAIXA (faltam em PEDIDOS e no banco) ═══`);
console.log(`Total: ${faltantes.length}\n`);

for (const v of faltantes) {
  console.log(`  ${v.id}  ${v.dataStr.padEnd(22)}  ${v.vendedor.padEnd(10)}  R$${v.total.toFixed(2).padStart(10)}  status=${v.status}`);
}

// 5) Pra cada um, busca em pedidos_itens e SOFIA_ITENS pra ver se tem itens
console.log('\n═══ Detalhe — buscando itens em pedidos_itens e SOFIA_ITENS ═══\n');

const itensRows = await readSheet('pedidos_itens!A2:Z10000');
const sofiaRows = await readSheet('SOFIA_ITENS!A2:Z10000');

for (const v of faltantes) {
  const itensNormal = itensRows.filter(r => (r[0] || '').toString().trim() === v.id);
  const itensSofia = sofiaRows.filter(r => (r[0] || '').toString().trim() === v.id);

  console.log(`── ${v.id} (${v.vendedor}, R$${v.total.toFixed(2)}) ──`);
  console.log(`   pedidos_itens: ${itensNormal.length} linha(s)`);
  for (const r of itensNormal) {
    console.log(`     cod=${r[1]} qtd=${r[3]} total=${r[11]} servico=${r[9]}`);
  }
  console.log(`   SOFIA_ITENS:   ${itensSofia.length} linha(s)`);
  for (const r of itensSofia) {
    console.log(`     cod=${r[2]} qtd=${r[20]} total=${r[12]}`);
  }
  console.log('');
}

// Resumo do impacto financeiro se importarmos
const totalFaltante = faltantes.reduce((s, v) => s + v.total, 0);
console.log(`\nImpacto se importarmos os ${faltantes.length} pedidos:`);
console.log(`  Soma totalAplicado: R$ ${totalFaltante.toFixed(2)}`);
const porVend = {};
for (const v of faltantes) {
  porVend[v.vendedor] = (porVend[v.vendedor] || 0) + v.total;
}
console.log('  Por vendedor:');
for (const [v, t] of Object.entries(porVend)) console.log(`    ${v}: R$ ${t.toFixed(2)}`);

await db.end();
