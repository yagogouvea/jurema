// Investiga divergências do dashboard
import mysql from 'mysql2/promise';
const url = new URL(process.env.DATABASE_URL);
const db = await mysql.createConnection({
  host: url.hostname, port: Number(url.port), user: url.username, password: url.password,
  database: url.pathname.slice(1), ssl: { rejectUnauthorized: false },
});

const range = `o.createdAt >= '2026-05-01 00:00:00' AND o.createdAt <= '2026-05-11 23:59:59'`;

console.log('═══════════════════════════════════════════════════════════════');
console.log('  1) PONTOS — quantos itens com ptAtacado/ptVarejo zerados?');
console.log('═══════════════════════════════════════════════════════════════\n');

const [pt0] = await db.execute(`
  SELECT
    SUM(CASE WHEN oi.ptAtacado = 0 AND oi.ptVarejo = 0 THEN 1 ELSE 0 END) as itens_com_pontos_zerados,
    SUM(CASE WHEN oi.ptAtacado > 0 OR oi.ptVarejo > 0 THEN 1 ELSE 0 END) as itens_com_pontos_validos,
    COUNT(*) as total_itens
  FROM pdv_order_items oi
  JOIN pdv_orders o ON oi.pedidoId = o.pedidoId
  WHERE oi.isSofia = 0 AND ${range}
`);
console.table(pt0);

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('  2) PRODUTOS — quais têm ptAtacado/ptVarejo na tabela mestre?');
console.log('═══════════════════════════════════════════════════════════════\n');

const [ptProd] = await db.execute(`
  SELECT
    SUM(CASE WHEN ptAtacado = 0 AND ptVarejo = 0 THEN 1 ELSE 0 END) as produtos_sem_pontos,
    SUM(CASE WHEN ptAtacado > 0 OR ptVarejo > 0 THEN 1 ELSE 0 END) as produtos_com_pontos,
    COUNT(*) as total
  FROM pdv_products
`);
console.table(ptProd);

console.log('\nSample de produtos e seus pontos:');
const [sample] = await db.execute(`SELECT codigo, descricao, ptAtacado, ptVarejo FROM pdv_products LIMIT 10`);
console.table(sample);

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('  3) POR VENDEDOR — valores atuais do dashboard');
console.log('═══════════════════════════════════════════════════════════════\n');

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
  WHERE o.status != 'CANCELADO' AND o.isSofia = 0 AND ${range}
  GROUP BY o.sellerName
  ORDER BY pontuacao DESC
`);
console.table(perVendedor);

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('  4) FORMAS DE PAGAMENTO — Railway atual');
console.log('═══════════════════════════════════════════════════════════════\n');

const [pagamentos] = await db.execute(`
  SELECT 
    p.formaPagamento,
    COUNT(*) as qtd,
    COALESCE(SUM(p.valor), 0) as total
  FROM pdv_order_payments p
  JOIN pdv_orders o ON o.pedidoId = p.pedidoId
  WHERE o.status != 'CANCELADO' AND ${range}
  GROUP BY p.formaPagamento
  ORDER BY total DESC
`);
console.table(pagamentos);

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('  5) FATURAMENTO E TICKET MÉDIO');
console.log('═══════════════════════════════════════════════════════════════\n');

const [resumo] = await db.execute(`
  SELECT
    COUNT(DISTINCT o.pedidoId) as total_pedidos,
    COALESCE(SUM(o.totalAplicado), 0) as faturamento_total_aplicado,
    COALESCE(SUM(oi.totalItem), 0) as faturamento_itens_nao_sofia
  FROM pdv_orders o
  LEFT JOIN pdv_order_items oi ON oi.pedidoId = o.pedidoId AND oi.isSofia = 0
  WHERE o.status != 'CANCELADO' AND o.isSofia = 0 AND ${range}
`);
console.table(resumo);

await db.end();
