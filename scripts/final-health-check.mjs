// Verificação geral de saúde do sistema antes do cutover
import mysql from 'mysql2/promise';
const url = new URL(process.env.DATABASE_URL);
const db = await mysql.createConnection({
  host: url.hostname, port: Number(url.port), user: url.username, password: url.password,
  database: url.pathname.slice(1), ssl: { rejectUnauthorized: false },
});

console.log('═══════════════════════════════════════════════════════════════');
console.log('  CHECK DE PRONTIDÃO — Railway antes do cutover');
console.log('═══════════════════════════════════════════════════════════════\n');

// ── 1) Contagens ──
console.log('── 1) Contagens das tabelas principais ──');
const tables = [
  'pdv_sellers', 'pdv_products', 'pdv_orders', 'pdv_order_items',
  'pdv_order_payments', 'pdv_order_services', 'pdv_cash_flow',
  'pdv_desconto_folha', 'pdv_goals', 'pdv_sofia_config'
];
for (const t of tables) {
  const [r] = await db.execute(`SELECT COUNT(*) c FROM ${t}`);
  console.log(`  ${t.padEnd(25)} ${String(r[0].c).padStart(6)} registros`);
}

// ── 2) Vendedores ativos (para login) ──
console.log('\n── 2) Vendedores ativos (que poderão fazer login no Railway) ──');
const [sellers] = await db.execute(`SELECT id, name, username, role, isActive FROM pdv_sellers WHERE isActive = 1 ORDER BY name`);
for (const s of sellers) console.log(`  [${s.role.padEnd(5)}] ${s.name.padEnd(15)} usuário: ${s.username}`);

// ── 3) Produtos por tipo ──
console.log('\n── 3) Produtos por tipo ──');
const [tipos] = await db.execute(`SELECT tipo, COUNT(*) c, SUM(estoque) total_estoque FROM pdv_products WHERE isActive = 1 GROUP BY tipo ORDER BY c DESC`);
for (const t of tipos) console.log(`  ${(t.tipo || '(vazio)').padEnd(20)} ${String(t.c).padStart(4)} produtos / ${String(t.total_estoque).padStart(5)} peças`);
const [estoqueTotal] = await db.execute(`SELECT SUM(estoque) t FROM pdv_products WHERE isActive = 1`);
console.log(`\n  ► Total estoque ativo: ${estoqueTotal[0].t} peças`);

// ── 4) Pedidos por status ──
console.log('\n── 4) Pedidos por status ──');
const [stats] = await db.execute(`SELECT status, COUNT(*) c FROM pdv_orders GROUP BY status`);
for (const s of stats) console.log(`  ${s.status.padEnd(12)} ${String(s.c).padStart(6)}`);

// ── 5) Metas configuradas ──
console.log('\n── 5) Metas configuradas ──');
const [goals] = await db.execute(`SELECT \`key\`, label, value FROM pdv_goals ORDER BY value`);
for (const g of goals) console.log(`  ${g.key.padEnd(12)} ${g.label.padEnd(20)} R$ ${Number(g.value).toFixed(2)}`);

// ── 6) Configurações Sofia ──
console.log('\n── 6) Configurações Sofia ──');
const [sofiaCfg] = await db.execute(`SELECT * FROM pdv_sofia_config LIMIT 5`);
console.log(`  ${sofiaCfg.length} configurações`);
for (const c of sofiaCfg) {
  // ajustar campos conforme schema
  console.log(`    ${JSON.stringify(c).slice(0, 200)}`);
}

// ── 7) Pedidos recentes (hoje) ──
console.log('\n── 7) Pedidos das últimas 24h ──');
const [recentes] = await db.execute(`
  SELECT pedidoId, sellerName,
         DATE_FORMAT(CONVERT_TZ(createdAt, '+00:00', '-03:00'), '%d/%m %H:%i') AS dt_br,
         totalAplicado, status
  FROM pdv_orders
  WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
  ORDER BY createdAt DESC
`);
console.log(`  ${recentes.length} pedidos nas últimas 24h`);
for (const r of recentes.slice(0, 10)) {
  console.log(`  ${r.pedidoId}  ${r.dt_br}  ${r.sellerName.padEnd(10)}  R$${String(Number(r.totalAplicado).toFixed(2)).padStart(8)}  ${r.status}`);
}

await db.end();
console.log('\n✓ Validação concluída.');
