// Inspeciona a aba pedidos_itens para ver se há coluna de pontos
const SHEET_ID = '1SGUr5Sh2gZ5nkYg0km-QhllQS4Jm2_aVxy6PuyATsLU';
const API_KEY = process.env.GOOGLE_SHEETS_API_KEY;

const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/pedidos_itens!A1:Z5?key=${API_KEY}`);
const j = await r.json();
const header = (j.values || [])[0] || [];
const rows = (j.values || []).slice(1).filter(row => (row[0] || '').toString().trim());

console.log('═══ Cabeçalho de pedidos_itens ═══');
header.forEach((h, i) => console.log(`  [${i}] = "${h}"`));

console.log('\n═══ Primeiras 5 linhas (raw) ═══\n');
for (let i = 0; i < rows.length; i++) {
  console.log(`Linha ${i + 1}:`);
  rows[i].forEach((v, idx) => {
    if (v) console.log(`  [${idx}] ${header[idx] || '?'} = ${v}`);
  });
  console.log('');
}

// Agora também olha SOFIA_ITENS
console.log('═══ Cabeçalho de SOFIA_ITENS ═══');
const r2 = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/SOFIA_ITENS!A1:Z3?key=${API_KEY}`);
const j2 = await r2.json();
const header2 = (j2.values || [])[0] || [];
header2.forEach((h, i) => console.log(`  [${i}] = "${h}"`));
const rows2 = (j2.values || []).slice(1).filter(row => (row[0] || '').toString().trim());
console.log('\n═══ Primeiras 2 linhas de SOFIA_ITENS ═══\n');
for (let i = 0; i < rows2.length; i++) {
  console.log(`Linha ${i + 1}:`);
  rows2[i].forEach((v, idx) => {
    if (v) console.log(`  [${idx}] ${header2[idx] || '?'} = ${v}`);
  });
  console.log('');
}
