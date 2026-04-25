import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';

dotenv.config({ path: '/home/ubuntu/jumera-sport/.env' });

const SHEET_ID = '1SGUr5Sh2gZ5nkYg0km-QhllQS4Jm2_aVxy6PuyATsLU';
const SHEET_RANGE = 'PRODUTOS!A:J';
const API_KEY = process.env.GOOGLE_SHEETS_API_KEY;

async function lerPlanilha() {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(SHEET_RANGE)}?key=${API_KEY}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Sheets API error ${resp.status}: ${txt}`);
  }
  const data = await resp.json();
  return data.values || [];
}

async function main() {
  console.log('Conectando ao banco...');
  const db = await mysql.createConnection(process.env.DATABASE_URL);

  const [rows] = await db.execute('SELECT codigo FROM pdv_products');
  const codigosNoBanco = new Set(rows.filter(r => r.codigo).map(r => r.codigo.toUpperCase().trim()));
  console.log(`Banco: ${codigosNoBanco.size} produtos cadastrados\n`);

  console.log('Lendo planilha...');
  const allRows = await lerPlanilha();
  const dataRows = allRows.slice(1); // remove cabeçalho
  console.log(`Planilha: ${dataRows.length} linhas de dados`);

  // Últimas 195 linhas
  const ultimas = dataRows.slice(-195);
  console.log(`\nAnalisando as últimas 195 linhas...\n`);

  const ausentes = [];
  const semCodigo = [];
  let presentes = 0;

  for (const row of ultimas) {
    const codigo = (row[0] || '').toString().trim().toUpperCase();
    const linha  = (row[1] || '').toString().trim();
    const modelo = (row[2] || '').toString().trim();
    const time   = (row[3] || '').toString().trim();
    const desc   = (row[4] || '').toString().trim();
    const tam    = (row[5] || '').toString().trim();

    if (!codigo) {
      semCodigo.push({ linha, modelo, time, desc, tam });
      continue;
    }

    if (codigosNoBanco.has(codigo)) {
      presentes++;
    } else {
      ausentes.push({ codigo, linha, modelo, time, desc, tam });
    }
  }

  console.log(`✅ Presentes no banco: ${presentes}`);
  console.log(`⚠️  Sem código na planilha: ${semCodigo.length}`);
  console.log(`❌ AUSENTES no banco: ${ausentes.length}`);

  if (semCodigo.length > 0) {
    console.log('\n--- Linhas sem código (precisam ser gerados) ---');
    semCodigo.slice(0, 10).forEach(p => {
      console.log(`  ${p.linha} | ${p.modelo} | ${p.time} | ${p.desc} | ${p.tam}`);
    });
    if (semCodigo.length > 10) console.log(`  ... e mais ${semCodigo.length - 10}`);
  }

  if (ausentes.length > 0) {
    console.log('\n--- Produtos com código mas AUSENTES no banco ---');
    ausentes.forEach(p => {
      console.log(`  ${p.codigo} | ${p.linha} | ${p.modelo} | ${p.time} | ${p.desc} | ${p.tam}`);
    });
  }

  await db.end();
}

main().catch(console.error);
