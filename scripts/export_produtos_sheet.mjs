/**
 * Exporta todos os produtos do banco no formato exato da aba PRODUTOS da planilha
 * Colunas: CODIGO, LINHA, MODELO, TIME, DESCRIÇÃO, TAM, TIPO, QTD, ATC, VAR, ATIVO, FOTO, TEMPORADA, PT ATAC, PT VAR
 */
import mysql from 'mysql2/promise';
import { config } from 'dotenv';
import { writeFileSync } from 'fs';

config();

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  console.log('Buscando todos os produtos do banco...');
  const [rows] = await conn.execute(`
    SELECT 
      codigo,
      linha,
      modelo,
      time,
      descricao,
      tamanho,
      tipo,
      estoque,
      precoAtacado,
      precoVarejo,
      isActive
    FROM pdv_products
    ORDER BY time, tamanho
  `);
  
  console.log(`Total de produtos: ${rows.length}`);
  
  // Montar cabeçalho exato da planilha original
  const header = ['CODIGO', 'LINHA', 'MODELO', 'TIME', 'DESCRIÇÃO', 'TAM', 'TIPO', 'QTD', 'ATC', 'VAR', 'ATIVO', 'FOTO', 'TEMPORADA', 'PT ATAC', 'PT VAR'];
  
  // Montar linhas de dados
  const dataRows = rows.map(r => [
    r.codigo || '',
    r.linha || '',
    r.modelo || '',
    r.time || '',
    r.descricao || '',
    r.tamanho || '',
    r.tipo || '',
    r.estoque ?? 0,
    r.precoAtacado ? parseFloat(r.precoAtacado) : 0,
    r.precoVarejo ? parseFloat(r.precoVarejo) : 0,
    r.isActive ? 'SIM' : 'NÃO',
    '',  // FOTO (vazio)
    '',  // TEMPORADA (vazio)
    r.precoAtacado ? parseFloat(r.precoAtacado) : 0,  // PT ATAC (mesmo que ATC)
    r.precoVarejo ? parseFloat(r.precoVarejo) : 0,    // PT VAR (mesmo que VAR)
  ]);
  
  // Gerar CSV
  const escapeCSV = (val) => {
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  
  const csvLines = [header, ...dataRows].map(row => row.map(escapeCSV).join(','));
  const csv = csvLines.join('\n');
  
  writeFileSync('/home/ubuntu/produtos_export.csv', csv, 'utf8');
  console.log(`CSV exportado: /home/ubuntu/produtos_export.csv`);
  console.log(`Linhas: ${dataRows.length} produtos + 1 cabeçalho`);
  
  // Também gerar JSON para uso via API
  const jsonData = {
    range: 'PRODUTOS!A1',
    majorDimension: 'ROWS',
    values: [header, ...dataRows.map(r => r.map(String))]
  };
  
  writeFileSync('/home/ubuntu/produtos_export.json', JSON.stringify(jsonData, null, 2), 'utf8');
  console.log(`JSON exportado: /home/ubuntu/produtos_export.json`);
  
  // Estatísticas
  const ativos = rows.filter(r => r.isActive).length;
  const inativos = rows.filter(r => !r.isActive).length;
  const comEstoque = rows.filter(r => r.estoque > 0).length;
  console.log(`\nEstatísticas:`);
  console.log(`  Ativos: ${ativos}`);
  console.log(`  Inativos: ${inativos}`);
  console.log(`  Com estoque > 0: ${comEstoque}`);
  
  await conn.end();
}

main().catch(console.error);
