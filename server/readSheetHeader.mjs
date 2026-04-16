/**
 * Script para ler o cabeçalho real da aba PEDIDOS na planilha
 * Uso: node server/readSheetHeader.mjs
 */
import { createSign } from 'crypto';
import { readFileSync } from 'fs';

// Carregar .env manualmente
const envPath = '/home/ubuntu/jumera-sport/.env';
let envVars = {};
try {
  const envContent = readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) envVars[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
  }
} catch {}

const SA_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || envVars.GOOGLE_SERVICE_ACCOUNT_JSON;
const API_KEY = process.env.GOOGLE_SHEETS_API_KEY || envVars.GOOGLE_SHEETS_API_KEY;
const SHEET_ID = '1SGUr5Sh2gZ5nkYg0km-QhllQS4Jm2_aVxy6PuyATsLU';

if (!SA_JSON && !API_KEY) {
  console.error('Nenhuma credencial disponível');
  process.exit(1);
}

// Tentar com API key primeiro (mais simples)
if (API_KEY) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent('PEDIDOS!1:1')}?key=${API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.values) {
    console.log('Cabeçalho PEDIDOS (via API key):');
    data.values[0].forEach((col, i) => {
      const letter = String.fromCharCode(65 + i);
      console.log(`  ${letter}: ${col}`);
    });
    process.exit(0);
  }
  console.log('API key response:', JSON.stringify(data));
}

// Fallback: Service Account
if (SA_JSON) {
  const sa = JSON.parse(SA_JSON);
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
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
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent('PEDIDOS!1:1')}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await res.json();
  if (data.values) {
    console.log('Cabeçalho PEDIDOS (via Service Account):');
    data.values[0].forEach((col, i) => {
      const letter = String.fromCharCode(65 + i);
      console.log(`  ${letter}: ${col}`);
    });
  } else {
    console.log('Resposta:', JSON.stringify(data));
  }
}
