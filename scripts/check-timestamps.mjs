// Verifica os timestamps dos pedidos recentes no banco vs planilha
import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;
const SHEET_ID = '1SGUr5Sh2gZ5nkYg0km-QhllQS4Jm2_aVxy6PuyATsLU';
const API_KEY = process.env.GOOGLE_SHEETS_API_KEY;

const url = new URL(DATABASE_URL);
const db = await mysql.createConnection({
  host: url.hostname,
  port: Number(url.port),
  user: url.username,
  password: url.password,
  database: url.pathname.slice(1),
  ssl: { rejectUnauthorized: false },
});

// 1) Timezone do servidor MySQL
const [tz] = await db.execute("SELECT @@global.time_zone gtz, @@session.time_zone stz, NOW() now_srv, UTC_TIMESTAMP() utc_srv");
console.log('═══ TIMEZONE DO SERVIDOR MYSQL ═══');
console.log(`global tz: ${tz[0].gtz}  session tz: ${tz[0].stz}`);
console.log(`NOW() (server local): ${tz[0].now_srv}`);
console.log(`UTC_TIMESTAMP():      ${tz[0].utc_srv}`);
console.log('');

// 2) Pedidos recentes — comparando 3 representações
const [recent] = await db.execute(`
  SELECT pedidoId,
         createdAt                                    AS raw_created_at,
         DATE_FORMAT(createdAt, '%d/%m/%y %H:%i')     AS as_stored,
         DATE_FORMAT(CONVERT_TZ(createdAt, '+00:00', '-03:00'), '%d/%m/%y %H:%i') AS minus_3h
  FROM pdv_orders
  ORDER BY createdAt DESC
  LIMIT 15
`);

console.log('═══ PEDIDOS NO BANCO ═══');
console.log('pedidoId         | raw createdAt        | exibido (UTC)   | -3h (BR)        ');
console.log('─────────────────|──────────────────────|─────────────────|─────────────────');
for (const r of recent) {
  console.log(`${r.pedidoId.padEnd(16)} | ${String(r.raw_created_at).padEnd(20)} | ${String(r.as_stored).padEnd(15)} | ${r.minus_3h}`);
}
console.log('');

// 3) Mesmas linhas na planilha PEDIDOS
const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/PEDIDOS!A2:C5000?key=${API_KEY}`);
const j = await r.json();
const sheetRows = j.values || [];
const sheetMap = new Map();
for (const row of sheetRows) {
  const pid = (row[0] || '').toString().trim();
  if (pid) sheetMap.set(pid, row[1] || '');
}

console.log('═══ CRUZAMENTO COM PLANILHA ═══');
console.log('pedidoId         | planilha             | banco (raw UTC)      | banco -3h       ');
console.log('─────────────────|──────────────────────|──────────────────────|─────────────────');
for (const r of recent) {
  const planilha = sheetMap.get(r.pedidoId) || '(não encontrado)';
  console.log(`${r.pedidoId.padEnd(16)} | ${String(planilha).padEnd(20)} | ${String(r.raw_created_at).padEnd(20)} | ${r.minus_3h}`);
}

await db.end();
