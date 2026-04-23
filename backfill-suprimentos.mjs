import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

console.log('=== DIAGNÓSTICO: Pedidos com DINHEIRO vs Suprimentos ===\n');

// 1. Pedidos com pagamento em DINHEIRO
const [pedidosDinheiro] = await conn.execute(`
  SELECT 
    o.pedidoId,
    o.clienteNome,
    o.createdAt,
    SUM(p.valor) as totalDinheiro
  FROM pdv_orders o
  JOIN pdv_order_payments p ON p.pedidoId = o.pedidoId
  WHERE p.formaPagamento = 'DINHEIRO'
  GROUP BY o.pedidoId, o.clienteNome, o.createdAt
  ORDER BY o.createdAt DESC
`);

console.log(`Total de pedidos com DINHEIRO: ${pedidosDinheiro.length}`);
const totalValorDinheiro = pedidosDinheiro.reduce((acc, p) => acc + parseFloat(p.totalDinheiro || 0), 0);
console.log(`Valor total em dinheiro: R$ ${totalValorDinheiro.toFixed(2)}\n`);

// 2. Suprimentos de pedidos já existentes
const [suprsExistentes] = await conn.execute(`
  SELECT descricao, valor, createdAt
  FROM pdv_cash_flow
  WHERE tipo = 'SUPRIMENTO' AND descricao LIKE 'Venda PED-%'
  ORDER BY createdAt DESC
`);

console.log(`Suprimentos de pedidos já existentes: ${suprsExistentes.length}`);

// 3. Identificar pedidos SEM suprimento
const pedidosComSuprimento = new Set(
  suprsExistentes.map(s => {
    const match = s.descricao.match(/Venda (PED-\w+)/);
    return match ? match[1] : null;
  }).filter(Boolean)
);

const pedidosSemSuprimento = pedidosDinheiro.filter(
  p => !pedidosComSuprimento.has(p.pedidoId)
);

console.log(`\nPedidos SEM suprimento correspondente: ${pedidosSemSuprimento.length}`);

if (pedidosSemSuprimento.length === 0) {
  console.log('✅ Todos os pedidos em dinheiro já têm suprimento!');
  await conn.end();
  process.exit(0);
}

const totalBackfill = pedidosSemSuprimento.reduce((acc, p) => acc + parseFloat(p.totalDinheiro || 0), 0);
console.log(`Valor total a ser gerado como suprimento: R$ ${totalBackfill.toFixed(2)}\n`);

// Mostrar os 5 primeiros para conferência
console.log('Primeiros 5 pedidos sem suprimento:');
pedidosSemSuprimento.slice(0, 5).forEach(p => {
  console.log(`  ${p.pedidoId} | ${p.clienteNome || 'sem nome'} | R$ ${parseFloat(p.totalDinheiro).toFixed(2)} | ${new Date(p.createdAt).toLocaleDateString('pt-BR')}`);
});

// 4. Executar backfill
console.log('\n=== EXECUTANDO BACKFILL ===\n');

let inseridos = 0;
let erros = 0;

for (const pedido of pedidosSemSuprimento) {
  try {
    const descricao = `Venda ${pedido.pedidoId}${pedido.clienteNome ? ` - ${pedido.clienteNome}` : ''}`;
    const valor = parseFloat(pedido.totalDinheiro);
    
    await conn.execute(`
      INSERT INTO pdv_cash_flow (tipo, descricao, valor, createdAt)
      VALUES ('SUPRIMENTO', ?, ?, ?)
    `, [descricao, valor, pedido.createdAt]);
    
    inseridos++;
    if (inseridos % 10 === 0) {
      console.log(`  ${inseridos}/${pedidosSemSuprimento.length} inseridos...`);
    }
  } catch (err) {
    erros++;
    console.error(`  ERRO no pedido ${pedido.pedidoId}:`, err.message);
  }
}

console.log(`\n✅ Backfill concluído: ${inseridos} suprimentos inseridos, ${erros} erros`);

// 5. Verificar saldo final
const [saldo] = await conn.execute(`
  SELECT 
    SUM(CASE WHEN tipo = 'SUPRIMENTO' THEN valor ELSE 0 END) as totalSuprimentos,
    SUM(CASE WHEN tipo = 'SANGRIA' THEN valor ELSE 0 END) as totalSangrias,
    SUM(CASE WHEN tipo = 'SUPRIMENTO' THEN valor ELSE -valor END) as saldo
  FROM pdv_cash_flow
`);
console.log(`\nSaldo atualizado do caixa: R$ ${parseFloat(saldo[0].saldo || 0).toFixed(2)}`);
console.log(`  Suprimentos: R$ ${parseFloat(saldo[0].totalSuprimentos || 0).toFixed(2)}`);
console.log(`  Sangrias: R$ ${parseFloat(saldo[0].totalSangrias || 0).toFixed(2)}`);

await conn.end();
