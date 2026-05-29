// Compara pedidos por vendedor entre banco Railway e planilha PEDIDOS.
// Identifica quais pedidos estão faltando no banco.
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

// ─── Banco: todos os pedidos do MÊS (maio 2026), separados por vendedor ───
const [bancoRows] = await db.execute(`
  SELECT
    o.pedidoId,
    o.sellerName,
    o.status,
    o.totalAplicado,
    o.isSofia,
    DATE_FORMAT(o.createdAt, '%d/%m %H:%i') as dt
  FROM pdv_orders o
  WHERE DATE(o.createdAt) >= '2026-05-01' AND DATE(o.createdAt) <= '2026-05-11'
  ORDER BY o.sellerName, o.createdAt
`);

const banco = new Map();
const bancoPorVendedor = new Map();
for (const r of bancoRows) {
  banco.set(r.pedidoId, r);
  if (!bancoPorVendedor.has(r.sellerName)) bancoPorVendedor.set(r.sellerName, []);
  bancoPorVendedor.get(r.sellerName).push(r);
}

// ─── Planilha PEDIDOS: A=pedidoId, B=data, C=vendedor, P=total ────────────
const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/PEDIDOS!A2:Z5000?key=${API_KEY}`);
const j = await r.json();
const sheetRows = j.values || [];

const sheet = new Map();
const sheetPorVendedor = new Map();

for (const row of sheetRows) {
  const pid = (row[0] || '').toString().trim();
  if (!pid) continue;
  const dataStr = (row[1] || '').toString();
  // Filtra apenas maio 2026 (formato DD/MM/YYYY na coluna B)
  const m = dataStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) continue;
  const mes = parseInt(m[2]), ano = parseInt(m[3]), dia = parseInt(m[1]);
  if (ano !== 2026 || mes !== 5 || dia > 11) continue;

  const vendedor = (row[2] || '').toString().toUpperCase().trim();
  // Total — buscar coluna que tem total aplicado (varia entre PEDIDOS columns)
  // Pela estrutura, vamos pegar coluna L (total aplicado/valor total)
  const totalStr = (row[11] || row[15] || '').toString().replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
  const total = parseFloat(totalStr) || 0;

  sheet.set(pid, { pedidoId: pid, sellerName: vendedor, dt: dataStr, total, raw: row });
  if (!sheetPorVendedor.has(vendedor)) sheetPorVendedor.set(vendedor, []);
  sheetPorVendedor.get(vendedor).push({ pedidoId: pid, dt: dataStr, total, raw: row });
}

// ─── DIFF por vendedor ─────────────────────────────────────────────────────
console.log('═══ DIFF por vendedor (01/05 a 11/05) ═══\n');

const vendedoresFoco = ['FLAVIO', 'MURILO', 'VINICIUS', 'GABRIEL'];

for (const v of vendedoresFoco) {
  const bancoP = (bancoPorVendedor.get(v) || []).map(r => r.pedidoId);
  const planilhaP = (sheetPorVendedor.get(v) || []).map(r => r.pedidoId);

  const faltamBanco = planilhaP.filter(p => !banco.has(p));
  const sobramBanco = bancoP.filter(p => !sheet.has(p));

  console.log(`── ${v}: banco=${bancoP.length}  planilha=${planilhaP.length}  faltam=${faltamBanco.length}  sobram=${sobramBanco.length}`);

  if (faltamBanco.length > 0) {
    console.log(`   FALTAM no banco (estão na planilha mas não no Railway):`);
    for (const pid of faltamBanco) {
      const s = sheet.get(pid);
      console.log(`     ${pid}  ${s.dt}  ${v}  R$ ${s.total.toFixed(2)}`);
    }
  }
  if (sobramBanco.length > 0) {
    console.log(`   SOBRAM no banco (estão no Railway mas não na planilha):`);
    for (const pid of sobramBanco) {
      const b = banco.get(pid);
      console.log(`     ${pid}  ${b.dt}  ${v}  R$ ${Number(b.totalAplicado).toFixed(2)}  status=${b.status}`);
    }
  }
  console.log('');
}

await db.end();
