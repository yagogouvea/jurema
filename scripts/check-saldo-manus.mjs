// Lê a coluna G (SALDO ACUMULADO) da planilha FLUXO_CAIXA
const SHEET_ID = '1SGUr5Sh2gZ5nkYg0km-QhllQS4Jm2_aVxy6PuyATsLU';
const API_KEY = process.env.GOOGLE_SHEETS_API_KEY;

const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/FLUXO_CAIXA!A2:G5000?key=${API_KEY}`);
const j = await r.json();
const rows = (j.values || []).filter(r => (r[0] || '').toString().trim());

console.log(`Total linhas: ${rows.length}\n`);
console.log('Últimas 10 linhas (saldo acumulado):');
console.log('  ID                 DATA                  TIPO        VALOR  SALDO');
console.log('  ----------------------------------------------------------------');
for (const row of rows.slice(-10)) {
  const [id, data, tipo, desc, valor, , saldo] = row;
  console.log(`  ${String(id).padEnd(18)} ${String(data).padEnd(22)} ${String(tipo).padEnd(11)} ${String(valor || '').padStart(7)} ${String(saldo || '').padStart(8)}`);
}

console.log('\nSaldo final (última linha):', rows[rows.length - 1]?.[6] || '(vazio)');

// Soma manual
let sup = 0, san = 0;
for (const row of rows) {
  const tipo = (row[2] || '').toUpperCase();
  const v = Math.abs(parseFloat(String(row[4] || '0').replace(',', '.'))) || 0;
  if (tipo === 'SUPRIMENTO') sup += v;
  else if (tipo === 'SANGRIA') san += v;
}
console.log(`\nSoma manual:  SUP=${sup.toFixed(2)}  SAN=${san.toFixed(2)}  Saldo=${(sup-san).toFixed(2)}`);
