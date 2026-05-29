// Compara fluxo de caixa: Banco Railway vs Planilha FLUXO_CAIXA
import mysql from 'mysql2/promise';

const SHEET_ID = '1SGUr5Sh2gZ5nkYg0km-QhllQS4Jm2_aVxy6PuyATsLU';
const API_KEY = process.env.GOOGLE_SHEETS_API_KEY;

const url = new URL(process.env.DATABASE_URL);
const db = await mysql.createConnection({
  host: url.hostname, port: Number(url.port), user: url.username, password: url.password,
  database: url.pathname.slice(1), ssl: { rejectUnauthorized: false },
});

// ── 1) BANCO ──
console.log('═══ 1) FLUXO DE CAIXA — Banco Railway ═══\n');
const [bd] = await db.execute(`
  SELECT id, tipo, descricao, valor, usuario,
    DATE_FORMAT(CONVERT_TZ(createdAt, '+00:00', '-03:00'), '%d/%m/%Y %H:%i') dt_br
  FROM pdv_cash_flow
  ORDER BY createdAt DESC
`);
console.log(`Total no banco: ${bd.length}\n`);
for (const r of bd) {
  console.log(`  [${String(r.id).padStart(3)}] ${r.tipo.padEnd(11)} ${r.dt_br}  R$${String(Number(r.valor).toFixed(2)).padStart(9)}  ${r.descricao.padEnd(40)}  (${r.usuario || '-'})`);
}

// ── 2) PLANILHA ──
console.log('\n═══ 2) FLUXO DE CAIXA — Planilha FLUXO_CAIXA ═══\n');
const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/FLUXO_CAIXA!A1:G5000?key=${API_KEY}`);
const j = await r.json();
const header = (j.values || [])[0] || [];
const rows = (j.values || []).slice(1).filter(r => (r[0] || '').toString().trim());
console.log(`Header: ${header.join(' | ')}`);
console.log(`Total na planilha: ${rows.length}\n`);
for (const row of rows.slice(0, 30)) {
  console.log(`  ${(row[0] || '').padEnd(20)}  ${(row[1] || '').padEnd(12)}  ${String(row[2] || '').slice(0, 40).padEnd(40)}  ${(row[3] || '').padEnd(10)}  ${(row[4] || '').padEnd(10)}  ${(row[5] || '').padEnd(10)}`);
}
if (rows.length > 30) console.log(`  ... + ${rows.length - 30} linhas`);

console.log('\n═══ 3) Resumo ═══\n');
const totBancoSup = bd.filter(r => r.tipo === 'SUPRIMENTO').reduce((s, r) => s + Number(r.valor), 0);
const totBancoSan = bd.filter(r => r.tipo === 'SANGRIA').reduce((s, r) => s + Number(r.valor), 0);
console.log(`  Banco:    SUPRIMENTO=R$ ${totBancoSup.toFixed(2)}  SANGRIA=R$ ${totBancoSan.toFixed(2)}  Saldo=R$ ${(totBancoSup - totBancoSan).toFixed(2)}`);

await db.end();
