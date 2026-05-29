// Olha o createdAt bruto no banco
import mysql from 'mysql2/promise';
const url = new URL(process.env.DATABASE_URL);
const db = await mysql.createConnection({
  host: url.hostname, port: Number(url.port), user: url.username, password: url.password,
  database: url.pathname.slice(1), ssl: { rejectUnauthorized: false },
});

const [r] = await db.execute(`
  SELECT id, tipo, descricao, valor, usuario,
    createdAt AS raw,
    DATE_FORMAT(createdAt, '%Y-%m-%d %H:%i:%s') AS utc_str,
    DATE_FORMAT(CONVERT_TZ(createdAt, '+00:00', '-03:00'), '%Y-%m-%d %H:%i:%s') AS br_str
  FROM pdv_cash_flow
  WHERE descricao LIKE 'Venda PED-22669763%' 
     OR descricao LIKE 'Exportação em lote%'
     OR descricao LIKE 'Venda PED-07960455%'
  ORDER BY id
`);
console.table(r);

console.log('\n── Compare com planilha: ──');
console.log('  PED-22669763: planilha diz 02/05/2026 08:51');
console.log('  Exportação 1/2: planilha diz 30/04/2026 18:52');
console.log('  PED-07960455:  planilha diz 11/05/2026 (último, recente)');

await db.end();
