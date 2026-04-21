/**
 * Script para adicionar o cabeçalho VENDEDOR na coluna N da aba pedidos_itens
 * da planilha Google Sheets do Jumera Sport.
 *
 * Uso: node scripts/add-vendedor-column-pedidos-itens.mjs
 */

import { createSign } from 'crypto';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SHEET_ID = '1SGUr5Sh2gZ5nkYg0km-QhllQS4Jm2_aVxy6PuyATsLU';
const ITEMS_SHEET = 'pedidos_itens';

// Tenta carregar o service account do .env ou de variável de ambiente
async function getServiceAccountToken() {
  let raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  
  if (!raw) {
    // Tenta carregar do .env
    try {
      const envPath = join(__dirname, '..', '.env');
      const envContent = readFileSync(envPath, 'utf8');
      const match = envContent.match(/GOOGLE_SERVICE_ACCOUNT_JSON=(.+)/);
      if (match) {
        raw = match[1].replace(/^['"]|['"]$/g, '');
      }
    } catch {}
  }
  
  if (!raw) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON não encontrado. Defina a variável de ambiente ou coloque no .env');
  }

  const sa = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);
  
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  })).toString('base64url');
  
  const signingInput = `${header}.${payload}`;
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  const signature = sign.sign(sa.private_key, 'base64url');
  const jwt = `${signingInput}.${signature}`;
  
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  
  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Falha ao obter token: ${err}`);
  }
  
  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

async function getSheetInfo(token) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets(properties(sheetId,title))`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  
  if (!res.ok) throw new Error(`Erro ao buscar info da planilha: ${await res.text()}`);
  const data = await res.json();
  return data.sheets;
}

async function readHeader(token) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(ITEMS_SHEET + '!A1:P1')}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  
  if (!res.ok) throw new Error(`Erro ao ler cabeçalho: ${await res.text()}`);
  const data = await res.json();
  return data.values?.[0] || [];
}

async function updateHeader(token, headers) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(ITEMS_SHEET + '!A1')}?valueInputOption=RAW`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range: `${ITEMS_SHEET}!A1`,
        majorDimension: 'ROWS',
        values: [headers],
      }),
    }
  );
  
  if (!res.ok) throw new Error(`Erro ao atualizar cabeçalho: ${await res.text()}`);
  return await res.json();
}

async function main() {
  console.log('🔑 Obtendo token de autenticação...');
  const token = await getServiceAccountToken();
  console.log('✅ Token obtido com sucesso');
  
  console.log(`\n📋 Lendo cabeçalho da aba "${ITEMS_SHEET}"...`);
  const currentHeader = await readHeader(token);
  console.log('Cabeçalho atual:', currentHeader);
  
  // Verificar se a coluna N (índice 13) já existe
  if (currentHeader.length >= 14 && currentHeader[13] === 'VENDEDOR') {
    console.log('\n✅ Coluna VENDEDOR já existe na posição N (índice 13). Nada a fazer.');
    return;
  }
  
  // Construir novo cabeçalho com VENDEDOR na posição N
  const expectedHeaders = [
    'pedido_id',      // A
    'cod',            // B
    'produto',        // C
    'quantidade',     // D
    'preco_atacado',  // E
    'preco_varejo',   // F
    'subtotal_atacado', // G
    'subtotal_varejo',  // H
    'modalidade',     // I
    'servico_extra',  // J
    'valor_servico',  // K
    'TOTAL',          // L
    'comissao',       // M
    'VENDEDOR',       // N
  ];
  
  // Preservar colunas existentes além das esperadas
  const newHeader = [...expectedHeaders];
  if (currentHeader.length > 14) {
    for (let i = 14; i < currentHeader.length; i++) {
      newHeader.push(currentHeader[i]);
    }
  }
  
  console.log('\n📝 Novo cabeçalho a ser gravado:', newHeader);
  console.log('\n⚠️  Atualizando cabeçalho na planilha...');
  
  const result = await updateHeader(token, newHeader);
  console.log('✅ Cabeçalho atualizado com sucesso!');
  console.log('   Células atualizadas:', result.updatedCells);
  
  console.log('\n🎉 Coluna VENDEDOR adicionada com sucesso na coluna N da aba pedidos_itens!');
  console.log('   Novos pedidos já incluirão o nome do vendedor automaticamente.');
}

main().catch(err => {
  console.error('\n❌ Erro:', err.message);
  process.exit(1);
});
