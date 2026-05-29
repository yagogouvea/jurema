// Corrige timestamps importados que ficaram 3h atrasados.
//
// Causa: o `import-orders.mjs` rodou no Windows local em BR (-0300).
// O `new Date(y, mo, d, h, mi)` cria Date como BR local.
// mysql2 (timezone: 'local') formatou como string BR sem TZ marker.
// Servidor MySQL (UTC) armazenou "14:51:00" naive.
// Ao ler, o instant é interpretado como UTC = 14:51 UTC = 11:51 BR no frontend.
//
// Fix: adicionar 3 horas em todos os timestamps importados, para que o instant
// armazenado realmente corresponda a 14:51 BR = 17:51 UTC.
//
// USO:
//   node scripts/fix-timezone.mjs --dry      → mostra o que vai mudar
//   node scripts/fix-timezone.mjs --apply    → aplica de fato

import mysql from 'mysql2/promise';

const argApply = process.argv.includes('--apply');
const argDry = process.argv.includes('--dry') || !argApply;

const DATABASE_URL = process.env.DATABASE_URL;
const url = new URL(DATABASE_URL);
const db = await mysql.createConnection({
  host: url.hostname,
  port: Number(url.port),
  user: url.username,
  password: url.password,
  database: url.pathname.slice(1),
  ssl: { rejectUnauthorized: false },
});

console.log(`Modo: ${argDry ? 'DRY-RUN (nada será alterado)' : 'APLICANDO +3h'}\n`);

// ── DIAGNÓSTICO ANTES ─────────────────────────────────────
const [before] = await db.execute(`
  SELECT pedidoId,
         DATE_FORMAT(createdAt, '%d/%m %H:%i') as antes
  FROM pdv_orders
  ORDER BY createdAt DESC
  LIMIT 5
`);
console.log('── Antes (5 pedidos mais recentes) ──');
for (const r of before) console.log(`  ${r.pedidoId}: ${r.antes}`);
console.log('');

// Tabelas/colunas afetadas pela importação manual.
// IMPORTANTE: pdv_products NÃO entra (foi sincronizado pelo backend via NOW() UTC).
const updates = [
  // pdv_orders — createdAt + updatedAt (importei ambos)
  `UPDATE pdv_orders SET createdAt = DATE_ADD(createdAt, INTERVAL 3 HOUR), updatedAt = DATE_ADD(updatedAt, INTERVAL 3 HOUR)`,
  // Filhos do pedido (createdAt copiado do pedido)
  `UPDATE pdv_order_payments SET createdAt = DATE_ADD(createdAt, INTERVAL 3 HOUR)`,
  `UPDATE pdv_order_services SET createdAt = DATE_ADD(createdAt, INTERVAL 3 HOUR)`,
  // Cashflow (importei do PEDIDOS/cashflow da planilha)
  `UPDATE pdv_cash_flow SET createdAt = DATE_ADD(createdAt, INTERVAL 3 HOUR)`,
  // Desconto folha
  `UPDATE pdv_desconto_folha SET createdAt = DATE_ADD(createdAt, INTERVAL 3 HOUR), updatedAt = DATE_ADD(updatedAt, INTERVAL 3 HOUR)`,
];

if (argApply) {
  console.log('Executando UPDATEs:');
  for (const sql of updates) {
    const [res] = await db.execute(sql);
    const m = sql.match(/UPDATE (\w+)/);
    console.log(`  ${m[1].padEnd(22)} → ${res.affectedRows} linhas`);
  }
  console.log('');

  // ── DIAGNÓSTICO DEPOIS ─────────────────────────────────────
  const [after] = await db.execute(`
    SELECT pedidoId,
           DATE_FORMAT(createdAt, '%d/%m %H:%i') as depois
    FROM pdv_orders
    ORDER BY createdAt DESC
    LIMIT 5
  `);
  console.log('── Depois ──');
  for (const r of after) console.log(`  ${r.pedidoId}: ${r.depois}`);
  console.log('\n✓ ok — atualize o dashboard pra ver.');
} else {
  console.log('SQL que seria executado:');
  for (const sql of updates) console.log(`  ${sql};`);
  console.log('\nRode novamente com --apply para aplicar.');
}

await db.end();
