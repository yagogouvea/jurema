// Reverte os fixes da v3 (atribuição por descrição+preço) deixando o orphan como NULL
import mysql from 'mysql2/promise';
const apply = process.argv.includes('--apply');
const url = new URL(process.env.DATABASE_URL);
const db = await mysql.createConnection({
  host: url.hostname, port: Number(url.port), user: url.username, password: url.password,
  database: url.pathname.slice(1), ssl: { rejectUnauthorized: false },
});

// Vou identificar quais foram os ids alterados pela v3:
// Os fix v2 tinham match na planilha pedidos_itens. Vou achar todos os items que TÊM productId
// mas cujo pedido NÃO tem entrada em pedidos_itens — esses foram os chutes da v3.
const SHEET_ID = '1SGUr5Sh2gZ5nkYg0km-QhllQS4Jm2_aVxy6PuyATsLU';
const API_KEY = process.env.GOOGLE_SHEETS_API_KEY;
const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/pedidos_itens!A2:A15000?key=${API_KEY}`);
const j = await r.json();
const pidsInSheet = new Set((j.values || []).map(row => (row[0] || '').trim()).filter(Boolean));
console.log(`Pedidos na planilha pedidos_itens: ${pidsInSheet.size}`);

// Itens com productId resolvido para um dos 7 códigos da heurística e cujo pedidoId NÃO está na planilha
const V3_CODES = ['CA-CO-SAO-SAO-PAUL-X','CA-TO-GEN-VARI-TIME-X','NA-TO-BRA-COPA-2026-X','NA-TO-BRA-COPA-26-X','NA-TO-GEN-VARI-TIME-X','NA-TO-BRA-CAIX-X'];
const [candidates] = await db.execute(`
  SELECT oi.id, oi.pedidoId, p.codigo
  FROM pdv_order_items oi
  JOIN pdv_orders o ON oi.pedidoId = o.pedidoId
  JOIN pdv_products p ON oi.productId = p.id
  WHERE o.isSofia = 0 AND oi.isSofia = 0
    AND DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00')) BETWEEN '2026-05-01' AND '2026-05-31'
    AND p.codigo IN (${V3_CODES.map(() => '?').join(',')})
`, V3_CODES);

const toRevert = candidates.filter(c => !pidsInSheet.has(c.pedidoId));
console.log(`Itens chutados pela v3 (a reverter): ${toRevert.length}`);

if (!apply) {
  console.log('(dry-run — use --apply)');
  toRevert.slice(0, 5).forEach(c => console.log(`  id=${c.id} ${c.pedidoId} cod=${c.codigo}`));
  await db.end();
  process.exit(0);
}

console.log('Revertendo…');
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
