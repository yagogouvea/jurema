/**
 * ============================================================
 *  JUMERA SPORT PDV — Google Apps Script
 *  Versão: 2.0 (com debounce + validação completa)
 * ============================================================
 *
 *  COMO INSTALAR:
 *  1. Abra a planilha no Google Sheets
 *  2. Menu: Extensões → Apps Script
 *  3. Cole todo este código substituindo o conteúdo existente
 *  4. Salve (Ctrl+S)
 *  5. Menu: Editar → Acionadores do projeto atual
 *  6. Adicione um acionador:
 *     - Função: onSheetEdit
 *     - Evento: "Da planilha" → "Ao editar"
 *  7. Autorize as permissões quando solicitado
 *
 *  CONFIGURAÇÃO:
 *  Altere as constantes abaixo conforme o ambiente.
 * ============================================================
 */

// ─── CONFIGURAÇÃO ────────────────────────────────────────────────────────────

var WEBHOOK_URL    = 'https://3000-ih8yg7wgbpdofglcbjuap-92ac7378.us2.manus.computer/api/trpc/pdvSync.webhookNewProduct';
var WEBHOOK_SECRET = 'jurema-pdv-2024';  // Deve ser igual ao SHEETS_WEBHOOK_SECRET no servidor
var SHEET_NAME     = 'PRODUTOS';         // Nome exato da aba na planilha

/**
 * Colunas obrigatórias para considerar a linha "completa":
 * [0]CODIGO [1]LINHA [2]MODELO [3]TIME [4]DESCRIÇÃO [5]TAM [6]TIPO [7]QTD [8]ATC [9]VAR [10]ATIVO
 *
 * A linha só será enviada ao sistema quando TODAS as colunas abaixo estiverem preenchidas.
 * Isso evita envios prematuros enquanto a Vanessa ainda está digitando.
 */
var REQUIRED_COLS = [0, 1, 2, 3, 5, 6, 7, 8, 9, 10];
var COL_NAMES = {
  0: 'CODIGO', 1: 'LINHA', 2: 'MODELO', 3: 'TIME', 4: 'DESCRIÇÃO',
  5: 'TAM', 6: 'TIPO', 7: 'QTD', 8: 'ATC', 9: 'VAR', 10: 'ATIVO'
};

/**
 * Tempo de espera (em segundos) após a última edição antes de enviar ao sistema.
 * Se a Vanessa editar a mesma linha dentro desse intervalo, o timer é reiniciado.
 * Recomendado: 30 segundos (tempo suficiente para preencher uma linha completa).
 */
var DEBOUNCE_SECONDS = 30;

// ─── GATILHO PRINCIPAL ───────────────────────────────────────────────────────

/**
 * Função chamada automaticamente pelo Google a cada edição na planilha.
 * Registra a edição e agenda o envio com debounce.
 */
function onSheetEdit(e) {
  try {
    // Ignorar edições em outras abas
    var sheet = e.range.getSheet();
    if (sheet.getName() !== SHEET_NAME) return;

    // Ignorar edições na linha de cabeçalho (linha 1)
    var editedRow = e.range.getRow();
    if (editedRow <= 1) return;

    // Registrar a linha editada e o timestamp no PropertiesService
    // (memória persistente entre execuções do Apps Script)
    var props = PropertiesService.getScriptProperties();
    var key = 'pending_row_' + editedRow;
    props.setProperty(key, new Date().getTime().toString());

    // Agendar o processamento com debounce
    // O ScriptApp.newTrigger cria um gatilho de tempo único
    scheduleDebounce(editedRow);

    Logger.log('[onSheetEdit] Linha ' + editedRow + ' editada — debounce agendado (' + DEBOUNCE_SECONDS + 's)');
  } catch (err) {
    Logger.log('[onSheetEdit] Erro: ' + err.message);
  }
}

// ─── DEBOUNCE ────────────────────────────────────────────────────────────────

/**
 * Agenda um gatilho de tempo para processar a linha após DEBOUNCE_SECONDS.
 * Se já existe um gatilho para essa linha, cancela o anterior e cria um novo.
 * Isso garante que edições rápidas em sequência não disparem múltiplos envios.
 */
function scheduleDebounce(rowNumber) {
  var props = PropertiesService.getScriptProperties();
  var triggerKey = 'trigger_row_' + rowNumber;

  // Cancelar gatilho anterior para essa linha, se existir
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

  // Criar novo gatilho que dispara após DEBOUNCE_SECONDS
  var trigger = ScriptApp.newTrigger('processRow_' + rowNumber)
    .timeBased()
    .after(DEBOUNCE_SECONDS * 1000)
    .create();

  // Salvar o ID do novo gatilho para poder cancelá-lo se necessário
  props.setProperty(triggerKey, trigger.getUniqueId());
  // Salvar o número da linha para que a função genérica saiba qual processar
  props.setProperty('row_for_trigger_' + trigger.getUniqueId(), rowNumber.toString());
}

/**
 * Função genérica chamada pelo gatilho de debounce.
 * O Apps Script não permite passar parâmetros para funções de gatilho,
 * então usamos o PropertiesService para recuperar qual linha processar.
 *
 * ATENÇÃO: Esta função é chamada para QUALQUER linha editada.
 * O número da linha é recuperado pelo ID do gatilho que a chamou.
 */
function processDebounced(e) {
  try {
    var props = PropertiesService.getScriptProperties();

    // Descobrir qual linha este gatilho deve processar
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

    // Limpar as propriedades usadas por este gatilho
    props.deleteProperty('row_for_trigger_' + triggerId);
    props.deleteProperty('trigger_row_' + rowNumber);
    props.deleteProperty('pending_row_' + rowNumber);

    // Processar a linha
    processRow(rowNumber);

  } catch (err) {
    Logger.log('[processDebounced] Erro: ' + err.message);
  }
}

// ─── PROCESSAMENTO DA LINHA ──────────────────────────────────────────────────

/**
 * Lê a linha da planilha, valida todos os campos obrigatórios
 * e envia ao sistema apenas se a linha estiver completa e válida.
 */
function processRow(rowNumber) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      Logger.log('[processRow] Aba "' + SHEET_NAME + '" não encontrada');
      return;
    }

    // Ler a linha completa (colunas A até O = 15 colunas)
    var range = sheet.getRange(rowNumber, 1, 1, 15);
    var values = range.getValues()[0];

    Logger.log('[processRow] Linha ' + rowNumber + ': ' + JSON.stringify(values));

    // ── VALIDAÇÃO 1: Campos obrigatórios ──────────────────────────────────────
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
      // NÃO envia — a linha ainda está sendo preenchida
      return;
    }

    // ── VALIDAÇÃO 2: CODIGO não pode ser vazio ────────────────────────────────
    var codigo = values[0].toString().trim().toUpperCase();
    if (!codigo) {
      Logger.log('[processRow] Linha ' + rowNumber + ' sem CODIGO — ignorando');
      return;
    }

    // ── VALIDAÇÃO 3: QTD deve ser número >= 0 ────────────────────────────────
    var qtdRaw = values[7].toString().trim();
    var qtd = parseInt(qtdRaw);
    if (isNaN(qtd) || qtd < 0) {
      Logger.log('[processRow] Linha ' + rowNumber + ' QTD inválido: "' + qtdRaw + '" — ignorando');
      return;
    }

    // ── VALIDAÇÃO 4: ATC e VAR devem ser números > 0 ─────────────────────────
    var atcRaw = values[8].toString().replace(',', '.').trim();
    var varRaw = values[9].toString().replace(',', '.').trim();
    var precoAtacado = parseFloat(atcRaw);
    var precoVarejo = parseFloat(varRaw);

    if (isNaN(precoAtacado) || precoAtacado <= 0) {
      Logger.log('[processRow] Linha ' + rowNumber + ' ATC inválido: "' + atcRaw + '" — ignorando');
      return;
    }
    if (isNaN(precoVarejo) || precoVarejo <= 0) {
      Logger.log('[processRow] Linha ' + rowNumber + ' VAR inválido: "' + varRaw + '" — ignorando');
      return;
    }

    // ── VALIDAÇÃO 5: ATIVO deve ser SIM ou NAO ────────────────────────────────
    var ativoRaw = values[10].toString().trim().toUpperCase();
    var isActive = (ativoRaw === 'SIM' || ativoRaw === '1' || ativoRaw === 'TRUE');

    // ── LINHA VÁLIDA — montar payload ─────────────────────────────────────────
    var product = {
      codigo:       codigo,
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

    Logger.log('[processRow] Linha ' + rowNumber + ' válida — enviando ao sistema: ' + JSON.stringify(product));

    // ── ENVIO AO WEBHOOK ──────────────────────────────────────────────────────
    sendToWebhook(product);

  } catch (err) {
    Logger.log('[processRow] Erro na linha ' + rowNumber + ': ' + err.message);
  }
}

// ─── ENVIO AO WEBHOOK ────────────────────────────────────────────────────────

/**
 * Envia o produto validado ao endpoint do sistema via HTTP POST.
 * O sistema decide se vai inserir (produto novo) ou atualizar (produto existente).
 */
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
      muteHttpExceptions: true,  // Não lançar exceção em erros HTTP
      followRedirects: true
    };

    var response = UrlFetchApp.fetch(WEBHOOK_URL, options);
    var statusCode = response.getResponseCode();
    var responseText = response.getContentText();

    if (statusCode === 200) {
      Logger.log('[sendToWebhook] Sucesso: ' + product.codigo + ' — Resposta: ' + responseText);
    } else {
      Logger.log('[sendToWebhook] Erro HTTP ' + statusCode + ' para ' + product.codigo + ': ' + responseText);
    }

  } catch (err) {
    Logger.log('[sendToWebhook] Exceção ao enviar ' + product.codigo + ': ' + err.message);
  }
}

// ─── FUNÇÕES AUXILIARES ───────────────────────────────────────────────────────

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

    // Pular linhas completamente vazias
    if (!values[0] || values[0].toString().trim() === '') {
      continue;
    }

    // Verificar campos obrigatórios
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

    // Montar e enviar produto
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

    // Pausa de 500ms entre envios para não sobrecarregar o servidor
    Utilities.sleep(500);
  }

  Logger.log('[syncAllProducts] Concluído — Enviados: ' + enviados + ', Ignorados: ' + ignorados);
  SpreadsheetApp.getUi().alert('Sincronização concluída!\n\nEnviados: ' + enviados + '\nIgnorados (incompletos): ' + ignorados);
}

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
