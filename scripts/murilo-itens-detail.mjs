// Lista todos os itens NÃO-Sofia do Murilo, e compara com a planilha pedidos_itens
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

// Conta itens não-Sofia do Murilo por pedido (no banco)
const [bancoItens] = await db.execute(`
  SELECT oi.pedidoId, COUNT(*) as n_items, SUM(oi.totalItem) as soma_items, SUM(oi.quantidade) as qtd_pecas
  FROM pdv_order_items oi
  JOIN pdv_orders o ON o.pedidoId = oi.pedidoId
  WHERE o.sellerName = 'MURILO'
    AND o.status != 'CANCELADO'
    AND oi.isSofia = 0
    AND DATE(o.createdAt) >= '2026-05-01' AND DATE(o.createdAt) <= '2026-05-11'
  GROUP BY oi.pedidoId
`);
const bancoMap = new Map(bancoItens.map(r => [r.pedidoId, r]));
const totalBanco = bancoItens.reduce((s, r) => s + Number(r.soma_items), 0);
const totalPecasBanco = bancoItens.reduce((s, r) => s + Number(r.qtd_pecas), 0);
console.log(`BANCO: ${bancoItens.length} pedidos com itens não-Sofia. Soma itens: R$ ${totalBanco.toFixed(2)}. Peças: ${totalPecasBanco}\n`);

// Planilha pedidos_itens — quantos itens existem do Murilo + soma
const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/pedidos_itens!A2:Z10000?key=${API_KEY}`);
const j = await r.json();
const rows = j.values || [];

// header
const headerR = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/pedidos_itens!A1:Z1?key=${API_KEY}`);
const headerJ = await headerR.json();
const headers = (headerJ.values || [[]])[0];
console.log('Cols pedidos_itens:');
headers.forEach((h, i) => console.log(`  [${i}] ${String.fromCharCode(65 + i)}: ${h}`));
console.log('');

// Identifica qual coluna é vendedor e total — pelo header
const idxVendedor = headers.findIndex(h => /vendedor/i.test(String(h)));
const idxTotal = headers.findIndex(h => /total/i.test(String(h)) && !/varejo|atacado/i.test(String(h)));
const idxData = headers.findIndex(h => /^data$/i.test(String(h)));
const idxQtd = headers.findIndex(h => /qtd|quantidade/i.test(String(h)));
const idxExtra = headers.findIndex(h => /extra|carreto|caixinha|correio/i.test(String(h)));
const idxValorExtra = headers.findIndex(h => /valor.*extra|valor.*adicion/i.test(String(h)));
const idxModalidade = headers.findIndex(h => /modal|atac.*varejo/i.test(String(h)));

console.log(`Idx detectados: vendedor=${idxVendedor}, total=${idxTotal}, data=${idxData}, qtd=${idxQtd}, extra=${idxExtra}, valor_extra=${idxValorExtra}, modalidade=${idxModalidade}`);
console.log('');

function parseMoney(s) {
  if (!s) return 0;
  return parseFloat(String(s).replace('R$', '').replace(/\./g, '').replace(',', '.').trim()) || 0;
}

const sheetByPedido = new Map();
let totalSheet = 0;
let totalSheetPecas = 0;
for (const row of rows) {
  const pid = (row[0] || '').toString().trim();
  if (!pid) continue;
  const dataStr = (row[idxData] || '').toString();
  const m = dataStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) continue;
  const mes = parseInt(m[2]), ano = parseInt(m[3]), dia = parseInt(m[1]);
  if (ano !== 2026 || mes !== 5 || dia > 11) continue;

  const vendedor = (row[idxVendedor] || '').toString().toUpperCase().trim();
  if (vendedor !== 'MURILO') continue;

  const total = parseMoney(row[idxTotal]);
  const qtd = parseInt(row[idxQtd]) || 0;
  totalSheet += total;
  totalSheetPecas += qtd;
  if (!sheetByPedido.has(pid)) sheetByPedido.set(pid, { n: 0, soma: 0, qtd: 0 });
  sheetByPedido.get(pid).n++;
  sheetByPedido.get(pid).soma += total;
  sheetByPedido.get(pid).qtd += qtd;
}
console.log(`PLANILHA pedidos_itens: ${[...sheetByPedido.values()].reduce((s, v) => s + v.n, 0)} linhas em ${sheetByPedido.size} pedidos. Soma totalItem: R$ ${totalSheet.toFixed(2)}. Peças: ${totalSheetPecas}\n`);

// Cruza pedido a pedido
console.log('═══ Pedidos com diferença banco vs pedidos_itens ═══');
const allIds = new Set([...bancoMap.keys(), ...sheetByPedido.keys()]);
const diff = [];
for (const pid of allIds) {
  const b = bancoMap.get(pid);
  const s = sheetByPedido.get(pid);
  const bSoma = b ? Number(b.soma_items) : 0;
  const sSoma = s ? s.soma : 0;
  const delta = bSoma - sSoma;
  if (Math.abs(delta) > 0.01 || (b && !s) || (!b && s)) {
    diff.push({ pid, bSoma, sSoma, delta, bQtd: b?.qtd_pecas || 0, sQtd: s?.qtd || 0 });
  }
}
diff.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
for (const d of diff) {
  console.log(`  ${d.pid}  banco=R$${d.bSoma.toFixed(2)}(${d.bQtd}pc) sheet=R$${d.sSoma.toFixed(2)}(${d.sQtd}pc)  Δ=R$${d.delta.toFixed(2)}`);
}
console.log(`\nSoma Δ: R$ ${diff.reduce((a, d) => a + d.delta, 0).toFixed(2)}`);
console.log(`Total banco - Total sheet: R$ ${(totalBanco - totalSheet).toFixed(2)}`);

await db.end();
