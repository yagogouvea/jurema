/**
 * Diagnóstico completo da aba PEDIDOS — lê até a coluna AZ para ver todos os dados
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

function colLetter(i) {
  if (i < 26) return String.fromCharCode(65 + i);
  return String.fromCharCode(65 + Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26));
}

async function readRange(token, range) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error('Erro ao ler: ' + await res.text());
  return (await res.json()).values || [];
}

async function main() {
  const token = await getToken();
  
  // Ler tudo até coluna AZ (52 colunas)
  const allData = await readRange(token, 'PEDIDOS!A1:AZ300');
  console.log(`Total de linhas: ${allData.length}`);
  
  // Mostrar cabeçalho
  const header = allData[0] || [];
  console.log('\n=== CABEÇALHO ===');
  header.forEach((col, i) => {
    if (col) console.log(`  ${colLetter(i)}: "${col}"`);
  });
  console.log(`  Total colunas no cabeçalho: ${header.length}`);
  
  // Analisar cada linha de dados
  console.log('\n=== ANÁLISE DE CADA LINHA ===');
  let problemCount = 0;
  for (let i = 1; i < allData.length; i++) {
    const row = allData[i];
    if (!row || row.length === 0) continue;
    
    const lineNum = i + 1;
    const maxCol = row.length;
    const hasPedidoInA = row[0] && String(row[0]).startsWith('PED-');
    const firstNonEmpty = row.findIndex(v => v && v !== '');
    
    if (!hasPedidoInA) {
      problemCount++;
      console.log(`⚠️  Linha ${lineNum}: pedido_id NÃO está em A. Primeira célula não-vazia: col ${colLetter(firstNonEmpty)} (idx ${firstNonEmpty}). Valor: "${row[firstNonEmpty]}". Total colunas: ${maxCol}`);
      // Mostrar todas as células não-vazias
      row.forEach((v, j) => {
        if (v && v !== '') console.log(`     ${colLetter(j)}(${j}): "${v}"`);
      });
    } else {
      // Linha OK — verificar se tem dados além da coluna W (índice 22)
      if (maxCol > 23) {
        console.log(`ℹ️  Linha ${lineNum}: OK (pedido: ${row[0]}) — mas tem ${maxCol} colunas (esperado ≤23). Extras: ${row.slice(23).map((v,j) => `${colLetter(23+j)}="${v}"`).join(', ')}`);
      }
    }
  }
  
  if (problemCount === 0) {
    console.log('✅ Nenhuma linha com problema encontrada!');
  } else {
    console.log(`\n❌ Total de linhas com problema: ${problemCount}`);
  }
}

main().catch(err => { console.error('Erro:', err.message); process.exit(1); });
