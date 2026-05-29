// Análise profunda das divergências de pagamento
import mysql from 'mysql2/promise';
const url = new URL(process.env.DATABASE_URL);
const db = await mysql.createConnection({
  host: url.hostname, port: Number(url.port), user: url.username, password: url.password,
  database: url.pathname.slice(1), ssl: { rejectUnauthorized: false },
});

const params = ['2026-05-01', '2026-05-11'];

console.log('═══ 1) Query EXATA do dashboard (byPayment) ═══\n');
const [dash] = await db.execute(`
  SELECT p.formaPagamento, 
    COUNT(DISTINCT p.pedidoId) as pedidos,
    COALESCE(SUM(p.valor), 0) as total
  FROM pdv_order_payments p
  INNER JOIN pdv_orders o ON p.pedidoId = o.pedidoId
  WHERE o.status != 'CANCELADO' AND o.isSofia = 0 
    AND DATE(o.createdAt) >= ? AND DATE(o.createdAt) <= ?
  GROUP BY p.formaPagamento
  ORDER BY total DESC
`, params);
console.table(dash);

console.log('\n═══ 2) MESMA query INCLUINDO pedidos 100% Sofia (isSofia=1) ═══\n');
const [todos] = await db.execute(`
  SELECT p.formaPagamento, 
    COUNT(DISTINCT p.pedidoId) as pedidos,
    COALESCE(SUM(p.valor), 0) as total
  FROM pdv_order_payments p
  INNER JOIN pdv_orders o ON p.pedidoId = o.pedidoId
  WHERE o.status != 'CANCELADO' 
    AND DATE(o.createdAt) >= ? AND DATE(o.createdAt) <= ?
  GROUP BY p.formaPagamento
  ORDER BY total DESC
`, params);
console.table(todos);

console.log('\n═══ 3) APENAS pagamentos de pedidos 100% Sofia ═══\n');
const [sofiaOnly] = await db.execute(`
  SELECT p.formaPagamento, 
    COUNT(DISTINCT p.pedidoId) as pedidos,
    COALESCE(SUM(p.valor), 0) as total
  FROM pdv_order_payments p
  INNER JOIN pdv_orders o ON p.pedidoId = o.pedidoId
  WHERE o.status != 'CANCELADO' AND o.isSofia = 1
    AND DATE(o.createdAt) >= ? AND DATE(o.createdAt) <= ?
  GROUP BY p.formaPagamento
  ORDER BY total DESC
`, params);
console.table(sofiaOnly);

console.log('\n═══ 4) Pedidos com pagamentos > totalAplicado (suspeito) ═══\n');
const [suspeitos] = await db.execute(`
  SELECT o.pedidoId, o.sellerName, o.totalAplicado, o.isSofia, o.status,
    COALESCE(SUM(p.valor), 0) as total_pagamentos,
    (COALESCE(SUM(p.valor), 0) - o.totalAplicado) as diferenca
  FROM pdv_orders o
  LEFT JOIN pdv_order_payments p ON p.pedidoId = o.pedidoId
  WHERE o.status != 'CANCELADO'
    AND DATE(o.createdAt) >= ? AND DATE(o.createdAt) <= ?
  GROUP BY o.pedidoId
  HAVING ABS(total_pagamentos - o.totalAplicado) > 0.01
  ORDER BY ABS(diferenca) DESC
  LIMIT 20
`, params);
console.log(`Pedidos com soma de pagamentos != totalAplicado: ${suspeitos.length}`);
if (suspeitos.length) console.table(suspeitos);

console.log('\n═══ 5) Faturamento real vs Pagamentos (decomposição) ═══\n');
const [decomp] = await db.execute(`
  SELECT 
    COUNT(DISTINCT o.id) as pedidos_isSofia0,
    COALESCE(SUM(oi.totalItem), 0) as faturamento_itens_naoSofia,
    (SELECT COALESCE(SUM(p2.valor), 0)
     FROM pdv_order_payments p2
     INNER JOIN pdv_orders o2 ON o2.pedidoId = p2.pedidoId
     WHERE o2.status != 'CANCELADO' AND o2.isSofia = 0
       AND DATE(o2.createdAt) BETWEEN ? AND ?) as total_pagamentos_dashboard
  FROM pdv_orders o
  JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId AND oi.isSofia = 0
  WHERE o.status != 'CANCELADO' AND o.isSofia = 0
    AND DATE(o.createdAt) BETWEEN ? AND ?
`, [...params, ...params]);
console.table(decomp);

console.log('\n  Faturamento (itens NÃO Sofia): R$', Number(decomp[0].faturamento_itens_naoSofia).toFixed(2));
console.log('  Pagamentos no dashboard:        R$', Number(decomp[0].total_pagamentos_dashboard).toFixed(2));
console.log('  Diferença (pagamento de Sofia mistos):', (Number(decomp[0].total_pagamentos_dashboard) - Number(decomp[0].faturamento_itens_naoSofia)).toFixed(2));

await db.end();
