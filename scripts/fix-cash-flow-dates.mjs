// Corrige createdAt do fluxo de caixa lendo direto da planilha (formato BR)
import mysql from 'mysql2/promise';

const SHEET_ID = '1SGUr5Sh2gZ5nkYg0km-QhllQS4Jm2_aVxy6PuyATsLU';
const API_KEY = process.env.GOOGLE_SHEETS_API_KEY;
const apply = process.argv.includes('--apply');

const url = new URL(process.env.DATABASE_URL);
const db = await mysql.createConnection({
  host: url.hostname, port: Number(url.port), user: url.username, password: url.password,
  database: url.pathname.slice(1), ssl: { rejectUnauthorized: false },
  timezone: 'Z',  // grava Dates JS como UTC literal
});

// ── Lê planilha ──
console.log('Lendo planilha FLUXO_CAIXA…');
const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/FLUXO_CAIXA!A2:G5000?key=${API_KEY}`);
const j = await r.json();
const rows = (j.values || []).filter(r => (r[0] || '').toString().trim());
console.log(`  ${rows.length} linhas na planilha`);

// Formato: ID | DATA | TIPO | DESCRIÇÃO | VALOR | RESPONSÁVEL | SALDO
// Data: "02/05/2026, 08:51:14"  ou  "30/04/2026, 18:52:12"
function parseBrDate(s) {
  if (!s) return null;
  const t = String(s).trim();
  const m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const [, d, mo, y, h, mi, se = '0'] = m;
  // Cria como UTC equivalente de hora BR (BR + 3h = UTC)
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h) + 3, Number(mi), Number(se)));
}

// ── Lê banco ──
const [bd] = await db.execute(`SELECT id, tipo, descricao, valor, usuario, createdAt FROM pdv_cash_flow ORDER BY id`);
console.log(`  ${bd.length} registros no banco`);

// ── Casa por (descricao, valor) ──
const planMap = new Map(); // key: descricao||valor → { dt, sheetId, row }
for (const row of rows) {
  const sheetId = (row[0] || '').toString().trim();
  const dataStr = (row[1] || '').toString().trim();
  const tipo = (row[2] || '').toString().trim().toUpperCase();
  const desc = (row[3] || '').toString().trim();
  const valor = Math.abs(parseFloat(String(row[4] || '0').replace(',', '.'))) || 0;
  const dt = parseBrDate(dataStr);
  const key = `${desc}||${valor.toFixed(2)}||${tipo}`;
  if (!planMap.has(key)) planMap.set(key, { sheetId, dt, dataStr, tipo, desc, valor });
}

console.log('\n── Comparação banco vs planilha ──\n');
const fixes = [];
for (const b of bd) {
  const key = `${b.descricao}||${Number(b.valor).toFixed(2)}||${b.tipo}`;
  const p = planMap.get(key);
  if (!p) {
    console.log(`  [id=${b.id}] SEM MATCH na planilha: "${b.descricao}" R$ ${b.valor}`);
    continue;
  }
  const atual = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
  const esperado = p.dt;
  if (!esperado) {
    console.log(`  [id=${b.id}] planilha data inválida: "${p.dataStr}"`);
    continue;
  }
  const diff = Math.abs(atual.getTime() - esperado.getTime());
  if (diff > 60_000) {
    fixes.push({ id: b.id, atual, esperado, desc: b.descricao });
    console.log(`  [id=${b.id}] "${b.descricao.slice(0, 35).padEnd(35)}"  banco=${atual.toISOString()}  planilha=${esperado.toISOString()}`);
  }
}

console.log(`\n${fixes.length} registros precisam de correção`);

if (!apply) {
  console.log('\n(dry-run — passe --apply para gravar)');
  await db.end();
  process.exit(0);
}

console.log('\n── Aplicando ──');
for (const f of fixes) {
  await db.execute(`UPDATE pdv_cash_flow SET createdAt = ? WHERE id = ?`, [f.esperado, f.id]);
}
console.log(`  ✓ ${fixes.length} registros atualizados`);

console.log('\n── Estado após o fix ──');
const [r2] = await db.execute(`
  SELECT id, tipo, valor, descricao,
    DATE_FORMAT(CONVERT_TZ(createdAt, '+00:00', '-03:00'), '%d/%m/%Y %H:%i') dt_br
  FROM pdv_cash_flow ORDER BY createdAt DESC LIMIT 10
`);
for (const r of r2) {
  console.log(`  [${String(r.id).padStart(3)}] ${r.tipo.padEnd(11)} ${r.dt_br}  R$${String(Number(r.valor).toFixed(2)).padStart(9)}  ${r.descricao}`);
}

await db.end();
