// Reverte exatamente os 49 chutes da v3: itens cuja linha em pedidos_itens tem cod vazio
import mysql from 'mysql2/promise';
const SHEET_ID = '1SGUr5Sh2gZ5nkYg0km-QhllQS4Jm2_aVxy6PuyATsLU';
const API_KEY = process.env.GOOGLE_SHEETS_API_KEY;
const apply = process.argv.includes('--apply');

const url = new URL(process.env.DATABASE_URL);
const db = await mysql.createConnection({
  host: url.hostname, port: Number(url.port), user: url.username, password: url.password,
  database: url.pathname.slice(1), ssl: { rejectUnauthorized: false },
});

// Ler pedidos_itens
const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/pedidos_itens!A2:Q15000?key=${API_KEY}`);
const j = await r.json();
const rows = (j.values || []).filter(row => (row[0] || '').toString().trim());

// pid → array de itens (cod, qtd, total)
const sheetByPid = new Map();
for (const row of rows) {
  const pid = (row[0] || '').trim();
  if (!pid) continue;
  if (!sheetByPid.has(pid)) sheetByPid.set(pid, []);
  sheetByPid.get(pid).push({
    cod: (row[1] || '').toString().trim().toUpperCase(),
    qtd: parseInt(row[3]) || 0,
    total: parseFloat(String(row[11] || '0').replace(',', '.')) || 0,
  });
}

// Lista 7 codes que a v3 usou
const V3_CODES = ['CA-CO-SAO-SAO-PAUL-X','CA-TO-GEN-VARI-TIME-X','NA-TO-BRA-COPA-2026-X','NA-TO-BRA-COPA-26-X','NA-TO-GEN-VARI-TIME-X','NA-TO-BRA-CAIX-X','CA-JG-TIM-VARI-TIME-X'];

const [candidates] = await db.execute(`
  SELECT oi.id, oi.pedidoId, oi.quantidade, oi.totalItem, p.codigo
  FROM pdv_order_items oi
  JOIN pdv_orders o ON oi.pedidoId = o.pedidoId
  JOIN pdv_products p ON oi.productId = p.id
  WHERE o.isSofia = 0 AND oi.isSofia = 0
    AND DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00')) BETWEEN '2026-05-01' AND '2026-05-31'
    AND p.codigo IN (${V3_CODES.map(() => '?').join(',')})
`, V3_CODES);

console.log(`Candidatos com código de v3: ${candidates.length}`);

const toRevert = [];
for (const c of candidates) {
  const linhas = sheetByPid.get(c.pedidoId) || [];
  // Procurar linha que case por qtd+total
  let match = linhas.find(l => l.qtd === c.quantidade && Math.abs(l.total - Number(c.totalItem)) < 0.01);
  if (!match) {
    const porQtd = linhas.filter(l => l.qtd === c.quantidade);
    if (porQtd.length === 1) match = porQtd[0];
  }
  // Se a linha tem cod vazio, é chute da v3
  if (!match) continue;
  if (match.cod === '' || match.cod === ' ') toRevert.push(c);
}

console.log(`Itens a reverter (cod vazio na planilha): ${toRevert.length}\n`);
toRevert.slice(0, 10).forEach(c => console.log(`  id=${c.id} ${c.pedidoId} cod=${c.codigo}`));

if (!apply) { console.log('\n(dry-run)'); await db.end(); process.exit(0); }

console.log('\nRevertendo…');
for (const c of toRevert) {
  await db.execute(`UPDATE pdv_order_items SET productId = NULL, ptAtacado = 0, ptVarejo = 0 WHERE id = ?`, [c.id]);
}
console.log(`✓ ${toRevert.length} itens revertidos`);

const [perSel] = await db.execute(`
  SELECT o.sellerName, COUNT(DISTINCT o.pedidoId) as pedidos, SUM(oi.quantidade) as pecas,
    COALESCE(SUM(oi.totalItem), 0) as fat,
    COALESCE(SUM(CASE WHEN o.regime = 'ATACADO' THEN oi.ptAtacado * oi.quantidade
                      ELSE oi.ptVarejo * oi.quantidade END), 0) as pontuacao
  FROM pdv_orders o
  JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId AND oi.isSofia = 0
  WHERE o.status != 'CANCELADO' AND o.isSofia = 0
    AND DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00')) BETWEEN '2026-05-01' AND '2026-05-11'
  GROUP BY o.sellerName ORDER BY pontuacao DESC
`);
console.log('\n── Pontuação após reversão ──');
console.table(perSel);
await db.end();
