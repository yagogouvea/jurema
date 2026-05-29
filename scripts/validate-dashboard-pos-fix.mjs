// Validação: simula EXATAMENTE o que dashboard vai retornar após o fix
import mysql from 'mysql2/promise';
const url = new URL(process.env.DATABASE_URL);
const db = await mysql.createConnection({
  host: url.hostname, port: Number(url.port), user: url.username, password: url.password,
  database: url.pathname.slice(1), ssl: { rejectUnauthorized: false },
});

const params = ['2026-05-01', '2026-05-11'];
const TZ = "CONVERT_TZ(o.createdAt, '+00:00', '-03:00')";

console.log('═══ DASHBOARD após fix (com timezone BR e dia como string) ═══\n');

console.log('1) SUMMARY:');
const [summary] = await db.execute(`
  SELECT 
    COUNT(DISTINCT o.id) as totalPedidos,
    COALESCE(SUM(oi.totalItem), 0) as faturamento,
    COALESCE(AVG(oi_totals.totalNaoSofia), 0) as ticketMedio
  FROM pdv_orders o
  JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId AND oi.isSofia = 0
  LEFT JOIN (
    SELECT pedidoId, SUM(totalItem) as totalNaoSofia
    FROM pdv_order_items WHERE isSofia = 0
    GROUP BY pedidoId
  ) oi_totals ON oi_totals.pedidoId = o.pedidoId
  WHERE o.status != 'CANCELADO' AND o.isSofia = 0
    AND DATE(${TZ}) >= ? AND DATE(${TZ}) <= ?
`, params);
console.table(summary);

console.log('\n2) BY SELLER (ordem por pontuacao DESC):');
const [bySeller] = await db.execute(`
  SELECT o.sellerName, 
    COUNT(DISTINCT o.id) as pedidos,
    COALESCE(SUM(oi.totalItem), 0) as faturamento,
    COALESCE(SUM(
      CASE WHEN o.regime = 'ATACADO' THEN oi.ptAtacado * oi.quantidade
           ELSE oi.ptVarejo * oi.quantidade END
    ), 0) as pontuacao
  FROM pdv_orders o
  JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId AND oi.isSofia = 0
  WHERE o.status != 'CANCELADO' AND o.isSofia = 0
    AND DATE(${TZ}) >= ? AND DATE(${TZ}) <= ?
  GROUP BY o.sellerId, o.sellerName
  ORDER BY pontuacao DESC
`, params);
console.table(bySeller);

console.log('\n3) BY PAYMENT:');
const [byPayment] = await db.execute(`
  SELECT p.formaPagamento, 
    COUNT(DISTINCT p.pedidoId) as pedidos,
    COALESCE(SUM(p.valor), 0) as total
  FROM pdv_order_payments p
  INNER JOIN pdv_orders o ON p.pedidoId = o.pedidoId
  WHERE o.status != 'CANCELADO' AND o.isSofia = 0
    AND DATE(${TZ}) >= ? AND DATE(${TZ}) <= ?
  GROUP BY p.formaPagamento
  ORDER BY total DESC
`, params);
console.table(byPayment);

console.log('\n4) BY DAY (gráfico — dia agora como string YYYY-MM-DD):');
const [byDay] = await db.execute(`
  SELECT DATE_FORMAT(${TZ}, '%Y-%m-%d') as dia,
    COUNT(DISTINCT o.id) as pedidos,
    COALESCE(SUM(oi.totalItem), 0) as faturamento
  FROM pdv_orders o
  JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId AND oi.isSofia = 0
  WHERE o.status != 'CANCELADO' AND o.isSofia = 0
    AND DATE(${TZ}) >= ? AND DATE(${TZ}) <= ?
  GROUP BY DATE_FORMAT(${TZ}, '%Y-%m-%d')
  ORDER BY dia ASC
`, params);
console.table(byDay);
for (const row of byDay) {
  console.log(`  dia="${row.dia}"  tipo=${typeof row.dia}  ${row.dia instanceof Date ? '(É Date)' : '(É string)'} → new Date(d+"T00:00:00") =`, new Date(row.dia + 'T00:00:00').toLocaleDateString('pt-BR'));
}

await db.end();
