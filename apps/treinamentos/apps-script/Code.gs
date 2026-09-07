/**
 * Treinamentos SAHMT com acompanhamento de reproducao do YouTube.
 * Implantar como aplicativo da web, executando como a conta proprietaria.
 */
const CONFIG = Object.freeze({
  spreadsheetId: "1NSICSqiTpmntdzEiuuc9CSBHgeZrSKw65X5yXfFq5x4",
  trainingSheet: "Treinamentos",
  participationSheet: "Participações",
  participantSheet: "Participantes"
});

function doGet(e) {
  const email = getAuthenticatedEmail_(e);
  const trainingId = String(e && e.parameter ? e.parameter.trainingId || "" : "").trim();
  const trainings = getTrainings_();
  const training = trainings.find((item) => item.id === trainingId) || null;
  const allowed = Boolean(email && isParticipantAllowed_(email));
  const accessId = allowed && training ? recordAccess_(email, training.id) : "";

  const template = HtmlService.createTemplate(html_());
  template.state = {
    allowed,
    email: email || "",
    accessId,
    training: training ? {
      id: training.id,
      title: training.title,
      videoId: training.videoId,
      videoUrl: training.videoUrl
    } : null,
    trainings,
    trainingCatalogJson: JSON.stringify(trainings)
  };

  return template.evaluate()
    .setTitle(training ? training.title : "Treinamentos SAHMT")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function completeTraining(accessId, email, trainingId) {
  const normalizedEmail = normalizeEmail_(email);
  const training = getTrainings_().find((item) => item.id === trainingId);
  if (!accessId || !normalizedEmail || !training) {
    throw new Error("Dados de conclusao invalidos.");
  }
  if (!isParticipantAllowed_(normalizedEmail)) {
    throw new Error("Usuario nao autorizado para este treinamento.");
  }

  const sheet = getSpreadsheet_().getSheetByName(CONFIG.participationSheet);
  if (!sheet) throw new Error("A aba Participações nao foi encontrada.");
  const values = sheet.getDataRange().getValues();
  const now = new Date();

  for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    const row = values[rowIndex];
    if (String(row[0] || "") !== accessId ||
        normalizeEmail_(row[1]) !== normalizedEmail ||
        String(row[2] || "") !== training.id) continue;
    if (String(row[5] || "") === "Concluido") {
      return { success: true, alreadyCompleted: true, points: Number(row[6] || 0) };
    }

    const points = training.accessPoints + training.completionPoints;
    sheet.getRange(rowIndex + 1, 5, 1, 4)
      .setValues([[now, "Concluido", points, now]]);
    return { success: true, alreadyCompleted: false, points };
  }

  throw new Error("Acesso nao localizado para conclusao.");
}

function getAuthenticatedEmail_(e) {
  const parameterEmail = e && e.parameter
    ? (e.parameter.userEmail || e.parameter.email)
    : "";
  const clientEmail = normalizeEmail_(parameterEmail);
  return clientEmail || normalizeEmail_(Session.getActiveUser().getEmail());
}

function isParticipantAllowed_(email) {
  const sheet = getSpreadsheet_().getSheetByName(CONFIG.participantSheet);
  if (!sheet) throw new Error("A aba Participantes nao foi encontrada.");
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  return sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues()
    .some((row) => normalizeEmail_(row[0]) === email);
}

function recordAccess_(email, trainingId) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSpreadsheet_().getSheetByName(CONFIG.participationSheet);
    if (!sheet) throw new Error("A aba Participações nao foi encontrada.");
    const values = sheet.getDataRange().getValues();

    for (let rowIndex = values.length - 1; rowIndex >= 1; rowIndex -= 1) {
      const row = values[rowIndex];
      if (normalizeEmail_(row[1]) === email && String(row[2] || "") === trainingId) {
        return String(row[0] || "");
      }
    }

    const training = getTrainings_().find((item) => item.id === trainingId);
    const accessId = Utilities.getUuid();
    const now = new Date();
    sheet.appendRow([
      accessId,
      email,
      trainingId,
      now,
      "",
      "Acessado",
      training ? training.accessPoints : 1,
      now
    ]);
    return accessId;
  } finally {
    lock.releaseLock();
  }
}

function getTrainings_() {
  const sheet = getSpreadsheet_().getSheetByName(CONFIG.trainingSheet);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 6)
    .getDisplayValues()
    .filter((row) => row[0] && row[5].toLowerCase() !== "false")
    .map((row) => ({
      id: row[0].trim(),
      title: row[1].trim(),
      videoUrl: row[2].trim(),
      videoId: extractYouTubeId_(row[2]),
      accessPoints: Number(row[3]) || 1,
      completionPoints: Number(row[4]) || 10
    }));
}

function extractYouTubeId_(value) {
  const text = String(value || "").trim();
  const match = text.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([^?&/]+)/i);
  return match ? match[1] : "";
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(CONFIG.spreadsheetId);
}

function normalizeEmail_(value) {
  return String(value || "").trim().toLowerCase();
}

function html_() {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Treinamentos SAHMT</title>
<style>
:root{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}body{margin:0;min-height:100vh;color:#0b2844;background:linear-gradient(145deg,#e8f2f2,#f7ead4)}main{width:min(94vw,760px);margin:auto;padding:20px 0 32px}.card{overflow:hidden;border:1px solid #fff;border-radius:26px;background:#ffffffc7;box-shadow:0 18px 50px #0b284428}header{padding:22px 20px;text-align:center;background:linear-gradient(135deg,#d8eee8,#f7e9cc)}h1{margin:0;font-size:clamp(1.4rem,5vw,2rem)}.user{margin:8px 0 0;color:#157760;font-weight:700;overflow-wrap:anywhere}.content{padding:20px}.notice{margin:0 0 16px;padding:13px 15px;border-radius:14px;background:#fff0d5;color:#70491f;font-weight:650}.catalog{display:grid;gap:12px}.training-link{display:flex;align-items:center;justify-content:center;min-height:64px;padding:0 18px;border-radius:18px;color:#fff;background:linear-gradient(135deg,#187e6a,#0d554e);font-weight:800;text-align:center;text-decoration:none;box-shadow:0 8px 18px #0d554e38}.player-wrap{position:relative;padding:0}.player{width:100%;aspect-ratio:16/9;border-radius:18px;background:#dbe8ec}.question-modal{position:absolute;inset:0;display:none;align-items:center;justify-content:center;padding:18px;border-radius:18px;background:#0b284499;z-index:2}.question-modal.visible{display:flex}.question-card{width:min(92%,420px);padding:22px 18px;border:2px solid #fff;border-radius:20px;background:#fffaf0;color:#0b2844;text-align:center;box-shadow:0 12px 32px #0b284455}.question-card h2{margin:0 0 16px;font-size:clamp(1.1rem,4vw,1.45rem)}.question-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}.question-actions button{min-height:48px}.question-actions .no{background:linear-gradient(135deg,#b95050,#8d2929)}.progress{height:10px;margin:16px 0 8px;border-radius:99px;background:#d8e5e5;overflow:hidden}.progress-bar{width:0;height:100%;background:#16805f;transition:width .2s}.status{min-height:24px;font-weight:700}.success{color:#116c48}.error{color:#a32828}button{width:100%;min-height:54px;border:0;border-radius:18px;color:#fff;background:linear-gradient(135deg,#187e6a,#0d554e);font-size:1rem;font-weight:800;cursor:pointer;box-shadow:0 8px 18px #0d554e38}button:disabled{opacity:.6;cursor:not-allowed}
</style>
</head>
<body>
<main><section class="card"><header><h1><?= state.training ? state.training.title : "Treinamentos SAHMT" ?></h1><? if (state.email) { ?><p class="user">Acesso: <?= state.email ?></p><? } ?></header><div class="content">
<? if (!state.allowed) { ?><p class="error">Este treinamento esta disponivel somente para participantes autorizados.</p><? } else if (!state.training) { ?><p class="notice">Escolha um treinamento para iniciar.</p><div id="catalog" class="catalog"></div><? } else { ?><p class="notice">Assista ao video completo. Na metade, responda a pergunta para continuar. A confirmacao sera liberada ao atingir 95% de reproducao e o final do video.</p><div class="player-wrap"><iframe id="youtubeFrame" class="player" src="https://www.youtube.com/embed/<?= state.training ? state.training.videoId : "" ?>?enablejsapi=1&playsinline=1&rel=0" title="<?= state.training ? state.training.title : "Treinamento SAHMT" ?>" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe><div id="questionModal" class="question-modal" role="dialog" aria-modal="true" aria-labelledby="questionTitle"><div class="question-card"><h2 id="questionTitle">Está entendendo?</h2><div class="question-actions"><button id="answerYes" type="button">Sim</button><button id="answerNo" class="no" type="button">Não</button></div></div></div></div><div class="progress" aria-label="Progresso do video"><div id="progressBar" class="progress-bar"></div></div><p id="status" class="status" aria-live="polite">Carregando video...</p><button id="complete" type="button" disabled>Concluir treinamento</button><? } ?></div></section></main>
<script>
const state = <?!= state.trainingCatalogJson ?>;
const endpoint = window.location.href.split("?")[0];
const training = <?!= JSON.stringify(state.training) ?>;
const email = <?!= JSON.stringify(state.email) ?>;
const accessId = <?!= JSON.stringify(state.accessId) ?>;

function renderCatalog() {
  const catalog = document.getElementById("catalog");
  if (!catalog) return;
  state.forEach(function (item) {
    const link = document.createElement("a");
    link.className = "training-link";
    link.href = endpoint + "?trainingId=" + encodeURIComponent(item.id) + "&userEmail=" + encodeURIComponent(email);
    link.textContent = item.title;
    catalog.appendChild(link);
  });
}

function loadPlayerApi() {
  const tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(tag);
}

let player;
let timer;
let watchedSeconds = 0;
let lastTime = 0;
let duration = 0;
let finished = false;
let midpointAsked = false;
let questionAnswered = false;

function onYouTubeIframeAPIReady() {
  if (!training || !training.videoId) return;
  player = new YT.Player("youtubeFrame", {
    videoId: training.videoId,
    playerVars: { playsinline: 1, rel: 0 },
    events: { onReady: onPlayerReady, onStateChange: onPlayerStateChange, onError: onPlayerError }
  });
}

function onPlayerReady(event) {
  duration = event.target.getDuration() || 0;
  document.getElementById("status").textContent = "Reproducao pronta. Assista ao video completo.";
}

function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.PLAYING) {
    lastTime = player.getCurrentTime();
    window.clearInterval(timer);
    timer = window.setInterval(trackPlayback, 1000);
  } else {
    window.clearInterval(timer);
  }
  if (event.data === YT.PlayerState.ENDED) {
    finished = true;
    updateCompletionState();
  }
}

function trackPlayback() {
  if (!player || !duration) return;
  const currentTime = player.getCurrentTime();
  if (!midpointAsked && currentTime >= duration / 2) {
    midpointAsked = true;
    player.pauseVideo();
    showQuestion();
  }
  const delta = currentTime - lastTime;
  if (delta > 0 && delta <= 2.5) watchedSeconds += delta;
  lastTime = currentTime;
  const progress = Math.min(100, Math.round((watchedSeconds / duration) * 100));
  document.getElementById("progressBar").style.width = progress + "%";
  updateCompletionState();
}

function showQuestion() {
  const modal = document.getElementById("questionModal");
  const status = document.getElementById("status");
  if (modal) modal.classList.add("visible");
  if (status) status.textContent = "Responda a pergunta para continuar o video.";
}

function answerQuestion() {
  questionAnswered = true;
  const modal = document.getElementById("questionModal");
  const status = document.getElementById("status");
  if (modal) modal.classList.remove("visible");
  if (status) status.textContent = "Video em reproducao. Continue ate o final.";
  lastTime = player.getCurrentTime();
  player.playVideo();
}

function updateCompletionState() {
  const button = document.getElementById("complete");
  const status = document.getElementById("status");
  if (!button) return;
  const ready = finished && duration > 0 && watchedSeconds / duration >= 0.95;
  button.disabled = !ready;
  status.textContent = ready ? "Video concluido. Voce pode confirmar o treinamento." : "Continue assistindo para liberar a confirmacao.";
  status.className = ready ? "status success" : "status";
}

function onPlayerError() {
  const status = document.getElementById("status");
  status.className = "status error";
  status.textContent = "Nao foi possivel carregar este video do YouTube.";
}

function bindCompletion() {
  const button = document.getElementById("complete");
  if (!button) return;
  const answerYes = document.getElementById("answerYes");
  const answerNo = document.getElementById("answerNo");
  if (answerYes) answerYes.addEventListener("click", answerQuestion);
  if (answerNo) answerNo.addEventListener("click", answerQuestion);
  button.addEventListener("click", function () {
    button.disabled = true;
    const status = document.getElementById("status");
    status.className = "status";
    status.textContent = "Registrando conclusao...";
    google.script.run
      .withSuccessHandler(function (result) {
        status.className = "status success";
        status.textContent = result.alreadyCompleted ? "Este treinamento ja havia sido concluido." : "Conclusao registrada. Pontuacao: " + result.points + " ponto(s).";
        button.textContent = "Treinamento concluido";
      })
      .withFailureHandler(function (error) {
        button.disabled = false;
        status.className = "status error";
        status.textContent = error && error.message ? error.message : "Nao foi possivel registrar a conclusao.";
      })
      .completeTraining(accessId, email, training.id);
  });
}

renderCatalog();
if (training) { bindCompletion(); loadPlayerApi(); }
</script>
</body>
</html>`;
}
