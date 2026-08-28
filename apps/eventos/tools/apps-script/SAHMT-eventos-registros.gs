// Apps Script de referencia operacional para o envio do modal "Lancamento do evento".
// Planilha alvo: 1ku56cds3LvaFuRHaNGysw-VI2jSq8l1Q6CFOsHmoCXg
// Aba alvo: Registros
// Endpoint implantado e confirmado em 23/08/2026:
// https://script.google.com/macros/s/AKfycbxxxOJEr7olF0-n_2LPcppbUj-vTXimoprqCPNDx6pnc5QRALhtndZD9iT0XfTsDrM/exec
const EVENTOS_SPREADSHEET_ID = '1ku56cds3LvaFuRHaNGysw-VI2jSq8l1Q6CFOsHmoCXg';
const EVENTOS_REGISTROS_SHEET = 'Registros';
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
  'HISTORICO DE ALTERACAO'
];

function doGet() {
  return jsonResponse_({
    ok: true,
    spreadsheetId: EVENTOS_SPREADSHEET_ID,
    sheetName: EVENTOS_REGISTROS_SHEET,
    message: 'Apps Script de registros ativo.'
  });
}

function doPost(e) {
  try {
    const payload = parsePayload_(e);
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

function parsePayload_(e) {
  const raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
  const payload = JSON.parse(raw);

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
    updatedBy: pickFirstValue_(payload, ['updatedBy']),
    dataDoEvento: pickFirstValue_(payload, ['dataDoEvento', 'data']),
    membro: pickFirstValue_(payload, ['membroAusenteAtrasado', 'ausente']),
    tipo: pickFirstValue_(payload, ['tipoDeEvento', 'evento']),
    descricao: pickFirstValue_(payload, ['descricaoDoEvento', 'eventoDescricao']),
    multiplo: pickFirstValue_(payload, ['multiploDoAtraso', 'atrasoTempo']),
    substituto: pickFirstValue_(payload, ['membroSubstituto', 'presente']),
    turno: pickFirstValue_(payload, ['turno']),
    pagador: pickFirstValue_(payload, ['pagador', 'devedor', 'responsavelPeloOnus']),
    credor: pickFirstValue_(payload, ['credor', 'resultadoCredor']),
    valor: pickFirstValue_(payload, ['valorAPagar', 'valorPagar']),
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
  var nextRow = buildRow_(payload, previousHistory, timestamp);
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

function buildRow_(payload, history, timestampOverride) {
  const timestamp = timestampOverride || normalizeTimestamp_(payload.criadoEm || new Date());
  const dataDoEvento = normalizeDateText_(payload.dataDoEvento);

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
    payload.valor,
    payload.origem || 'PWA Eventos de escala',
    String(history || '').trim()
  ];
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
  return 'Data: ' + now + '\nResponsável: ' + String(updatedBy || 'Acesso local').trim() + '\nAlteração: ' + changes.join('; ');
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
