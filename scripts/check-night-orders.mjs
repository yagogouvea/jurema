// Detecta pedidos noturnos cuja data UTC ficou diferente da data BR após o +3h fix
import mysql from 'mysql2/promise';
const url = new URL(process.env.DATABASE_URL);
const db = await mysql.createConnection({
  host: url.hostname, port: Number(url.port), user: url.username, password: url.password,
  database: url.pathname.slice(1), ssl: { rejectUnauthorized: false },
});

// Pedidos com DATE(UTC) != DATE(BR) em maio 2026
const [rows] = await db.execute(`
  SELECT o.pedidoId, o.sellerName, o.totalAplicado, o.isSofia, o.status,
         DATE_FORMAT(o.createdAt, '%Y-%m-%d %H:%i') AS createdAt_utc,
         DATE(o.createdAt) AS date_utc,
         DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00')) AS date_br,
         COALESCE((SELECT SUM(oi.totalItem) FROM pdv_order_items oi WHERE oi.pedidoId = o.pedidoId AND oi.isSofia = 0), 0) AS sum_normal
  FROM pdv_orders o
  WHERE DATE(o.createdAt) != DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00'))
    AND DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00')) >= '2026-04-15'
    AND DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00')) <= '2026-05-15'
  ORDER BY o.createdAt
`);

console.log(`═══ Pedidos com DATE(UTC) ≠ DATE(BR) — pedidos NOTURNOS ═══\n`);
console.log('pedidoId      | vendedor | createdAt(UTC)    | data_UTC   | data_BR    | totalAplicado | sum_normal | status');
console.log('-'.repeat(120));

const porData = new Map(); // data_BR → array de pedidos
for (const r of rows) {
  const dBR = r.date_br.toISOString().slice(0, 10);
  const dUTC = r.date_utc.toISOString().slice(0, 10);
  console.log(`${r.pedidoId.padEnd(13)} | ${(r.sellerName || '').padEnd(8)} | ${r.createdAt_utc} | ${dUTC} | ${dBR} | R$${String(Number(r.totalAplicado).toFixed(2)).padStart(8)} | R$${String(Number(r.sum_normal).toFixed(2)).padStart(8)} | ${r.status}`);
  if (!porData.has(dBR)) porData.set(dBR, []);
  porData.get(dBR).push(r);
}

console.log(`\nTotal: ${rows.length} pedidos cuja data UTC≠BR\n`);

// Vendedores afetados
const porVendedor = new Map();
for (const r of rows) {
  if (!porVendedor.has(r.sellerName)) porVendedor.set(r.sellerName, { pedidos: 0, sum_normal: 0, total: 0 });
  const acc = porVendedor.get(r.sellerName);
  acc.pedidos++;
  acc.sum_normal += Number(r.sum_normal);
  acc.total += Number(r.totalAplicado);
}
console.log('Resumo por vendedor:');
for (const [v, a] of porVendedor.entries()) {
  console.log(`  ${v}: ${a.pedidos} pedidos, sum_normal=R$${a.sum_normal.toFixed(2)}, totalAplicado=R$${a.total.toFixed(2)}`);
}

// Especificamente: quantos pedidos do Murilo de DATA BR maio que UTC virou junho/etc
console.log('\n═══ Filtro do dashboard: que pedidos do Murilo entram em "01-11/05" via UTC mas via BR? ═══');
const [murUTC] = await db.execute(`SELECT COUNT(*) c, SUM(CASE WHEN o.status != 'CANCELADO' AND oi.isSofia=0 THEN oi.totalItem ELSE 0 END) v FROM pdv_orders o LEFT JOIN pdv_order_items oi ON oi.pedidoId=o.pedidoId WHERE o.sellerName='MURILO' AND DATE(o.createdAt) >= '2026-05-01' AND DATE(o.createdAt) <= '2026-05-11'`);
const [murBR] = await db.execute(`SELECT COUNT(*) c, SUM(CASE WHEN o.status != 'CANCELADO' AND oi.isSofia=0 THEN oi.totalItem ELSE 0 END) v FROM pdv_orders o LEFT JOIN pdv_order_items oi ON oi.pedidoId=o.pedidoId WHERE o.sellerName='MURILO' AND DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00')) >= '2026-05-01' AND DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00')) <= '2026-05-11'`);
console.log(`Filtro UTC: ${murUTC[0].c} linhas item, faturamento R$ ${Number(murUTC[0].v).toFixed(2)}`);
console.log(`Filtro BR : ${murBR[0].c} linhas item, faturamento R$ ${Number(murBR[0].v).toFixed(2)}`);

await db.end();
