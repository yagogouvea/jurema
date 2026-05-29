// Analisa divergência de Formas de Pagamento (Railway vs Manus)
import mysql from 'mysql2/promise';
const url = new URL(process.env.DATABASE_URL);
const db = await mysql.createConnection({
  host: url.hostname, port: Number(url.port), user: url.username, password: url.password,
  database: url.pathname.slice(1), ssl: { rejectUnauthorized: false },
});

const PERIODO = "DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00')) BETWEEN '2026-05-01' AND '2026-05-11'";

console.log('═══ 1) Forma de Pagamento — só NÃO Sofia (atual Railway) ═══');
const [naoSofia] = await db.execute(`
  SELECT p.formaPagamento, SUM(p.valor) as total, COUNT(*) as qtd
  FROM pdv_order_payments p
  JOIN pdv_orders o ON p.pedidoId = o.pedidoId
  WHERE o.status != 'CANCELADO' AND o.isSofia = 0 AND ${PERIODO}
  GROUP BY p.formaPagamento ORDER BY total DESC
`);
console.table(naoSofia);
const totRail = naoSofia.reduce((s,r)=>s+Number(r.total),0);
console.log(`  TOTAL (NÃO Sofia): R$ ${totRail.toFixed(2)}`);

console.log('\n═══ 2) Forma de Pagamento — só Sofia ═══');
const [sofia] = await db.execute(`
  SELECT p.formaPagamento, SUM(p.valor) as total, COUNT(*) as qtd
  FROM pdv_order_payments p
  JOIN pdv_orders o ON p.pedidoId = o.pedidoId
  WHERE o.status != 'CANCELADO' AND o.isSofia = 1 AND ${PERIODO}
  GROUP BY p.formaPagamento ORDER BY total DESC
`);
console.table(sofia);
const totSof = sofia.reduce((s,r)=>s+Number(r.total),0);
console.log(`  TOTAL (Sofia): R$ ${totSof.toFixed(2)}`);

console.log('\n═══ 3) Total Sofia + Não-Sofia (igualaria ao Manus?) ═══');
const [todos] = await db.execute(`
  SELECT p.formaPagamento, SUM(p.valor) as total, COUNT(*) as qtd
  FROM pdv_order_payments p
  JOIN pdv_orders o ON p.pedidoId = o.pedidoId
  WHERE o.status != 'CANCELADO' AND ${PERIODO}
  GROUP BY p.formaPagamento ORDER BY total DESC
`);
console.table(todos);

console.log('\n═══ 4) Comparação esperada vs Manus ═══');
console.log('  Manus:');
console.log('    PIX:           R$ 254.213,00');
console.log('    CREDITO:       R$  11.580,00');
console.log('    DINHEIRO:      R$  10.385,00');
console.log('    DEBITO:        R$     200,00');
console.log('    DESCONTO_FOLHA:R$      40,00');
console.log('    TOTAL:         R$ 276.418,00\n');
console.log('  Railway (Não-Sofia atual):');
const m = Object.fromEntries(naoSofia.map(r => [r.formaPagamento, Number(r.total)]));
console.log(`    PIX:           R$ ${(m.PIX || 0).toFixed(2).padStart(11)}`);
console.log(`    CREDITO:       R$ ${(m.CREDITO || 0).toFixed(2).padStart(11)}`);
console.log(`    DINHEIRO:      R$ ${(m.DINHEIRO || 0).toFixed(2).padStart(11)}`);
console.log(`    DEBITO:        R$ ${(m.DEBITO || 0).toFixed(2).padStart(11)}`);
console.log(`    DESCONTO_FOLHA:R$ ${(m.DESCONTO_FOLHA || 0).toFixed(2).padStart(11)}`);
console.log(`    TOTAL:         R$ ${totRail.toFixed(2).padStart(11)}\n`);
console.log('  Railway (Total = Sofia + Não-Sofia):');
const t = Object.fromEntries(todos.map(r => [r.formaPagamento, Number(r.total)]));
console.log(`    PIX:           R$ ${(t.PIX || 0).toFixed(2).padStart(11)}`);
console.log(`    CREDITO:       R$ ${(t.CREDITO || 0).toFixed(2).padStart(11)}`);
console.log(`    DINHEIRO:      R$ ${(t.DINHEIRO || 0).toFixed(2).padStart(11)}`);
console.log(`    DEBITO:        R$ ${(t.DEBITO || 0).toFixed(2).padStart(11)}`);
console.log(`    DESCONTO_FOLHA:R$ ${(t.DESCONTO_FOLHA || 0).toFixed(2).padStart(11)}`);

const totTotal = Object.values(t).reduce((s,v)=>s+v,0);
console.log(`    TOTAL:         R$ ${totTotal.toFixed(2).padStart(11)}`);

console.log('\n═══ 5) Estatística geral ═══');
const [stats] = await db.execute(`
  SELECT 
    COUNT(*) as total_pedidos,
    SUM(CASE WHEN isSofia = 1 THEN 1 ELSE 0 END) as pedidos_sofia,
    SUM(CASE WHEN isSofia = 0 THEN 1 ELSE 0 END) as pedidos_normal
  FROM pdv_orders o WHERE o.status != 'CANCELADO' AND ${PERIODO}
`);
console.table(stats);

await db.end();
