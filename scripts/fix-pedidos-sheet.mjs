/**
 * Script para corrigir a aba PEDIDOS da planilha Google Sheets:
 * 1. Remove a coluna K vazia (sem cabeçalho)
 * 2. Realinha os dados das linhas 75+ que estão deslocados 11 colunas para a direita
 * 3. Atualiza o cabeçalho para refletir a nova estrutura sem coluna K vazia
 *
 * Uso: node scripts/fix-pedidos-sheet.mjs
 */

import { createSign } from 'crypto';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHEET_ID = '1SGUr5Sh2gZ5nkYg0km-QhllQS4Jm2_aVxy6PuyATsLU';
const ORDERS_SHEET = 'PEDIDOS';

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
  const data = await res.json();
  if (!data.access_token) throw new Error('Token inválido: ' + JSON.stringify(data));
  return data.access_token;
}

async function readRange(token, range) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error('Erro ao ler: ' + await res.text());
  return (await res.json()).values || [];
}

async function getSheetId(token) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets(properties(sheetId,title))`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error('Erro ao buscar sheets: ' + await res.text());
  const data = await res.json();
  const sheet = data.sheets.find(s => s.properties.title === ORDERS_SHEET);
  return sheet?.properties?.sheetId;
}

async function batchUpdate(token, requests) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests }),
    }
  );
  if (!res.ok) throw new Error('Erro no batchUpdate: ' + await res.text());
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

async function clearRange(token, range) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}:clear`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    }
  );
  if (!res.ok) throw new Error('Erro ao limpar: ' + await res.text());
  return await res.json();
}

// Mapeamento: dado na coluna X (índice 0-based) da planilha atual → posição correta
// Estrutura CORRETA (sem coluna K vazia):
// A(0)=pedido_id, B(1)=data, C(2)=vendedor, D(3)=canal, E(4)=cliente, F(5)=telefone,
// G(6)=cep, H(7)=varejo, I(8)=atacado, J(9)=atacado_varejo,
// K(10)=extra, L(11)=valor_adicional, M(12)=valor_sem_taxa, N(13)=forma_pagamento,
// O(14)=taxa, P(15)=total_com_taxa, Q(16)=pendente, R(17)=justificativa,
// S(18)=modalidade, T(19)=status, U(20)=qtd_itens, V(21)=comissao, W(22)=justificativa_atac_menos6

// Estrutura ATUAL com coluna K vazia (índices na planilha atual):
// A(0)=pedido_id, B(1)=data, C(2)=vendedor, D(3)=canal, E(4)=cliente, F(5)=telefone,
// G(6)=cep, H(7)=varejo, I(8)=atacado, J(9)=atacado_varejo,
// K(10)=VAZIA, L(11)=extra, M(12)=valor_adicional, N(13)=valor_sem_taxa, O(14)=forma_pagamento,
// P(15)=taxa, Q(16)=total_com_taxa, R(17)=pendente, S(18)=justificativa,
// T(19)=modalidade, U(20)=status, V(21)=qtd_itens, W(22)=comissao, X(23)=justificativa_atac_menos6

// Para linhas deslocadas (a partir da linha 75), os dados estão 11 colunas à frente:
// L(11)=pedido_id, M(12)=data, N(13)=vendedor, O(14)=canal, P(15)=cliente, Q(16)=telefone,
// R(17)=cep, S(18)=varejo, T(19)=atacado, U(20)=atacado_varejo,
// V(21)=extra, W(22)=valor_adicional, X(23)=valor_sem_taxa, Y(24)=forma_pagamento,
// Z(25)=taxa (ou mais)

function fixDisplacedRow(row) {
  // Detecta se a linha está deslocada: colunas A-K vazias e L tem um pedido_id
  const aToK = row.slice(0, 11);
  const allEmpty = aToK.every(v => !v || v === '');
  const lHasPedidoId = row[11] && String(row[11]).startsWith('PED-');
  
  if (allEmpty && lHasPedidoId) {
    // Linha deslocada: pegar dados a partir da coluna L (índice 11)
    // e mapear para a estrutura correta (sem coluna K vazia)
    const displaced = row.slice(11); // dados começam na coluna L
    
    // displaced[0]=pedido_id, [1]=data, [2]=vendedor, [3]=canal, [4]=cliente,
    // [5]=telefone, [6]=cep, [7]=varejo, [8]=atacado, [9]=atacado_varejo,
    // [10]=extra, [11]=valor_adicional, [12]=valor_sem_taxa, [13]=forma_pagamento,
    // [14]=taxa, [15]=total_com_taxa, [16]=pendente, [17]=justificativa,
    // [18]=modalidade, [19]=status, [20]=qtd_itens, [21]=comissao, [22]=justificativa_atac_menos6
    
    return displaced.slice(0, 23); // 23 colunas (A até W)
  }
  
  // Linha normal com coluna K vazia: remover a coluna K (índice 10)
  if (row.length >= 10) {
    const fixed = [...row.slice(0, 10), ...row.slice(11)]; // remove índice 10 (K vazia)
    return fixed.slice(0, 23);
  }
  
  return row;
}

async function main() {
  console.log('🔑 Obtendo token...');
  const token = await getToken();
  console.log('✅ Token OK');

  // 1. Ler todos os dados da aba PEDIDOS
  console.log('\n📋 Lendo todos os dados da aba PEDIDOS...');
  const allData = await readRange(token, `${ORDERS_SHEET}!A1:Z200`);
  console.log(`   Total de linhas: ${allData.length}`);

  // 2. Mostrar cabeçalho atual
  const currentHeader = allData[0] || [];
  console.log('\n📌 Cabeçalho atual:');
  currentHeader.forEach((col, i) => {
    const letter = String.fromCharCode(65 + i);
    console.log(`   ${letter}: "${col}"`);
  });

  // 3. Novo cabeçalho (sem coluna K vazia)
  const newHeader = [
    'pedido_id',        // A
    'data',             // B
    'vendedor',         // C
    'canal',            // D
    'cliente',          // E
    'telefone',         // F
    'cep',              // G
    'varejo',           // H
    'atacado',          // I
    'atacado_varejo',   // J
    'extra',            // K (era L)
    'valor_adicional',  // L (era M)
    'valor_sem_taxa',   // M (era N)
    'forma_pagamento',  // N (era O)
    'taxa',             // O (era P)
    'total_com_taxa',   // P (era Q)
    'pendente',         // Q (era R)
    'justificativa',    // R (era S)
    'modalidade',       // S (era T)
    'status',           // T (era U)
    'qtd_itens',        // U (era V)
    'comissao',         // V (era W)
    'justificativa_atac_menos6', // W (era X)
  ];

  // 4. Processar linhas de dados (pular cabeçalho)
  const dataRows = allData.slice(1);
  let fixedCount = 0;
  let normalCount = 0;
  
  const fixedRows = dataRows.map((row, i) => {
    const lineNum = i + 2;
    const aToK = row.slice(0, 11);
    const allEmpty = aToK.every(v => !v || v === '');
    const lHasPedidoId = row[11] && String(row[11]).startsWith('PED-');
    
    if (allEmpty && lHasPedidoId) {
      fixedCount++;
      console.log(`   🔧 Linha ${lineNum}: DESLOCADA → corrigindo (pedido: ${row[11]})`);
      return fixDisplacedRow(row);
    } else if (row.length > 0 && row[0]) {
      // Linha normal com coluna K vazia: remover K
      normalCount++;
      return fixDisplacedRow(row); // também remove a coluna K vazia das linhas normais
    }
    return null;
  }).filter(Boolean);

  console.log(`\n📊 Resumo:`);
  console.log(`   Linhas normais (remover K vazia): ${normalCount}`);
  console.log(`   Linhas deslocadas (realinhar): ${fixedCount}`);
  console.log(`   Total a gravar: ${fixedRows.length}`);

  if (fixedRows.length === 0) {
    console.log('\n✅ Nenhuma linha para corrigir.');
    return;
  }

  // 5. Limpar toda a aba (exceto linha 1 que será o novo cabeçalho)
  console.log('\n🗑️  Limpando aba PEDIDOS...');
  await clearRange(token, `${ORDERS_SHEET}!A1:Z200`);
  console.log('   ✅ Aba limpa');

  // 6. Gravar novo cabeçalho + dados corrigidos
  console.log('\n📝 Gravando cabeçalho + dados corrigidos...');
  const allNewData = [newHeader, ...fixedRows];
  const result = await updateValues(token, `${ORDERS_SHEET}!A1`, allNewData);
  console.log(`   ✅ ${result.updatedCells} células atualizadas`);
  console.log(`   ✅ ${result.updatedRows} linhas gravadas`);

  console.log('\n🎉 Planilha PEDIDOS corrigida com sucesso!');
  console.log('   - Coluna K vazia removida');
  console.log('   - Dados das linhas deslocadas realinhados');
  console.log('   - Cabeçalho atualizado');
}

main().catch(err => {
  console.error('\n❌ Erro:', err.message);
  process.exit(1);
});
