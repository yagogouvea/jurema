// Investiga profundamente as divergências de pontos
import mysql from 'mysql2/promise';
const url = new URL(process.env.DATABASE_URL);
const db = await mysql.createConnection({
  host: url.hostname, port: Number(url.port), user: url.username, password: url.password,
  database: url.pathname.slice(1), ssl: { rejectUnauthorized: false },
});

console.log('═══ 1) Itens com productId NULL no período ═══\n');
const [nullProd] = await db.execute(`
  SELECT 
    SUM(CASE WHEN oi.productId IS NULL THEN 1 ELSE 0 END) as null_prod,
    SUM(CASE WHEN oi.productId IS NOT NULL THEN 1 ELSE 0 END) as with_prod,
    COUNT(*) as total
  FROM pdv_order_items oi
  JOIN pdv_orders o ON oi.pedidoId = o.pedidoId
  WHERE o.status != 'CANCELADO' AND o.isSofia = 0 
    AND DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00')) BETWEEN '2026-05-01' AND '2026-05-11'
    AND oi.isSofia = 0
`);
console.table(nullProd);

console.log('\n═══ 2) Por vendedor: itens com productId NULL ═══\n');
const [perSel] = await db.execute(`
  SELECT 
    o.sellerName,
    SUM(CASE WHEN oi.productId IS NULL THEN 1 ELSE 0 END) as null_prod,
    SUM(CASE WHEN oi.productId IS NULL THEN oi.quantidade ELSE 0 END) as qtd_null,
    SUM(CASE WHEN oi.productId IS NOT NULL THEN 1 ELSE 0 END) as with_prod
  FROM pdv_order_items oi
  JOIN pdv_orders o ON oi.pedidoId = o.pedidoId
  WHERE o.status != 'CANCELADO' AND o.isSofia = 0 
    AND DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00')) BETWEEN '2026-05-01' AND '2026-05-11'
    AND oi.isSofia = 0
  GROUP BY o.sellerName
  ORDER BY null_prod DESC
`);
console.table(perSel);

console.log('\n═══ 3) Top 20 códigos de produto sem productId ═══\n');
const [orphan] = await db.execute(`
  SELECT 
    SUBSTRING_INDEX(oi.descricao, ' ', 1) as primeira_palavra,
    oi.descricao,
    COUNT(*) as ocorrencias,
    SUM(oi.quantidade) as total_qtd
  FROM pdv_order_items oi
  JOIN pdv_orders o ON oi.pedidoId = o.pedidoId
  WHERE o.status != 'CANCELADO' AND o.isSofia = 0
    AND DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00')) BETWEEN '2026-05-01' AND '2026-05-11'
    AND oi.productId IS NULL AND oi.isSofia = 0
  GROUP BY oi.descricao
  ORDER BY ocorrencias DESC
  LIMIT 20
`);
console.table(orphan);

console.log('\n═══ 4) Faturamento "perdido" por vendedor (itens sem productId) ═══\n');
const [perd] = await db.execute(`
  SELECT 
    o.sellerName,
    COUNT(*) as qtd_itens_sem_prod,
    SUM(oi.quantidade) as pecas_sem_prod,
    SUM(oi.totalItem) as faturamento_sem_prod
  FROM pdv_order_items oi
  JOIN pdv_orders o ON oi.pedidoId = o.pedidoId
  WHERE o.status != 'CANCELADO' AND o.isSofia = 0
    AND DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00')) BETWEEN '2026-05-01' AND '2026-05-11'
    AND oi.productId IS NULL AND oi.isSofia = 0
  GROUP BY o.sellerName
  ORDER BY pecas_sem_prod DESC
`);
console.table(perd);

await db.end();
