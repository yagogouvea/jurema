// Audita o estado do Sofia no banco vs planilha
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

console.log('═════════════════════════════════════════════════════════════');
console.log('  AUDITORIA SOFIA — Banco vs Planilha');
console.log('═════════════════════════════════════════════════════════════\n');

// ───────── BANCO ─────────
const [pedidosAll] = await db.execute('SELECT COUNT(*) c FROM pdv_orders');
const [pedidos100Sofia] = await db.execute('SELECT COUNT(*) c FROM pdv_orders WHERE isSofia = 1');
const [pedidosMistos] = await db.execute(`
  SELECT o.id, o.pedidoId, o.totalAplicado, o.createdAt,
         SUM(CASE WHEN i.isSofia=1 THEN 1 ELSE 0 END) sofia_count,
         SUM(CASE WHEN i.isSofia=0 THEN 1 ELSE 0 END) normal_count
  FROM pdv_orders o
  JOIN pdv_order_items i ON i.pedidoId = o.pedidoId
  WHERE o.isSofia = 0
  GROUP BY o.id, o.pedidoId, o.totalAplicado, o.createdAt
  HAVING sofia_count > 0 AND normal_count > 0
  ORDER BY o.createdAt DESC
`);

const [itensSofia] = await db.execute('SELECT COUNT(*) c, SUM(quantidade) qtd FROM pdv_order_items WHERE isSofia = 1');
const [itensNormais] = await db.execute('SELECT COUNT(*) c, SUM(quantidade) qtd FROM pdv_order_items WHERE isSofia = 0');

const [comissaoStats] = await db.execute(`
  SELECT
    COUNT(*) total_sofia_items,
    SUM(CASE WHEN comissaoLojaSofia IS NOT NULL AND CAST(comissaoLojaSofia AS DECIMAL) > 0 THEN 1 ELSE 0 END) com_comissao,
    SUM(CASE WHEN comissaoLojaSofia IS NULL OR CAST(comissaoLojaSofia AS DECIMAL) = 0 THEN 1 ELSE 0 END) sem_comissao,
    SUM(CAST(comissaoLojaSofia AS DECIMAL) * quantidade) comissao_total_loja,
    SUM(totalItem) valor_total_sofia
  FROM pdv_order_items WHERE isSofia = 1
`);

console.log('── BANCO ──────────────────────────────────────────────────');
console.log(`Total pedidos:                ${pedidosAll[0].c}`);
console.log(`Pedidos 100% Sofia:           ${pedidos100Sofia[0].c}`);
console.log(`Pedidos MISTOS (Sofia+norm):  ${pedidosMistos.length}`);
console.log(`Itens Sofia:                  ${itensSofia[0].c} linhas / ${itensSofia[0].qtd} peças`);
console.log(`Itens normais:                ${itensNormais[0].c} linhas / ${itensNormais[0].qtd} peças`);
console.log('');
console.log('── COMISSÃO LOJA SOFIA ────────────────────────────────────');
console.log(`Itens Sofia com comissão:     ${comissaoStats[0].com_comissao} / ${comissaoStats[0].total_sofia_items}`);
console.log(`Itens Sofia SEM comissão:     ${comissaoStats[0].sem_comissao}`);
console.log(`Valor total vendido Sofia:    R$ ${Number(comissaoStats[0].valor_total_sofia).toFixed(2)}`);
console.log(`Comissão TOTAL da loja:       R$ ${Number(comissaoStats[0].comissao_total_loja || 0).toFixed(2)}`);
console.log(`Reembolso devido (Sofia):     R$ ${(Number(comissaoStats[0].valor_total_sofia) - Number(comissaoStats[0].comissao_total_loja || 0)).toFixed(2)}`);
console.log('');

if (pedidosMistos.length > 0) {
  console.log('── PEDIDOS MISTOS (top 5) ─────────────────────────────────');
  for (const p of pedidosMistos.slice(0, 5)) {
    console.log(`  ${p.pedidoId}  R$ ${Number(p.totalAplicado).toFixed(2)}  itens: ${p.normal_count} normais + ${p.sofia_count} Sofia`);
  }
  console.log('');
}

// ───────── PLANILHA ─────────
const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/SOFIA_ITENS!A2:W5000?key=${API_KEY}`);
const j = await r.json();
if (j.error) {
  console.log(`[ERRO PLANILHA] ${j.error.message}`);
}
const rows = j.values || [];
console.log(`[planilha] ${rows.length} linhas lidas`);

const pedidoIdsSheet = new Set();
let valorTotalSheet = 0;
let comissaoTotalSheet = 0;
let reembolsoTotalSheet = 0;
let qtdItensSheet = 0;
let qtdPecasSheet = 0;

for (const row of rows) {
  const pid = (row[0] || '').toString().trim();
  if (!pid) continue;
  pedidoIdsSheet.add(pid);
  qtdItensSheet++;
  qtdPecasSheet += Number((row[20] || '0').toString().replace(',', '.')) || 0;
  valorTotalSheet += Number((row[12] || '0').toString().replace('R$', '').replace(',', '.').trim()) || 0;
  comissaoTotalSheet += Number((row[21] || '0').toString().replace('R$', '').replace(',', '.').trim()) || 0;
  reembolsoTotalSheet += Number((row[22] || '0').toString().replace('R$', '').replace(',', '.').trim()) || 0;
}

console.log('── PLANILHA (aba SOFIA_ITENS) ─────────────────────────────');
console.log(`Linhas (itens):               ${qtdItensSheet}`);
console.log(`Pedidos únicos:               ${pedidoIdsSheet.size}`);
console.log(`Total peças (col U):          ${qtdPecasSheet}`);
console.log(`Valor total sem taxa (col M): R$ ${valorTotalSheet.toFixed(2)}`);
console.log(`Comissão loja (col V):        R$ ${comissaoTotalSheet.toFixed(2)}`);
console.log(`Reembolso (col W):            R$ ${reembolsoTotalSheet.toFixed(2)}`);
console.log('');

// ───────── CROSS-CHECK ─────────
const [bancoIds] = await db.execute(`
  SELECT DISTINCT i.pedidoId
  FROM pdv_order_items i
  WHERE i.isSofia = 1
`);
const idsBanco = new Set(bancoIds.map(r => r.pedidoId));

const naoNoBanco = [...pedidoIdsSheet].filter(id => !idsBanco.has(id));
const naoNaPlanilha = [...idsBanco].filter(id => !pedidoIdsSheet.has(id));

console.log('── CROSS-CHECK pedidoId Sofia ─────────────────────────────');
console.log(`Pedidos Sofia no banco:       ${idsBanco.size}`);
console.log(`Pedidos Sofia na planilha:    ${pedidoIdsSheet.size}`);
console.log(`Na planilha mas NÃO no banco: ${naoNoBanco.length}`);
console.log(`No banco mas NÃO na planilha: ${naoNaPlanilha.length}`);
if (naoNoBanco.length > 0) console.log(`  ⚠️  faltam:  ${naoNoBanco.slice(0, 10).join(', ')}${naoNoBanco.length > 10 ? '…' : ''}`);
if (naoNaPlanilha.length > 0) console.log(`  ⚠️  excesso: ${naoNaPlanilha.slice(0, 10).join(', ')}${naoNaPlanilha.length > 10 ? '…' : ''}`);
console.log('');

// ───────── SAMPLE ─────────
const [sample] = await db.execute(`
  SELECT o.pedidoId, o.createdAt, o.totalAplicado, o.isSofia,
         i.descricao, p.codigo AS codigo, i.tamanho, i.quantidade, i.precoUnitario, i.totalItem,
         i.comissaoLojaSofia, i.isSofia AS item_sofia
  FROM pdv_orders o
  JOIN pdv_order_items i ON i.pedidoId = o.pedidoId
  LEFT JOIN pdv_products p ON p.id = i.productId
  WHERE i.isSofia = 1
  ORDER BY o.createdAt DESC
  LIMIT 3
`);

console.log('── SAMPLE (últimos 3 itens Sofia no banco) ────────────────');
for (const r of sample) {
  const comissaoTotal = Number(r.comissaoLojaSofia || 0) * Number(r.quantidade);
  const reembolso = Math.max(0, Number(r.totalItem) - comissaoTotal);
  console.log(`  ${r.pedidoId} ${r.isSofia ? '(100% Sofia)' : '(misto)'}  ${r.codigo || '?'} ${r.descricao || ''} ${r.tamanho}`);
  console.log(`    qtd=${r.quantidade} unit=R$${Number(r.precoUnitario).toFixed(2)} total=R$${Number(r.totalItem).toFixed(2)}`);
  console.log(`    comissão/peça=R$${Number(r.comissaoLojaSofia || 0).toFixed(2)} → loja recebe R$${comissaoTotal.toFixed(2)} → reembolso Sofia R$${reembolso.toFixed(2)}`);
}

await db.end();
