// Compara TODOS os pedidos do Murilo banco vs planilha, identificando diferenças de valor.
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

// Banco — todos os pedidos do MURILO em maio com soma normal e Sofia
const [bancoRows] = await db.execute(`
  SELECT
    o.pedidoId,
    o.status,
    o.totalAplicado,
    o.isSofia,
    DATE_FORMAT(o.createdAt, '%d/%m %H:%i') as dt,
    COALESCE((SELECT SUM(oi.totalItem) FROM pdv_order_items oi WHERE oi.pedidoId = o.pedidoId AND oi.isSofia = 0), 0) as sum_normal,
    COALESCE((SELECT SUM(oi.quantidade) FROM pdv_order_items oi WHERE oi.pedidoId = o.pedidoId AND oi.isSofia = 0), 0) as qtd_normal
  FROM pdv_orders o
  WHERE o.sellerName = 'MURILO'
    AND DATE(o.createdAt) >= '2026-05-01' AND DATE(o.createdAt) <= '2026-05-11'
  ORDER BY o.pedidoId
`);

// Planilha — pedidos do MURILO em PEDIDOS
const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/PEDIDOS!A2:Z5000?key=${API_KEY}`);
const j = await r.json();
const sheetRows = j.values || [];

function parseValor(s) {
  if (!s) return 0;
  return parseFloat(String(s).replace('R$', '').replace(/\./g, '').replace(',', '.').trim()) || 0;
}

const sheet = new Map();
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

  // col M = valor_sem_taxa (índice 12), col P = total_com_taxa (15), col U = qtd_itens (20)
  const valor_sem_taxa = parseValor(row[12]);
  const total_com_taxa = parseValor(row[15]);
  const qtd = parseInt(row[20]) || 0;
  const status = (row[19] || '').toString();
  sheet.set(pid, { dt: dataStr, valor_sem_taxa, total_com_taxa, qtd, status, raw: row });
}

console.log(`Banco: ${bancoRows.length} pedidos do Murilo  |  Planilha PEDIDOS: ${sheet.size} pedidos do Murilo\n`);

// Cruza pedido a pedido (ignorando 100% Sofia, que não estão na planilha PEDIDOS)
const diferencas = [];
let totalBancoFat = 0;
let totalSheetFat = 0;

for (const r of bancoRows) {
  if (r.isSofia) continue; // 100% Sofia não aparece em PEDIDOS
  const planilha = sheet.get(r.pedidoId);
  const bancoFat = Number(r.sum_normal);
  totalBancoFat += bancoFat;
  if (!planilha) {
    diferencas.push({ pid: r.pedidoId, tipo: 'só banco', dt: r.dt, bancoFat, sheetFat: 0, delta: bancoFat });
    continue;
  }
  totalSheetFat += planilha.valor_sem_taxa;
  const delta = bancoFat - planilha.valor_sem_taxa;
  if (Math.abs(delta) > 0.01) {
    diferencas.push({
      pid: r.pedidoId, tipo: 'valor diferente', dt: r.dt,
      bancoFat, sheetFat: planilha.valor_sem_taxa, delta,
      planilhaQtd: planilha.qtd, bancoQtd: r.qtd_normal,
      status: r.status, statusSheet: planilha.status,
    });
  }
}

// Verifica pedidos só na planilha
for (const [pid, p] of sheet.entries()) {
  if (!bancoRows.find(r => r.pedidoId === pid)) {
    diferencas.push({ pid, tipo: 'só planilha', dt: p.dt, bancoFat: 0, sheetFat: p.valor_sem_taxa, delta: -p.valor_sem_taxa, status: p.status });
  }
}

console.log('═══ DIFERENÇAS pedido a pedido ═══');
for (const d of diferencas) {
  console.log(`  [${d.tipo}] ${d.pid} ${d.dt || ''}  banco=R$${d.bancoFat.toFixed(2)} sheet=R$${d.sheetFat.toFixed(2)} Δ=R$${d.delta.toFixed(2)}${d.planilhaQtd !== undefined ? `  qtd: banco=${d.bancoQtd} sheet=${d.planilhaQtd}` : ''}${d.status ? `  status=${d.status}/${d.statusSheet || ''}` : ''}`);
}
console.log(`\nTotal diferenças: ${diferencas.length}`);
console.log(`Soma Δ:           R$ ${diferencas.reduce((a, d) => a + d.delta, 0).toFixed(2)}`);
console.log(`Faturamento banco (sum_normal não-Sofia, não cancelados): R$ ${bancoRows.filter(r => r.status !== 'CANCELADO').reduce((a, r) => a + Number(r.sum_normal), 0).toFixed(2)}`);
console.log(`Faturamento planilha PEDIDOS (col M, valor_sem_taxa):     R$ ${[...sheet.values()].reduce((a, p) => a + p.valor_sem_taxa, 0).toFixed(2)}`);

await db.end();
