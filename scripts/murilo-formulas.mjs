// Tenta diferentes fórmulas pra ver qual dá R$ 50.780 (o que o Manus mostra)
import mysql from 'mysql2/promise';
const url = new URL(process.env.DATABASE_URL);
const db = await mysql.createConnection({
  host: url.hostname, port: Number(url.port), user: url.username, password: url.password,
  database: url.pathname.slice(1), ssl: { rejectUnauthorized: false },
});

const PERIODO = `DATE(o.createdAt) >= '2026-05-01' AND DATE(o.createdAt) <= '2026-05-11'`;
const FILTRO = `o.sellerName = 'MURILO' AND o.status != 'CANCELADO' AND ${PERIODO}`;

const queries = [
  { nome: 'SUM(items não-Sofia)',
    sql: `SELECT SUM(oi.totalItem) v FROM pdv_order_items oi JOIN pdv_orders o ON o.pedidoId=oi.pedidoId WHERE ${FILTRO} AND oi.isSofia=0` },
  { nome: 'SUM(items TODOS, incl Sofia)',
    sql: `SELECT SUM(oi.totalItem) v FROM pdv_order_items oi JOIN pdv_orders o ON o.pedidoId=oi.pedidoId WHERE ${FILTRO}` },
  { nome: 'SUM(totalAplicado) pedidos não-Sofia',
    sql: `SELECT SUM(o.totalAplicado) v FROM pdv_orders o WHERE ${FILTRO} AND o.isSofia=0` },
  { nome: 'SUM(totalAplicado) TODOS pedidos',
    sql: `SELECT SUM(o.totalAplicado) v FROM pdv_orders o WHERE ${FILTRO}` },
  { nome: 'SUM(items não-Sofia) + serviços',
    sql: `SELECT (SELECT SUM(oi.totalItem) FROM pdv_order_items oi JOIN pdv_orders o ON o.pedidoId=oi.pedidoId WHERE ${FILTRO.replaceAll('o.', 'o.')} AND oi.isSofia=0) + (SELECT SUM(svc.valor) FROM pdv_order_services svc JOIN pdv_orders o ON o.pedidoId=svc.pedidoId WHERE ${FILTRO}) AS v` },
  { nome: 'SUM(items não-Sofia) + serviços CAIXINHA',
    sql: `SELECT (SELECT SUM(oi.totalItem) FROM pdv_order_items oi JOIN pdv_orders o ON o.pedidoId=oi.pedidoId WHERE ${FILTRO} AND oi.isSofia=0) + (SELECT SUM(svc.valor) FROM pdv_order_services svc JOIN pdv_orders o ON o.pedidoId=svc.pedidoId WHERE ${FILTRO} AND svc.tipo='CAIXINHA') AS v` },
  { nome: 'SUM(totalPago)',
    sql: `SELECT SUM(o.totalPago) v FROM pdv_orders o WHERE ${FILTRO} AND o.isSofia=0` },
];

console.log('═══ Várias fórmulas — qual dá R$ 50.780 (Manus)? ═══');
for (const q of queries) {
  try {
    const [r] = await db.execute(q.sql);
    const v = Number(r[0]?.v ?? 0);
    const delta = v - 50780;
    const ok = Math.abs(delta) < 0.5 ? ' ← !!!!' : '';
    console.log(`  ${q.nome.padEnd(48)} = R$ ${v.toFixed(2).padStart(12)}  Δ Manus = ${delta > 0 ? '+' : ''}${delta.toFixed(2)}${ok}`);
  } catch (err) {
    console.log(`  ${q.nome}: ERRO ${err.message}`);
  }
}

// Lista serviços do Murilo por tipo
const [svcByTipo] = await db.execute(`
  SELECT svc.tipo, COUNT(*) n, SUM(svc.valor) v
  FROM pdv_order_services svc
  JOIN pdv_orders o ON o.pedidoId = svc.pedidoId
  WHERE ${FILTRO} GROUP BY svc.tipo
`);
console.log('\n── Serviços do Murilo no período ──');
for (const r of svcByTipo) console.log(`  ${r.tipo}: ${r.n}× — total R$ ${Number(r.v).toFixed(2)}`);

// Verifica se há pedidos do Murilo com totalAplicado <> sum(items)
const [check] = await db.execute(`
  SELECT o.pedidoId, o.totalAplicado, COALESCE(SUM(oi.totalItem), 0) as soma_itens, (o.totalAplicado - COALESCE(SUM(oi.totalItem), 0)) as delta
  FROM pdv_orders o
  LEFT JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId AND oi.isSofia = 0
  WHERE ${FILTRO} AND o.isSofia = 0
  GROUP BY o.pedidoId, o.totalAplicado
  HAVING ABS(delta) > 0.01
  ORDER BY ABS(delta) DESC
  LIMIT 30
`);
console.log(`\n── ${check.length} pedidos onde totalAplicado != SUM(items não-Sofia) ──`);
for (const r of check.slice(0, 15)) {
  console.log(`  ${r.pedidoId}: totalAplicado=R$${Number(r.totalAplicado).toFixed(2)} sum_items=R$${Number(r.soma_itens).toFixed(2)} Δ=R$${Number(r.delta).toFixed(2)}`);
}

await db.end();
