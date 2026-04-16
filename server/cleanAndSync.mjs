/**
 * cleanAndSync.mjs
 * 1. Deleta todos os pedidos do banco (sem afetar estoque)
 * 2. Sincroniza estoque do banco com a planilha PRODUTOS (coluna H = QTD)
 *
 * Uso: node server/cleanAndSync.mjs
 */
import { createSign } from 'crypto';
import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';

// ─── Carregar .env ────────────────────────────────────────────────────────────
function loadEnv() {
  const vars = {};
  try {
    const content = readFileSync('/home/ubuntu/jumera-sport/.env', 'utf8');
    for (const line of content.split('\n')) {
      const m = line.match(/^([^=]+)=(.*)$/);
      if (m) vars[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {}
  return vars;
}

const env = loadEnv();
const get = (k) => process.env[k] || env[k] || '';

const DATABASE_URL = get('DATABASE_URL');
const SA_JSON = get('GOOGLE_SERVICE_ACCOUNT_JSON');
const API_KEY = get('GOOGLE_SHEETS_API_KEY');
const SHEET_ID = '1SGUr5Sh2gZ5nkYg0km-QhllQS4Jm2_aVxy6PuyATsLU';

if (!DATABASE_URL) { console.error('DATABASE_URL não encontrada'); process.exit(1); }

// ─── Google Sheets: ler planilha PRODUTOS ─────────────────────────────────────
async function readProductsSheet() {
  // Tentar API key primeiro
  if (API_KEY) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent('PRODUTOS!A:H')}?key=${API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.values) return data.values;
  }

  // Fallback: Service Account
  if (!SA_JSON) throw new Error('Nenhuma credencial do Google disponível');
  const sa = JSON.parse(SA_JSON);
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600, iat: now,
  })).toString('base64url');
  const signingInput = `${header}.${payload}`;
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  const signature = sign.sign(sa.private_key, 'base64url');
  const jwt = `${signingInput}.${signature}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const { access_token } = await tokenRes.json();

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent('PRODUTOS!A:H')}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${access_token}` } });
  const data = await res.json();
  return data.values || [];
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const conn = await mysql.createConnection(DATABASE_URL);

try {
  console.log('\n=== FASE 1: Limpeza de pedidos ===\n');

  // Contar antes
  const [[{ total: totalPedidos }]] = await conn.execute('SELECT COUNT(*) as total FROM pdv_orders');
  const [[{ total: totalItens }]] = await conn.execute('SELECT COUNT(*) as total FROM pdv_order_items');
  const [[{ total: totalPagamentos }]] = await conn.execute('SELECT COUNT(*) as total FROM pdv_order_payments');
  const [[{ total: totalServicos }]] = await conn.execute('SELECT COUNT(*) as total FROM pdv_order_services');

  console.log(`Pedidos encontrados: ${totalPedidos}`);
  console.log(`Itens encontrados: ${totalItens}`);
  console.log(`Pagamentos encontrados: ${totalPagamentos}`);
  console.log(`Serviços encontrados: ${totalServicos}`);

  if (totalPedidos === 0) {
    console.log('\nNenhum pedido para deletar.');
  } else {
    // Deletar na ordem correta (filhos antes dos pais)
    await conn.execute('DELETE FROM pdv_order_services');
    await conn.execute('DELETE FROM pdv_order_payments');
    await conn.execute('DELETE FROM pdv_order_items');
    await conn.execute('DELETE FROM pdv_orders');
    console.log(`\n✓ ${totalPedidos} pedidos deletados (sem afetar estoque)`);
    console.log(`✓ ${totalItens} itens deletados`);
    console.log(`✓ ${totalPagamentos} pagamentos deletados`);
    console.log(`✓ ${totalServicos} serviços deletados`);
  }

  console.log('\n=== FASE 2: Sincronização de estoque ===\n');

  // Ler planilha
  console.log('Lendo planilha PRODUTOS...');
  const rows = await readProductsSheet();

  if (rows.length < 2) {
    console.log('Planilha vazia ou sem dados.');
    process.exit(0);
  }

  // Cabeçalho: A=CODIGO, B=TIME, C=LINHA, D=TAMANHO, E=PRECO_VAREJO, F=PRECO_ATACADO, G=PRECO_CUSTO, H=QTD
  const header = rows[0];
  console.log('Colunas da planilha:', header.join(' | '));

  // Encontrar índices das colunas
  const codigoIdx = header.findIndex(h => h?.toString().toUpperCase().includes('CODIGO') || h?.toString().toUpperCase() === 'COD');
  const qtdIdx = header.findIndex(h => h?.toString().toUpperCase().includes('QTD') || h?.toString().toUpperCase() === 'ESTOQUE');

  if (codigoIdx === -1 || qtdIdx === -1) {
    console.error(`Não encontrei as colunas esperadas. Colunas: ${header.join(', ')}`);
    console.log('Usando posições padrão: A=CODIGO (0), H=QTD (7)');
  }

  const codCol = codigoIdx >= 0 ? codigoIdx : 0;
  const qtdCol = qtdIdx >= 0 ? qtdIdx : 7;

  console.log(`Usando coluna ${codCol} para CODIGO e coluna ${qtdCol} para QTD\n`);

  let atualizados = 0;
  let naoEncontrados = 0;
  let semCodigo = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const codigo = row[codCol]?.toString().trim();
    const qtdRaw = row[qtdCol]?.toString().trim().replace(',', '.');
    const qtd = parseFloat(qtdRaw);

    if (!codigo) { semCodigo++; continue; }
    if (isNaN(qtd)) continue; // linha sem quantidade

    // Atualizar estoque no banco
    const [result] = await conn.execute(
      'UPDATE pdv_products SET estoque = ? WHERE codigo = ?',
      [qtd, codigo]
    );

    if (result.affectedRows > 0) {
      atualizados++;
      if (atualizados <= 10) console.log(`  ✓ ${codigo} → estoque = ${qtd}`);
      if (atualizados === 11) console.log('  ... (mostrando apenas os primeiros 10)');
    } else {
      naoEncontrados++;
      if (naoEncontrados <= 5) console.log(`  ⚠ Código não encontrado no banco: ${codigo}`);
      if (naoEncontrados === 6) console.log('  ... (omitindo demais não encontrados)');
    }
  }

  console.log(`\n=== RESULTADO ===`);
  console.log(`✓ ${atualizados} produtos com estoque atualizado`);
  if (naoEncontrados > 0) console.log(`⚠ ${naoEncontrados} códigos da planilha não encontrados no banco`);
  if (semCodigo > 0) console.log(`ℹ ${semCodigo} linhas sem código ignoradas`);

  // Verificar totais finais
  const [[{ total: pedidosRestantes }]] = await conn.execute('SELECT COUNT(*) as total FROM pdv_orders');
  const [[{ totalProd }]] = await conn.execute('SELECT COUNT(*) as totalProd FROM pdv_products');
  console.log(`\nBanco de dados: ${pedidosRestantes} pedidos, ${totalProd} produtos`);

} finally {
  await conn.end();
}
