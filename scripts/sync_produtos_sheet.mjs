/**
 * Sincroniza produtos do banco para a nova planilha Google Sheets
 * - Lê produtos existentes na planilha
 * - Identifica os que faltam (por CODIGO)
 * - Prepara os dados para inserção
 * - Usa Google Sheets API com OAuth (browser) para escrever
 */
import mysql from 'mysql2/promise';
import { config } from 'dotenv';
import { writeFileSync } from 'fs';

config();

const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
const NEW_SHEET_ID = '1SGUr5Sh2gZ5nkYg0km-QhllQS4Jm2_aVxy6PuyATsLU';

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  // 1. Buscar todos os produtos do banco
  console.log('Buscando produtos do banco...');
  const [dbRows] = await conn.execute(`
    SELECT codigo, linha, modelo, time, descricao, tamanho, tipo, estoque, precoAtacado, precoVarejo, isActive
    FROM pdv_products
    ORDER BY time, tamanho
  `);
  console.log(`Banco: ${dbRows.length} produtos`);
  
  // 2. Buscar produtos existentes na planilha
  console.log('Buscando produtos da planilha...');
  const sheetUrl = `https://sheets.googleapis.com/v4/spreadsheets/${NEW_SHEET_ID}/values/PRODUTOS!A2:A2000?key=${apiKey}`;
  const sheetRes = await fetch(sheetUrl);
  const sheetData = await sheetRes.json();
  const existingCodes = new Set((sheetData.values || []).map(r => r[0]));
  console.log(`Planilha: ${existingCodes.size} produtos existentes`);
  
  // 3. Identificar faltantes
  const missing = dbRows.filter(r => !existingCodes.has(r.codigo));
  console.log(`Faltando: ${missing.length} produtos`);
  
  // 4. Preparar dados para inserção
  const newRows = missing.map(r => [
    r.codigo || '',
    r.linha || '',
    r.modelo || '',
    r.time || '',
    r.descricao || '',
    r.tamanho || '',
    r.tipo || '',
    String(r.estoque ?? 0),
    String(r.precoAtacado ? parseFloat(r.precoAtacado) : 0),
    String(r.precoVarejo ? parseFloat(r.precoVarejo) : 0),
    r.isActive ? 'SIM' : 'NÃO',
    '',  // FOTO
    '',  // TEMPORADA
    String(r.precoAtacado ? parseFloat(r.precoAtacado) : 0),  // PT ATAC
    String(r.precoVarejo ? parseFloat(r.precoVarejo) : 0),    // PT VAR
  ]);
  
  // 5. Salvar JSON com os dados para inserção via API
  const payload = {
    range: `PRODUTOS!A${existingCodes.size + 2}`,
    majorDimension: 'ROWS',
    values: newRows
  };
  
  writeFileSync('/home/ubuntu/missing_products.json', JSON.stringify(payload, null, 2));
  console.log(`\nJSON salvo: /home/ubuntu/missing_products.json`);
  console.log(`Pronto para inserir ${newRows.length} produtos na planilha`);
  
  // 6. Também gerar CSV dos faltantes para referência
  const header = 'CODIGO,LINHA,MODELO,TIME,DESCRIÇÃO,TAM,TIPO,QTD,ATC,VAR,ATIVO,FOTO,TEMPORADA,PT ATAC,PT VAR';
  const csvRows = newRows.map(r => r.map(v => v.includes(',') ? `"${v}"` : v).join(','));
  writeFileSync('/home/ubuntu/missing_products.csv', [header, ...csvRows].join('\n'), 'utf8');
  console.log(`CSV salvo: /home/ubuntu/missing_products.csv`);
  
  // Mostrar amostra dos primeiros 3 faltantes
  console.log('\nPrimeiros 3 produtos faltantes:');
  missing.slice(0, 3).forEach(r => console.log(`  ${r.codigo} - ${r.time} ${r.tamanho}`));
  
  await conn.end();
  return { missing: newRows.length, existing: existingCodes.size };
}

main().then(r => {
  console.log(`\n✅ Análise concluída: ${r.existing} existentes, ${r.missing} para adicionar`);
}).catch(console.error);
