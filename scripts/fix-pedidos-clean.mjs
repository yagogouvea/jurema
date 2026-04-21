/**
 * Corrige a aba PEDIDOS:
 * 1. Lê todos os dados
 * 2. Para cada linha, mantém apenas as primeiras 23 colunas (A-W)
 * 3. Reescreve toda a aba de forma limpa (sem colunas extras)
 */
import { createSign } from 'crypto';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHEET_ID = '1SGUr5Sh2gZ5nkYg0km-QhllQS4Jm2_aVxy6PuyATsLU';
const ORDERS_SHEET = 'PEDIDOS';
const MAX_COLS = 23; // A até W

async function getToken() {
  let raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    try {
      const envContent = readFileSync(join(__dirname, '..', '.env'), 'utf8');
      const match = envContent.match(/GOOGLE_SERVICE_ACCOUNT_JSON=(.+)/);
      if (match) raw = match[1].replace(/^['"]|['"]$/g, '');
    } catch {}
  }
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON não encontrado');
  const sa = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);
  const hdr = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const pay = Buffer.from(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now,
  })).toString('base64url');
  const si = `${hdr}.${pay}`;
  const sign = createSign('RSA-SHA256'); sign.update(si);
  const jwt = `${si}.${sign.sign(sa.private_key, 'base64url')}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const d = await res.json();
  if (!d.access_token) throw new Error('Token inválido: ' + JSON.stringify(d));
  return d.access_token;
}

async function readRange(token, range) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error('Erro ao ler: ' + await res.text());
  return (await res.json()).values || [];
}

async function clearRange(token, range) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}:clear`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
  if (!res.ok) throw new Error('Erro ao limpar: ' + await res.text());
  return await res.json();
}

async function updateValues(token, range, values) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ range, majorDimension: 'ROWS', values }),
    }
  );
  if (!res.ok) throw new Error('Erro ao atualizar: ' + await res.text());
  return await res.json();
}

function colLetter(i) {
  if (i < 26) return String.fromCharCode(65 + i);
  return String.fromCharCode(65 + Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26));
}

async function main() {
  console.log('🔑 Obtendo token...');
  const token = await getToken();
  console.log('✅ Token OK');

  // Ler tudo até coluna AZ para capturar todos os dados extras
  console.log('\n📋 Lendo todos os dados da aba PEDIDOS (até coluna AZ)...');
  const allData = await readRange(token, `${ORDERS_SHEET}!A1:AZ300`);
  console.log(`   Total de linhas: ${allData.length}`);

  // Processar cada linha: truncar para MAX_COLS colunas
  let trimmedCount = 0;
  const cleanData = allData.map((row, i) => {
    if (row.length > MAX_COLS) {
      trimmedCount++;
      const lineNum = i + 1;
      const extras = row.slice(MAX_COLS).filter(v => v && v !== '');
      if (extras.length > 0) {
        console.log(`   ✂️  Linha ${lineNum}: removendo ${row.length - MAX_COLS} colunas extras (${colLetter(MAX_COLS)}-${colLetter(row.length-1)}). Valores descartados: [${extras.join(', ')}]`);
      }
      return row.slice(0, MAX_COLS);
    }
    return row;
  });

  console.log(`\n📊 Linhas com colunas extras removidas: ${trimmedCount}`);

  // Limpar toda a aba (range amplo para garantir que tudo seja apagado)
  console.log('\n🗑️  Limpando aba PEDIDOS (A1:AZ300)...');
  await clearRange(token, `${ORDERS_SHEET}!A1:AZ300`);
  console.log('   ✅ Aba limpa');

  // Reescrever os dados limpos
  console.log('\n📝 Gravando dados limpos...');
  const result = await updateValues(token, `${ORDERS_SHEET}!A1`, cleanData);
  console.log(`   ✅ ${result.updatedCells} células atualizadas`);
  console.log(`   ✅ ${result.updatedRows} linhas gravadas`);

  // Verificação final
  console.log('\n🔍 Verificação final...');
  const checkData = await readRange(token, `${ORDERS_SHEET}!A1:AZ10`);
  const headerLen = checkData[0]?.length || 0;
  console.log(`   Cabeçalho: ${headerLen} colunas (esperado: ${MAX_COLS})`);
  
  let hasProblems = false;
  for (let i = 1; i < Math.min(checkData.length, 5); i++) {
    const row = checkData[i];
    if (row && row.length > MAX_COLS) {
      console.log(`   ⚠️  Linha ${i+1} ainda tem ${row.length} colunas`);
      hasProblems = true;
    }
  }
  
  if (!hasProblems) {
    console.log('   ✅ Todas as linhas verificadas estão dentro do limite de 23 colunas');
  }

  console.log('\n🎉 Aba PEDIDOS corrigida com sucesso!');
  console.log('   - Todas as colunas extras (X em diante) foram removidas');
  console.log('   - Estrutura final: A-W (23 colunas)');
}

main().catch(err => { console.error('\n❌ Erro:', err.message); process.exit(1); });
