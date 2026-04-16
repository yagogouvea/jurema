/**
 * Script para limpar as abas FLUXO_CAIXA e VENDAS_CAIXA da planilha
 * Mantém apenas o cabeçalho (linha 1)
 */
import { readFileSync } from 'fs';
import { createSign } from 'crypto';

// Usar variáveis de ambiente do processo
const SHEET_ID = '1SGUr5Sh2gZ5nkYg0km-QhllQS4Jm2_aVxy6PuyATsLU';
const API_KEY = process.env.GOOGLE_SHEETS_API_KEY;
const SA_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

async function getServiceAccountToken() {
  const sa = JSON.parse(SA_JSON);
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  })).toString('base64url');
  const unsigned = `${header}.${payload}`;
  const sign = createSign('RSA-SHA256');
  sign.update(unsigned);
  const sig = sign.sign(sa.private_key, 'base64url');
  const jwt = `${unsigned}.${sig}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Token error: ' + JSON.stringify(data));
  return data.access_token;
}

async function getSheetIds() {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties&key=${API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  const map = {};
  for (const s of data.sheets || []) {
    map[s.properties.title] = s.properties.sheetId;
  }
  return map;
}

async function countRows(sheetName) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(sheetName + '!A:A')}?key=${API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  return (data.values || []).length;
}

async function clearSheet(sheetName, sheetId, token, rowCount) {
  if (rowCount <= 1) {
    console.log(`  ${sheetName}: apenas cabeçalho, nada a limpar`);
    return;
  }
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [{
        deleteDimension: {
          range: {
            sheetId,
            dimension: 'ROWS',
            startIndex: 1,
            endIndex: rowCount,
          }
        }
      }]
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(JSON.stringify(data.error));
  console.log(`  ${sheetName}: ${rowCount - 1} linhas removidas (cabeçalho mantido)`);
}

async function main() {
  console.log('Obtendo token de serviço...');
  const token = await getServiceAccountToken();
  console.log('Token obtido com sucesso');
  
  console.log('Buscando IDs das abas...');
  const sheetIds = await getSheetIds();
  console.log('Abas disponíveis:', Object.keys(sheetIds).join(', '));
  
  for (const aba of ['FLUXO_CAIXA', 'VENDAS_CAIXA']) {
    if (sheetIds[aba] === undefined) {
      console.log(`  ${aba}: não encontrada`);
      continue;
    }
    const rowCount = await countRows(aba);
    console.log(`  ${aba}: ${rowCount} linhas encontradas`);
    await clearSheet(aba, sheetIds[aba], token, rowCount);
  }
  
  console.log('\nPlanilha limpa com sucesso!');
}

main().catch(console.error);
