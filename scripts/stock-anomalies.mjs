// Detecta produtos com estoque absurdo no banco vs planilha
import mysql from 'mysql2/promise';
const SHEET_ID = '1SGUr5Sh2gZ5nkYg0km-QhllQS4Jm2_aVxy6PuyATsLU';
const API_KEY = process.env.GOOGLE_SHEETS_API_KEY;

const url = new URL(process.env.DATABASE_URL);
const db = await mysql.createConnection({
  host: url.hostname, port: Number(url.port), user: url.username, password: url.password,
  database: url.pathname.slice(1), ssl: { rejectUnauthorized: false },
});

// Produtos com estoque acima de 200 (suspeito)
const [anomalias] = await db.execute(`
  SELECT codigo, descricao, tipo, estoque, isActive
  FROM pdv_products
  WHERE estoque > 200
  ORDER BY estoque DESC
`);

console.log(`═══ Produtos com estoque suspeito (>200) ═══\n`);
console.log(`Total: ${anomalias.length} produtos\n`);
console.log('codigo'.padEnd(35) + 'tipo'.padEnd(18) + 'descricao'.padEnd(50) + 'estoque');
console.log('-'.repeat(120));
for (const p of anomalias) {
  console.log(`${(p.codigo || '').padEnd(35)}${(p.tipo || '').padEnd(18)}${String(p.descricao || '').slice(0, 48).padEnd(50)}${p.estoque}`);
}

// Compara com planilha PRODUTOS
console.log('\n═══ Cruzamento com planilha PRODUTOS ═══\n');
const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/PRODUTOS!A2:O2000?key=${API_KEY}`);
const j = await r.json();
const rows = j.values || [];

const planilhaMap = new Map();
for (const row of rows) {
  const cod = (row[0] || '').toString().trim();
  if (!cod) continue;
  const qtd = parseInt(row[7]) || 0;
  planilhaMap.set(cod, { qtd, descricao: row[4] || '', tipo: row[6] || '' });
}
console.log(`Planilha tem ${planilhaMap.size} produtos\n`);

// Para cada anomalia, mostra o que está na planilha
console.log('codigo'.padEnd(35) + 'banco_estoque'.padEnd(15) + 'planilha_estoque'.padEnd(18) + 'diferença');
console.log('-'.repeat(95));
for (const p of anomalias) {
  const plan = planilhaMap.get(p.codigo);
  const planQtd = plan ? plan.qtd : '(não está na planilha)';
  const delta = plan ? (p.estoque - plan.qtd) : '?';
  console.log(`${(p.codigo || '').padEnd(35)}${String(p.estoque).padEnd(15)}${String(planQtd).padEnd(18)}${delta}`);
}

// Soma total de estoque banco vs planilha
const [bancoTotal] = await db.execute(`SELECT SUM(estoque) t FROM pdv_products WHERE isActive=1`);
const planTotal = [...planilhaMap.values()].reduce((s, p) => s + p.qtd, 0);
console.log(`\n═══ Totais de estoque ═══`);
console.log(`Banco (isActive=1): ${bancoTotal[0].t} peças`);
console.log(`Planilha:           ${planTotal} peças`);

await db.end();
