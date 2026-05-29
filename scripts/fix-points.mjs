// Corrige ptAtacado / ptVarejo nos itens dos pedidos (cópia do pdv_products)
import mysql from 'mysql2/promise';
const url = new URL(process.env.DATABASE_URL);
const db = await mysql.createConnection({
  host: url.hostname, port: Number(url.port), user: url.username, password: url.password,
  database: url.pathname.slice(1), ssl: { rejectUnauthorized: false },
});

console.log('═══ Estado ANTES ═══\n');
const [antes] = await db.execute(`
  SELECT 
    SUM(CASE WHEN oi.ptAtacado = 0 AND oi.ptVarejo = 0 THEN 1 ELSE 0 END) as itens_zerados,
    SUM(CASE WHEN oi.ptAtacado > 0 OR oi.ptVarejo > 0 THEN 1 ELSE 0 END) as itens_com_pontos,
    COUNT(*) as total
  FROM pdv_order_items oi
`);
console.table(antes);

console.log('\n═══ Aplicando UPDATE de cópia dos pontos ═══\n');
const [result] = await db.execute(`
  UPDATE pdv_order_items oi
  JOIN pdv_products p ON p.id = oi.productId
  SET 
    oi.ptAtacado = p.ptAtacado,
    oi.ptVarejo  = p.ptVarejo
  WHERE oi.ptAtacado = 0 AND oi.ptVarejo = 0
    AND (p.ptAtacado > 0 OR p.ptVarejo > 0)
`);
console.log(`  ✓ ${result.affectedRows} itens atualizados`);

console.log('\n═══ Estado DEPOIS ═══\n');
const [depois] = await db.execute(`
  SELECT 
    SUM(CASE WHEN oi.ptAtacado = 0 AND oi.ptVarejo = 0 THEN 1 ELSE 0 END) as itens_zerados,
    SUM(CASE WHEN oi.ptAtacado > 0 OR oi.ptVarejo > 0 THEN 1 ELSE 0 END) as itens_com_pontos,
    COUNT(*) as total
  FROM pdv_order_items oi
`);
console.table(depois);

console.log('\n═══ Itens que continuam zerados (produto sem pontos) ═══\n');
const [zerados] = await db.execute(`
  SELECT p.codigo, p.descricao, p.ptAtacado, p.ptVarejo, COUNT(*) as itens_zerados
  FROM pdv_order_items oi
  JOIN pdv_products p ON p.id = oi.productId
  WHERE oi.ptAtacado = 0 AND oi.ptVarejo = 0
  GROUP BY p.id
  ORDER BY itens_zerados DESC
  LIMIT 20
`);
console.table(zerados);

console.log('\n═══ Pontuação por vendedor (período 01-11/05) ═══\n');
const [perVendedor] = await db.execute(`
  SELECT 
    o.sellerName,
    COUNT(DISTINCT o.pedidoId) as pedidos,
    COALESCE(SUM(oi.totalItem), 0) as faturamento,
    COALESCE(SUM(
      CASE WHEN o.regime = 'ATACADO' THEN oi.ptAtacado * oi.quantidade
           ELSE oi.ptVarejo * oi.quantidade END
    ), 0) as pontuacao,
    COALESCE(SUM(oi.quantidade), 0) as total_pecas
  FROM pdv_orders o
  JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId AND oi.isSofia = 0
  WHERE o.status != 'CANCELADO' AND o.isSofia = 0 
    AND DATE(o.createdAt) BETWEEN '2026-05-01' AND '2026-05-11'
  GROUP BY o.sellerName
  ORDER BY pontuacao DESC
`);
console.table(perVendedor);

await db.end();
