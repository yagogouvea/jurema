/**
 * Lê o cabeçalho e as primeiras 5 linhas da planilha PRODUTOS
 */
import { readFileSync } from 'fs';

// Carregar variáveis de ambiente do processo (injetadas pelo servidor)
const API_KEY = process.env.GOOGLE_SHEETS_API_KEY;
const SHEET_ID = '1SGUr5Sh2gZ5nkYg0km-QhllQS4Jm2_aVxy6PuyATsLU';

if (!API_KEY) { console.error('GOOGLE_SHEETS_API_KEY não encontrada'); process.exit(1); }

const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent('PRODUTOS!A:O')}?key=${API_KEY}`;
const res = await fetch(url);
const data = await res.json();

if (!data.values) { console.log('Erro:', JSON.stringify(data)); process.exit(1); }

const rows = data.values;
console.log(`Total de linhas: ${rows.length}`);
console.log('\nCABEÇALHO:');
rows[0].forEach((col, i) => {
  const letter = i < 26 ? String.fromCharCode(65 + i) : 'A' + String.fromCharCode(65 + i - 26);
  console.log(`  ${letter} (${i}): "${col}"`);
});

console.log('\nPRIMEIRAS 3 LINHAS DE DADOS:');
for (let i = 1; i <= Math.min(3, rows.length - 1); i++) {
  console.log(`\nLinha ${i + 1}:`);
  rows[i].forEach((val, j) => {
    if (val) console.log(`  ${rows[0][j] || j}: "${val}"`);
  });
}
