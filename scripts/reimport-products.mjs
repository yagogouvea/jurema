/**
 * Reimportação do catálogo PDV a partir da planilha PDVJUREMA5.0.xlsx
 * Fonte primária: aba "PRODUTOS VISUAL" (tem SKU, descrição, estoque, preços)
 * Fonte secundária: aba "ESTOQUE ESTATICO" (itens sem código mas com dados completos)
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');
const XLSX = require('xlsx');
const path = require('path');

const PLANILHA = '/home/ubuntu/upload/PDVJUREMA5.0.xlsx';

async function main() {
  const db = await mysql.createConnection(process.env.DATABASE_URL);
  console.log('✅ Conectado ao banco de dados');

  // Carregar planilha
  const wb = XLSX.readFile(PLANILHA, { cellDates: true });
  
  // ── FASE 1: PRODUTOS VISUAL ──────────────────────────────────────────────
  const ws1 = wb.Sheets['PRODUTOS VISUAL'];
  const rows1 = XLSX.utils.sheet_to_json(ws1, { header: 1, defval: null });
  // Header: CODIGO, LINHA, MODELO, TIME, DESCRIÇÃO, TAM, TIPO, QTD, ATC, VAR, ATIVO, FOTO, TEMPORADA
  const products = [];
  const seen = new Set();

  for (let i = 1; i < rows1.length; i++) {
    const r = rows1[i];
    if (!r[0] || !r[1] || !r[3]) continue; // precisa de codigo, linha, time
    const atacado = parseFloat(r[8]) || 0;
    const varejo = parseFloat(r[9]) || 0;
    if (atacado <= 0 && varejo <= 0) continue; // sem preço, pula
    const ativo = String(r[10] || '').toUpperCase() === 'SIM';
    const key = String(r[0]).trim();
    if (seen.has(key)) continue; // evita duplicatas pelo código
    seen.add(key);

    const linhaMapPV = { 'TAILANDESA': 'TAILANDESA', 'NACIONAL': 'NACIONAL', 'TORCEDOR': 'TORCEDOR', 'PECA': 'PECA', 'BONÉ': 'TAILANDESA', 'BONE': 'TAILANDESA' };
    const modeloMapPV = { 'TORCEDOR': 'TORCEDOR', 'JOGADOR': 'JOGADOR', 'TAILANDESA': 'TAILANDESA', 'VENDEDOR': 'VENDEDOR' };
    const linhaValPV = linhaMapPV[String(r[1]||'').trim().toUpperCase()] || 'TAILANDESA';
    const modeloValPV = modeloMapPV[String(r[2]||'').trim().toUpperCase()] || 'TORCEDOR';
    const tipoValPV = ['CAMISETA','CONJUNTO','OUTRO'].includes(String(r[6]||'').trim().toUpperCase()) ? String(r[6]).trim().toUpperCase() : 'CAMISETA';
    products.push({
      sku: key,
      linha: linhaValPV,
      modelo: modeloValPV,
      time: String(r[3] || '').trim().toUpperCase(),
      descricao: String(r[4] || '').trim(),
      tamanho: String(r[5] || '').trim().toUpperCase(),
      tipo: tipoValPV,
      estoque: parseInt(r[7]) || 0,
      precoAtacado: atacado,
      precoVarejo: varejo > 0 ? varejo : atacado * 1.25,
      ativo,
    });
  }
  console.log(`📦 PRODUTOS VISUAL: ${products.length} produtos válidos`);

  // ── FASE 2: ESTOQUE ESTATICO (complemento) ────────────────────────────────
  const ws2 = wb.Sheets['ESTOQUE ESTATICO'];
  const rows2 = XLSX.utils.sheet_to_json(ws2, { header: 1, defval: null });
  // Header: codigo, linha, modelo, time, descricao, tamanho, tipo, estoque, atacado, varejo, ativo, ...
  let extraCount = 0;
  for (let i = 1; i < rows2.length; i++) {
    const r = rows2[i];
    if (!r[1] || !r[2] || !r[3]) continue;
    const atacado = parseFloat(r[8]) || 0;
    const varejo = parseFloat(r[9]) || 0;
    if (atacado <= 0) continue;
    const ativo = String(r[10] || '').toUpperCase() === 'SIM';
    
    // Mapear linha para enum do banco
    const linhaMap = { 'TAILANDESA': 'TAILANDESA', 'NACIONAL': 'NACIONAL', 'TORCEDOR': 'TORCEDOR', 'PECA': 'PECA', 'BONÉ': 'OUTRO', 'BONE': 'OUTRO' };
    const modeloMap = { 'TORCEDOR': 'TORCEDOR', 'JOGADOR': 'JOGADOR', 'TAILANDESA': 'TAILANDESA', 'VENDEDOR': 'VENDEDOR' };
    const linhaVal = linhaMap[String(r[1]||'').trim().toUpperCase()] || 'TAILANDESA';
    const modeloVal = modeloMap[String(r[2]||'').trim().toUpperCase()] || 'TORCEDOR';
    // Gera um SKU sintético para itens sem código
    const sku = r[0] ? String(r[0]).trim() : 
      `EST-${String(r[1]).substring(0,3)}-${String(r[2]).substring(0,3)}-${String(r[3]).replace(/\s+/g,'').substring(0,6)}-${String(r[5]||'?')}`.toUpperCase();
    
    if (seen.has(sku)) continue;
    seen.add(sku);

    products.push({
      sku,
      linha: linhaVal,
      modelo: modeloVal,
      time: String(r[3] || '').trim().toUpperCase(),
      descricao: String(r[4] || '').trim(),
      tamanho: String(r[5] || '').trim().toUpperCase(),
      tipo: 'CAMISETA',
      estoque: parseInt(r[7]) || 0,
      precoAtacado: atacado,
      precoVarejo: varejo > 0 ? varejo : atacado * 1.25,
      ativo,
    });
    extraCount++;
  }
  console.log(`📦 ESTOQUE ESTATICO (complemento): +${extraCount} produtos adicionais`);
  console.log(`📦 Total a importar: ${products.length} produtos`);

  // ── FASE 3: LIMPAR E REIMPORTAR ───────────────────────────────────────────
  console.log('\n🗑️  Limpando produtos existentes...');
  await db.execute('DELETE FROM pdv_products');
  console.log('✅ Produtos removidos');

  // Inserir em lotes de 200
  const BATCH = 200;
  let inserted = 0;
  for (let i = 0; i < products.length; i += BATCH) {
    const batch = products.slice(i, i + BATCH);
    const placeholders = batch.map(() => '(?,?,?,?,?,?,?,?,?,?,?)').join(',');
    const values = batch.flatMap(p => [
      p.sku, p.linha, p.modelo, p.time, p.descricao, p.tamanho,
      p.tipo, p.estoque, p.precoAtacado, p.precoVarejo,
      p.ativo ? 1 : 0
    ]);
    await db.execute(
      `INSERT INTO pdv_products 
       (codigo, linha, modelo, time, descricao, tamanho, tipo, estoque, precoAtacado, precoVarejo, isActive)
       VALUES ${placeholders}`,
      values
    );
    inserted += batch.length;
    process.stdout.write(`\r  Inseridos: ${inserted}/${products.length}`);
  }
  console.log('\n✅ Importação concluída!');

  // ── FASE 4: VALIDAÇÃO ─────────────────────────────────────────────────────
  const [[{ total }]] = await db.execute('SELECT COUNT(*) as total FROM pdv_products');
  const [[{ comEstoque }]] = await db.execute('SELECT COUNT(*) as comEstoque FROM pdv_products WHERE estoque > 0');
  const [[{ linhas }]] = await db.execute('SELECT GROUP_CONCAT(DISTINCT linha ORDER BY linha) as linhas FROM pdv_products');
  const [[{ times }]] = await db.execute('SELECT COUNT(DISTINCT time) as times FROM pdv_products');
  const [[{ minAtc, maxAtc, minVar, maxVar }]] = await db.execute(
    'SELECT MIN(precoAtacado) as minAtc, MAX(precoAtacado) as maxAtc, MIN(precoVarejo) as minVar, MAX(precoVarejo) as maxVar FROM pdv_products WHERE precoAtacado > 0'
  );

  console.log('\n📊 Resumo da importação:');
  console.log(`  Total de produtos: ${total}`);
  console.log(`  Com estoque > 0: ${comEstoque}`);
  console.log(`  Linhas: ${linhas}`);
  console.log(`  Times/seleções: ${times}`);
  console.log(`  Preço atacado: R$ ${minAtc} – R$ ${maxAtc}`);
  console.log(`  Preço varejo: R$ ${minVar} – R$ ${maxVar}`);

  await db.end();
}

main().catch(err => {
  console.error('❌ Erro:', err.message);
  process.exit(1);
});
