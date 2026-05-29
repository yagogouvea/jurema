// Analisa por que os pontos divergem entre Railway e Manus
import mysql from 'mysql2/promise';
const SHEET_ID = '1SGUr5Sh2gZ5nkYg0km-QhllQS4Jm2_aVxy6PuyATsLU';
const API_KEY = process.env.GOOGLE_SHEETS_API_KEY;
const url = new URL(process.env.DATABASE_URL);
const db = await mysql.createConnection({
  host: url.hostname, port: Number(url.port), user: url.username, password: url.password,
  database: url.pathname.slice(1), ssl: { rejectUnauthorized: false },
});

console.log('═══ 1) Diferenças esperadas (Manus − Railway) ═══\n');
console.log('  GABRIEL:  14121 - 11353 = +2768 PT');
console.log('  MURILO:    6845 -  5645 = +1200 PT');
console.log('  FLAVIO:    6493 -  5260 = +1233 PT');
console.log('  VINICIUS:  3975 -  3593 = +382 PT');
console.log('  VANESSA:    390 -   390 = 0 PT  ← Vanessa OK!');
console.log('  TOTAL: +5583 PT a mais no Manus\n');

console.log('═══ 2) Pontos por produto no banco vs planilha PRODUTOS ═══\n');
const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/PRODUTOS!A1:P200?key=${API_KEY}`);
const j = await r.json();
const header = (j.values || [])[0] || [];
const rows = (j.values || []).slice(1).filter(row => (row[0] || '').toString().trim());
console.log('Cabeçalho da planilha PRODUTOS:');
header.forEach((h, i) => console.log(`  [${i}] = "${h}"`));

console.log(`\nTotal de produtos na planilha: ${rows.length}`);

// Cross-check: cada produto, banco vs planilha
const [bd] = await db.execute(`SELECT codigo, descricao, ptAtacado, ptVarejo FROM pdv_products ORDER BY codigo`);
const bdMap = new Map();
for (const p of bd) bdMap.set(p.codigo.trim().toUpperCase(), p);

console.log('\n─── Cross-check (planilha vs banco) ───');
let divergencias = 0;
for (const row of rows) {
  const cod = (row[0] || '').toString().trim().toUpperCase();
  if (!cod) continue;
  const bdProd = bdMap.get(cod);
  if (!bdProd) {
    console.log(`  ${cod.padEnd(28)} (NÃO no banco)`);
    continue;
  }
  // Vou checar cada coluna possível de pontos
  // header tem: A=codigo, B=linha, C=modelo, D=time, E=descricao, F=tamanho, G=tipo, H=estoque,
  //              I=atacado, J=varejo, K=ptAtacado, L=ptVarejo, ...
}

// Mostra primeiras linhas em detalhe
console.log('\n─── Primeiras 5 linhas da planilha (raw) ───');
for (let i = 0; i < Math.min(5, rows.length); i++) {
  console.log(`Linha ${i+1}:`);
  rows[i].forEach((v, idx) => {
    if (v) console.log(`  [${idx}] ${header[idx] || '?'} = ${v}`);
  });
  console.log('');
}

await db.end();
