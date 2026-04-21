/**
 * Script para analisar a aba PEDIDOS da planilha Google Sheets
 * Mostra cabeçalho e linhas recentes para identificar desalinhamento
 */

import { createSign } from 'crypto';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHEET_ID = '1SGUr5Sh2gZ5nkYg0km-QhllQS4Jm2_aVxy6PuyATsLU';

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
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600, iat: now,
  })).toString('base64url');
  const signingInput = `${header}.${payload}`;
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  const jwt = `${signingInput}.${sign.sign(sa.private_key, 'base64url')}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  return (await res.json()).access_token;
}

async function readRange(token, range) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()).values || [];
}

async function main() {
  const token = await getToken();

  // Ler cabeçalho e primeiras 5 linhas
  console.log('\n=== CABEÇALHO (linha 1) ===');
  const header = await readRange(token, 'PEDIDOS!A1:Z1');
  if (header[0]) {
    header[0].forEach((col, i) => {
      const letter = String.fromCharCode(65 + i);
      console.log(`  ${letter}: ${col}`);
    });
  }

  // Ler linhas 70-80 para ver onde começa o problema
  console.log('\n=== LINHAS 70-80 (área do problema) ===');
  const rows7080 = await readRange(token, 'PEDIDOS!A70:Z80');
  rows7080.forEach((row, i) => {
    console.log(`Linha ${70 + i}: [${row.map((v, j) => `${String.fromCharCode(65+j)}="${v}"`).join(', ')}]`);
  });

  // Ler últimas linhas (80-90)
  console.log('\n=== LINHAS 80-90 (mais recentes) ===');
  const rows8090 = await readRange(token, 'PEDIDOS!A80:Z90');
  rows8090.forEach((row, i) => {
    if (row.length > 0) {
      console.log(`Linha ${80 + i}: [${row.map((v, j) => `${String.fromCharCode(65+j)}="${v}"`).join(', ')}]`);
    }
  });

  // Contar total de linhas
  const allRows = await readRange(token, 'PEDIDOS!A:A');
  console.log(`\nTotal de linhas na aba PEDIDOS: ${allRows.length}`);
}

main().catch(err => { console.error('Erro:', err.message); process.exit(1); });
