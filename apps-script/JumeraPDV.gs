/**
 * ============================================================
 *  JUMERA SPORT PDV — Google Apps Script
 *  Versão: 4.0 (geração automática de código + debounce + reconciliação)
 * ============================================================
 *
 *  COMO INSTALAR / ATUALIZAR:
 *  1. Abra a planilha no Google Sheets
 *  2. Menu: Extensões → Apps Script
 *  3. Cole todo este código substituindo o conteúdo existente
 *  4. Salve (Ctrl+S)
 *  5. Menu lateral: Acionadores (ícone de relógio)
 *  6. Verifique se existem DOIS acionadores (ou crie-os):
 *
 *     Acionador 1 — Edição:
 *     - Função: onSheetEdit
 *     - Evento: "Da planilha" → "Ao editar"
 *
 *     Acionador 2 — Reconciliação automática (a cada 5 minutos):
 *     - Função: reconcileProducts
 *     - Evento: "Baseado em tempo" → "Acionador por minutos" → "A cada 5 minutos"
 *
 *  7. Autorize as permissões quando solicitado
 *
 *  NOVIDADE v4.0:
 *  - Quando a coluna CODIGO estiver vazia, o código é gerado automaticamente
 *    no formato {LINHA}-{MODELO}-{TIME}-{DESC}-{TAM} e gravado na célula A.
 * ============================================================
 */

// ─── CONFIGURAÇÃO ────────────────────────────────────────────────────────────

var WEBHOOK_URL           = 'https://juremasports2.com.br/api/trpc/pdvSync.webhookNewProduct';
var WEBHOOK_RECONCILE_URL = 'https://juremasports2.com.br/api/trpc/pdvSync.webhookReconcile';
var WEBHOOK_SECRET        = 'jurema-pdv-2024';
var SHEET_NAME            = 'PRODUTOS';

/**
 * Colunas obrigatórias para considerar a linha "completa":
 * [0]CODIGO (opcional — gerado automaticamente) [1]LINHA [2]MODELO [3]TIME
 * [4]DESCRIÇÃO [5]TAM [6]TIPO [7]QTD [8]ATC [9]VAR [10]ATIVO
 * CODIGO não é mais obrigatório — será gerado se vazio.
 */
var REQUIRED_COLS = [1, 2, 3, 5, 6, 7, 8, 9, 10];
var COL_NAMES = {
  0: 'CODIGO', 1: 'LINHA', 2: 'MODELO', 3: 'TIME', 4: 'DESCRIÇÃO',
  5: 'TAM', 6: 'TIPO', 7: 'QTD', 8: 'ATC', 9: 'VAR', 10: 'ATIVO'
};

var DEBOUNCE_SECONDS = 30;

// ─── GERAÇÃO AUTOMÁTICA DE CÓDIGO ────────────────────────────────────────────

// IMPORTANTE: estes mapas DEVEM ser idênticos aos do servidor
// (server/routers/pdvProductCode.ts). Antes 'TAILANDESA' gerava 'CA' aqui e 'TA'
// no servidor, criando códigos divergentes para o mesmo produto.
var LINHA_MAP  = { 'TAILANDESA': 'TA', 'NACIONAL': 'NA', 'TORCEDOR': 'TO', 'PECA': 'PE' };
var MODELO_MAP = {
  'JOGADOR': 'JG', 'TORCEDOR': 'TO', 'TAILANDESA': 'TA', 'DRYFIT': 'DR', 'VENDEDOR': 'VE',
  'CONJ.ADULTO': 'CO', 'CONJ ADULTO': 'CO', 'CONJUNTO ADULTO': 'CO',
  'CONJ.INFANTIL': 'CI', 'CONJ INFANTIL': 'CI', 'CONJUNTO INFANTIL': 'CI',
  'FEMININO': 'FE', 'FEMI': 'FE', 'MASCULINO': 'MA', 'INFANTIL': 'IN',
  'REGATA': 'RG', 'AGASALHO': 'AG', 'SHORTS': 'SH', 'CALCA': 'CL', 'CALÇA': 'CL',
  'BERMUDA': 'BM', 'MOLETOM': 'ML', 'JAQUETA': 'JQ', 'BLUSA': 'BL', 'CAMISA': 'CM',
  'CAMISETA': 'CT', 'POLO': 'PL', 'MEIAS': 'ME', 'BONE': 'BO', 'BONÉ': 'BO',
  'MOCHILA': 'MO', 'CHUTEIRA': 'CH', 'RETRO': 'RE', 'RETRÔ': 'RE'
};
var STOPWORDS  = ['COM','DE','DA','DO','NO','NA','E','A','O','EM','AO','AS','OS','UM','UMA'];
var DESC_OVERRIDE = {
  'FEMI-PRETA COM GOLA AMARELA RIO': 'FEMI-PRET-GOLA-AMAR',
  'FEMI-PRETA GOLA AMARELA RIO':     'FEMI-PRET-GOLA-RIO',
  'FEMI-VERDE GOLA AMARELA':         'FEMI-VERD-GOLA',
  'FEMI-VERDE GOLA AMARELA RIO':     'FEMI-VERD-GOLA-RIO',
  'VERMELHO COM LISTRA PRETA':       'VERM-LIST-PRET',
  'VERMELHA COM LISTRA PRETA NO OMBRO': 'VERM-LIST-OMBR'
};

function removeAcentos(s) {
  var map = {'À':'A','Á':'A','Â':'A','Ã':'A','Ä':'A','È':'E','É':'E','Ê':'E','Ë':'E',
             'Ì':'I','Í':'I','Î':'I','Ï':'I','Ò':'O','Ó':'O','Ô':'O','Õ':'O','Ö':'O',
             'Ù':'U','Ú':'U','Û':'U','Ü':'U','Ç':'C','Ñ':'N','à':'a','á':'a','â':'a',
             'ã':'a','ä':'a','è':'e','é':'e','ê':'e','ë':'e','ì':'i','í':'i','î':'i',
             'ï':'i','ò':'o','ó':'o','ô':'o','õ':'o','ö':'o','ù':'u','ú':'u','û':'u',
             'ü':'u','ç':'c','ñ':'n'};
  return s.split('').map(function(c) { return map[c] || c; }).join('');
}

function slugifyCode(s) {
  if (!s) return '';
  var r = removeAcentos(s.trim().toUpperCase());
  r = r.replace(/[^A-Z0-9 \-]/g, '');
  r = r.replace(/\s+/g, '-');
  r = r.replace(/-+/g, '-');
  return r.replace(/^-|-$/g, '');
}

function abreviarCampo(s, mapa, n) {
  if (!s) return '';
  var chave = s.trim().toUpperCase();
  if (mapa[chave]) return mapa[chave];
  return slugifyCode(chave).substring(0, n);
}

function palavrasSig(desc) {
  var s = removeAcentos(desc.toUpperCase());
  var palavras = s.match(/[A-Z0-9]+/g) || [];
  var sig = palavras.filter(function(p) { return STOPWORDS.indexOf(p) === -1; });
  return sig.length > 0 ? sig : palavras;
}

function abreviarDesc(desc, n) {
  if (!desc) return '';
  n = n || 2;
  var chave = removeAcentos(desc.trim().toUpperCase());
  if (DESC_OVERRIDE[chave]) return DESC_OVERRIDE[chave];
  var sig = palavrasSig(desc);
  return sig.slice(0, n).map(function(p) { return p.substring(0, 4); }).join('-');
}

function gerarCodigo(linha, modelo, time, desc, tamanho) {
  var partes = [];
  var l = abreviarCampo(linha, LINHA_MAP, 2);   if (l) partes.push(l);
  var m = abreviarCampo(modelo, MODELO_MAP, 2); if (m) partes.push(m);
  var t = abreviarCampo(time, {}, 3);           if (t) partes.push(t);
  var d = abreviarDesc(desc, 2);                if (d) partes.push(d);
  var tam = slugifyCode(tamanho);               if (tam) partes.push(tam);
  return partes.join('-');
}

// ─── GATILHO PRINCIPAL (EDIÇÃO) ─────────────────────────────────────────────

function onSheetEdit(e) {
  try {
    var sheet = e.range.getSheet();
    if (sheet.getName() !== SHEET_NAME) return;

    var editedRow = e.range.getRow();
    if (editedRow <= 1) return;

    var props = PropertiesService.getScriptProperties();
    var key = 'pending_row_' + editedRow;
    props.setProperty(key, new Date().getTime().toString());

    scheduleDebounce(editedRow);
    Logger.log('[onSheetEdit] Linha ' + editedRow + ' editada — debounce agendado (' + DEBOUNCE_SECONDS + 's)');
  } catch (err) {
    Logger.log('[onSheetEdit] Erro: ' + err.message);
  }
}

// ─── DEBOUNCE ────────────────────────────────────────────────────────────────

function scheduleDebounce(rowNumber) {
  var props = PropertiesService.getScriptProperties();
  var triggerKey = 'trigger_row_' + rowNumber;

  var existingTriggerId = props.getProperty(triggerKey);
  if (existingTriggerId) {
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getUniqueId() === existingTriggerId) {
        ScriptApp.deleteTrigger(triggers[i]);
        break;
      }
    }
  }

  var trigger = ScriptApp.newTrigger('processDebounced')
    .timeBased()
    .after(DEBOUNCE_SECONDS * 1000)
    .create();

  props.setProperty(triggerKey, trigger.getUniqueId());
  props.setProperty('row_for_trigger_' + trigger.getUniqueId(), rowNumber.toString());
}

function processDebounced(e) {
  try {
    var props = PropertiesService.getScriptProperties();
    var triggerId = e ? e.triggerUid : null;
    if (!triggerId) {
      Logger.log('[processDebounced] Sem triggerUid — ignorando');
      return;
    }

    var rowStr = props.getProperty('row_for_trigger_' + triggerId);
    if (!rowStr) {
      Logger.log('[processDebounced] Linha não encontrada para trigger ' + triggerId);
      return;
    }

    var rowNumber = parseInt(rowStr);

    props.deleteProperty('row_for_trigger_' + triggerId);
    props.deleteProperty('trigger_row_' + rowNumber);
    props.deleteProperty('pending_row_' + rowNumber);

    processRow(rowNumber);
  } catch (err) {
    Logger.log('[processDebounced] Erro: ' + err.message);
  }
}

// ─── PROCESSAMENTO DA LINHA ──────────────────────────────────────────────────

function processRow(rowNumber) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) return;

    var range = sheet.getRange(rowNumber, 1, 1, 16);
    var values = range.getValues()[0];

    // Validação de campos obrigatórios (exceto CODIGO que é gerado automaticamente)
    var missingCols = [];
    for (var i = 0; i < REQUIRED_COLS.length; i++) {
      var colIdx = REQUIRED_COLS[i];
      var val = values[colIdx];
      if (val === undefined || val === null || val.toString().trim() === '') {
        missingCols.push(COL_NAMES[colIdx] || 'col' + (colIdx + 1));
      }
    }

    if (missingCols.length > 0) {
      Logger.log('[processRow] Linha ' + rowNumber + ' incompleta — aguardando: ' + missingCols.join(', '));
      return;
    }

    // Validação de QTD
    var qtdRaw = values[7].toString().trim();
    var qtd = parseInt(qtdRaw);
    if (isNaN(qtd) || qtd < 0) {
      Logger.log('[processRow] Linha ' + rowNumber + ' QTD inválido: "' + qtdRaw + '"');
      return;
    }

    // Validação de preços
    var atcRaw = values[8].toString().replace(',', '.').trim();
    var varRaw = values[9].toString().replace(',', '.').trim();
    var precoAtacado = parseFloat(atcRaw);
    var precoVarejo = parseFloat(varRaw);
    if (isNaN(precoAtacado) || precoAtacado <= 0) return;
    if (isNaN(precoVarejo) || precoVarejo <= 0) return;

    var linha   = (values[1] || '').toString().trim().toUpperCase();
    var modelo  = (values[2] || '').toString().trim().toUpperCase();
    var time    = (values[3] || '').toString().trim().toUpperCase();
    var desc    = (values[4] || '').toString().trim();
    var tamanho = (values[5] || '').toString().trim().toUpperCase();

    // Gerar código automaticamente se vazio
    var codigo = (values[0] || '').toString().trim().toUpperCase();
    if (!codigo) {
      codigo = gerarCodigo(linha, modelo, time, desc, tamanho);
      if (!codigo) {
        Logger.log('[processRow] Linha ' + rowNumber + ' — não foi possível gerar código');
        return;
      }
      // Escrever o código gerado na célula A da linha
      sheet.getRange(rowNumber, 1).setValue(codigo);
      Logger.log('[processRow] Linha ' + rowNumber + ' — código gerado e gravado: ' + codigo);
    }

    var ativoRaw = values[11].toString().trim().toUpperCase();
    var isActive = (ativoRaw === 'SIM' || ativoRaw === '1' || ativoRaw === 'TRUE');

    var product = {
      codigo:       codigo,
      linha:        linha,
      modelo:       modelo,
      time:         time,
      descricao:    desc,
      tamanho:      tamanho,
      tipo:         (values[6] || 'CAMISETA').toString().trim().toUpperCase(),
      estoque:      qtd,
      precoAtacado: precoAtacado,
      precoVarejo:  precoVarejo,
      isActive:     isActive
    };

    sendToWebhook(product);
  } catch (err) {
    Logger.log('[processRow] Erro na linha ' + rowNumber + ': ' + err.message);
  }
}

// ─── ENVIO AO WEBHOOK ────────────────────────────────────────────────────────

function sendToWebhook(product) {
  try {
    var payload = JSON.stringify({
      json: {
        secret: WEBHOOK_SECRET,
        product: product
      }
    });

    var options = {
      method: 'post',
      contentType: 'application/json',
      payload: payload,
      muteHttpExceptions: true,
      followRedirects: true
    };

    var response = UrlFetchApp.fetch(WEBHOOK_URL, options);
    var statusCode = response.getResponseCode();

    Logger.log('[sendToWebhook] ' + product.codigo + ' — HTTP ' + statusCode);
  } catch (err) {
    Logger.log('[sendToWebhook] Exceção ao enviar ' + product.codigo + ': ' + err.message);
  }
}

// ─── RECONCILIAÇÃO (DETECTA EXCLUSÕES) ──────────────────────────────────────

/**
 * Compara os códigos da planilha com os do banco de dados.
 * Produtos que existem no banco mas NÃO na planilha são DESATIVADOS (isActive=0).
 *
 * Esta função deve ser configurada como acionador baseado em tempo (a cada 5 minutos)
 * para detectar exclusões de linhas automaticamente.
 */
function reconcileProducts() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      Logger.log('[reconcileProducts] Aba "' + SHEET_NAME + '" não encontrada');
      return;
    }

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      Logger.log('[reconcileProducts] Planilha vazia — nada a reconciliar');
      return;
    }

    var range = sheet.getRange(2, 1, lastRow - 1, 1);
    var values = range.getValues();
    var codigos = [];

    for (var i = 0; i < values.length; i++) {
      var codigo = (values[i][0] || '').toString().trim().toUpperCase();
      if (codigo) {
        codigos.push(codigo);
      }
    }

    Logger.log('[reconcileProducts] ' + codigos.length + ' códigos encontrados na planilha');

    if (codigos.length === 0) {
      Logger.log('[reconcileProducts] Nenhum código válido — abortando para segurança');
      return;
    }

    var payload = JSON.stringify({
      json: {
        secret: WEBHOOK_SECRET,
        codigos: codigos
      }
    });

    var options = {
      method: 'post',
      contentType: 'application/json',
      payload: payload,
      muteHttpExceptions: true,
      followRedirects: true
    };

    var response = UrlFetchApp.fetch(WEBHOOK_RECONCILE_URL, options);
    var statusCode = response.getResponseCode();
    var responseText = response.getContentText();

    if (statusCode === 200) {
      try {
        var result = JSON.parse(responseText);
        var data = result.result && result.result.data ? result.result.data.json : null;
        if (data && data.desativados > 0) {
          Logger.log('[reconcileProducts] ' + data.desativados + ' produto(s) desativado(s): ' + (data.codigos || []).join(', '));
        } else {
          Logger.log('[reconcileProducts] Nenhum produto desativado — tudo sincronizado');
        }
      } catch (e) {
        Logger.log('[reconcileProducts] Resposta: ' + responseText);
      }
    } else {
      Logger.log('[reconcileProducts] Erro HTTP ' + statusCode + ': ' + responseText);
    }

  } catch (err) {
    Logger.log('[reconcileProducts] Erro: ' + err.message);
  }
}

// ─── SINCRONIZAÇÃO MANUAL ────────────────────────────────────────────────────

/**
 * Sincronização manual: processa TODAS as linhas da aba PRODUTOS de uma vez.
 * Gera código automaticamente para linhas sem CODIGO.
 * Execute manualmente pelo menu Executar → syncAllProducts.
 */
function syncAllProducts() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    Logger.log('[syncAllProducts] Aba "' + SHEET_NAME + '" não encontrada');
    return;
  }

  var lastRow = sheet.getLastRow();
  Logger.log('[syncAllProducts] Processando linhas 2 a ' + lastRow);

  var enviados = 0;
  var ignorados = 0;
  var codigosGerados = 0;

  for (var row = 2; row <= lastRow; row++) {
    var range = sheet.getRange(row, 1, 1, 16);
    var values = range.getValues()[0];

    // Verificar campos obrigatórios (exceto CODIGO)
    var completa = true;
    for (var i = 0; i < REQUIRED_COLS.length; i++) {
      var val = values[REQUIRED_COLS[i]];
      if (!val || val.toString().trim() === '') {
        completa = false;
        break;
      }
    }

    if (!completa) {
      ignorados++;
      continue;
    }

    var atcRaw = values[8].toString().replace(',', '.').trim();
    var varRaw = values[9].toString().replace(',', '.').trim();
    var precoAtacado = parseFloat(atcRaw);
    var precoVarejo = parseFloat(varRaw);

    if (isNaN(precoAtacado) || precoAtacado <= 0 || isNaN(precoVarejo) || precoVarejo <= 0) {
      ignorados++;
      continue;
    }

    var linha   = (values[1] || '').toString().trim().toUpperCase();
    var modelo  = (values[2] || '').toString().trim().toUpperCase();
    var time    = (values[3] || '').toString().trim().toUpperCase();
    var desc    = (values[4] || '').toString().trim();
    var tamanho = (values[5] || '').toString().trim().toUpperCase();

    // Gerar código se vazio
    var codigo = (values[0] || '').toString().trim().toUpperCase();
    if (!codigo) {
      codigo = gerarCodigo(linha, modelo, time, desc, tamanho);
      if (!codigo) { ignorados++; continue; }
      sheet.getRange(row, 1).setValue(codigo);
      codigosGerados++;
    }

    var ativoRaw = values[11].toString().trim().toUpperCase();
    var product = {
      codigo:       codigo,
      linha:        linha,
      modelo:       modelo,
      time:         time,
      descricao:    desc,
      tamanho:      tamanho,
      tipo:         (values[6] || 'CAMISETA').toString().trim().toUpperCase(),
      estoque:      parseInt(values[7].toString().trim()) || 0,
      precoAtacado: precoAtacado,
      precoVarejo:  precoVarejo,
      isActive:     (ativoRaw === 'SIM' || ativoRaw === '1' || ativoRaw === 'TRUE')
    };

    sendToWebhook(product);
    enviados++;

    Utilities.sleep(300);
  }

  Logger.log('[syncAllProducts] Concluído — Enviados: ' + enviados + ', Ignorados: ' + ignorados + ', Códigos gerados: ' + codigosGerados);
  SpreadsheetApp.getUi().alert('Sincronização concluída!\n\nEnviados: ' + enviados + '\nIgnorados (incompletos): ' + ignorados + '\nCódigos gerados automaticamente: ' + codigosGerados);
}

// ─── LIMPEZA ─────────────────────────────────────────────────────────────────

/**
 * Limpa todos os gatilhos de debounce pendentes.
 * Use se o script ficar com muitos gatilhos acumulados.
 */
function clearAllDebounceTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  var removed = 0;
  for (var i = 0; i < triggers.length; i++) {
    var fn = triggers[i].getHandlerFunction();
    if (fn === 'processDebounced') {
      ScriptApp.deleteTrigger(triggers[i]);
      removed++;
    }
  }
  Logger.log('[clearAllDebounceTriggers] Removidos ' + removed + ' gatilhos pendentes');
}
