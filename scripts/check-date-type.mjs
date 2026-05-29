import mysql from 'mysql2/promise';
const url = new URL(process.env.DATABASE_URL);
const db = await mysql.createConnection({
  host: url.hostname, port: Number(url.port), user: url.username, password: url.password,
  database: url.pathname.slice(1), ssl: { rejectUnauthorized: false },
});

const [r] = await db.execute(`
  SELECT DATE(o.createdAt) as dia, COUNT(*) c 
  FROM pdv_orders o 
  WHERE o.status != 'CANCELADO' AND o.isSofia = 0 
    AND DATE(o.createdAt) BETWEEN '2026-05-01' AND '2026-05-11' 
  GROUP BY DATE(o.createdAt) 
  ORDER BY dia 
  LIMIT 3
`);

for (const row of r) {
  console.log('Tipo:', typeof row.dia, '| instanceof Date:', row.dia instanceof Date);
  console.log('Valor bruto:', row.dia);
  console.log('toString():', String(row.dia));
  console.log('Concatenado:', row.dia + 'T00:00:00');
  console.log('new Date(concat):', new Date(row.dia + 'T00:00:00').toString());
  console.log('---');
}

await db.end();
