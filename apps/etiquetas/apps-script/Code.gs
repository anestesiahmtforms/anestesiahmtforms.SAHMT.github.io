const SPREADSHEET_NAME = "Etiquetas";
const SPREADSHEET_ID = "1JBndSbftojjB-UGkBs4USUmCe5ZWdSx57bbZoSia2ME";
const REGISTROS_SHEET = "ETIQUETA";
const LISTAS_SHEET = "Listas";
const OPENAI_MODEL = "gpt-5.2";
const OPENAI_API_KEY_PROPERTY = "OPENAI_API_KEY";
const REGISTROS_HEADERS = [
  "Data",
  "Nome do Paciente",
  "Convênio",
  "Cirurgia",
  "Atendimento",
  "Tipo",
  "Credor",
  "Plantonista(s)",
  "Observacoes",
  "Criado em",
  "Criado por",
  "Observacao atualizada em",
  "Observacao atualizada por",
  "Editado em",
  "Editado por",
  "Resumo da edicao",
  "Valor",
];

const TIPO_OPTIONS = ["Particular", "Complementação", "Convênio", "Consulta Pré-anestésica"];
const CREDOR_OPTIONS = ["Caixa", "Plantão", "Plantão/Caixa"];
const PLANTONISTA_OPTIONS = [
  "AD", "AA", "AL", "BA", "CH", "CR", "DE", "DN", "FL", "FR", "GU", "GB", "IG", "JA",
  "L2", "LE", "LD", "LC", "LH", "LU", "LA", "LO", "MA", "MH", "PR", "RA", "RL", "RC",
  "RO", "RU", "WE",
];

function setup() {
  return ensureWorkbook_();
}

function doGet(e) {
  try {
    const spreadsheet = ensureWorkbook_();
    const action = (e && e.parameter && e.parameter.action) || "";

    if (action === "metadata") {
      return jsonResponse({
        ok: true,
        spreadsheetName: spreadsheet.getName(),
        targetSpreadsheetName: SPREADSHEET_NAME,
        targetSheetName: REGISTROS_SHEET,
        tipoOptions: TIPO_OPTIONS,
        credorOptions: CREDOR_OPTIONS,
        plantonistaOptions: PLANTONISTA_OPTIONS,
      });
    }

    if (action === "summary") {
      const date = String(e.parameter.date || "").trim();
      return jsonResponse({
        ok: true,
        date,
        entries: getEntriesByDate_(date),
      });
    }

    if (action === "summaryMonth") {
      const month = String(e.parameter.month || "").trim();
      return jsonResponse({
        ok: true,
        month,
        entries: getEntriesByMonth_(month),
      });
    }

    if (action === "search") {
      const query = String(e.parameter.q || "").trim();
      const limit = Number(e.parameter.limit || 60);
      return jsonResponse({
        ok: true,
        query,
        entries: searchEntries_(query, limit),
      });
    }

    return jsonResponse({
      ok: true,
      message: "ETIQUETAS SAHMT API online.",
      spreadsheetName: spreadsheet.getName(),
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      message: error.message,
    });
  }
}

function doPost(e) {
  try {
    const payload = JSON.parse((e.postData && e.postData.contents) || "{}");
    const action = String(payload.action || (e.parameter && e.parameter.action) || "").trim();

    if (action === "aiHealth") {
      return handleAiHealth_();
    }

    if (action === "aiExtract") {
      return handleAiExtract_(payload);
    }

    ensureWorkbook_();

    if (action === "updateObservation") {
      return handleUpdateObservation_(payload, getRequestUser_(payload));
    }

    if (action === "updateRecord") {
      return handleUpdateRecord_(payload, getRequestUser_(payload));
    }

    validatePayload_(payload);

    const duplicateRows = findExactDuplicates_(payload);
    if (duplicateRows.length && !String(payload.duplicateJustification || "").trim()) {
      throw new Error("Lancamento duplicado encontrado. Informe uma justificativa para continuar.");
    }

    const sheet = getSpreadsheet_().getSheetByName(REGISTROS_SHEET);
    sheet.appendRow([
      parseIsoDate_(payload.data) || payload.data || "",
      payload.nomePaciente || "",
      payload.convenio || "",
      payload.cirurgia || "",
      payload.atendimento || "",
      payload.tipo || "",
      payload.credor || "",
      payload.plantonistas || "",
      compactCellText_(buildObservacoes_(payload), "Observacao"),
      new Date(),
      getRequestUser_(payload).email,
      "",
      "",
      "",
      "",
      "",
      normalizeCurrency_(payload.valor),
    ]);
    const appendedRow = sheet.getLastRow();
    setCompactCellWithNote_(
      sheet.getRange(appendedRow, REGISTROS_HEADERS.indexOf("Observacoes") + 1),
      buildObservacoes_(payload),
      "Observacao"
    );
    applyRowFormats_(sheet, appendedRow);

    return jsonResponse({
      ok: true,
      message: "Entrada salva com sucesso.",
      entries: getEntriesByDate_(payload.data),
      userEmail: getRequestUser_(payload).email,
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      message: error.message,
    });
  }
}

function getRequestUser_(payload) {
  const email = String(payload && payload.userEmail || "").trim().toLowerCase();
  return {
    email: email || "autenticacao-pagina-principal",
    name: "",
  };
}

function handleAiHealth_() {
  const apiKey = PropertiesService.getScriptProperties().getProperty(OPENAI_API_KEY_PROPERTY);
  if (!apiKey) {
    throw new Error("Configure a propriedade OPENAI_API_KEY no Apps Script.");
  }

  const response = UrlFetchApp.fetch("https://api.openai.com/v1/responses", {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + apiKey,
    },
    payload: JSON.stringify({
      model: OPENAI_MODEL,
      input: "Responda apenas OK.",
      max_output_tokens: 16,
    }),
    muteHttpExceptions: true,
  });
  const status = response.getResponseCode();
  const content = response.getContentText();
  if (status < 200 || status >= 300) {
    throw new Error("API OpenAI nao confirmou a rota de leitura (" + status + "): " + content.slice(0, 200));
  }

  const payload = JSON.parse(content || "{}");
  const outputText = extractOutputText_(payload);

  return jsonResponse({
    ok: true,
    model: OPENAI_MODEL,
    message: outputText ? "IA OpenAI ativa via Responses." : "IA OpenAI respondeu sem texto util.",
  });
}

function handleAiExtract_(payload) {
  const imageDataUrl = String(payload.imageDataUrl || "").trim();
  if (!/^data:image\/(png|jpe?g|webp);base64,/i.test(imageDataUrl)) {
    throw new Error("Imagem invalida para leitura com IA.");
  }

  const apiKey = PropertiesService.getScriptProperties().getProperty(OPENAI_API_KEY_PROPERTY);
  if (!apiKey) {
    throw new Error("Configure a propriedade OPENAI_API_KEY no Apps Script.");
  }

  const prompt = [
    "Voce le etiquetas hospitalares HMT e tambem cards de consulta pre-anestesica.",
    "Extraia somente os campos abaixo e responda em JSON.",
    "Regras:",
    "1. Para etiqueta hospitalar padrao, nomePaciente: texto depois de 'Nome:' e antes de 'Pront:'. Nao inclua Pront nem o numero do prontuario.",
    "2. Para etiqueta hospitalar padrao, convenio: texto depois de 'Convenio:' ate o fim da linha. Nao inclua a palavra Convenio:.",
    "3. Para etiqueta hospitalar padrao, cirurgia: numero impresso abaixo do primeiro codigo de barras, na parte inferior esquerda, proximo de 'N.Cirur'. Deve conter somente digitos.",
    "4. Para etiqueta hospitalar padrao, atendimento: numero impresso abaixo do segundo codigo de barras, na parte inferior direita, proximo de 'N.Atend'. Deve conter somente digitos.",
    "5. Para o modelo de consulta pre-anestesica em formato de card escuro, extraia apenas nomePaciente e atendimento.",
    "6. Quando detectar o modelo de consulta pre-anestesica, preencha tipo exatamente como 'Consulta Pré-anestésica' e credor exatamente como 'Caixa'. Nessa situacao, deixe convenio e cirurgia vazios.",
    "7. Quando detectar a etiqueta hospitalar padrao, deixe tipo e credor vazios para o frontend manter o fluxo atual.",
    "8. Nao troque cirurgia por atendimento e nao use numero de prontuario nesses campos.",
    "9. Preserve o nome e o convenio com grafia natural, corrigindo apenas pequenos erros visuais obvios.",
    "10. Se a foto estiver parcial ou borrada, deixe vazio apenas o campo inseguro.",
    "Se houver duvida, use string vazia no campo duvidoso. Nao invente valores.",
  ].join("\n");

  const requestBody = {
    model: OPENAI_MODEL,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: imageDataUrl, detail: "high" },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "etiqueta_hmt",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["nomePaciente", "convenio", "cirurgia", "atendimento", "tipo", "credor"],
          properties: {
            nomePaciente: { type: "string" },
            convenio: { type: "string" },
            cirurgia: { type: "string" },
            atendimento: { type: "string" },
            tipo: { type: "string" },
            credor: { type: "string" },
          },
        },
      },
    },
  };

  const response = UrlFetchApp.fetch("https://api.openai.com/v1/responses", {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + apiKey,
    },
    payload: JSON.stringify(requestBody),
    muteHttpExceptions: true,
  });

  const status = response.getResponseCode();
  const content = response.getContentText();
  if (status < 200 || status >= 300) {
    throw new Error("Falha na IA (" + status + "): " + content.slice(0, 300));
  }

  const apiResult = JSON.parse(content);
  const outputText = extractOutputText_(apiResult);
  if (!outputText) {
    throw new Error("A IA nao retornou texto estruturado.");
  }

  const extracted = parseJsonObjectSafe_(outputText);
  const nomePaciente = cleanName_(extracted.nomePaciente);
  const convenio = cleanConvenio_(extracted.convenio);
  const cirurgia = sanitizeLabelNumber_(extracted.cirurgia);
  const atendimento = sanitizeLabelNumber_(extracted.atendimento);
  const tipo = normalizeConsultaType_(extracted.tipo);
  const credor = tipo === "Consulta Pré-anestésica" ? "Caixa" : "";

  return jsonResponse({
    ok: true,
    model: OPENAI_MODEL,
    message: "Leitura por IA concluida.",
    nomePaciente,
    convenio,
    cirurgia,
    atendimento,
    tipo,
    credor,
  });
}

function extractOutputText_(apiResult) {
  if (apiResult.output_text) {
    return apiResult.output_text;
  }

  const output = apiResult.output || [];
  for (let i = 0; i < output.length; i += 1) {
    const item = output[i];
    const content = item.content || [];
    for (let j = 0; j < content.length; j += 1) {
      if (content[j].type === "output_text" && content[j].text) {
        return content[j].text;
      }
    }
  }

  return "";
}

function parseJsonObjectSafe_(text) {
  const raw = String(text || "").trim();
  if (!raw) {
    throw new Error("A IA nao retornou JSON.");
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    throw new Error("A IA retornou texto fora do JSON esperado.");
  }
}

function sanitizeLabelNumber_(value) {
  const digits = cleanDigits_(value);
  if (!digits || digits.length < 3) {
    return "";
  }
  return digits;
}

function normalizeConsultaType_(value) {
  const normalized = normalizeCompare_(value);
  if (normalized === "consulta pre-anestesica" || normalized === "consulta pre anestesica") {
    return "Consulta Pré-anestésica";
  }
  return "";
}

function ensureWorkbook_() {
  const spreadsheet = getSpreadsheet_();
  const registros = spreadsheet.getSheetByName(REGISTROS_SHEET) || spreadsheet.insertSheet(REGISTROS_SHEET);
  const listas = spreadsheet.getSheetByName(LISTAS_SHEET) || spreadsheet.insertSheet(LISTAS_SHEET);

  migrateConvenioColumn_(registros);
  ensureHeaders_(registros, REGISTROS_HEADERS);
  seedLists_(listas);
  applyValidations_(registros, listas);
  formatRegistros_(registros);

  return spreadsheet;
}

function ensureHeaders_(sheet, headers) {
  const current = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  const mustRewrite = headers.some((header, index) => current[index] !== header);

  if (mustRewrite) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  sheet.setFrozenRows(1);
}

function migrateConvenioColumn_(sheet) {
  const lastColumn = Math.max(sheet.getLastColumn(), REGISTROS_HEADERS.length);
  if (lastColumn < 3) {
    return;
  }

  const headerValues = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const targetIndex = 2;
  const currentIndex = headerValues.indexOf("Convênio");

  if (currentIndex === targetIndex) {
    return;
  }

  const maxRows = sheet.getMaxRows();
  if (currentIndex === -1) {
    sheet.insertColumnBefore(targetIndex + 1);
    sheet.getRange(1, targetIndex + 1).setValue("Convênio");
    return;
  }

  sheet.insertColumnBefore(targetIndex + 1);
  const shiftedSourceIndex = currentIndex >= targetIndex ? currentIndex + 2 : currentIndex + 1;
  sheet.getRange(1, shiftedSourceIndex, maxRows, 1).copyTo(sheet.getRange(1, targetIndex + 1, maxRows, 1));
  sheet.deleteColumn(shiftedSourceIndex);
}

function seedLists_(sheet) {
  sheet.clear();
  sheet.getRange(1, 1, 1, 3).setValues([["Tipo", "Credor", "Plantonista(s)"]]);
  sheet.getRange(2, 1, TIPO_OPTIONS.length, 1).setValues(TIPO_OPTIONS.map((value) => [value]));
  sheet.getRange(2, 2, CREDOR_OPTIONS.length, 1).setValues(CREDOR_OPTIONS.map((value) => [value]));
  sheet.getRange(2, 3, PLANTONISTA_OPTIONS.length, 1).setValues(PLANTONISTA_OPTIONS.map((value) => [value]));
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, 3);
}

function applyValidations_(registros, listas) {
  const lastRow = Math.max(registros.getMaxRows(), 1000);
  const tipoRule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(listas.getRange(2, 1, TIPO_OPTIONS.length, 1), true)
    .setAllowInvalid(false)
    .build();
  const credorRule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(listas.getRange(2, 2, CREDOR_OPTIONS.length, 1), true)
    .setAllowInvalid(false)
    .build();

  registros.getRange(2, 1, lastRow - 1, REGISTROS_HEADERS.length).clearDataValidations();
  registros.getRange(2, 6, lastRow - 1, 1).setDataValidation(tipoRule);
  registros.getRange(2, 7, lastRow - 1, 1).setDataValidation(credorRule);
}

function formatRegistros_(sheet) {
  const headerRange = sheet.getRange(1, 1, 1, REGISTROS_HEADERS.length);
  headerRange
    .setBackground("#0b3f3a")
    .setFontColor("#ffffff")
    .setFontWeight("bold");
  sheet.getRange(2, 1, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat("dd/mm/yyyy");
  sheet.getRange(2, 10, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat("dd/mm/yyyy hh:mm:ss");
  sheet.getRange(2, 12, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat("dd/mm/yyyy hh:mm:ss");
  sheet.getRange(2, 14, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat("dd/mm/yyyy hh:mm:ss");
  sheet.getRange(2, REGISTROS_HEADERS.indexOf("Valor") + 1, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat("R$ #,##0.00");
  sheet.autoResizeColumns(1, REGISTROS_HEADERS.length);
}

function applyRowFormats_(sheet, rowNumber) {
  if (rowNumber < 2) {
    return;
  }

  sheet.getRange(rowNumber, 1).setNumberFormat("dd/mm/yyyy");
  sheet.getRange(rowNumber, 10).setNumberFormat("dd/mm/yyyy hh:mm:ss");
  sheet.getRange(rowNumber, 12).setNumberFormat("dd/mm/yyyy hh:mm:ss");
  sheet.getRange(rowNumber, 14).setNumberFormat("dd/mm/yyyy hh:mm:ss");
  sheet.getRange(rowNumber, REGISTROS_HEADERS.indexOf("Valor") + 1).setNumberFormat("R$ #,##0.00");
}

function normalizeCurrency_(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return "";
  }

  const cleaned = text.replace(/R\$|\s/g, "");
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) {
    return text;
  }

  return "R$ " + numeric.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function validatePayload_(payload) {
  if (payload.consulta === true || String(payload.tipo || "").trim() === "Consulta Pré-anestésica") {
    const consultaRequired = ["data", "nomePaciente", "atendimento", "credor"];
    const consultaMissing = consultaRequired.filter((key) => !String(payload[key] || "").trim());
    if (consultaMissing.length) {
      throw new Error("Campos obrigatorios ausentes: " + consultaMissing.join(", "));
    }
    if (String(payload.credor || "").trim() !== "Caixa") {
      throw new Error("Consultas devem usar o credor Caixa.");
    }
    return;
  }
  const required = ["data", "nomePaciente", "cirurgia", "atendimento", "tipo", "credor"];
  if (isFinancialType_(payload.tipo)) {
    required.push("valor");
  }
  required.push("convenio");
  if (payload.credor !== "Caixa") {
    required.push("plantonistas");
  }

  const missing = required.filter((key) => !String(payload[key] || "").trim());
  if (missing.length) {
    throw new Error("Campos obrigatorios ausentes: " + missing.join(", "));
  }
}

function validateUpdatePayload_(payload) {
  const required = ["data", "nomePaciente", "cirurgia", "atendimento", "tipo", "credor"];
  if (payload.credor !== "Caixa") {
    required.push("plantonistas");
  }

  const missing = required.filter((key) => !String(payload[key] || "").trim());
  if (missing.length) {
    throw new Error("Campos obrigatorios ausentes: " + missing.join(", "));
  }
}

function handleUpdateObservation_(payload, user) {
  const rowNumber = Number(payload.rowNumber || 0);
  if (!Number.isInteger(rowNumber) || rowNumber < 2) {
    throw new Error("Registro invalido para atualizar observacao.");
  }

  const sheet = getSpreadsheet_().getSheetByName(REGISTROS_SHEET);
  if (!sheet || rowNumber > sheet.getLastRow()) {
    throw new Error("Registro nao encontrado na planilha.");
  }

  const observacoesColumn = REGISTROS_HEADERS.indexOf("Observacoes") + 1;
  const observacaoAtualizadaEmColumn = REGISTROS_HEADERS.indexOf("Observacao atualizada em") + 1;
  const observacaoAtualizadaPorColumn = REGISTROS_HEADERS.indexOf("Observacao atualizada por") + 1;
  setCompactCellWithNote_(
    sheet.getRange(rowNumber, observacoesColumn),
    String(payload.observacoes || "").trim(),
    "Observacao"
  );
  sheet.getRange(rowNumber, observacaoAtualizadaEmColumn).setValue(new Date());
  sheet.getRange(rowNumber, observacaoAtualizadaPorColumn).setValue(user.email);
  applyRowFormats_(sheet, rowNumber);

  return jsonResponse({
    ok: true,
    message: "Observacao atualizada com sucesso.",
    userEmail: user.email,
    entry: rowToEntryFromSheet_(sheet, rowNumber),
  });
}

function handleUpdateRecord_(payload, user) {
  const rowNumber = Number(payload.rowNumber || 0);
  if (!Number.isInteger(rowNumber) || rowNumber < 2) {
    throw new Error("Registro invalido para editar.");
  }

  validateUpdatePayload_(payload);

  const sheet = getSpreadsheet_().getSheetByName(REGISTROS_SHEET);
  if (!sheet || rowNumber > sheet.getLastRow()) {
    throw new Error("Registro nao encontrado na planilha.");
  }

  const oldEntry = rowToEntryFromSheet_(sheet, rowNumber);
  const updatedValues = [
    parseIsoDate_(payload.data) || payload.data || "",
    payload.nomePaciente || "",
    payload.convenio || "",
    payload.cirurgia || "",
    payload.atendimento || "",
    payload.tipo || "",
    payload.credor || "",
    payload.credor === "Caixa" ? "" : (payload.plantonistas || ""),
    compactCellText_(String(payload.observacoes || "").trim(), "Observacao"),
  ];
  const changeSummary = buildEditSummary_(oldEntry, payload);
  const observationChanged = normalizeCompare_(oldEntry.observacoes || "") !== normalizeCompare_(payload.observacoes || "");

  sheet.getRange(rowNumber, 1, 1, 9).setValues([updatedValues]);
  sheet.getRange(rowNumber, REGISTROS_HEADERS.indexOf("Valor") + 1).setValue(isFinancialType_(payload.tipo) ? normalizeCurrency_(payload.valor) : "");
  setCompactCellWithNote_(
    sheet.getRange(rowNumber, REGISTROS_HEADERS.indexOf("Observacoes") + 1),
    String(payload.observacoes || "").trim(),
    "Observacao"
  );

  const observacaoAtualizadaEmColumn = REGISTROS_HEADERS.indexOf("Observacao atualizada em") + 1;
  const observacaoAtualizadaPorColumn = REGISTROS_HEADERS.indexOf("Observacao atualizada por") + 1;
  const editadoEmColumn = REGISTROS_HEADERS.indexOf("Editado em") + 1;
  const editadoPorColumn = REGISTROS_HEADERS.indexOf("Editado por") + 1;
  const resumoEdicaoColumn = REGISTROS_HEADERS.indexOf("Resumo da edicao") + 1;
  if (observationChanged) {
    sheet.getRange(rowNumber, observacaoAtualizadaEmColumn).setValue(new Date());
    sheet.getRange(rowNumber, observacaoAtualizadaPorColumn).setValue(user.email);
  }
  if (changeSummary) {
    sheet.getRange(rowNumber, editadoEmColumn).setValue(new Date());
    sheet.getRange(rowNumber, editadoPorColumn).setValue(user.email);
    setCompactCellWithNote_(
      sheet.getRange(rowNumber, resumoEdicaoColumn),
      appendEditHistory_(
        oldEntry.resumoEdicao,
        changeSummary,
        user.email
      ),
      "Edicao"
    );
  }
  applyRowFormats_(sheet, rowNumber);

  return jsonResponse({
    ok: true,
    message: "Registro editado com sucesso.",
    userEmail: user.email,
    entry: rowToEntryFromSheet_(sheet, rowNumber),
  });
}

function buildEditSummary_(oldEntry, payload) {
  const fields = [
    { key: "data", label: "Data", oldValue: normalizeDate_(oldEntry.data), newValue: normalizeDate_(payload.data) },
    { key: "nomePaciente", label: "Nome", oldValue: oldEntry.nomePaciente, newValue: payload.nomePaciente },
    { key: "cirurgia", label: "Cirurgia", oldValue: oldEntry.cirurgia, newValue: payload.cirurgia },
    { key: "atendimento", label: "Atendimento", oldValue: oldEntry.atendimento, newValue: payload.atendimento },
    { key: "tipo", label: "Tipo", oldValue: oldEntry.tipo, newValue: payload.tipo },
    { key: "valor", label: "Valor", oldValue: oldEntry.valor, newValue: isFinancialType_(payload.tipo) ? payload.valor : "" },
    { key: "convenio", label: "Convênio", oldValue: oldEntry.convenio, newValue: payload.convenio || "" },
    { key: "credor", label: "Credor", oldValue: oldEntry.credor, newValue: payload.credor },
    { key: "plantonistas", label: "Plantonista(s)", oldValue: oldEntry.plantonistas, newValue: payload.credor === "Caixa" ? "" : payload.plantonistas },
  ];

  return fields
    .filter(function(field) {
      return normalizeCompare_(field.oldValue || "") !== normalizeCompare_(field.newValue || "");
    })
    .map(function(field) {
      const oldText = formatEditValue_(field.oldValue);
      const newText = formatEditValue_(field.newValue);
      return field.label + ": " + oldText + " -> " + newText;
    })
    .join("; ")
    .slice(0, 480);
}

function formatEditValue_(value) {
  const text = String(value || "").trim();
  return text || "(vazio)";
}

function appendEditHistory_(previousHistory, changeSummary, userEmail) {
  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");
  const line = timestamp + " - " + userEmail + ": " + String(changeSummary || "").trim();
  const previous = String(previousHistory || "").trim();
  const history = previous ? line + "\n" + previous : line;
  return history.slice(0, 4000);
}

function buildObservacoes_(payload) {
  const observacoes = String(payload.observacoes || "").trim();
  const duplicateJustification = String(payload.duplicateJustification || "").trim();
  if (duplicateJustification && observacoes.indexOf("Duplicidade justificada:") === -1) {
    return "Duplicidade justificada: " + duplicateJustification;
  }

  return observacoes;
}

function findExactDuplicates_(payload) {
  const date = normalizeDate_(payload.data);
  return getEntriesByDate_(date).filter(function(entry) {
    return normalizeCompare_(entry.nomePaciente) === normalizeCompare_(payload.nomePaciente) &&
      cleanDigits_(entry.cirurgia) === cleanDigits_(payload.cirurgia) &&
      cleanDigits_(entry.atendimento) === cleanDigits_(payload.atendimento) &&
      normalizeCompare_(entry.tipo) === normalizeCompare_(payload.tipo) &&
      normalizeCompare_(entry.valor || "") === normalizeCompare_(payload.valor || "") &&
      normalizeCompare_(entry.convenio || "") === normalizeCompare_(payload.convenio || "") &&
      normalizeCompare_(entry.credor) === normalizeCompare_(payload.credor) &&
      normalizeCompare_(entry.plantonistas || "") === normalizeCompare_(payload.plantonistas || "");
  });
}

function getEntriesByDate_(date) {
  return getAllEntries_()
    .filter((entry) => entry.data === date);
}

function getEntriesByMonth_(month) {
  return getAllEntries_()
    .filter((entry) => entry.data.slice(0, 7) === month);
}

function searchEntries_(query, limit) {
  const normalizedQuery = normalizeCompare_(query);
  if (!normalizedQuery) {
    return [];
  }

  const maxRows = Math.min(Math.max(Number(limit || 60), 1), 200);
  return getAllEntries_()
    .filter(function(entry) {
      return normalizeCompare_([
        entry.data,
        entry.nomePaciente,
        entry.cirurgia,
        entry.atendimento,
        entry.tipo,
        entry.valor,
        entry.convenio,
        entry.credor,
        entry.plantonistas,
        entry.observacoes,
        entry.criadoPor,
        entry.observacaoAtualizadaPor,
        entry.editadoPor,
        entry.resumoEdicao,
      ].join(" ")).indexOf(normalizedQuery) !== -1;
    })
    .slice(-maxRows)
    .reverse();
}

function getAllEntries_() {
  const sheet = getSpreadsheet_().getSheetByName(REGISTROS_SHEET);
  if (!sheet) {
    return [];
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }

  const dataRange = sheet.getRange(2, 1, lastRow - 1, REGISTROS_HEADERS.length);
  const values = dataRange.getDisplayValues();
  const notes = dataRange.getNotes();
  return values
    .map((row, index) => rowToEntry_(row, index + 2, notes[index]));
}

function rowToEntry_(row, rowNumber, notes) {
  notes = notes || [];
  return {
    rowNumber,
    data: normalizeDate_(row[0]),
    nomePaciente: row[1],
    convenio: row[2],
    cirurgia: row[3],
    atendimento: row[4],
    tipo: row[5],
    credor: row[6],
    plantonistas: row[7],
    observacoes: notes[8] || row[8],
    criadoEm: row[9],
    criadoPor: row[10],
    observacaoAtualizadaEm: row[11],
    observacaoAtualizadaPor: row[12],
    editadoEm: row[13],
    editadoPor: row[14],
    resumoEdicao: notes[15] || row[15],
    valor: normalizeCurrency_(row[16]),
  };
}

function rowToEntryFromSheet_(sheet, rowNumber) {
  const range = sheet.getRange(rowNumber, 1, 1, REGISTROS_HEADERS.length);
  return rowToEntry_(range.getDisplayValues()[0], rowNumber, range.getNotes()[0]);
}

function setCompactCellWithNote_(range, fullText, label) {
  const text = String(fullText || "").trim();
  range.setValue(compactCellText_(text, label));
  if (text) {
    range.setNote(text);
  } else {
    range.clearNote();
  }
}

function compactCellText_(fullText, label) {
  const text = String(fullText || "").trim();
  if (!text) {
    return "";
  }

  return label + " em nota";
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function normalizeDate_(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value)) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }

  const text = String(value || "").trim();
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return text;
  }

  const ymdSlashMatch = text.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (ymdSlashMatch) {
    return ymdSlashMatch[1] + "-" + ymdSlashMatch[2] + "-" + ymdSlashMatch[3];
  }

  const brMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    return brMatch[3] + "-" + brMatch[2] + "-" + brMatch[1];
  }

  return text;
}

function parseIsoDate_(value) {
  const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function normalizeCompare_(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isFinancialType_(value) {
  const normalized = normalizeCompare_(value);
  return normalized === "particular" || normalized === "complementacao";
}

function isComplementacaoType_(value) {
  return normalizeCompare_(value) === "complementacao";
}

function cleanDigits_(value) {
  return String(value || "").replace(/\D/g, "");
}

function cleanName_(value) {
  return String(value || "")
    .replace(/\bPront\s*:.*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function cleanConvenio_(value) {
  return String(value || "")
    .replace(/^\s*Convenio\s*:\s*/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
