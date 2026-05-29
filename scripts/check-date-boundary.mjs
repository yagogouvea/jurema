// Verifica se há pedidos do Murilo no banco em horário "noturno" próximo aos limites
import mysql from 'mysql2/promise';
const url = new URL(process.env.DATABASE_URL);
const db = await mysql.createConnection({
  host: url.hostname, port: Number(url.port), user: url.username, password: url.password,
  database: url.pathname.slice(1), ssl: { rejectUnauthorized: false },
});

// Pedidos do Murilo perto dos limites: 30/04 noite (= 01/05 UTC) e 11/05 noite (= 12/05 UTC)
const [rows] = await db.execute(`
  SELECT o.pedidoId, o.totalAplicado,
         DATE_FORMAT(o.createdAt, '%Y-%m-%d %H:%i') as createdAt_raw,
         DATE(o.createdAt) as date_utc,
         DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00')) as date_br,
         COALESCE((SELECT SUM(oi.totalItem) FROM pdv_order_items oi WHERE oi.pedidoId = o.pedidoId AND oi.isSofia = 0), 0) AS sum_normal
  FROM pdv_orders o
  WHERE o.sellerName = 'MURILO' AND o.status != 'CANCELADO' AND o.isSofia = 0
    AND DATE(o.createdAt) >= '2026-04-29' AND DATE(o.createdAt) <= '2026-05-13'
  ORDER BY o.createdAt
`);

console.log('═══ Pedidos do Murilo perto dos limites (30/04 a 13/05) ═══');
console.log('pedidoId      | createdAt(UTC)       | date_utc   | date_br    | total | sum_normal');
console.log('-'.repeat(110));
for (const r of rows) {
  const flag = (r.date_utc.toISOString().slice(0, 10) !== r.date_br.toISOString().slice(0, 10)) ? ' ← BORDER' : '';
  console.log(`${r.pedidoId.padEnd(13)} | ${r.createdAt_raw} | ${r.date_utc.toISOString().slice(0, 10)} | ${r.date_br.toISOString().slice(0, 10)} | R$${String(Number(r.totalAplicado).toFixed(2)).padStart(8)} | R$${String(Number(r.sum_normal).toFixed(2)).padStart(8)}${flag}`);
}

// Resumo com dois filtros distintos
console.log('\n═══ Comparação Faturamento Murilo: filtro UTC vs BR ═══');
const [r1] = await db.execute(`
  SELECT SUM(oi.totalItem) AS v
  FROM pdv_order_items oi JOIN pdv_orders o ON o.pedidoId = oi.pedidoId
  WHERE o.sellerName='MURILO' AND o.status != 'CANCELADO' AND oi.isSofia = 0
    AND DATE(o.createdAt) >= '2026-05-01' AND DATE(o.createdAt) <= '2026-05-11'
`);
const [r2] = await db.execute(`
  SELECT SUM(oi.totalItem) AS v
  FROM pdv_order_items oi JOIN pdv_orders o ON o.pedidoId = oi.pedidoId
  WHERE o.sellerName='MURILO' AND o.status != 'CANCELADO' AND oi.isSofia = 0
    AND DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00')) >= '2026-05-01'
    AND DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00')) <= '2026-05-11'
`);
console.log(`Filtro UTC (Railway atual): R$ ${Number(r1[0].v).toFixed(2)}`);
console.log(`Filtro BR (correto):        R$ ${Number(r2[0].v).toFixed(2)}`);
console.log(`Δ: R$ ${(Number(r2[0].v) - Number(r1[0].v)).toFixed(2)}`);

// Mesmo pra TOTAL geral (todos vendedores)
console.log('\n═══ Comparação TOTAL GERAL: filtro UTC vs BR ═══');
const [r3] = await db.execute(`
  SELECT SUM(oi.totalItem) AS v
  FROM pdv_order_items oi JOIN pdv_orders o ON o.pedidoId = oi.pedidoId
  WHERE o.status != 'CANCELADO' AND oi.isSofia = 0
    AND DATE(o.createdAt) >= '2026-05-01' AND DATE(o.createdAt) <= '2026-05-11'
`);
const [r4] = await db.execute(`
  SELECT SUM(oi.totalItem) AS v
  FROM pdv_order_items oi JOIN pdv_orders o ON o.pedidoId = oi.pedidoId
  WHERE o.status != 'CANCELADO' AND oi.isSofia = 0
    AND DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00')) >= '2026-05-01'
    AND DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00')) <= '2026-05-11'
`);
console.log(`Filtro UTC (Railway atual): R$ ${Number(r3[0].v).toFixed(2)}`);
console.log(`Filtro BR (correto):        R$ ${Number(r4[0].v).toFixed(2)}`);
console.log(`Δ: R$ ${(Number(r4[0].v) - Number(r3[0].v)).toFixed(2)}`);

await db.end();
