// Apps Script de referencia operacional para o envio do modal "Lancamento do evento".
// Planilha alvo: 1ku56cds3LvaFuRHaNGysw-VI2jSq8l1Q6CFOsHmoCXg
// Aba alvo: Registros
// Endpoint implantado e confirmado em 23/08/2026:
// https://script.google.com/macros/s/AKfycbwfL9_ZUjR35Pd_FbLmBKky0hx3a0EQG4JDZicfBVcgUvyQyxHmpz_3wJluFAFYRRra/exec
const EVENTOS_SPREADSHEET_ID = '1ku56cds3LvaFuRHaNGysw-VI2jSq8l1Q6CFOsHmoCXg';
const EVENTOS_REGISTROS_SHEET = 'Registros';
const EVENTOS_HIGHLIGHTS_SPREADSHEET_ID = '11ayJbQFmFPzLegFZHL8kPKCvudpPo60O4NyR3i7aofA';
const EVENTOS_HIGHLIGHTS_SHEET = 'DESTAQUES APP';
const EVENTOS_AUTH_VALIDATION_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzdtxNDDOwGyZ44oMbx4LPktnQvdKemF0c2kdbpD63rmzAsF-tiUDOtheBAgej1SWaH/exec';
const EVENTOS_WRITE_USERS = new Set([
  'wx2064@gmail.com',
  'marcio.henrique82@gmail.com'
]);
const EVENTOS_HEADERS = [
  'Timestamp',
  'Data do Evento',
  'MEMBRO (AUSENTE/ATRASADO)',
  'Tipo de Evento',
  'Descricao do evento',
  'Multiplo do atraso',
  'SUBSTITUTO',
  'TURNO',
  'PAGADOR',
  'CREDOR',
  'VALOR A PAGAR',
  'ORIGEM',
  'HISTORICO DE ALTERACAO',
  'RESPONSAVEL PELO REGISTRO'
];

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const action = String(params.action || 'get').toLowerCase();

  if (action === 'set' || action === 'toggle') {
    return jsonResponse_({
      ok: false,
      message: 'Alteracoes de siglas devem ser enviadas por POST com a sessao autenticada.'
    });
  }

  if (params.sheetName === EVENTOS_HIGHLIGHTS_SHEET) {
    const sheet = getHighlightsSheet_();
    return jsonResponse_({
      ok: true,
      highlights: readHighlights_(sheet)
    });
  }

  return jsonResponse_({
    ok: true,
    spreadsheetId: EVENTOS_SPREADSHEET_ID,
    sheetName: EVENTOS_REGISTROS_SHEET,
    message: 'Apps Script de registros ativo.'
  });
}

function getHighlightsSheet_() {
  const spreadsheet = SpreadsheetApp.openById(EVENTOS_HIGHLIGHTS_SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(EVENTOS_HIGHLIGHTS_SHEET);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(EVENTOS_HIGHLIGHTS_SHEET);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Data', 'Sigla', 'Marcado', 'Atualizado em', 'Atualizado por']);
  }

  return sheet;
}

function setHighlight_(sheet, params, authenticatedEmail) {
  const dateKey = normalizeHighlightDateKey_(params.date);
  const sigla = String(params.sigla || '').trim().toUpperCase();
  const marked = String(params.marked).toLowerCase() === 'true';
  const updatedBy = String(authenticatedEmail || params.updatedBy || '').trim().toLowerCase();

  if (!dateKey || !sigla) {
    throw new Error('Data e sigla sao obrigatorias.');
  }

  if (!EVENTOS_WRITE_USERS.has(updatedBy)) {
    throw new Error('Apenas os usuarios autorizados podem alterar as marcacoes das siglas.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const lastRow = sheet.getLastRow();
    const values = lastRow > 1
      ? sheet.getRange(2, 1, lastRow - 1, 2).getValues()
      : [];
    const matchingRows = [];

    values.forEach((row, index) => {
      if (
        normalizeHighlightDateKey_(row[0]) === dateKey &&
        String(row[1] || '').trim().toUpperCase() === sigla
      ) {
        matchingRows.push(index + 2);
      }
    });

    const now = new Date();
    const updatedByValue = updatedBy.slice(0, 120);

    if (matchingRows.length) {
      matchingRows.forEach((rowNumber) => {
        sheet.getRange(rowNumber, 1, 1, 5).setValues([
          [dateKey, sigla, marked, now, updatedByValue]
        ]);
      });
    } else {
      sheet.appendRow([dateKey, sigla, marked, now, updatedByValue]);
    }
  } finally {
    lock.releaseLock();
  }
}

function readHighlights_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return {};
  }

  const rows = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  const state = {};

  rows.forEach((row) => {
    const dateKey = normalizeHighlightDateKey_(row[0]);
    const sigla = String(row[1] || '').trim().toUpperCase();
    if (!dateKey || !sigla) {
      return;
    }
    if (!state[dateKey]) {
      state[dateKey] = {};
    }
    state[dateKey][sigla] = isHighlightMarked_(row[2]);
  });

  return Object.keys(state).reduce((highlights, dateKey) => {
    const siglas = Object.keys(state[dateKey])
      .filter((sigla) => state[dateKey][sigla])
      .sort();
    if (siglas.length) {
      highlights[dateKey] = siglas;
    }
    return highlights;
  }, {});
}

function isHighlightMarked_(value) {
  return value === true || /^(true|1|sim|x)$/i.test(String(value || '').trim());
}

function normalizeHighlightDateKey_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }

  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const brMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return brMatch
    ? brMatch[3] + '-' + brMatch[2] + '-' + brMatch[1]
    : '';
}

function doPost(e) {
  try {
    const rawPayload = parseJsonPayload_(e);
    if (['set', 'toggle'].includes(String(rawPayload.action || '').toLowerCase())) {
      const authenticatedUser = validateAuthenticatedUser_(rawPayload);
      assertWriteAccess_(authenticatedUser.email);
      const sheet = getHighlightsSheet_();
      setHighlight_(sheet, rawPayload, authenticatedUser.email);
      return jsonResponse_({
        ok: true,
        highlights: readHighlights_(sheet)
      });
    }

    const authenticatedUser = validateAuthenticatedUser_(rawPayload);
    const payload = parsePayload_(rawPayload);
    payload.userEmail = authenticatedUser.email;
    payload.updatedBy = authenticatedUser.email;
    assertWriteAccess_(authenticatedUser.email);
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    var result;

    try {
      const sheet = getRegistrosSheet_();
      ensureHeaders_(sheet);
      result = shouldUpdateRow_(payload)
        ? updateExistingRow_(sheet, payload)
        : appendNewRow_(sheet, payload);
    } finally {
      lock.releaseLock();
    }

    return jsonResponse_({
      ok: true,
      message: result.message,
      savedAt: result.savedAt,
      rowIndex: result.rowIndex,
      history: result.history
    });
  } catch (error) {
    return jsonResponse_({
      ok: false,
      message: error && error.message ? error.message : String(error)
    });
  }
}

function parseJsonPayload_(e) {
  const raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
  return JSON.parse(raw);
}

function parsePayload_(payload) {

  const normalized = {
    operation: pickFirstValue_(payload, ['operation']),
    rowIndex: pickFirstValue_(payload, ['rowIndex']),
    originalTimestamp: pickFirstValue_(payload, ['originalTimestamp']),
    originalHistory: pickFirstValue_(payload, ['originalHistory']),
    originalDataDoEvento: pickFirstValue_(payload, ['originalDataDoEvento']),
    originalMembro: pickFirstValue_(payload, ['originalMembro']),
    originalTipo: pickFirstValue_(payload, ['originalTipo']),
    originalDescricao: pickFirstValue_(payload, ['originalDescricao']),
    originalMultiplo: pickFirstValue_(payload, ['originalMultiplo']),
    originalSubstituto: pickFirstValue_(payload, ['originalSubstituto']),
    originalTurno: pickFirstValue_(payload, ['originalTurno']),
    originalPagador: pickFirstValue_(payload, ['originalPagador']),
    originalCredor: pickFirstValue_(payload, ['originalCredor']),
    originalValor: pickFirstValue_(payload, ['originalValor']),
    userEmail: pickFirstValue_(payload, ['userEmail']),
    updatedBy: pickFirstValue_(payload, ['updatedBy', 'userEmail']),
    dataDoEvento: pickFirstValue_(payload, ['dataDoEvento', 'data']),
    membro: pickFirstValue_(payload, ['membroAusenteAtrasado', 'ausente']),
    tipo: pickFirstValue_(payload, ['tipoDeEvento', 'evento']),
    descricao: pickFirstValue_(payload, ['descricaoDoEvento', 'eventoDescricao']),
    multiplo: pickFirstValue_(payload, ['multiploDoAtraso', 'atrasoTempo']),
    substituto: pickFirstValue_(payload, ['membroSubstituto', 'presente']),
    turno: pickFirstValue_(payload, ['turno']),
    pagador: pickFirstValue_(payload, ['pagador', 'devedor', 'responsavelPeloOnus']),
    credor: pickFirstValue_(payload, ['credor', 'resultadoCredor']),
    valor: normalizeCurrency_(pickFirstValue_(payload, ['valorAPagar', 'valorPagar'])),
    origem: pickFirstValue_(payload, ['origem']),
    criadoEm: pickFirstValue_(payload, ['criadoEmIso', 'criadoEm'])
  };

  if (!normalized.dataDoEvento) {
    throw new Error('Data do Evento e obrigatoria.');
  }
  if (!normalized.membro) {
    throw new Error('MEMBRO (AUSENTE/ATRASADO) e obrigatorio.');
  }
  if (!normalized.tipo) {
    throw new Error('Tipo de Evento e obrigatorio.');
  }
  if (!normalized.pagador) {
    throw new Error('PAGADOR e obrigatorio.');
  }
  if (!normalized.credor) {
    throw new Error('CREDOR e obrigatorio.');
  }
  if (!normalized.valor) {
    throw new Error('VALOR A PAGAR e obrigatorio.');
  }

  return normalized;
}

function shouldUpdateRow_(payload) {
  return String(payload.operation || '').toLowerCase() === 'update' && Number(payload.rowIndex) > 1;
}

function validateAuthenticatedUser_(payload) {
  const authToken = String(payload && payload.authToken || '').trim();
  const deviceToken = String(payload && payload.deviceToken || '').trim();
  const userEmail = String(payload && payload.userEmail || '').trim().toLowerCase();

  if (!authToken && !deviceToken) {
    throw new Error('Sessao autenticada ausente ou expirada. Entre novamente no app.');
  }

  const response = UrlFetchApp.fetch(EVENTOS_AUTH_VALIDATION_ENDPOINT, {
    method: 'post',
    contentType: 'text/plain;charset=utf-8',
    payload: JSON.stringify({
      action: 'auth',
      authToken: authToken,
      deviceToken: deviceToken,
      userEmail: userEmail,
      moduleId: 'EVENTOS',
      pageId: 'eventos',
      path: '/apps/eventos/',
      embedded: false
    }),
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  const text = response.getContentText() || '{}';
  let result;
  try {
    result = JSON.parse(text);
  } catch (error) {
    result = null;
  }

  const email = String(result && result.email || '').trim().toLowerCase();
  if (status < 200 || status >= 300 || !result || result.ok !== true || !email) {
    throw new Error((result && result.message) || 'Sessao autenticada invalida ou expirada. Entre novamente no app.');
  }

  return {
    email: email,
    name: String(result.name || '').trim()
  };
}

function assertWriteAccess_(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!EVENTOS_WRITE_USERS.has(normalizedEmail)) {
    throw new Error('Apenas os usuarios autorizados podem lancar ou editar eventos.');
  }
}

function appendNewRow_(sheet, payload) {
  const row = buildRow_(payload, '');
  sheet.appendRow(row);

  return {
    message: 'Registro salvo.',
    savedAt: row[0],
    rowIndex: sheet.getLastRow(),
    history: ''
  };
}

function updateExistingRow_(sheet, payload) {
  var rowIndex = resolveTargetRowIndex_(sheet, payload);
  if (!rowIndex || rowIndex <= 1 || rowIndex > sheet.getLastRow()) {
    throw new Error('Registro para edicao nao encontrado.');
  }

  var currentRow = sheet.getRange(rowIndex, 1, 1, EVENTOS_HEADERS.length).getDisplayValues()[0];
  var timestamp = String(currentRow[0] || '').trim() || normalizeTimestamp_(payload.originalTimestamp || new Date());
  var previousHistory = String(currentRow[12] || payload.originalHistory || '').trim();
  var currentRegisteredBy = String(currentRow[13] || '').trim();
  var nextRow = buildRow_(payload, previousHistory, timestamp, currentRegisteredBy);
  var historyEntry = buildHistoryEntry_(currentRow, nextRow, payload.updatedBy);

  if (!historyEntry) {
    throw new Error('Nenhuma alteracao foi identificada para salvar.');
  }

  nextRow[12] = previousHistory ? previousHistory + '\n\n' + historyEntry : historyEntry;
  sheet.getRange(rowIndex, 1, 1, EVENTOS_HEADERS.length).setValues([nextRow]);

  return {
    message: 'Registro atualizado.',
    savedAt: nextRow[0],
    rowIndex: rowIndex,
    history: nextRow[12]
  };
}

function resolveTargetRowIndex_(sheet, payload) {
  var explicitRowIndex = Number(payload.rowIndex);
  if (explicitRowIndex > 1 && explicitRowIndex <= sheet.getLastRow()) {
    return explicitRowIndex;
  }

  return findRowIndexBySnapshot_(sheet, payload) || explicitRowIndex;
}

function findRowIndexBySnapshot_(sheet, payload) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return 0;
  }

  var rows = sheet.getRange(2, 1, lastRow - 1, EVENTOS_HEADERS.length).getDisplayValues();
  var target = {
    timestamp: normalizeSnapshotText_(payload.originalTimestamp),
    dataDoEvento: normalizeSnapshotText_(payload.originalDataDoEvento || payload.dataDoEvento),
    membro: normalizeSnapshotText_(payload.originalMembro || payload.membro),
    tipo: normalizeSnapshotText_(payload.originalTipo || payload.tipo),
    descricao: normalizeSnapshotText_(payload.originalDescricao || payload.descricao),
    multiplo: normalizeSnapshotText_(payload.originalMultiplo || payload.multiplo),
    substituto: normalizeSnapshotText_(payload.originalSubstituto || payload.substituto),
    turno: normalizeSnapshotText_(payload.originalTurno || payload.turno),
    pagador: normalizeSnapshotText_(payload.originalPagador || payload.pagador),
    credor: normalizeSnapshotText_(payload.originalCredor || payload.credor),
    valor: normalizeSnapshotText_(payload.originalValor || payload.valor),
    history: normalizeSnapshotText_(payload.originalHistory)
  };

  for (var index = 0; index < rows.length; index += 1) {
    var row = rows[index];
    if (normalizeSnapshotText_(row[0]) === target.timestamp &&
        normalizeSnapshotText_(row[1]) === target.dataDoEvento &&
        normalizeSnapshotText_(row[2]) === target.membro &&
        normalizeSnapshotText_(row[3]) === target.tipo &&
        normalizeSnapshotText_(row[4]) === target.descricao &&
        normalizeSnapshotText_(row[5]) === target.multiplo &&
        normalizeSnapshotText_(row[6]) === target.substituto &&
        normalizeSnapshotText_(row[7]) === target.turno &&
        normalizeSnapshotText_(row[8]) === target.pagador &&
        normalizeSnapshotText_(row[9]) === target.credor &&
        normalizeSnapshotText_(row[10]) === target.valor &&
        (!target.history || normalizeSnapshotText_(row[12]) === target.history)) {
      return index + 2;
    }
  }

  return 0;
}

function buildRow_(payload, history, timestampOverride, registeredByOverride) {
  const timestamp = timestampOverride || normalizeTimestamp_(payload.criadoEm || new Date());
  const dataDoEvento = normalizeDateText_(payload.dataDoEvento);
  const registeredBy = String(registeredByOverride || payload.userEmail || payload.updatedBy || '').trim().toLowerCase();
  if (!registeredBy) {
    throw new Error('E-mail autenticado nao identificado. Entre novamente no app e tente salvar o evento.');
  }

  return [
    timestamp,
    dataDoEvento,
    payload.membro,
    payload.tipo,
    payload.descricao,
    payload.multiplo,
    payload.substituto,
    payload.turno,
    payload.pagador,
    payload.credor,
    normalizeCurrency_(payload.valor),
    payload.origem || 'PWA Eventos de escala',
    String(history || '').trim(),
    registeredBy
  ];
}

function normalizeCurrency_(value) {
  var text = String(value == null ? '' : value).trim();
  if (!text) {
    return '';
  }

  var cleaned = text.replace(/R\$|\s/g, '');
  var normalized = cleaned.indexOf(',') >= 0
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned;
  var numeric = Number(normalized);
  if (!isFinite(numeric)) {
    return text;
  }

  return 'R$ ' + numeric.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function getRegistrosSheet_() {
  const spreadsheet = SpreadsheetApp.openById(EVENTOS_SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(EVENTOS_REGISTROS_SHEET);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(EVENTOS_REGISTROS_SHEET);
  }

  return sheet;
}

function ensureHeaders_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, EVENTOS_HEADERS.length).setValues([EVENTOS_HEADERS]);
    return;
  }

  if (sheet.getMaxColumns() < EVENTOS_HEADERS.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), EVENTOS_HEADERS.length - sheet.getMaxColumns());
  }

  const currentHeaders = sheet.getRange(1, 1, 1, EVENTOS_HEADERS.length).getDisplayValues()[0];
  const needsUpdate = EVENTOS_HEADERS.some(function (header, index) {
    return String(currentHeaders[index] || '').trim() !== header;
  });

  if (needsUpdate) {
    sheet.getRange(1, 1, 1, EVENTOS_HEADERS.length).setValues([EVENTOS_HEADERS]);
  }
}

function pickFirstValue_(source, keys) {
  for (var index = 0; index < keys.length; index += 1) {
    var key = keys[index];
    var value = source && Object.prototype.hasOwnProperty.call(source, key) ? source[key] : '';
    var text = String(value || '').trim();
    if (text) {
      return text;
    }
  }

  return '';
}

function normalizeDateText_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'dd/MM/yyyy');
  }

  var text = String(value || '').trim();
  if (!text) {
    return '';
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    var isoParts = text.split('-');
    return isoParts[2] + '/' + isoParts[1] + '/' + isoParts[0];
  }

  var brMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    return brMatch[1] + '/' + brMatch[2] + '/' + brMatch[3];
  }

  var parsed = new Date(text);
  if (isNaN(parsed.getTime())) {
    return text;
  }

  return Utilities.formatDate(parsed, Session.getScriptTimeZone(), 'dd/MM/yyyy');
}

function normalizeTimestamp_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
  }

  var text = String(value || '').trim();
  if (!text) {
    return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
  }

  var parsed = new Date(text);
  if (isNaN(parsed.getTime())) {
    return text;
  }

  return Utilities.formatDate(parsed, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
}

function normalizeSnapshotText_(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function buildHistoryEntry_(currentRow, nextRow, updatedBy) {
  var labels = [
    'Data do Evento',
    'MEMBRO (AUSENTE/ATRASADO)',
    'Tipo de Evento',
    'Descricao do evento',
    'Multiplo do atraso',
    'SUBSTITUTO',
    'TURNO',
    'PAGADOR',
    'CREDOR',
    'VALOR A PAGAR',
    'ORIGEM'
  ];
  var changes = [];

  for (var index = 1; index <= 11; index += 1) {
    var previousValue = String(currentRow[index] || '').trim();
    var nextValue = String(nextRow[index] || '').trim();
    if (previousValue !== nextValue) {
      changes.push(labels[index - 1] + ': "' + previousValue + '" -> "' + nextValue + '"');
    }
  }

  if (!changes.length) {
    return '';
  }

  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
  return 'Data: ' + now + '\nResponsável: ' + String(updatedBy || '').trim() + '\nAlteração: ' + changes.join('; ');
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
