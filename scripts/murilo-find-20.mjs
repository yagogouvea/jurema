// Tenta encontrar o R$ 20 específico no banco
import mysql from 'mysql2/promise';
const url = new URL(process.env.DATABASE_URL);
const db = await mysql.createConnection({
  host: url.hostname, port: Number(url.port), user: url.username, password: url.password,
  database: url.pathname.slice(1), ssl: { rejectUnauthorized: false },
});

// 1) Itens Sofia do Murilo em pedidos MISTOS (não-100%-Sofia)
const [sofiaItensMisto] = await db.execute(`
  SELECT oi.pedidoId, oi.descricao, oi.quantidade, oi.precoUnitario, oi.totalItem, o.isSofia AS pedido_isSofia
  FROM pdv_order_items oi
  JOIN pdv_orders o ON o.pedidoId = oi.pedidoId
  WHERE o.sellerName = 'MURILO' AND o.status != 'CANCELADO' AND oi.isSofia = 1 AND o.isSofia = 0
    AND DATE(o.createdAt) >= '2026-05-01' AND DATE(o.createdAt) <= '2026-05-11'
  ORDER BY oi.totalItem
`);
console.log('═══ Itens SOFIA do Murilo em pedidos MISTOS (estes não somam no faturamento) ═══');
let totalSofiaMisto = 0;
for (const r of sofiaItensMisto) {
  totalSofiaMisto += Number(r.totalItem);
  console.log(`  ${r.pedidoId}: ${r.descricao} qtd=${r.quantidade} R$ ${Number(r.totalItem).toFixed(2)}`);
}
console.log(`  total: ${sofiaItensMisto.length} itens, R$ ${totalSofiaMisto.toFixed(2)}\n`);

// 2) Itens com totalItem = 20 do Murilo
const [items20] = await db.execute(`
  SELECT oi.pedidoId, oi.descricao, oi.quantidade, oi.totalItem, oi.isSofia, o.status, o.isSofia AS pedido_isSofia
  FROM pdv_order_items oi
  JOIN pdv_orders o ON o.pedidoId = oi.pedidoId
  WHERE o.sellerName = 'MURILO' AND DATE(o.createdAt) >= '2026-05-01' AND DATE(o.createdAt) <= '2026-05-11'
    AND oi.totalItem = 20
  ORDER BY o.createdAt
`);
console.log(`═══ Itens com totalItem = R$ 20 (qualquer tipo) ═══`);
for (const r of items20) {
  console.log(`  ${r.pedidoId}: ${r.descricao} qtd=${r.quantidade} isSofia=${r.isSofia} status=${r.status}`);
}
console.log(`  total: ${items20.length} itens\n`);

// 3) Total geral PDV em maio (todos vendedores) - bate com R$ 252.800 ?
const [totalGeral] = await db.execute(`
  SELECT
    SUM(CASE WHEN o.status != 'CANCELADO' AND oi.isSofia = 0 THEN oi.totalItem ELSE 0 END) AS faturamento_railway,
    SUM(CASE WHEN o.status != 'CANCELADO' THEN oi.totalItem ELSE 0 END) AS faturamento_com_sofia,
    SUM(CASE WHEN o.status != 'CANCELADO' AND oi.isSofia = 0 THEN oi.quantidade ELSE 0 END) AS pecas
  FROM pdv_orders o
  JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId
  WHERE DATE(o.createdAt) >= '2026-05-01' AND DATE(o.createdAt) <= '2026-05-11'
`);
console.log('═══ Total geral (todos vendedores, maio) ═══');
console.log(`  Faturamento Railway (formula atual): R$ ${Number(totalGeral[0].faturamento_railway).toFixed(2)}`);
console.log(`  Faturamento com Sofia incluído:      R$ ${Number(totalGeral[0].faturamento_com_sofia).toFixed(2)}`);
console.log(`  Peças:                                ${totalGeral[0].pecas}`);

await db.end();
