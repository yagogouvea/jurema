const SHEET_ID = '1SGUr5Sh2gZ5nkYg0km-QhllQS4Jm2_aVxy6PuyATsLU';
const API_KEY = process.env.GOOGLE_SHEETS_API_KEY;

const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Lucro_produtos!A1:M10?key=${API_KEY}`);
const j = await r.json();
const header = (j.values || [])[0] || [];
console.log('═══ Cabeçalho da aba Lucro_produtos ═══');
header.forEach((h, i) => console.log(`  [${i}] = "${h}"`));

console.log('\n═══ Primeiras 5 linhas ═══\n');
for (let i = 1; i < Math.min(6, j.values.length); i++) {
  const row = j.values[i];
  console.log(`Linha ${i}:`);
  row.forEach((v, idx) => {
    if (v) console.log(`  [${idx}] ${header[idx] || '?'} = ${v}`);
  });
  console.log('');
}

// Pegar uma amostra mais distante para ver dados de maio
console.log('═══ Amostra de linhas mais recentes (10000-10010) ═══\n');
const r2 = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Lucro_produtos!A10000:M10010?key=${API_KEY}`);
const j2 = await r2.json();
for (const row of (j2.values || []).slice(0, 5)) {
  console.log('  ' + (row || []).map((v, i) => `${header[i]}=${v}`).filter(s => !s.endsWith('=')).join(' | '));
}
