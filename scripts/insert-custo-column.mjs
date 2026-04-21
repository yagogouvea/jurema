/**
 * Script para inserir a coluna CUSTO na posição K da aba PRODUTOS
 * Usa o mesmo mecanismo de autenticação (Service Account JWT) do projeto
 */

const SHEET_ID = '1SGUr5Sh2gZ5nkYg0km-QhllQS4Jm2_aVxy6PuyATsLU';
const GID_PRODUTOS = 1252148770; // gid da aba PRODUTOS (do URL: gid=1252148770)

async function getServiceAccountToken() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON não definida');
  const sa = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);

  const { createSign } = await import('crypto');
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
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error(`Falha ao obter token: ${JSON.stringify(tokenData)}`);
  return tokenData.access_token;
}

async function main() {
  console.log('Obtendo token de autenticação...');
  const token = await getServiceAccountToken();
  console.log('✅ Token obtido com sucesso');

  // Verificar cabeçalho atual
  const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
  const headerRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent('PRODUTOS!A1:R1')}?key=${apiKey}`
  );
  const headerData = await headerRes.json();
  const currentHeader = headerData.values?.[0] || [];
  console.log('Cabeçalho atual:', currentHeader);

  // Verificar se CUSTO já existe
  if (currentHeader.includes('CUSTO')) {
    console.log('⚠️  Coluna CUSTO já existe na posição:', currentHeader.indexOf('CUSTO') + 1, '(coluna', String.fromCharCode(65 + currentHeader.indexOf('CUSTO')) + ')');
    return;
  }

  // Verificar posição de VAR
  const varIdx = currentHeader.indexOf('VAR');
  if (varIdx === -1) {
    console.error('❌ Coluna VAR não encontrada no cabeçalho!');
    process.exit(1);
  }
  console.log(`VAR está na coluna ${String.fromCharCode(65 + varIdx)} (índice ${varIdx})`);
  const custoInsertIdx = varIdx + 1; // Inserir logo APÓS VAR
  console.log(`Inserindo CUSTO na coluna ${String.fromCharCode(65 + custoInsertIdx)} (índice ${custoInsertIdx})`);

  // Inserir coluna vazia na posição correta
  const insertRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          insertDimension: {
            range: {
              sheetId: GID_PRODUTOS,
              dimension: 'COLUMNS',
              startIndex: custoInsertIdx,
              endIndex: custoInsertIdx + 1,
            },
            inheritFromBefore: false,
          },
        }],
      }),
    }
  );

  const insertData = await insertRes.json();
  if (!insertRes.ok) {
    console.error('❌ Erro ao inserir coluna:', JSON.stringify(insertData, null, 2));
    process.exit(1);
  }
  console.log('✅ Coluna inserida com sucesso!');

  // Escrever cabeçalho CUSTO
  const colLetter = String.fromCharCode(65 + custoInsertIdx);
  const updateRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(`PRODUTOS!${colLetter}1`)}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [['CUSTO']] }),
    }
  );

  const updateData = await updateRes.json();
  if (!updateRes.ok) {
    console.error('❌ Erro ao escrever cabeçalho:', JSON.stringify(updateData, null, 2));
    process.exit(1);
  }
  console.log(`✅ Cabeçalho "CUSTO" escrito em ${colLetter}1!`);

  // Verificar resultado final
  const finalRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent('PRODUTOS!A1:R1')}?key=${apiKey}`
  );
  const finalData = await finalRes.json();
  console.log('Cabeçalho final:', finalData.values?.[0]);
  console.log('\n✅ Coluna CUSTO adicionada com sucesso ao lado de VAR!');
}

main().catch(err => {
  console.error('Erro:', err.message);
  process.exit(1);
});
