import mysql from 'mysql2/promise';

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

console.log('Node TZ        :', process.env.TZ || '(não setado)');
console.log('Node now ISO   :', new Date().toISOString());
console.log('Node now local :', new Date().toString());
console.log('');

// MySQL info
const [info] = await db.execute(`
  SELECT
    @@global.time_zone gtz,
    @@session.time_zone stz,
    @@system_time_zone sys,
    NOW() now_v,
    UTC_TIMESTAMP() utc_v
`);
console.log('MySQL @@global.time_zone:', info[0].gtz);
console.log('MySQL @@session.time_zone:', info[0].stz);
console.log('MySQL @@system_time_zone:', info[0].sys);
console.log('MySQL NOW():', info[0].now_v, ' (devolvido como Date JS:', info[0].now_v instanceof Date ? info[0].now_v.toISOString() : 'string', ')');
console.log('MySQL UTC_TS():', info[0].utc_v, ' (Date JS:', info[0].utc_v instanceof Date ? info[0].utc_v.toISOString() : 'string', ')');
console.log('');

// Pega um pedido específico com várias formas
const [rows] = await db.execute(`
  SELECT
    pedidoId,
    createdAt,
    DATE_FORMAT(createdAt, '%Y-%m-%d %H:%i:%s') as as_text,
    UNIX_TIMESTAMP(createdAt) as epoch_seconds
  FROM pdv_orders
  WHERE pedidoId = 'PED-21890473'
`);
const r = rows[0];
console.log('=== PED-21890473 no banco ===');
console.log('createdAt (Date JS) :', r.createdAt);
console.log('createdAt .toISOString:', r.createdAt instanceof Date ? r.createdAt.toISOString() : '(não é Date)');
console.log('createdAt .getTime  :', r.createdAt instanceof Date ? r.createdAt.getTime() : '-');
console.log('AS_TEXT (sem TZ)    :', r.as_text);
console.log('UNIX_TIMESTAMP      :', r.epoch_seconds, ' → ISO:', new Date(Number(r.epoch_seconds)*1000).toISOString());
console.log('');
console.log('Conclusão:');
console.log('  Se UNIX_TIMESTAMP devolve algo correspondente a 14:51 BR (= 17:51 UTC),');
console.log('  então o banco está realmente armazenando hora BR (correta).');
console.log('  Se devolve correspondente a 11:51 BR (= 14:51 UTC), o banco armazenou errado.');

await db.end();
