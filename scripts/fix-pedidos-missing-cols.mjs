/**
 * Corrige dados faltando nas colunas P-W das linhas 75+ da aba PEDIDOS.
 * Busca os pedidos do banco de dados e reescreve as linhas incompletas.
 *
 * Uso: node scripts/fix-pedidos-missing-cols.mjs
 */
import { createSign } from 'crypto';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHEET_ID = '1SGUr5Sh2gZ5nkYg0km-QhllQS4Jm2_aVxy6PuyATsLU';
const ORDERS_SHEET = 'PEDIDOS';

// ── Auth ──────────────────────────────────────────────────────────────────────

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

// ── Sheets ────────────────────────────────────────────────────────────────────

async function readRange(token, range) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error('Erro ao ler: ' + await res.text());
  return (await res.json()).values || [];
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

// ── DB ────────────────────────────────────────────────────────────────────────

async function getDb() {
  let dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    try {
      const envContent = readFileSync(join(__dirname, '..', '.env'), 'utf8');
      const match = envContent.match(/DATABASE_URL=(.+)/);
      if (match) dbUrl = match[1].replace(/^['"]|['"]$/g, '');
    } catch {}
  }
  if (!dbUrl) throw new Error('DATABASE_URL não encontrado');
  return mysql.createConnection(dbUrl);
}

function pad(n) { return String(n).padStart(2, '0'); }

function formatDate(d) {
  const dt = new Date(d);
  const dtBR = new Date(dt.getTime() - 3 * 60 * 60 * 1000);
  return `${pad(dtBR.getUTCDate())}/${pad(dtBR.getUTCMonth() + 1)}/${dtBR.getUTCFullYear()} ${pad(dtBR.getUTCHours())}:${pad(dtBR.getUTCMinutes())}`;
}

async function main() {
  console.log('🔑 Obtendo token Google...');
  const token = await getToken();
  console.log('✅ Token OK');

  // 1. Ler planilha atual
  console.log('\n📋 Lendo aba PEDIDOS...');
  const sheetData = await readRange(token, `${ORDERS_SHEET}!A1:W300`);
  console.log(`   ${sheetData.length} linhas encontradas`);

  // 2. Identificar linhas incompletas (colunas P-W vazias = índices 15-22)
  const incompleteRows = [];
  for (let i = 1; i < sheetData.length; i++) {
    const row = sheetData[i];
    const pedidoId = row[0];
    if (!pedidoId || !String(pedidoId).startsWith('PED-')) continue;
    
    // Verificar se coluna P (índice 15 = total_com_taxa) está vazia
    const totalComTaxa = row[15];
    if (!totalComTaxa && totalComTaxa !== 0) {
      incompleteRows.push({ lineNum: i + 1, pedidoId, rowIndex: i });
    }
  }

  if (incompleteRows.length === 0) {
    console.log('\n✅ Nenhuma linha incompleta encontrada!');
    return;
  }

  console.log(`\n⚠️  Linhas incompletas encontradas: ${incompleteRows.length}`);
  incompleteRows.forEach(r => console.log(`   Linha ${r.lineNum}: ${r.pedidoId}`));

  // 3. Buscar dados do banco
  console.log('\n🗄️  Conectando ao banco de dados...');
  const db = await getDb();
  console.log('✅ Banco conectado');

  const pedidoIds = incompleteRows.map(r => r.pedidoId);
  
  // Buscar pedidos (colunas camelCase conforme schema Drizzle)
  const [orders] = await db.execute(
    `SELECT o.* FROM pdv_orders o WHERE o.pedidoId IN (${pedidoIds.map(() => '?').join(',')})`,
    pedidoIds
  );
  
  // Buscar pagamentos (usa pedidoId como FK)
  const [payments] = await db.execute(
    `SELECT * FROM pdv_order_payments WHERE pedidoId IN (${pedidoIds.map(() => '?').join(',')})`,
    pedidoIds
  );
  
  // Buscar serviços (usa pedidoId como FK)
  const [services] = await db.execute(
    `SELECT * FROM pdv_order_services WHERE pedidoId IN (${pedidoIds.map(() => '?').join(',')})`,
    pedidoIds
  );

  // Buscar itens para calcular qtd_itens (usa pedidoId como FK)
  const [items] = await db.execute(
    `SELECT pedidoId, SUM(quantidade) as qtd FROM pdv_order_items WHERE pedidoId IN (${pedidoIds.map(() => '?').join(',')}) GROUP BY pedidoId`,
    pedidoIds
  );

  await db.end();

  // Indexar por pedidoId
  const ordersMap = {};
  for (const o of orders) ordersMap[o.pedidoId] = o;
  
  const paymentsMap = {};
  for (const p of payments) {
    if (!paymentsMap[p.pedidoId]) paymentsMap[p.pedidoId] = [];
    paymentsMap[p.pedidoId].push(p);
  }
  
  const servicesMap = {};
  for (const s of services) {
    if (!servicesMap[s.pedidoId]) servicesMap[s.pedidoId] = [];
    servicesMap[s.pedidoId].push(s);
  }

  const itemsMap = {};
  for (const it of items) itemsMap[it.pedidoId] = it.qtd;

  // 4. Construir linhas corrigidas
  console.log('\n🔧 Construindo linhas corrigidas...');
  
  const updates = [];
  
  for (const { lineNum, pedidoId, rowIndex } of incompleteRows) {
    const order = ordersMap[pedidoId];
    if (!order) {
      console.log(`   ⚠️  Pedido ${pedidoId} não encontrado no banco`);
      continue;
    }
    
    const orderPayments = paymentsMap[pedidoId] || [];
    const orderServices = servicesMap[pedidoId] || [];
    
    const extraTipos = orderServices.map(s => s.tipo).join(', ') || '';
    const extraValor = orderServices.reduce((sum, s) => sum + parseFloat(s.valor || 0), 0);
    const formasPagamento = orderPayments.map(p => p.formaPagamento).join(', ');
    const taxaTotal = orderPayments.reduce((sum, p) => sum + parseFloat(p.taxa || 0), 0);
    
    const totalAtacado = parseFloat(order.totalAtacado || 0);
    const totalVarejo = parseFloat(order.totalVarejo || 0);
    const totalAplicado = order.regime === 'ATACADO' ? totalAtacado : totalVarejo;
    const valorSemTaxa = totalAplicado + extraValor;
    const totalComTaxa = valorSemTaxa + taxaTotal;
    const totalPendente = parseFloat(order.totalPendente || 0);
    const comissaoTotal = parseFloat(order.comissaoTotal || 0);
    const qtdItens = parseInt(itemsMap[pedidoId] || order.qtdItens || 0);
    
    // Verificar se é atacado com menos de 6 peças
    const isAtacadoMenos6 = order.regime === 'ATACADO' && qtdItens < 6 && qtdItens > 0;
    
    // Linha completa (23 colunas A-W)
    const fullRow = [
      pedidoId,                                                    // A
      formatDate(order.createdAt),                                 // B
      order.sellerName || '',                                      // C
      order.canal === 'WHATSAPP' ? 'WhatsApp' : 'Balão',         // D
      order.clienteNome || '',                                     // E
      order.clienteTelefone || '',                                 // F
      '',                                                          // G (cep do correio - buscar dos serviços)G
      parseFloat(totalVarejo.toFixed(2)),                          // H
      parseFloat(totalAtacado.toFixed(2)),                         // I
      order.regime === 'ATACADO' ? 'Atacado' : 'Varejo',          // J
      extraTipos,                                                  // K
      extraValor > 0 ? parseFloat(extraValor.toFixed(2)) : '',    // L
      parseFloat(valorSemTaxa.toFixed(2)),                         // M
      formasPagamento,                                             // N
      taxaTotal > 0 ? parseFloat(taxaTotal.toFixed(2)) : '',      // O
      parseFloat(totalComTaxa.toFixed(2)),                         // P
      totalPendente > 0 ? parseFloat(totalPendente.toFixed(2)) : '', // Q
      order.justificativa || '',                                   // R
      order.regime === 'ATACADO' ? 'Atacado' : 'Varejo',          // S
      order.status === 'CANCELADO' ? 'Cancelado' : order.status === 'PENDENTE' ? 'Pendente' : 'Pago', // T
      qtdItens,                                                    // U
      parseFloat(comissaoTotal.toFixed(2)),                        // V
      isAtacadoMenos6 ? (order.justificativa || '') : '',          // W
    ];
    
    updates.push({ lineNum, pedidoId, rowIndex, fullRow });
    console.log(`   ✅ Linha ${lineNum} (${pedidoId}): total_com_taxa=${totalComTaxa.toFixed(2)}, forma=${formasPagamento}, status=${order.status}`);
  }

  if (updates.length === 0) {
    console.log('\n❌ Nenhuma linha pôde ser corrigida (pedidos não encontrados no banco)');
    return;
  }

  // 5. Atualizar cada linha na planilha
  console.log(`\n📝 Atualizando ${updates.length} linhas na planilha...`);
  
  for (const { lineNum, pedidoId, fullRow } of updates) {
    const range = `${ORDERS_SHEET}!A${lineNum}:W${lineNum}`;
    await updateValues(token, range, [fullRow]);
    console.log(`   ✅ Linha ${lineNum} (${pedidoId}) atualizada`);
  }

  console.log(`\n🎉 Correção concluída! ${updates.length} linhas corrigidas.`);
}

main().catch(err => { console.error('\n❌ Erro:', err.message); process.exit(1); });
