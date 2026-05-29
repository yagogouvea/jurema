// Lista todas as abas da planilha + procura por aba de pontos
const SHEET_ID = '1SGUr5Sh2gZ5nkYg0km-QhllQS4Jm2_aVxy6PuyATsLU';
const API_KEY = process.env.GOOGLE_SHEETS_API_KEY;

const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties&key=${API_KEY}`);
const j = await r.json();

console.log('═══ Abas da planilha ═══\n');
for (const s of j.sheets || []) {
  const p = s.properties;
  console.log(`  ${p.title.padEnd(40)} (id=${p.sheetId}, rows=${p.gridProperties?.rowCount || '?'}, cols=${p.gridProperties?.columnCount || '?'})`);
}
