/**
 * pdvSheetsWriter.ts
 * Módulo de escrita bidirecional com Google Sheets
 * 
 * LEITURA: usa API key pública (GOOGLE_SHEETS_API_KEY) — sem autenticação extra
 * ESCRITA: usa Google Service Account JWT (GOOGLE_SERVICE_ACCOUNT_JSON) — precisa de credenciais
 * 
 * Fluxo:
 * 1. Ao finalizar pedido → appendOrderToSheet() grava linha na aba PEDIDOS
 * 2. Ao finalizar pedido → updateProductStockInSheet() deduz estoque na aba PRODUTOS
 * 3. Ao cancelar pedido → restoreProductStockInSheet() devolve estoque na aba PRODUTOS
 * 4. Webhook recebe novos produtos adicionados na planilha via Apps Script
 */

const SHEET_ID = '1SGUr5Sh2gZ5nkYg0km-QhllQS4Jm2_aVxy6PuyATsLU';
const PRODUCTS_RANGE = 'PRODUTOS!A:O';
const ORDERS_SHEET = 'PEDIDOS';
const ITEMS_SHEET = 'pedidos_itens';
const SOFIA_SHEET = 'SOFIA_ITENS';

// ─── JWT para Service Account ───────────────────────────────────────────────

async function getServiceAccountToken(): Promise<string | null> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;

  try {
    const sa = JSON.parse(raw);
    const now = Math.floor(Date.now() / 1000);
    
    // Build JWT header + payload
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    })).toString('base64url');
    
    const signingInput = `${header}.${payload}`;
    
    // Sign with private key using Node.js crypto
    const { createSign } = await import('crypto');
    const sign = createSign('RSA-SHA256');
    sign.update(signingInput);
    const signature = sign.sign(sa.private_key, 'base64url');
    
    const jwt = `${signingInput}.${signature}`;
    
    // Exchange JWT for access token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });
    
    const tokenData = await tokenRes.json() as any;
    return tokenData.access_token || null;
  } catch (err) {
    console.error('[SheetsWriter] Failed to get service account token:', err);
    return null;
  }
}

// ─── Leitura da planilha (API key pública) ───────────────────────────────────

async function readSheet(range: string): Promise<any[][]> {
  const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
  if (!apiKey) return [];
  
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?key=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json() as any;
  return data.values || [];
}

// ─── Escrita na planilha (Service Account) ───────────────────────────────────

async function appendToSheet(range: string, values: any[][]): Promise<boolean> {
  const token = await getServiceAccountToken();
  if (!token) {
    console.warn('[SheetsWriter] No service account token — skipping sheet write');
    return false;
  }
  
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values }),
  });
  
  if (!res.ok) {
    const err = await res.text();
    console.error('[SheetsWriter] Append failed:', err);
    return false;
  }
  return true;
}

async function updateCellInSheet(range: string, value: any): Promise<boolean> {
  const token = await getServiceAccountToken();
  if (!token) {
    console.warn('[SheetsWriter] No service account token — skipping cell update');
    return false;
  }
  
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: [[value]] }),
  });
  
  if (!res.ok) {
    const err = await res.text();
    console.error('[SheetsWriter] Update cell failed:', err);
    return false;
  }
  return true;
}

// ─── Funções públicas ─────────────────────────────────────────────────────────

/**
 * Grava um pedido completo na aba PEDIDOS da planilha
 * Colunas: pedido_id | data | vendedor | canal | cliente | telefone | varejo | atacado |
 *          atacado/varejo | extra | valor_adicional | valor_sem_taxa | forma_pagamento |
 *          taxa | total_com_taxa | pendente | justificativa | modalidade | qtd_itens | comissao
 */
export async function appendOrderToSheet(order: {
  pedidoId: string;
  createdAt: Date;
  sellerName: string;
  canal: string;
  clienteNome?: string | null;
  clienteTelefone?: string | null;
  totalVarejo: number;
  totalAtacado: number;
  regime: string;
  services: Array<{ tipo: string; valor: number }>;
  totalAplicado: number;
  payments: Array<{ formaPagamento: string; taxa: number; valor: number }>;
  totalPendente: number;
  justificativa?: string | null;
  status: string;
  qtdItens: number;
  comissaoTotal: number;
}): Promise<boolean> {
  try {
    // Serviços extras
    const extraTipos = order.services.map(s => s.tipo).join(', ') || '';
    const extraValor = order.services.reduce((sum, s) => sum + s.valor, 0);
    
    // Pagamentos
    const formasPagamento = order.payments.map(p => p.formaPagamento).join(', ');
    const taxaTotal = order.payments.reduce((sum, p) => sum + (p.taxa || 0), 0);
    const totalComTaxa = order.totalAplicado + extraValor + taxaTotal;
    
    // Formatar data
    const dataFormatada = new Date(order.createdAt).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    
    const row = [
      order.pedidoId,                                    // A: pedido_id
      dataFormatada,                                     // B: data
      order.sellerName,                                  // C: vendedor
      order.canal === 'WHATSAPP' ? 'WhatsApp' : 'Balcão', // D: canal
      order.clienteNome || '',                           // E: cliente
      order.clienteTelefone || '',                       // F: telefone
      order.totalVarejo.toFixed(2),                      // G: varejo
      order.totalAtacado.toFixed(2),                     // H: atacado
      order.regime === 'ATACADO' ? 'Atacado' : 'Varejo', // I: atacado/varejo
      extraTipos,                                        // J: extra
      extraValor > 0 ? extraValor.toFixed(2) : '',       // K: valor_adicional
      order.totalAplicado.toFixed(2),                    // L: valor_sem_taxa
      formasPagamento,                                   // M: forma_pagamento
      taxaTotal > 0 ? taxaTotal.toFixed(2) : '',         // N: taxa
      totalComTaxa.toFixed(2),                           // O: total_com_taxa
      order.totalPendente > 0 ? order.totalPendente.toFixed(2) : '', // P: pendente
      order.justificativa || '',                         // Q: justificativa
      order.status === 'CANCELADO' ? 'Cancelado' : order.status === 'PENDENTE' ? 'Pendente' : 'Pago', // R: status
      order.qtdItens,                                    // S: qtd_itens
      order.comissaoTotal.toFixed(2),                    // T: comissao
    ];
    
    return await appendToSheet(`${ORDERS_SHEET}!A:T`, [row]);
  } catch (err) {
    console.error('[SheetsWriter] appendOrderToSheet error:', err);
    return false;
  }
}

/**
 * Deduz estoque de um produto na aba PRODUTOS da planilha
 * Localiza o produto pelo CODIGO (coluna A) e atualiza a coluna H (QTD)
 */
export async function updateProductStockInSheet(codigo: string, quantidadeVendida: number): Promise<boolean> {
  try {
    // Ler a partir da linha 2 (sem cabeçalho) — rows[0] = linha 2 da planilha
    const rows = await readSheet('PRODUTOS!A2:O2000');
    
    const rowIndex = rows.findIndex(row => row[0]?.toString().trim() === codigo.trim());
    if (rowIndex === -1) {
      console.warn(`[SheetsWriter] Produto ${codigo} não encontrado na planilha para deduzir estoque`);
      return false;
    }
    
    const currentStock = parseInt(rows[rowIndex][7] || '0', 10); // coluna H = índice 7
    const newStock = Math.max(0, currentStock - quantidadeVendida);
    
    // Linha na planilha = rowIndex + 2 (rows[0] = linha 2 da planilha)
    const sheetRow = rowIndex + 2;
    console.log(`[SheetsWriter] Deduzindo estoque ${codigo}: ${currentStock} - ${quantidadeVendida} = ${newStock} (linha ${sheetRow})`);
    return await updateCellInSheet(`PRODUTOS!H${sheetRow}`, newStock);
  } catch (err) {
    console.error('[SheetsWriter] updateProductStockInSheet error:', err);
    return false;
  }
}

/**
 * Devolve estoque de um produto na aba PRODUTOS (ao cancelar pedido)
 */
export async function restoreProductStockInSheet(codigo: string, quantidadeDevolvida: number): Promise<boolean> {
  try {
    // Ler a partir da linha 2 (sem cabeçalho) — rows[0] = linha 2 da planilha
    const rows = await readSheet('PRODUTOS!A2:O2000');
    const rowIndex = rows.findIndex(row => row[0]?.toString().trim() === codigo.trim());
    if (rowIndex === -1) {
      console.warn(`[SheetsWriter] Produto ${codigo} não encontrado na planilha para restaurar estoque`);
      return false;
    }
    
    const currentStock = parseInt(rows[rowIndex][7] || '0', 10);
    const newStock = currentStock + quantidadeDevolvida;
    const sheetRow = rowIndex + 2;
    console.log(`[SheetsWriter] Restaurando estoque ${codigo}: ${currentStock} + ${quantidadeDevolvida} = ${newStock} (linha ${sheetRow})`);
    return await updateCellInSheet(`PRODUTOS!H${sheetRow}`, newStock);
  } catch (err) {
    console.error('[SheetsWriter] restoreProductStockInSheet error:', err);
    return false;
  }
}

/**
 * Adiciona um novo produto na aba PRODUTOS da planilha
 * (chamado quando um produto é criado pelo sistema)
 */
export async function appendProductToSheet(product: {
  codigo: string;
  linha: string;
  modelo: string;
  time: string;
  descricao: string;
  tamanho: string;
  tipo: string;
  estoque: number;
  precoAtacado: number;
  precoVarejo: number;
  isActive: boolean;
}): Promise<boolean> {
  try {
    const row = [
      product.codigo,                                    // A: CODIGO
      product.linha,                                     // B: LINHA
      product.modelo,                                    // C: MODELO
      product.time,                                      // D: TIME
      product.descricao,                                 // E: DESCRICAO
      product.tamanho,                                   // F: TAM
      product.tipo,                                      // G: TIPO
      product.estoque,                                   // H: QTD
      product.precoAtacado.toFixed(2),                   // I: ATC
      product.precoVarejo.toFixed(2),                    // J: VAR
      product.isActive ? 'SIM' : 'NAO',                  // K: ATIVO
      '',                                                // L: (vazio)
      '',                                                // M: (vazio)
      '',                                                // N: (vazio)
      '',                                                // O: (vazio)
    ];
    return await appendToSheet(`PRODUTOS!A:O`, [row]);
  } catch (err) {
    console.error('[SheetsWriter] appendProductToSheet error:', err);
    return false;
  }
}

/**
 * Grava os itens de um pedido na aba pedidos_itens da planilha
 *
 * Colunas (13 no total):
 * A: pedido_id
 * B: cod (SKU)
 * C: produto (Linha Modelo Time Descrição Tamanho Tipo)
 * D: quantidade
 * E: preco_atacado (unitário)
 * F: preco_varejo (unitário)
 * G: subtotal_atacado (preco_atacado × quantidade)
 * H: subtotal_varejo (preco_varejo × quantidade)
 * I: modalidade usada (Atacado | Varejo)
 * J: preco_utilizado (subtotal na modalidade escolhida)
 * K: serviço extra (tipo/descrição)
 * L: valor serviço extra (R$)
 * M: TOTAL (preco_utilizado + valor serviço extra)
 */
export async function appendOrderItemsToSheet(params: {
  pedidoId: string;
  regime: string;
  services: Array<{ tipo: string; valor: number }>;
  items: Array<{
    codigo?: string | null;
    linha?: string | null;
    modelo?: string | null;
    time: string;
    descricao?: string | null;
    tamanho: string;
    tipo?: string | null;
    quantidade: number;
    precoUnitario: number;
    totalItem: number;
    precoAtacado?: number | null;
    precoVarejo?: number | null;
  }>;
}): Promise<boolean> {
  try {
    const { pedidoId, regime, services, items } = params;

    // Serviços extras: tipo(s) e valor total
    const extraTipos = services.map(s => s.tipo).join(', ');
    const extraValorTotal = services.reduce((sum, s) => sum + s.valor, 0);
    // Distribuir valor do serviço extra proporcionalmente entre os itens
    const extraPorItem = items.length > 0 ? extraValorTotal / items.length : 0;

    const rows = items.map(item => {
      // Descrição completa: Linha Modelo Time Descrição Tamanho Tipo
      const descParts = [
        item.linha || '',
        item.modelo || '',
        item.time || '',
        item.descricao || '',
        item.tamanho || '',
        item.tipo || '',
      ].filter(Boolean);
      const produtoDesc = descParts.join(' ');

      // Preços unitários (por unidade, não subtotal)
      const precoAtacadoUnit = item.precoAtacado ?? item.precoUnitario;
      const precoVarejoUnit = item.precoVarejo ?? item.precoUnitario;

      // Subtotais (preço unitário × quantidade)
      const subtotalAtacado = precoAtacadoUnit * item.quantidade;
      const subtotalVarejo = precoVarejoUnit * item.quantidade;

      const modalidade = regime === 'ATACADO' ? 'Atacado' : 'Varejo';
      // preco_utilizado = subtotal na modalidade escolhida
      const precoUtilizado = regime === 'ATACADO' ? subtotalAtacado : subtotalVarejo;
      const totalComExtra = precoUtilizado + extraPorItem;

      return [
        pedidoId,                          // A: pedido_id
        item.codigo || '',                 // B: cod (SKU)
        produtoDesc,                       // C: produto
        item.quantidade,                   // D: quantidade
        precoAtacadoUnit.toFixed(2),       // E: preco_atacado (unitário)
        precoVarejoUnit.toFixed(2),        // F: preco_varejo (unitário)
        subtotalAtacado.toFixed(2),        // G: subtotal_atacado
        subtotalVarejo.toFixed(2),         // H: subtotal_varejo
        modalidade,                        // I: modalidade usada
        precoUtilizado.toFixed(2),         // J: preco_utilizado
        extraTipos || '',                  // K: serviço extra
        extraPorItem > 0 ? extraPorItem.toFixed(2) : '', // L: valor serviço extra
        totalComExtra.toFixed(2),          // M: TOTAL
      ];
    });

    return await appendToSheet(`${ITEMS_SHEET}!A:M`, rows);
  } catch (err) {
    console.error('[SheetsWriter] appendOrderItemsToSheet error:', err);
    return false;
  }
}

/**
 * Grava itens Sofia de um pedido na aba SOFIA_ITENS da planilha
 *
 * Colunas (23 no total):
 * A: pedido_id
 * B: data
 * C: cod (SKU)
 * D: vendedor
 * E: canal
 * F: cliente
 * G: fone
 * H: varejo (preço unitário varejo)
 * I: atacado (preço unitário atacado)
 * J: atacado/varejo (modalidade usada)
 * K: serviço extra (tipo)
 * L: valor serviço extra (R$)
 * M: valor total sem taxa
 * N: forma de pagamento
 * O: taxa
 * P: total com taxa
 * Q: pendente
 * R: justificativa
 * S: modalidade (Atacado/Varejo)
 * T: status
 * U: qtd itens
 * V: comissao loja sofia (personalizada por item)
 * W: reembolso (valor total - comissão)
 */
export async function appendSofiaItemsToSheet(params: {
  pedidoId: string;
  createdAt: Date;
  sellerName: string;
  canal: string;
  clienteNome?: string | null;
  clienteTelefone?: string | null;
  regime: string;
  services: Array<{ tipo: string; valor: number }>;
  payments: Array<{ formaPagamento: string; taxa: number; valor: number }>;
  totalPendente: number;
  justificativa?: string | null;
  status: string;
  items: Array<{
    codigo?: string | null;
    linha?: string | null;
    modelo?: string | null;
    time: string;
    descricao?: string | null;
    tamanho: string;
    tipo?: string | null;
    quantidade: number;
    precoUnitario: number;
    totalItem: number;
    precoAtacado?: number | null;
    precoVarejo?: number | null;
    isSofia?: boolean;
    comissaoLojaSofia?: number | null;
  }>;
}): Promise<boolean> {
  try {
    const { pedidoId, createdAt, sellerName, canal, clienteNome, clienteTelefone, regime, services, payments, totalPendente, justificativa, status, items } = params;

    // Formatar data
    const dataFormatada = new Date(createdAt).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    // Serviços extras
    const extraTipos = services.map(s => s.tipo).join(', ') || '';
    const extraValorTotal = services.reduce((sum, s) => sum + s.valor, 0);
    const extraPorItem = items.length > 0 ? extraValorTotal / items.length : 0;

    // Pagamentos
    const formasPagamento = payments.map(p => p.formaPagamento).join(', ');
    const taxaTotal = payments.reduce((sum, p) => sum + (p.taxa || 0), 0);

    const modalidade = regime === 'ATACADO' ? 'Atacado' : 'Varejo';
    const canalFormatado = canal === 'WHATSAPP' ? 'WhatsApp' : 'Balcão';
    const statusFormatado = status === 'CANCELADO' ? 'Cancelado' : status === 'PENDENTE' ? 'Pendente' : 'Pago';

    const rows = items.map(item => {
      // Preços unitários
      const precoVarejoUnit = item.precoVarejo ?? item.precoUnitario;
      const precoAtacadoUnit = item.precoAtacado ?? item.precoUnitario;

      // Valor total do item (preço utilizado na modalidade * quantidade)
      const valorItemSemTaxa = item.totalItem;
      const valorItemComExtra = valorItemSemTaxa + extraPorItem;

      // Taxa proporcional por item
      const totalGeralItens = items.reduce((s, i) => s + i.totalItem, 0);
      const proporcao = totalGeralItens > 0 ? item.totalItem / totalGeralItens : 0;
      const taxaProporcional = taxaTotal * proporcao;
      const totalComTaxa = valorItemComExtra + taxaProporcional;

      // Pendente proporcional
      const pendenteProporcional = totalPendente * proporcao;

      // Comissão da loja Sofia (personalizada por item)
      const comissaoLoja = item.comissaoLojaSofia ?? 0;
      // Comissão total = comissão por peça * quantidade
      const comissaoTotal = comissaoLoja * item.quantidade;
      // Reembolso = valor total do item - comissão da loja
      const reembolso = Math.max(0, valorItemSemTaxa - comissaoTotal);

      return [
        pedidoId,                                              // A: pedido_id
        dataFormatada,                                         // B: data
        item.codigo || '',                                     // C: cod (SKU)
        sellerName,                                            // D: vendedor
        canalFormatado,                                        // E: canal
        clienteNome || '',                                     // F: cliente
        clienteTelefone || '',                                 // G: fone
        precoVarejoUnit.toFixed(2),                            // H: varejo (unitário)
        precoAtacadoUnit.toFixed(2),                           // I: atacado (unitário)
        modalidade,                                            // J: atacado/varejo
        extraTipos || '',                                      // K: serviço extra
        extraPorItem > 0 ? extraPorItem.toFixed(2) : '',       // L: valor serviço extra
        valorItemSemTaxa.toFixed(2),                           // M: valor total sem taxa
        formasPagamento,                                       // N: forma de pagamento
        taxaProporcional > 0 ? taxaProporcional.toFixed(2) : '', // O: taxa
        totalComTaxa.toFixed(2),                               // P: total com taxa
        pendenteProporcional > 0 ? pendenteProporcional.toFixed(2) : '', // Q: pendente
        justificativa || '',                                   // R: justificativa
        modalidade,                                            // S: modalidade
        statusFormatado,                                       // T: status
        item.quantidade,                                       // U: qtd itens
        comissaoTotal.toFixed(2),                              // V: comissao loja sofia
        reembolso.toFixed(2),                                  // W: reembolso
      ];
    });

    return await appendToSheet(`${SOFIA_SHEET}!A:W`, rows);
  } catch (err) {
    console.error('[SheetsWriter] appendSofiaItemsToSheet error:', err);
    return false;
  }
}

/**
 * Verifica se há novos produtos na planilha que não existem no banco
 * Retorna lista de produtos novos para importação
 */
export async function getNewProductsFromSheet(existingCodigos: Set<string>): Promise<any[]> {
  try {
    // Usar A2:O para pular a linha de cabeçalho (igual ao pdvSync que usa PRODUTOS!A2:O2000)
    const rows = await readSheet('PRODUTOS!A2:O2000');
    const newProducts = [];
    
    for (const row of rows) {
      const codigo = row[0]?.toString().trim();
      if (!codigo || existingCodigos.has(codigo)) continue;
      
      newProducts.push({
        codigo,
        linha: row[1]?.toString().trim() || '',
        modelo: row[2]?.toString().trim() || '',
        time: row[3]?.toString().trim() || '',
        descricao: row[4]?.toString().trim() || '',
        tamanho: row[5]?.toString().trim() || '',
        tipo: row[6]?.toString().trim() || 'CAMISETA',
        estoque: parseInt(row[7] || '0', 10),
        precoAtacado: parseFloat(row[8]?.replace(',', '.') || '0'),
        precoVarejo: parseFloat(row[9]?.replace(',', '.') || '0'),
        isActive: (row[10]?.toString().trim().toUpperCase() === 'SIM'),
      });
    }
    
    return newProducts;
  } catch (err) {
    console.error('[SheetsWriter] getNewProductsFromSheet error:', err);
    return [];
  }
}
