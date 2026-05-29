import mysql from 'mysql2/promise';
const url = new URL(process.env.DATABASE_URL);
const db = await mysql.createConnection({
  host: url.hostname, port: Number(url.port), user: url.username, password: url.password,
  database: url.pathname.slice(1), ssl: { rejectUnauthorized: false },
});

const P = "DATE(CONVERT_TZ(o.createdAt, '+00:00', '-03:00')) BETWEEN '2026-05-01' AND '2026-05-11'";

console.log('═══════════════════════════════════════════════════════════');
console.log('  RESUMO FINAL — Pontos e Formas de Pagamento');
console.log('═══════════════════════════════════════════════════════════\n');

// PONTOS
const [pts] = await db.execute(`
  SELECT o.sellerName,
    COALESCE(SUM(CASE WHEN o.regime = 'ATACADO' THEN oi.ptAtacado * oi.quantidade
                      ELSE oi.ptVarejo * oi.quantidade END), 0) as pontuacao
  FROM pdv_orders o
  JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId AND oi.isSofia = 0
  WHERE o.status != 'CANCELADO' AND o.isSofia = 0 AND ${P}
  GROUP BY o.sellerName ORDER BY pontuacao DESC
`);

const manusPts = { GABRIEL: 14121, MURILO: 6845, FLAVIO: 6493, VINICIUS: 3975, VANESSA: 390 };
console.log('▣ PONTUAÇÃO POR VENDEDOR (período 01-11/05)\n');
console.log('  Vendedor      Railway   Manus     Diferença');
console.log('  ─────────────────────────────────────────────');
let totalRail = 0, totalManus = 0;
for (const r of pts) {
  const rail = Number(r.pontuacao);
  const manus = manusPts[r.sellerName] || 0;
  totalRail += rail; totalManus += manus;
  const diff = rail - manus;
  const status = Math.abs(diff) < 50 ? '✓' : diff < 0 ? '−' : '+';
  console.log(`  ${r.sellerName.padEnd(12)}  ${String(rail).padStart(7)}   ${String(manus).padStart(7)}   ${status} ${String(diff).padStart(5)}`);
}
console.log('  ─────────────────────────────────────────────');
console.log(`  TOTAL         ${String(totalRail).padStart(7)}   ${String(totalManus).padStart(7)}   ${String(totalRail - totalManus).padStart(7)}`);

// Itens órfãos remanescentes
const [orphans] = await db.execute(`
  SELECT COUNT(*) as qtd_itens, SUM(oi.quantidade) as pecas, SUM(oi.totalItem) as fat
  FROM pdv_order_items oi
  JOIN pdv_orders o ON oi.pedidoId = o.pedidoId
  WHERE oi.productId IS NULL AND oi.isSofia = 0 AND o.isSofia = 0 AND ${P}
`);
console.log(`\n  Órfãos remanescentes: ${orphans[0].qtd_itens} itens (${orphans[0].pecas} peças, R$ ${Number(orphans[0].fat).toFixed(2)})`);
console.log('  → São itens "manuais" digitados sem código de produto (no Manus também não rastreável)');

// PAGAMENTOS
console.log('\n\n▣ FORMAS DE PAGAMENTO (período 01-11/05)\n');
const [pay] = await db.execute(`
  SELECT p.formaPagamento, SUM(p.valor) as total
  FROM pdv_order_payments p
  JOIN pdv_orders o ON p.pedidoId = o.pedidoId
  WHERE o.status != 'CANCELADO' AND o.isSofia = 0 AND ${P}
  GROUP BY p.formaPagamento
`);
const m = Object.fromEntries(pay.map(r => [r.formaPagamento, Number(r.total)]));
const manusPay = { PIX: 254213, CREDITO: 11580, DINHEIRO: 10385, DEBITO: 200, DESCONTO_FOLHA: 40 };
console.log('  Forma           Railway       Manus        Diferença');
console.log('  ──────────────────────────────────────────────────────');
let tR = 0, tM = 0;
for (const f of ['PIX','CREDITO','DINHEIRO','DEBITO','DESCONTO_FOLHA']) {
  const r = m[f] || 0;
  const mm = manusPay[f];
  tR += r; tM += mm;
  console.log(`  ${f.padEnd(15)} R$ ${r.toFixed(2).padStart(10)}  R$ ${mm.toFixed(2).padStart(10)}  ${(r-mm) > 0 ? '+' : ''}${(r-mm).toFixed(2)}`);
}
console.log('  ──────────────────────────────────────────────────────');
console.log(`  TOTAL           R$ ${tR.toFixed(2).padStart(10)}  R$ ${tM.toFixed(2).padStart(10)}  ${(tR-tM).toFixed(2)}`);
console.log(`\n  Divergência total: R$ ${(tM-tR).toFixed(2)} (Manus a mais)`);
console.log('  → ~R$ 6.700 vêm dos 6 pedidos que sumiram no import (já identificados anteriormente)');
console.log('  → ~R$ 5.000 vêm de pedidos Sofia, cuja contabilização difere entre Manus e Railway');

await db.end();
