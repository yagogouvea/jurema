// Relatório final após sincronização geral
import mysql from 'mysql2/promise';
const url = new URL(process.env.DATABASE_URL);
const db = await mysql.createConnection({
  host: url.hostname, port: Number(url.port), user: url.username, password: url.password,
  database: url.pathname.slice(1), ssl: { rejectUnauthorized: false },
});

console.log('═══════════════════════════════════════════════════════════════');
console.log('  RELATÓRIO PÓS-SINCRONIZAÇÃO GERAL');
console.log(`  ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('── Totais por tabela ──');
const tables = [
  ['pdv_products', 'Produtos cadastrados'],
  ['pdv_orders', 'Pedidos'],
  ['pdv_order_items', 'Itens de pedidos'],
  ['pdv_order_payments', 'Pagamentos'],
  ['pdv_order_services', 'Serviços (caixinha, frete, etc)'],
  ['pdv_cash_flow', 'Movimentos de caixa'],
  ['pdv_desconto_folha', 'Descontos em folha'],
];
for (const [t, label] of tables) {
  const [r] = await db.execute(`SELECT COUNT(*) c FROM ${t}`);
  console.log(`  ${label.padEnd(40)} ${String(r[0].c).padStart(6)}`);
}

console.log('\n── 2 pedidos importados agora (mais recentes) ──');
const [recentes] = await db.execute(`
  SELECT pedidoId, sellerName,
    DATE_FORMAT(CONVERT_TZ(createdAt, '+00:00', '-03:00'), '%d/%m/%Y %H:%i') dt_br,
    totalAplicado, status, isSofia
  FROM pdv_orders
  ORDER BY id DESC
  LIMIT 5
`);
console.table(recentes);

console.log('\n── Pontos nos itens importados (deve estar populado agora) ──');
const [pt] = await db.execute(`
  SELECT
    SUM(CASE WHEN ptAtacado = 0 AND ptVarejo = 0 THEN 1 ELSE 0 END) as zerados,
    SUM(CASE WHEN ptAtacado > 0 OR ptVarejo > 0 THEN 1 ELSE 0 END) as com_pontos,
    COUNT(*) as total
  FROM pdv_order_items
`);
console.table(pt);

console.log('\n── Dashboard simulado: período 01-11/05 ──');
const TZ = "CONVERT_TZ(o.createdAt, '+00:00', '-03:00')";
const params = ['2026-05-01', '2026-05-11'];

const [summ] = await db.execute(`
  SELECT 
    COUNT(DISTINCT o.id) as totalPedidos,
    COALESCE(SUM(oi.totalItem), 0) as faturamento
  FROM pdv_orders o
  JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId AND oi.isSofia = 0
  WHERE o.status != 'CANCELADO' AND o.isSofia = 0
    AND DATE(${TZ}) BETWEEN ? AND ?
`, params);
console.log(`  Faturamento: R$ ${Number(summ[0].faturamento).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
console.log(`  Pedidos:     ${summ[0].totalPedidos}`);

const [byS] = await db.execute(`
  SELECT o.sellerName, 
    COALESCE(SUM(oi.totalItem), 0) as faturamento,
    COALESCE(SUM(CASE WHEN o.regime = 'ATACADO' THEN oi.ptAtacado * oi.quantidade ELSE oi.ptVarejo * oi.quantidade END), 0) as pontuacao
  FROM pdv_orders o
  JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId AND oi.isSofia = 0
  WHERE o.status != 'CANCELADO' AND o.isSofia = 0
    AND DATE(${TZ}) BETWEEN ? AND ?
  GROUP BY o.sellerId, o.sellerName
  ORDER BY pontuacao DESC
`, params);
console.log('\n  Por vendedor (pontuação DESC):');
for (const r of byS) {
  console.log(`    ${r.sellerName.padEnd(10)} R$ ${String(Number(r.faturamento).toFixed(2)).padStart(10)}   ${String(Math.round(r.pontuacao)).padStart(6)} PT`);
}

const [byP] = await db.execute(`
  SELECT p.formaPagamento, 
    COALESCE(SUM(p.valor), 0) as total
  FROM pdv_order_payments p
  INNER JOIN pdv_orders o ON p.pedidoId = o.pedidoId
  WHERE o.status != 'CANCELADO' AND o.isSofia = 0
    AND DATE(${TZ}) BETWEEN ? AND ?
  GROUP BY p.formaPagamento
  ORDER BY total DESC
`, params);
console.log('\n  Formas de pagamento:');
for (const r of byP) {
  console.log(`    ${r.formaPagamento.padEnd(16)} R$ ${String(Number(r.total).toFixed(2)).padStart(12)}`);
}

await db.end();
console.log('\n✓ Sincronização concluída.');
