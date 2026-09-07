/**
 * Acompanhamento dos treinamentos SAHMT.
 * Implantar como aplicativo da web, executando como a conta proprietaria.
 */
const CONFIG = Object.freeze({
  spreadsheetId: "1NSICSqiTpmntdzEiuuc9CSBHgeZrSKw65X5yXfFq5x4",
  trainingSheet: "Treinamentos",
  participationSheet: "Participações",
  participantSheet: "Participantes",
  trainingId: "treinamento-app",
  trainingTitle: "Treinamento App",
  trainingUrl: "https://sites.google.com/view/sahmtbh/treinamentos/treinamentos-do-app"
});

function doGet(e) {
  const email = getAuthenticatedEmail_(e);
  const allowed = email && isParticipantAllowed_(email);
  const accessId = allowed ? Utilities.getUuid() : "";
  if (allowed) recordAccess_(accessId, email);

  const template = HtmlService.createTemplate(html_());
  template.state = { allowed, email: email || "", accessId,
    trainingId: CONFIG.trainingId, trainingTitle: CONFIG.trainingTitle, trainingUrl: CONFIG.trainingUrl };
  return template.evaluate().setTitle(CONFIG.trainingTitle)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function completeTraining(accessId, email, trainingId) {
  const normalizedEmail = normalizeEmail_(email);
  if (!accessId || !normalizedEmail || trainingId !== CONFIG.trainingId) throw new Error("Dados de conclusao invalidos.");
  if (!isParticipantAllowed_(normalizedEmail)) throw new Error("Usuario nao autorizado para este treinamento.");

  const sheet = getSpreadsheet_().getSheetByName(CONFIG.participationSheet);
  if (!sheet) throw new Error("A aba Participações nao foi encontrada.");
  const values = sheet.getDataRange().getValues();
  const now = new Date();
  for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    const row = values[rowIndex];
    if (String(row[0] || "") !== accessId || normalizeEmail_(row[1]) !== normalizedEmail || String(row[2] || "") !== CONFIG.trainingId) continue;
    if (String(row[5] || "") === "Concluido") return { success: true, alreadyCompleted: true, points: Number(row[6] || 0) };
    const points = getTrainingPoints_().access + getTrainingPoints_().completion;
    sheet.getRange(rowIndex + 1, 5, 1, 4).setValues([[now, "Concluido", points, now]]);
    return { success: true, alreadyCompleted: false, points };
  }
  throw new Error("Acesso nao localizado para conclusao.");
}

function getAuthenticatedEmail_(e) {
  const parameterEmail = e && e.parameter
    ? (e.parameter.userEmail || e.parameter.email)
    : "";
  const clientEmail = normalizeEmail_(parameterEmail);

  // O app ja concluiu a autenticacao e envia este email ao abrir o treinamento.
  // Ele e validado novamente contra a aba Participantes antes de qualquer registro.
  if (clientEmail) {
    return clientEmail;
  }

  return normalizeEmail_(Session.getActiveUser().getEmail());
}

function isParticipantAllowed_(email) {
  const sheet = getSpreadsheet_().getSheetByName(CONFIG.participantSheet);
  if (!sheet) throw new Error("A aba Participantes nao foi encontrada.");
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  return sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues()
    .some((row) => normalizeEmail_(row[0]) === email);
}

function recordAccess_(accessId, email) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSpreadsheet_().getSheetByName(CONFIG.participationSheet);
    if (!sheet) throw new Error("A aba Participações nao foi encontrada.");
    const now = new Date();
    sheet.appendRow([accessId, email, CONFIG.trainingId, now, "", "Acessado", getTrainingPoints_().access, now]);
  } finally {
    lock.releaseLock();
  }
}

function getTrainingPoints_() {
  const sheet = getSpreadsheet_().getSheetByName(CONFIG.trainingSheet);
  if (!sheet || sheet.getLastRow() < 2) return { access: 1, completion: 10 };
  const row = sheet.getRange(2, 1, 1, 6).getValues()[0];
  return { access: Number(row[3]) || 1, completion: Number(row[4]) || 10 };
}

function getSpreadsheet_() { return SpreadsheetApp.openById(CONFIG.spreadsheetId); }
function normalizeEmail_(value) { return String(value || "").trim().toLowerCase(); }

function html_() {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title><?= state.trainingTitle ?></title><style>
:root{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}body{margin:0;min-height:100vh;color:#0b2844;background:linear-gradient(145deg,#e8f2f2,#f7ead4)}main{width:min(92vw,760px);margin:auto;padding:24px 0 34px}.card{overflow:hidden;border:1px solid #fff;border-radius:26px;background:#ffffffc7;box-shadow:0 18px 50px #0b284428}header{padding:22px 24px;background:linear-gradient(135deg,#d8eee8,#f7e9cc)}h1{margin:0;text-align:center;font-size:clamp(1.45rem,5vw,2.1rem)}.user{margin:8px 0 0;color:#157760;font-weight:700;text-align:center;overflow-wrap:anywhere}.content{padding:20px}.video{width:100%;min-height:55vh;border:0;border-radius:18px;background:#dbe8ec}.notice{margin:16px 0;padding:13px 15px;border-radius:14px;background:#fff0d5;color:#70491f;font-weight:650}button{width:100%;min-height:52px;border:0;border-radius:18px;color:#fff;background:linear-gradient(135deg,#187e6a,#0d554e);font-size:1rem;font-weight:800;cursor:pointer;box-shadow:0 8px 18px #0d554e38}button:disabled{opacity:.65;cursor:wait}.success{color:#116c48;font-weight:800}.error{color:#a32828;font-weight:700}</style></head><body><main><section class="card"><header><h1><?= state.trainingTitle ?></h1><? if (state.email) { ?><p class="user">Acesso: <?= state.email ?></p><? } ?></header><div class="content"><? if (!state.allowed) { ?><p class="error">Este treinamento esta disponivel somente para participantes autorizados.</p><? } else { ?><p class="notice">Assista ao conteudo e, ao final, confirme sua participacao.</p><iframe class="video" src="<?= state.trainingUrl ?>" title="Conteudo do treinamento" allowfullscreen></iframe><p id="status" aria-live="polite"></p><button id="complete" type="button">Concluir treinamento</button><? } ?></div></section></main><? if (state.allowed) { ?><script>
const button=document.getElementById("complete"),status=document.getElementById("status");button.addEventListener("click",()=>{button.disabled=true;status.className="";status.textContent="Registrando conclusao...";google.script.run.withSuccessHandler(result=>{status.className="success";status.textContent=result.alreadyCompleted?"Este treinamento ja havia sido concluido.":"Conclusao registrada. Pontuacao: "+result.points+" ponto(s).";button.textContent="Treinamento concluido";}).withFailureHandler(error=>{button.disabled=false;status.className="error";status.textContent=error&&error.message?error.message:"Nao foi possivel registrar a conclusao.";}).completeTraining(<?= JSON.stringify(state.accessId) ?>,<?= JSON.stringify(state.email) ?>,<?= JSON.stringify(state.trainingId) ?>);});</script><? } ?></body></html>`;
}
