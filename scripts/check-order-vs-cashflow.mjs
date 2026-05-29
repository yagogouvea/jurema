import mysql from 'mysql2/promise';
const url = new URL(process.env.DATABASE_URL);
const db = await mysql.createConnection({
  host: url.hostname, port: Number(url.port), user: url.username, password: url.password,
  database: url.pathname.slice(1), ssl: { rejectUnauthorized: false },
});

const peds = ['PED-22669763', 'PED-53878094', 'PED-07960455', 'PED-79712668'];

console.log('Comparando datas:');
console.log('  pdv_orders.createdAt vs pdv_cash_flow.createdAt\n');
for (const pid of peds) {
  const [o] = await db.execute(
    `SELECT pedidoId, createdAt, 
       DATE_FORMAT(CONVERT_TZ(createdAt, '+00:00', '-03:00'), '%d/%m/%Y %H:%i:%s') br
     FROM pdv_orders WHERE pedidoId = ?`, [pid]);
  const [c] = await db.execute(
    `SELECT descricao, createdAt,
       DATE_FORMAT(CONVERT_TZ(createdAt, '+00:00', '-03:00'), '%d/%m/%Y %H:%i:%s') br
     FROM pdv_cash_flow WHERE descricao LIKE ?`, [`%${pid}%`]);
  const order = o[0]; const cash = c[0];
  if (!order) { console.log(`  ${pid}: pedido não encontrado no banco`); continue; }
  if (!cash) { console.log(`  ${pid}: pedido OK (${order.br}) mas cashflow não tem`); continue; }
  const match = String(order.br) === String(cash.br) ? '✓' : '✗ DIVERGE';
  console.log(`  ${pid}  ${match}`);
  console.log(`    order:    ${order.br}`);
  console.log(`    cashflow: ${cash.br}`);
}

await db.end();
