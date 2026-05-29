// Compara pedidos Sofia do Murilo banco vs planilha SOFIA_ITENS
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

// Pedidos 100% Sofia do Murilo no banco
const [bancoSofia] = await db.execute(`
  SELECT o.pedidoId, o.totalAplicado, DATE_FORMAT(o.createdAt, '%d/%m %H:%i') as dt
  FROM pdv_orders o
  WHERE o.sellerName = 'MURILO' AND o.isSofia = 1
    AND DATE(o.createdAt) >= '2026-05-01' AND DATE(o.createdAt) <= '2026-05-11'
  ORDER BY o.createdAt
`);
console.log('═══ Banco: pedidos 100% Sofia do MURILO maio ═══');
for (const r of bancoSofia) console.log(`  ${r.pedidoId}  ${r.dt}  R$${Number(r.totalAplicado).toFixed(2)}`);
console.log(`  total: ${bancoSofia.length}\n`);

// Pedidos do Murilo na planilha SOFIA_ITENS (vendedor = col D = índice 3)
const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/SOFIA_ITENS!A2:W5000?key=${API_KEY}`);
const j = await r.json();
const rows = j.values || [];

const pedidosMurilo = new Map();
for (const row of rows) {
  const pid = (row[0] || '').toString().trim();
  if (!pid) continue;
  const dataStr = (row[1] || '').toString();
  const m = dataStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) continue;
  const mes = parseInt(m[2]), ano = parseInt(m[3]), dia = parseInt(m[1]);
  if (ano !== 2026 || mes !== 5 || dia > 11) continue;

  const vendedor = (row[3] || '').toString().toUpperCase().trim();
  if (vendedor !== 'MURILO') continue;
  if (!pedidosMurilo.has(pid)) pedidosMurilo.set(pid, { dt: dataStr, items: [], totalRow: 0 });
  pedidosMurilo.get(pid).items.push(row);
  const valorItem = parseFloat(String(row[12] || '0').replace(',', '.')) || 0;
  pedidosMurilo.get(pid).totalRow += valorItem;
}

console.log('═══ Planilha SOFIA_ITENS: pedidos do MURILO maio ═══');
for (const [pid, info] of pedidosMurilo.entries()) {
  console.log(`  ${pid}  ${info.dt}  ${info.items.length} item(s)  R$${info.totalRow.toFixed(2)}`);
}
console.log(`  total: ${pedidosMurilo.size}\n`);

// Diff
const bancoIds = new Set(bancoSofia.map(r => r.pedidoId));
const sheetIds = new Set(pedidosMurilo.keys());
const faltamBanco = [...sheetIds].filter(id => !bancoIds.has(id));
const sobramBanco = [...bancoIds].filter(id => !sheetIds.has(id));

console.log('═══ DIFF Sofia Murilo ═══');
console.log(`Banco tem: ${bancoIds.size}  Planilha tem: ${sheetIds.size}`);
console.log(`Faltam no banco: ${faltamBanco.length}`);
for (const pid of faltamBanco) {
  const info = pedidosMurilo.get(pid);
  console.log(`  ${pid}  ${info.dt}  R$${info.totalRow.toFixed(2)}`);
  console.log(`    raw[0..13]: ${JSON.stringify(info.items[0].slice(0, 14))}`);
}
console.log(`Sobram no banco: ${sobramBanco.length}`);
for (const pid of sobramBanco) {
  console.log(`  ${pid}`);
}

// VINICIUS e FLAVIO também — quick count
for (const v of ['VINICIUS', 'FLAVIO']) {
  console.log(`\n── ${v} ──`);
  const [b] = await db.execute(`SELECT pedidoId FROM pdv_orders WHERE sellerName=? AND isSofia=1 AND DATE(createdAt) >= '2026-05-01' AND DATE(createdAt) <= '2026-05-11'`, [v]);
  const sheetSet = new Set();
  for (const row of rows) {
    const pid = (row[0] || '').toString().trim();
    if (!pid) continue;
    const dataStr = (row[1] || '').toString();
    const m = dataStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m) continue;
    const mes = parseInt(m[2]), ano = parseInt(m[3]), dia = parseInt(m[1]);
    if (ano !== 2026 || mes !== 5 || dia > 11) continue;
    const vendedor = (row[3] || '').toString().toUpperCase().trim();
    if (vendedor !== v) continue;
    sheetSet.add(pid);
  }
  const bSet = new Set(b.map(x => x.pedidoId));
  const faltam = [...sheetSet].filter(id => !bSet.has(id));
  console.log(`  banco 100%Sofia: ${bSet.size}  planilha Sofia: ${sheetSet.size}  faltam no banco: ${faltam.length}`);
  for (const pid of faltam) console.log(`    falta: ${pid}`);
}

await db.end();
