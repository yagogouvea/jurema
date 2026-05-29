// Compara faturamento do Murilo banco vs planilha PEDIDOS
import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;
const SHEET_ID = '1SGUr5Sh2gZ5nkYg0km-QhllQS4Jm2_aVxy6PuyATsLU';
const API_KEY = process.env.GOOGLE_SHEETS_API_KEY;

const url = new URL(DATABASE_URL);
const db = await mysql.createConnection({
  host: url.hostname,
  port: Number(url.port),
  user: url.username,
  password: url.password,
  database: url.pathname.slice(1),
  ssl: { rejectUnauthorized: false },
});

// Banco — todos pedidos do MURILO em maio
const [bancoRows] = await db.execute(`
  SELECT
    o.pedidoId,
    o.status,
    o.totalAplicado,
    o.isSofia,
    DATE_FORMAT(o.createdAt, '%d/%m %H:%i') as dt,
    COALESCE((SELECT SUM(oi.totalItem) FROM pdv_order_items oi WHERE oi.pedidoId = o.pedidoId AND oi.isSofia = 0), 0) as sum_normal,
    COALESCE((SELECT SUM(oi.totalItem) FROM pdv_order_items oi WHERE oi.pedidoId = o.pedidoId AND oi.isSofia = 1), 0) as sum_sofia,
    COALESCE((SELECT SUM(s.valor) FROM pdv_order_services s WHERE s.pedidoId = o.pedidoId), 0) as sum_services
  FROM pdv_orders o
  WHERE o.sellerName = 'MURILO'
    AND DATE(o.createdAt) >= '2026-05-01' AND DATE(o.createdAt) <= '2026-05-11'
  ORDER BY o.createdAt
`);

let totalBancoFat = 0;
let countCanc = 0;
let countSofia100 = 0;
let countMisto = 0;
for (const r of bancoRows) {
  totalBancoFat += Number(r.sum_normal);
  if (r.status === 'CANCELADO') countCanc++;
  if (r.isSofia) countSofia100++;
  if (!r.isSofia && Number(r.sum_sofia) > 0) countMisto++;
}

console.log('═══ BANCO RAILWAY — MURILO maio/2026 ═══');
console.log(`Total pedidos:     ${bancoRows.length}`);
console.log(`  100% Sofia:      ${countSofia100}`);
console.log(`  Mistos (normal+Sofia): ${countMisto}`);
console.log(`  Cancelados:      ${countCanc}`);
console.log(`Faturamento (sum_normal): R$ ${totalBancoFat.toFixed(2)}`);
console.log('');

// Planilha PEDIDOS
const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/PEDIDOS!A2:Z5000?key=${API_KEY}`);
const j = await r.json();
const sheetRows = j.values || [];

console.log('═══ PLANILHA PEDIDOS — MURILO maio/2026 ═══');
// Primeiro vou imprimir o header pra saber o índice das colunas
const headerR = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/PEDIDOS!A1:Z1?key=${API_KEY}`);
const headerJ = await headerR.json();
const headers = (headerJ.values || [[]])[0];
console.log('Colunas PEDIDOS:');
headers.forEach((h, i) => console.log(`  [${i}] ${String.fromCharCode(65 + i)}: ${h}`));
console.log('');

// Lista pedidos do Murilo na planilha
const muriloPlanilha = [];
for (const row of sheetRows) {
  const pid = (row[0] || '').toString().trim();
  if (!pid) continue;
  const dataStr = (row[1] || '').toString();
  const m = dataStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) continue;
  const mes = parseInt(m[2]), ano = parseInt(m[3]), dia = parseInt(m[1]);
  if (ano !== 2026 || mes !== 5 || dia > 11) continue;

  const vendedor = (row[2] || '').toString().toUpperCase().trim();
  if (vendedor !== 'MURILO') continue;
  muriloPlanilha.push({ pid, data: dataStr, row });
}

console.log(`Total pedidos do Murilo na PLANILHA PEDIDOS: ${muriloPlanilha.length}\n`);

// Diff por pedidoId
const bancoIds = new Set(bancoRows.map(r => r.pedidoId));
const planilhaIds = new Set(muriloPlanilha.map(r => r.pid));

const sobramBanco = [...bancoIds].filter(id => !planilhaIds.has(id));
const sobramPlanilha = [...planilhaIds].filter(id => !bancoIds.has(id));

console.log(`SOBRAM no banco (não estão na planilha PEDIDOS):`);
for (const pid of sobramBanco) {
  const r = bancoRows.find(b => b.pedidoId === pid);
  console.log(`  ${pid}  ${r.dt}  total=R$${Number(r.totalAplicado).toFixed(2)}  normal=R$${Number(r.sum_normal).toFixed(2)}  sofia=R$${Number(r.sum_sofia).toFixed(2)}  isSofia=${r.isSofia}  status=${r.status}`);
}
console.log('');
console.log(`SOBRAM na planilha (não estão no banco):`);
for (const pid of sobramPlanilha) {
  const p = muriloPlanilha.find(m => m.pid === pid);
  console.log(`  ${pid}  ${p.data}  raw=${JSON.stringify(p.row.slice(0, 16))}`);
}

await db.end();
