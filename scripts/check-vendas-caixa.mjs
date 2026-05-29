// Verifica se os pedidos faltantes do Manus estão em VENDAS_CAIXA ou Lucro_produtos
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

function parseMoney(s) {
  if (!s) return 0;
  return parseFloat(String(s).replace('R$', '').replace(/\./g, '').replace(',', '.').trim()) || 0;
}

// ─── VENDAS_CAIXA ────────────────────────────────────────
console.log('═══ Aba VENDAS_CAIXA ═══');
const vcHeader = await readSheet('VENDAS_CAIXA!A1:Z1');
console.log('Headers:');
(vcHeader[0] || []).forEach((h, i) => console.log(`  [${i}] ${String.fromCharCode(65 + i)}: ${h}`));

const vcRows = await readSheet('VENDAS_CAIXA!A2:Z10000');
console.log(`\nTotal linhas: ${vcRows.length}`);

// Filtra por Murilo em maio 2026
const muriloVC = [];
for (const row of vcRows) {
  const id = (row[0] || '').toString().trim();
  if (!id) continue;
  const dataStr = (row[1] || '').toString();
  const m = dataStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) continue;
  const dia = parseInt(m[1]), mes = parseInt(m[2]), ano = parseInt(m[3]);
  if (ano !== 2026 || mes !== 5 || dia > 11 || dia < 1) continue;
  const vendedor = (row[2] || '').toString().toUpperCase().trim();
  if (vendedor !== 'MURILO') continue;
  muriloVC.push({ id, dataStr, vendedor, total: parseMoney(row[6]), status: row[8], raw: row });
}
console.log(`\nVENDAS_CAIXA Murilo em maio: ${muriloVC.length} pedidos`);

// Banco — pedido_id numéricos do Murilo em maio (não-Sofia)
const [bancoRows] = await db.execute(`
  SELECT o.pedidoId, REGEXP_REPLACE(o.pedidoId, '[^0-9]', '') AS id_num, o.totalAplicado, o.status
  FROM pdv_orders o
  WHERE o.sellerName = 'MURILO' AND o.isSofia = 0
    AND DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00')) >= '2026-05-01'
    AND DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00')) <= '2026-05-11'
`);
const bancoIds = new Set(bancoRows.map(r => r.id_num));
const vcIds = new Set(muriloVC.map(r => r.id));
const sobramVC = [...vcIds].filter(id => !bancoIds.has(id));
const sobramBanco = [...bancoIds].filter(id => !vcIds.has(id));

console.log(`\nBanco (não-Sofia, Murilo, maio): ${bancoRows.length} pedidos`);
console.log(`VENDAS_CAIXA tem mas banco não tem: ${sobramVC.length}`);
for (const id of sobramVC) {
  const v = muriloVC.find(x => x.id === id);
  console.log(`  ${id}  ${v.dataStr}  R$${v.total.toFixed(2)}  status=${v.status}`);
}
console.log(`Banco tem mas VENDAS_CAIXA não tem: ${sobramBanco.length}`);
for (const id of sobramBanco) {
  const r = bancoRows.find(x => x.id_num === id);
  console.log(`  ${id}  (${r.pedidoId})  R$${Number(r.totalAplicado).toFixed(2)}  status=${r.status}`);
}

// Soma totais
const totalVC = muriloVC.reduce((s, v) => s + v.total, 0);
const totalBanco = bancoRows.reduce((s, r) => s + Number(r.totalAplicado), 0);
console.log(`\nSoma TOTAL VENDAS_CAIXA Murilo: R$ ${totalVC.toFixed(2)}`);
console.log(`Soma totalAplicado banco:        R$ ${totalBanco.toFixed(2)}`);
console.log(`Δ: R$ ${(totalVC - totalBanco).toFixed(2)}`);

// ─── Lucro_produtos ─────────────────────────────────────
console.log('\n\n═══ Aba Lucro_produtos ═══');
const lpHeader = await readSheet('Lucro_produtos!A1:Z1');
console.log('Headers:');
(lpHeader[0] || []).forEach((h, i) => console.log(`  [${i}] ${String.fromCharCode(65 + i)}: ${h}`));

const lpRows = await readSheet('Lucro_produtos!A2:Z20000');
console.log(`\nTotal linhas: ${lpRows.length}`);

// Identifica colunas por header
const lpHeaders = lpHeader[0] || [];
const idxIdPedido = lpHeaders.findIndex(h => /pedido|id/i.test(String(h)));
const idxLpData = lpHeaders.findIndex(h => /data/i.test(String(h)));
const idxLpVendedor = lpHeaders.findIndex(h => /vendedor/i.test(String(h)));
const idxLpValor = lpHeaders.findIndex(h => /preco|valor.*venda|venda.*r\$/i.test(String(h)));

console.log(`\nIdx detectados: pedido=${idxIdPedido}, data=${idxLpData}, vendedor=${idxLpVendedor}, valor=${idxLpValor}`);

const pedidosLpMurilo = new Map();
for (const row of lpRows) {
  const dataStr = (row[idxLpData] || '').toString();
  const m = dataStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) continue;
  const dia = parseInt(m[1]), mes = parseInt(m[2]), ano = parseInt(m[3]);
  if (ano !== 2026 || mes !== 5 || dia > 11 || dia < 1) continue;
  const vendedor = (row[idxLpVendedor] || '').toString().toUpperCase().trim();
  if (vendedor !== 'MURILO') continue;
  const pid = (row[idxIdPedido] || '').toString().trim();
  if (!pid) continue;
  if (!pedidosLpMurilo.has(pid)) pedidosLpMurilo.set(pid, { pedidos: 0, total: 0 });
  pedidosLpMurilo.get(pid).pedidos++;
  pedidosLpMurilo.get(pid).total += parseMoney(row[idxLpValor]);
}
console.log(`Lucro_produtos pedidos únicos do Murilo: ${pedidosLpMurilo.size}`);

// Compara com banco
const lpIds = new Set([...pedidosLpMurilo.keys()].map(p => p.replace(/\D/g, '')));
const sobramLp = [...lpIds].filter(id => !bancoIds.has(id));
console.log(`Em Lucro_produtos mas NÃO no banco (Murilo, maio):  ${sobramLp.length}`);
for (const id of sobramLp) {
  const pidFull = [...pedidosLpMurilo.keys()].find(p => p.replace(/\D/g, '') === id);
  const info = pedidosLpMurilo.get(pidFull);
  console.log(`  ${pidFull}  R$${info.total.toFixed(2)}  (${info.pedidos} peças)`);
}

await db.end();
