/**
 * ============================================================
 *  JUMERA SPORT PDV — Google Apps Script
 *  Versão: 3.0 (debounce + validação + reconciliação de exclusões)
 * ============================================================
 *
 *  COMO INSTALAR:
 *  1. Abra a planilha no Google Sheets
 *  2. Menu: Extensões → Apps Script
 *  3. Cole todo este código substituindo o conteúdo existente
 *  4. Salve (Ctrl+S)
 *  5. Menu lateral: Acionadores (ícone de relógio)
 *  6. Adicione DOIS acionadores:
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
 *  CONFIGURAÇÃO:
 *  Altere as constantes abaixo conforme o ambiente.
 * ============================================================
 */

// ─── CONFIGURAÇÃO ────────────────────────────────────────────────────────────

var WEBHOOK_URL           = 'https://juremasport.wzsolutions.com.br/api/trpc/pdvSync.webhookNewProduct';
var WEBHOOK_RECONCILE_URL = 'https://juremasport.wzsolutions.com.br/api/trpc/pdvSync.webhookReconcile';
var WEBHOOK_SECRET        = 'jurema-pdv-2024';
var SHEET_NAME            = 'PRODUTOS';

/**
 * Colunas obrigatórias para considerar a linha "completa":
 * [0]CODIGO [1]LINHA [2]MODELO [3]TIME [4]DESCRIÇÃO [5]TAM [6]TIPO [7]QTD [8]ATC [9]VAR [10]ATIVO
 */
var REQUIRED_COLS = [0, 1, 2, 3, 5, 6, 7, 8, 9, 10];
var COL_NAMES = {
  0: 'CODIGO', 1: 'LINHA', 2: 'MODELO', 3: 'TIME', 4: 'DESCRIÇÃO',
  5: 'TAM', 6: 'TIPO', 7: 'QTD', 8: 'ATC', 9: 'VAR', 10: 'ATIVO'
};

var DEBOUNCE_SECONDS = 30;

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

    var range = sheet.getRange(rowNumber, 1, 1, 15);
    var values = range.getValues()[0];

    // Se a linha está vazia (foi deletada), disparar reconciliação imediata
    var codigo = (values[0] || '').toString().trim();
    if (!codigo) {
      Logger.log('[processRow] Linha ' + rowNumber + ' vazia (possível exclusão) — disparando reconciliação');
      reconcileProducts();
      return;
    }

    // Validação de campos obrigatórios
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

    var codigoUpper = codigo.toUpperCase();

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

    var ativoRaw = values[10].toString().trim().toUpperCase();
    var isActive = (ativoRaw === 'SIM' || ativoRaw === '1' || ativoRaw === 'TRUE');

    var product = {
      codigo:       codigoUpper,
      linha:        (values[1] || '').toString().trim().toUpperCase(),
      modelo:       (values[2] || '').toString().trim().toUpperCase(),
      time:         (values[3] || '').toString().trim().toUpperCase(),
      descricao:    (values[4] || '').toString().trim(),
      tamanho:      (values[5] || '').toString().trim().toUpperCase(),
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
 *
 * Também pode ser executada manualmente: Executar → reconcileProducts
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

    // Ler todos os códigos da planilha (coluna A, linhas 2 até o fim)
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

    // Enviar lista de códigos ao webhook de reconciliação
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
 * Útil para importação inicial ou reprocessamento em caso de falha.
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

  for (var row = 2; row <= lastRow; row++) {
    var range = sheet.getRange(row, 1, 1, 15);
    var values = range.getValues()[0];

    if (!values[0] || values[0].toString().trim() === '') {
      continue;
    }

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

    var ativoRaw = values[10].toString().trim().toUpperCase();
    var product = {
      codigo:       values[0].toString().trim().toUpperCase(),
      linha:        (values[1] || '').toString().trim().toUpperCase(),
      modelo:       (values[2] || '').toString().trim().toUpperCase(),
      time:         (values[3] || '').toString().trim().toUpperCase(),
      descricao:    (values[4] || '').toString().trim(),
      tamanho:      (values[5] || '').toString().trim().toUpperCase(),
      tipo:         (values[6] || 'CAMISETA').toString().trim().toUpperCase(),
      estoque:      parseInt(values[7].toString().trim()) || 0,
      precoAtacado: precoAtacado,
      precoVarejo:  precoVarejo,
      isActive:     (ativoRaw === 'SIM' || ativoRaw === '1' || ativoRaw === 'TRUE')
    };

    sendToWebhook(product);
    enviados++;

    Utilities.sleep(500);
  }

  Logger.log('[syncAllProducts] Concluído — Enviados: ' + enviados + ', Ignorados: ' + ignorados);
  SpreadsheetApp.getUi().alert('Sincronização concluída!\n\nEnviados: ' + enviados + '\nIgnorados (incompletos): ' + ignorados);
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
