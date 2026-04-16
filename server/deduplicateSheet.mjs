/**
 * Script de deduplicação da aba PRODUTOS na planilha Google Sheets
 * 
 * Estratégia otimizada (uma única requisição batchUpdate):
 * 1. Lê todas as linhas da aba PRODUTOS (A2:O2000)
 * 2. Agrupa por CODIGO (coluna A)
 * 3. Para cada código com mais de 1 linha, mantém a ÚLTIMA ocorrência
 * 4. Envia TODAS as deleções em um único batchUpdate (sem rate limit)
 *    - As deleções são ordenadas de baixo para cima para não deslocar índices
 *    - Agrupa linhas consecutivas em ranges para minimizar o número de operações
 */

import { createSign } from 'crypto';

const SHEET_ID = '1SGUr5Sh2gZ5nkYg0km-QhllQS4Jm2_aVxy6PuyATsLU';
const GOOGLE_SHEETS_API_KEY = process.env.GOOGLE_SHEETS_API_KEY || '';
const GOOGLE_SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '';

if (!GOOGLE_SHEETS_API_KEY || !GOOGLE_SERVICE_ACCOUNT_JSON) {
  console.error('Erro: variáveis GOOGLE_SHEETS_API_KEY e GOOGLE_SERVICE_ACCOUNT_JSON são necessárias');
  process.exit(1);
}

async function getServiceAccountToken() {
  const sa = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  })).toString('base64url');

  const sign = createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const sig = sign.sign(sa.private_key, 'base64url');
  const jwt = `${header}.${payload}.${sig}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const tokenData = await tokenRes.json();
  return tokenData.access_token || null;
}

async function readSheet(range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?key=${GOOGLE_SHEETS_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.values || [];
}

async function getSheetNumericId(token) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties&key=${GOOGLE_SHEETS_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  const sheet = data.sheets?.find(s => s.properties.title === 'PRODUTOS');
  return sheet?.properties?.sheetId ?? 0;
}

async function batchDeleteRows(token, sheetNumericId, rowIndices) {
  // rowIndices são 0-based dentro de rows[] → índice na planilha = rowIdx + 1 (cabeçalho ocupa linha 0)
  // Ordenar em ordem DECRESCENTE para não deslocar índices ao deletar
  const sorted = [...rowIndices].sort((a, b) => b - a);
  
  // Agrupar índices consecutivos em ranges para reduzir o número de requests
  const ranges = [];
  let i = 0;
  while (i < sorted.length) {
    let start = sorted[i];
    let end = sorted[i];
    while (i + 1 < sorted.length && sorted[i] - sorted[i + 1] === 1) {
      i++;
      end = sorted[i];
    }
    // start >= end (ordem decrescente), então start é o maior
    ranges.push({ startIndex: end + 1, endIndex: start + 2 }); // +1 para cabeçalho, +1 para endIndex exclusivo
    i++;
  }

  // Enviar todas as deleções em uma única requisição batchUpdate
  const requests = ranges.map(r => ({
    deleteDimension: {
      range: {
        sheetId: sheetNumericId,
        dimension: 'ROWS',
        startIndex: r.startIndex,
        endIndex: r.endIndex,
      }
    }
  }));

  console.log(`Enviando ${requests.length} operações de deleção em uma única requisição...`);
  
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`batchUpdate falhou: ${err}`);
  }
  return true;
}

async function main() {
  console.log('=== Deduplicação da aba PRODUTOS (batchUpdate) ===\n');

  // 1. Ler todas as linhas
  console.log('Lendo planilha...');
  const rows = await readSheet('PRODUTOS!A2:O2000');
  console.log(`Total de linhas lidas: ${rows.length}`);

  if (rows.length === 0) {
    console.log('A planilha está vazia ou não foi possível ler.');
    return;
  }

  // 2. Agrupar por código
  const codeMap = new Map();
  for (let i = 0; i < rows.length; i++) {
    const codigo = rows[i][0]?.toString().trim();
    if (!codigo) continue;
    if (!codeMap.has(codigo)) codeMap.set(codigo, []);
    codeMap.get(codigo).push(i);
  }

  // 3. Encontrar duplicatas
  const allToDelete = [];
  let dupCount = 0;
  for (const [codigo, indices] of codeMap.entries()) {
    if (indices.length > 1) {
      dupCount++;
      const toDelete = indices.slice(0, -1); // manter última, deletar anteriores
      allToDelete.push(...toDelete);
      console.log(`  ${codigo}: ${indices.length} linhas → deletando ${toDelete.length} (mantendo linha ${indices[indices.length - 1] + 2})`);
    }
  }

  if (allToDelete.length === 0) {
    console.log('\n✅ Nenhuma duplicata encontrada! A planilha está limpa.');
    return;
  }

  console.log(`\nTotal: ${dupCount} código(s) duplicados, ${allToDelete.length} linhas a remover`);

  // 4. Obter token e sheetId numérico
  const token = await getServiceAccountToken();
  if (!token) {
    console.error('Erro: não foi possível obter token de autenticação');
    process.exit(1);
  }
  const sheetNumericId = await getSheetNumericId(token);
  console.log(`Sheet ID numérico da aba PRODUTOS: ${sheetNumericId}`);

  // 5. Deletar tudo em uma única requisição batchUpdate
  await batchDeleteRows(token, sheetNumericId, allToDelete);

  console.log(`\n✅ Deduplicação concluída! ${allToDelete.length} linhas removidas.`);
  console.log(`   Planilha agora tem ~${rows.length - allToDelete.length} linhas de produto.`);
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
