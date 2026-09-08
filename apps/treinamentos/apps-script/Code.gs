/**
 * Treinamentos SAHMT com acompanhamento de reproducao do YouTube.
 * Implantar como aplicativo da web, executando como a conta proprietaria.
 */
const CONFIG = Object.freeze({
  spreadsheetId: "1NSICSqiTpmntdzEiuuc9CSBHgeZrSKw65X5yXfFq5x4",
  trainingSheet: "Treinamentos",
  participationSheet: "Participações",
  participantSheet: "Participantes",
  webAppUrl: "https://script.google.com/macros/s/AKfycbw8tyhilyC8czRrho0iOugr7B6L5COFZjm2x5Di4HuzsgTsw3SSlbVDFLexzYmN0m1j0g/exec"
});

function doGet(e) {
  const email = getAuthenticatedEmail_(e);
  const trainingId = String(e && e.parameter ? e.parameter.trainingId || "" : "").trim();
  const trainings = getTrainings_();
  const training = trainings.find((item) => item.id === trainingId) || null;
  const allowed = Boolean(email && isParticipantAllowed_(email));
  const accessId = allowed && training ? recordAccess_(email, training.id) : "";
  const totalPoints = allowed ? getTotalPoints_(email) : 0;
  const totalAvailablePoints = trainings.reduce((total, item) => {
    return total + item.accessPoints + item.completionPoints;
  }, 0);
  const scorePercentage = totalAvailablePoints > 0
    ? Math.min(100, Math.round((totalPoints / totalAvailablePoints) * 100))
    : 0;

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
    totalPoints,
    totalAvailablePoints,
    scorePercentage,
    endpoint: CONFIG.webAppUrl,
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

function getTotalPoints_(email) {
  const normalizedEmail = normalizeEmail_(email);
  if (!normalizedEmail) return 0;
  const sheet = getSpreadsheet_().getSheetByName(CONFIG.participationSheet);
  if (!sheet || sheet.getLastRow() < 2) return 0;
  return sheet.getRange(2, 2, sheet.getLastRow() - 1, 6)
    .getValues()
    .reduce((total, row) => {
      return normalizeEmail_(row[0]) === normalizedEmail
        ? total + (Number(row[5]) || 0)
        : total;
    }, 0);
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
<meta name="referrer" content="strict-origin-when-cross-origin">
<title>Treinamentos SAHMT</title>
<style>
:root{--navy:#0d3257;--navy-mid:#214463;--sand:#f6ead4;--ink:#143254;--teal:#18b7b7;--gold:#c79a3e;--copper:#b56404;--shadow:0 22px 48px #08121f35;font-family:"Manrope",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}html,body{margin:0;min-height:100%;color:var(--ink)}body{background:radial-gradient(circle at 88% 4%,#ffffff22,transparent 24%),radial-gradient(circle at 8% 82%,#ffb74d22,transparent 20%),linear-gradient(180deg,var(--navy) 0%,var(--navy-mid) 46%,#eee4d1 100%);background-attachment:fixed}main{width:min(92vw,760px);margin:auto;padding:max(18px,env(safe-area-inset-top)) 0 max(32px,env(safe-area-inset-bottom))}.card{overflow:hidden;border:1px solid #ffffffb8;border-radius:28px;background:#f9fbfce8;box-shadow:var(--shadow),inset 0 1px 0 #fff}header{position:relative;display:flex;align-items:center;gap:18px;padding:22px;background:linear-gradient(100deg,#ffd27873 0%,#e8d9bbf5 100%);border-bottom:2px solid #ff9f43a8;text-align:left}.brand-logo{position:relative;display:grid;place-items:center;flex:0 0 auto;width:112px;height:112px;padding:8px;border:2px solid #fff;border-radius:24px;background:linear-gradient(145deg,#fff 0%,#e9f5fb 48%,#a8c7d6 100%);box-shadow:0 0 0 3px #74bee247,0 16px 28px #08233755,inset 0 3px 0 #fff,inset 0 -10px 16px #214d6538}.brand-logo:before{content:"";position:absolute;inset:3px 12px auto;height:42%;border-radius:50%;background:linear-gradient(105deg,transparent,#ffffffdd,transparent);transform:rotate(-8deg)}.brand-logo img{position:relative;width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 7px 8px #0c2b3e47)}.header-copy{min-width:0;flex:1}.eyebrow{display:block;margin-bottom:4px;color:var(--copper);font-size:.72rem;font-weight:900;letter-spacing:.13em}.header-copy h1{margin:0;color:var(--navy);font-size:clamp(1.45rem,5vw,2.05rem);line-height:1.05}.user-summary{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:11px}.user,.score{margin:0;font-weight:800;overflow-wrap:anywhere}.user{color:#1762a1;font-size:.78rem}.score{padding:7px 12px;border:1px solid #fff7d6;border-radius:999px;color:#fff;background:linear-gradient(135deg,#f59e0b,var(--copper));font-size:.82rem;box-shadow:0 6px 14px #9a43084d,inset 0 1px 0 #ffffff88}.content{padding:22px}.catalog{display:grid;gap:14px}.training-link{position:relative;isolation:isolate;overflow:hidden;display:grid;grid-template-columns:1fr auto;align-items:center;gap:12px;min-height:82px;padding:14px 15px 14px 20px;border:1px solid #ffffffc9;border-radius:20px;color:#fff;background:linear-gradient(145deg,#1762a1 0%,var(--navy) 78%);font-weight:900;text-align:left;text-decoration:none;box-shadow:0 10px 0 #082b4a,0 17px 28px #08121f35,inset 0 2px 0 #ffffff48;transition:transform .16s ease,filter .16s ease,box-shadow .16s ease}.training-link:before{content:"";position:absolute;z-index:-1;inset:0;background:radial-gradient(circle at 92% 10%,#18b7b755,transparent 32%),linear-gradient(105deg,transparent 5%,#ffffff18 46%,transparent 68%)}.training-link:hover,.training-link:focus-visible{outline:0;filter:brightness(1.08) saturate(1.08);transform:translateY(-3px);box-shadow:0 13px 0 #082b4a,0 22px 32px #08121f45,inset 0 2px 0 #ffffff66}.training-link:active{transform:translateY(7px);box-shadow:0 3px 0 #082b4a,0 9px 16px #08121f35,inset 0 2px 8px #0004}.training-title{font-size:clamp(.98rem,3.8vw,1.12rem);line-height:1.25}.training-points{min-width:82px;padding:8px 10px;border:1px solid #ffe8a6;border-radius:999px;background:linear-gradient(135deg,#f3bd51,var(--copper));color:#fff;font-size:.82rem;letter-spacing:.01em;text-align:center;box-shadow:0 5px 12px #061b2c55,inset 0 1px 0 #ffffff99}.training-mode{width:min(99vw,1400px);height:100vh;height:100dvh;padding:4px 0;box-sizing:border-box}.training-mode .card{height:100%;display:flex;flex-direction:column;border-radius:14px;box-sizing:border-box}.training-mode header{flex:0 0 auto;padding:7px 12px}.training-mode h1{font-size:clamp(1rem,3.5vw,1.45rem)}.training-mode .user{margin-top:2px;font-size:.74rem}.training-mode .content{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;padding:6px 8px 8px}.training-mode .player-wrap{flex:1 1 auto;min-height:0}.player-wrap{position:relative;padding:0}#youtubeFrame,.player{display:block;width:100%!important;height:100%!important;min-height:52dvh;aspect-ratio:auto;border:0;border-radius:10px;background:#dbe8ec}.question-modal{position:absolute;inset:0;display:none;align-items:center;justify-content:center;padding:18px;border-radius:10px;background:#0b284499;z-index:2}.question-modal.visible{display:flex}.question-card{width:min(92%,420px);padding:22px 18px;border:2px solid #fff;border-radius:20px;background:#fffaf0;color:#0b2844;text-align:center;box-shadow:0 12px 32px #0b284455}.question-card h2{margin:0 0 16px;font-size:clamp(1.1rem,4vw,1.45rem)}.question-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}.question-actions button{min-height:48px}.question-actions .no{background:linear-gradient(135deg,#b95050,#8d2929)}.progress{flex:0 0 auto;height:8px;margin:7px 0 4px;border-radius:99px;background:#d8e5e5;overflow:hidden}.progress-bar{width:0;height:100%;background:#16805f;transition:width .2s}.status{flex:0 0 auto;min-height:20px;margin:5px 0;font-size:.88rem;font-weight:700}.success{color:#116c48}.error{margin:0;padding:18px;border-radius:16px;background:#fff0f0;color:#a32828;font-weight:800}button,.back-link{flex:0 0 auto;width:100%;min-height:46px;border:0;border-radius:14px;color:#fff;background:linear-gradient(135deg,#1762a1,var(--navy));font-size:.95rem;font-weight:800;cursor:pointer;box-shadow:0 8px 18px #0d325738;box-sizing:border-box}.back-link{display:flex;align-items:center;justify-content:center;margin-top:7px;text-align:center;text-decoration:none;background:linear-gradient(135deg,#2563eb,#173f9b)}.back-link[hidden]{display:none!important}button:disabled{opacity:.6;cursor:not-allowed}@media(max-width:540px){main{width:min(94vw,430px)}header{gap:13px;padding:17px 15px}.brand-logo{width:88px;height:88px;border-radius:20px}.content{padding:17px 14px}.training-link{min-height:76px;padding-left:16px}.training-points{min-width:76px;padding:7px 8px}}@media(max-width:360px){header{align-items:flex-start}.brand-logo{width:76px;height:76px}.user-summary{align-items:flex-start;flex-direction:column}.training-link{grid-template-columns:1fr}.training-points{justify-self:start}}@media (max-height:560px){.training-mode header{padding:3px 10px}.training-mode .user{display:none}.training-mode .content{padding:3px 6px 5px}#youtubeFrame,.player{min-height:40dvh}.status{margin:3px 0;font-size:.78rem}button,.back-link{min-height:38px}}
html,body{width:100%;height:100%;overflow:hidden;overscroll-behavior:none}body{position:fixed;inset:0;height:100vh;height:100svh;min-height:0}body:not(.training-active) main{position:absolute;inset:0;width:min(92vw,760px);height:100%;min-height:0;margin:auto;padding:max(16px,env(safe-area-inset-top)) 0 max(16px,env(safe-area-inset-bottom));display:flex;align-items:stretch}body:not(.training-active) .card{width:100%;height:100%;min-height:0;display:flex;flex-direction:column}body:not(.training-active) header{flex:0 0 auto}body:not(.training-active) .content{flex:1 1 auto;min-height:0;overflow:hidden}body:not(.training-active) .catalog{height:100%;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:3px 4px 13px;scrollbar-width:thin;scrollbar-color:#c79a3e55 transparent}body:not(.training-active) .training-link{width:100%;min-width:0}body:not(.training-active) .training-title{min-width:0;overflow-wrap:anywhere}body:not(.training-active) .training-points{white-space:nowrap}.score-percentage{display:inline-flex;align-items:center;justify-content:center;min-width:76px;padding:5px 11px;border:2px solid #8fd8ff;border-radius:14px;background:linear-gradient(145deg,#eaf8ff,#bde7ff);color:#075fa8;font-size:clamp(1.35rem,5vw,1.85rem);font-weight:900;line-height:1;letter-spacing:-.035em;box-shadow:0 7px 15px #1762a133,inset 0 2px 0 #fff}.score-caption{font-size:.63em;letter-spacing:0}@media(max-width:540px){body:not(.training-active) main{width:min(94vw,430px);padding:10px 0}body:not(.training-active) .card{border-radius:23px}body:not(.training-active) .content{padding:14px 11px}body:not(.training-active) .catalog{gap:12px}body:not(.training-active) .training-link{grid-template-columns:minmax(0,1fr) auto;min-height:70px;padding:11px 12px 11px 15px;border-radius:17px}.training-title{font-size:.96rem}.training-points{min-width:72px;padding:7px;font-size:.76rem}.score-percentage{min-width:68px;font-size:1.35rem}}@media(max-width:340px){body:not(.training-active) .training-link{grid-template-columns:1fr;gap:7px}.training-points{justify-self:start}}@media(max-height:620px){body:not(.training-active) header{padding:12px}.brand-logo{width:68px;height:68px;border-radius:17px}.eyebrow{font-size:.62rem}.header-copy h1{font-size:1.2rem}.user-summary{margin-top:6px}.score{padding:5px 9px}.score-percentage{padding:4px 9px;font-size:1.2rem}.training-link{min-height:62px}}
body.training-active{overflow:hidden}.training-active .training-mode{position:absolute;inset:0;width:100vw;max-width:none;height:100%;min-height:0;margin:0;padding:4px;z-index:10}.training-footer{flex:0 0 auto;padding:8px 2px 2px;background:#ffffffee;border-top:1px solid #c9dada}.training-footer .progress{margin-top:0}#complete{min-height:68px;border:3px solid #fff7d6;border-radius:18px;background:linear-gradient(135deg,#f59e0b,#d85b08);color:#fff;font-size:clamp(1.08rem,4vw,1.3rem);letter-spacing:.025em;box-shadow:0 10px 24px #9a430866}#complete:disabled{background:linear-gradient(135deg,#a9b6b4,#758784);border-color:#e8eeee;color:#f8fbfb;box-shadow:none}.training-footer .back-link{min-height:58px;font-size:1.05rem}@media (max-height:560px){#complete{min-height:52px}.training-footer{padding-top:4px}}
.training-active header{display:none}.training-active .training-mode .content{padding-top:4px}.training-footer .status{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.training-active #youtubeFrame,.training-active .player{min-height:0;background:#000}
#playPause{min-height:58px;margin-bottom:7px;background:linear-gradient(135deg,#2563eb,#173f9b);font-size:clamp(1rem,3.5vw,1.15rem)}#playPause:disabled{background:linear-gradient(135deg,#a9b6b4,#758784);box-shadow:none}@media (max-height:560px){#playPause{min-height:44px;margin-bottom:4px}}
:root{--app-height:100svh;--catalog-gap:10px;--training-row-height:64px}body{height:var(--app-height)!important;max-height:var(--app-height);overscroll-behavior:none;touch-action:none}body:not(.training-active) main{width:min(98vw,980px)!important;height:var(--app-height)!important;max-height:var(--app-height);align-items:stretch}body:not(.training-active) .card{height:100%;max-height:100%}body:not(.training-active) header{min-height:204px;padding:30px 28px}body:not(.training-active) .content{padding:16px 14px}body:not(.training-active) .catalog{display:flex;flex-direction:column;gap:var(--catalog-gap);height:100%;overflow:hidden;overscroll-behavior:none;touch-action:none;padding:2px 4px 4px}body:not(.training-active) .training-link{flex:0 0 var(--training-row-height);height:var(--training-row-height);min-height:var(--training-row-height);max-height:var(--training-row-height);padding:9px 18px 9px 22px;border-radius:16px;box-shadow:0 6px 0 #082b4a,0 10px 18px #08121f2e,inset 0 2px 0 #ffffff48}body:not(.training-active) .training-link:hover,body:not(.training-active) .training-link:focus-visible{transform:none;box-shadow:0 6px 0 #082b4a,0 10px 18px #08121f38,inset 0 2px 0 #ffffff5c}body:not(.training-active) .training-link:active{transform:translateY(3px);box-shadow:0 3px 0 #082b4a,0 6px 11px #08121f32,inset 0 2px 7px #0003}.catalog-fill{flex:1 1 auto;min-height:0;display:grid;gap:var(--catalog-gap);overflow:hidden}.upcoming-training{min-height:0;display:flex;align-items:center;justify-content:center;padding:7px 12px;border:1px dashed #8eacc2;border-radius:15px;background:linear-gradient(145deg,#f7fbfd,#e6eef2);color:#547088;font-size:.84rem;font-weight:800;letter-spacing:.01em;text-align:center;box-shadow:inset 0 1px 0 #fff}@media(max-width:540px){:root{--catalog-gap:8px;--training-row-height:60px}body:not(.training-active) main{width:98vw!important}body:not(.training-active) header{min-height:190px;padding:24px 18px}.brand-logo{width:100px;height:100px}body:not(.training-active) .content{padding:11px 9px}body:not(.training-active) .training-link{padding:8px 14px 8px 17px;border-radius:15px}.upcoming-training{padding:5px 9px;font-size:.78rem}}@media(max-height:620px){:root{--catalog-gap:7px;--training-row-height:54px}body:not(.training-active) header{min-height:164px;padding:17px}.brand-logo{width:82px;height:82px}.user-summary{margin-top:7px}body:not(.training-active) .content{padding:9px}.upcoming-training{font-size:.74rem}}

/* Catalogo no mesmo sistema visual da pagina Escala Semanal. */
body:not(.training-active) main{
  padding:max(10px,env(safe-area-inset-top)) 0 max(10px,env(safe-area-inset-bottom));
}
body:not(.training-active) .card{
  gap:8px;
  overflow:visible;
  border:0;
  border-radius:0;
  background:transparent;
  box-shadow:none;
}
body:not(.training-active) header,
body:not(.training-active) .content,
body:not(.training-active) .module-link-strip,
body:not(.training-active) .footer-banner{
  flex:0 0 auto;
  border-radius:24px;
  box-shadow:var(--shadow);
}
body:not(.training-active) header{
  min-height:174px;
  max-width:100%;
  overflow:hidden;
  padding:20px 24px;
  border:2px solid #ff9f43b8;
  background:linear-gradient(90deg,#ffd27866 0%,#e8d9bbf5 100%);
}
body:not(.training-active) .brand-logo{
  width:112px;
  height:112px;
}
body:not(.training-active) .header-copy{
  max-width:calc(100% - 130px);
}
body:not(.training-active) .content{
  flex:1 1 auto;
  min-height:0;
  overflow:hidden;
  padding:13px 14px;
  border:1px solid #ffffffdc;
  background:#f9fbfcee;
  box-shadow:0 18px 36px #08121f24,inset 0 1px 0 #fff;
}
.module-link-strip{
  display:grid;
  grid-template-columns:repeat(4,minmax(0,1fr));
  gap:8px;
  min-height:92px;
  padding:7px;
  border:1px solid #ffffffdb;
  background:linear-gradient(145deg,#fffffff0,#dae8efcf);
  box-shadow:0 14px 28px #08121f24,inset 0 1px 0 #fff;
}
.module-link-card{
  position:relative;
  isolation:isolate;
  display:grid;
  grid-template-rows:1fr auto;
  justify-items:center;
  min-width:0;
  min-height:76px;
  overflow:hidden;
  padding:4px 3px 6px;
  border:1px solid #fffffff2;
  border-radius:17px;
  background:linear-gradient(160deg,#fff 0%,#ebf4f8f0 48%,#c7dae4e8 100%);
  color:#1762a1;
  text-decoration:none;
  box-shadow:0 0 0 2px #ffffff94,0 8px 15px #1a496229,inset 0 1px 0 #fff,inset 0 -5px 10px #3360771a;
  transition:transform .16s ease,filter .16s ease,box-shadow .16s ease;
}
.module-link-card:before{
  content:"";
  position:absolute;
  z-index:-1;
  top:-44%;
  left:-22%;
  width:144%;
  height:68%;
  border-radius:50%;
  background:linear-gradient(100deg,transparent 12%,#ffffffb8 48%,transparent 82%);
  transform:rotate(-8deg);
}
.module-link-card:hover,.module-link-card:focus-visible{
  outline:0;
  filter:saturate(1.08);
  transform:translateY(-2px);
  box-shadow:0 0 0 2px #dbf1ffe6,0 12px 20px #1762a133,inset 0 1px 0 #fff;
}
.module-link-card:active{transform:translateY(1px) scale(.97)}
.module-link-card img{
  display:block;
  width:min(100%,66px);
  height:55px;
  object-fit:contain;
  filter:drop-shadow(0 5px 6px #0c2b3e2e);
}
.module-link-card span{
  max-width:100%;
  overflow:hidden;
  padding:3px 6px;
  border:1px solid #1762a133;
  border-radius:999px;
  background:#ffffffa3;
  color:#1762a1;
  font-size:.54rem;
  font-weight:900;
  line-height:1;
  letter-spacing:.06em;
  text-overflow:ellipsis;
  white-space:nowrap;
}
.footer-banner{
  padding:9px 10px;
  color:#fff;
  background:linear-gradient(135deg,#18b7b7,#0a808a);
  font-size:.62rem;
  font-weight:800;
  text-align:center;
  box-shadow:0 12px 22px #083e5230,inset 0 1px 0 #ffffff4a;
}
@media(max-width:540px){
  body:not(.training-active) main{width:96vw!important;padding-top:max(8px,env(safe-area-inset-top));padding-bottom:max(8px,env(safe-area-inset-bottom))}
  body:not(.training-active) header{min-height:150px;padding:14px 15px;gap:12px}
  body:not(.training-active) .brand-logo{width:92px;height:92px;border-radius:20px}
  body:not(.training-active) .header-copy{max-width:calc(100% - 104px)}
  body:not(.training-active) .header-copy h1{font-size:clamp(1.25rem,6vw,1.72rem)}
  body:not(.training-active) .user-summary{gap:5px;margin-top:8px}
  body:not(.training-active) .user{width:100%;font-size:.7rem}
  body:not(.training-active) .score{padding:5px 8px;font-size:.7rem}
  body:not(.training-active) .score-percentage{min-width:58px;padding:4px 7px;font-size:1.1rem}
  body:not(.training-active) .content{padding:9px}
  .module-link-strip{gap:5px;min-height:78px;padding:5px;border-radius:20px!important}
  .module-link-card{min-height:66px;padding:3px 2px 5px;border-radius:14px}
  .module-link-card img{width:min(100%,53px);height:44px}
  .module-link-card span{padding:2px 4px;font-size:.46rem;letter-spacing:.035em}
  .footer-banner{padding:7px 8px!important;font-size:.54rem}
}
@media(max-width:360px){
  body:not(.training-active) header{min-height:140px;padding:12px}
  body:not(.training-active) .brand-logo{width:78px;height:78px}
  body:not(.training-active) .header-copy{max-width:calc(100% - 90px)}
  .module-link-card span{font-size:.42rem}
}
@media(max-height:700px){
  :root{--training-row-height:50px;--catalog-gap:6px}
  body:not(.training-active) header{min-height:130px;padding:11px 14px}
  body:not(.training-active) .brand-logo{width:78px;height:78px}
  body:not(.training-active) .header-copy{max-width:calc(100% - 92px)}
  body:not(.training-active) .eyebrow{font-size:.58rem}
  body:not(.training-active) .header-copy h1{font-size:1.18rem}
  body:not(.training-active) .user-summary{margin-top:5px}
  .module-link-strip{min-height:68px}
  .module-link-card{min-height:56px}
  .module-link-card img{height:35px;width:44px}
  .footer-banner{padding:6px 8px}
}
</style>
</head>
<body class="<?= state.training ? "training-active" : "" ?>">
<main class="<?= state.training ? "training-mode" : "" ?>"><section class="card"><header><div class="brand-logo"><img src="https://anestesiahmtforms.github.io/anestesiahmtforms.SAHMT.github.io/sahmt_option1_clean.png" alt="Logo SAHMT"></div><div class="header-copy"><span class="eyebrow">EDUCAÇÃO CONTINUADA</span><h1><?= state.training ? state.training.title : "Treinamentos SAHMT" ?></h1><? if (state.email) { ?><div class="user-summary"><p class="user">Acesso: <?= state.email ?></p><p class="score">Sua pontuação: <?= state.totalPoints ?> / <?= state.totalAvailablePoints ?> pontos</p><span class="score-percentage"><?= state.scorePercentage ?>% <span class="score-caption">concluído</span></span></div><? } ?></div></header><div class="content">
<? if (!state.allowed) { ?><p class="error">Este treinamento esta disponivel somente para participantes autorizados.</p><? } else if (!state.training) { ?><div id="catalog" class="catalog"></div><? } else { ?><div class="player-wrap"><div id="youtubeFrame" class="player" aria-label="<?= state.training ? state.training.title : "Treinamento SAHMT" ?>"></div><div id="questionModal" class="question-modal" role="dialog" aria-modal="true" aria-labelledby="questionTitle"><div class="question-card"><h2 id="questionTitle">Está entendendo?</h2><div class="question-actions"><button id="answerYes" type="button">Sim</button><button id="answerNo" class="no" type="button">Não</button></div></div></div></div><footer class="training-footer"><button id="playPause" type="button" disabled>REPRODUZIR</button><div class="progress" aria-label="Progresso do video"><div id="progressBar" class="progress-bar"></div></div><p id="status" class="status" aria-live="polite">Carregando video...</p><button id="complete" type="button" disabled>CONCLUIR TREINAMENTO</button><a id="backToCatalog" class="back-link" hidden>Voltar aos treinamentos</a></footer><? } ?></div><? if (!state.training) { ?><nav class="module-link-strip" aria-label="Navegação SAHMT"><a class="module-link-card" href="https://anestesiahmtforms.github.io/anestesiahmtforms.SAHMT.github.io/?from=treinamentos&skipNotice=1" target="_top" aria-label="Abrir Escala Semanal"><img src="https://anestesiahmtforms.github.io/anestesiahmtforms.SAHMT.github.io/sahmt_option1.png" alt="Escala"><span>ESCALA</span></a><a class="module-link-card" href="https://anestesiahmtforms.github.io/anestesiahmtforms.SAHMT.github.io/apps/eventos/" target="_top" aria-label="Abrir Gestão Operacional"><img src="https://anestesiahmtforms.github.io/anestesiahmtforms.SAHMT.github.io/gestao_operacional.png" alt="Operacional"><span>OPERACIONAL</span></a><a class="module-link-card" href="https://anestesiahmtforms.github.io/anestesiahmtforms.SAHMT.github.io/apps/etiquetas/" target="_top" aria-label="Abrir Etiquetas SAHMT"><img src="https://anestesiahmtforms.github.io/anestesiahmtforms.SAHMT.github.io/sahmt_option1.png" alt="Etiquetas"><span>ETIQUETAS</span></a><a class="module-link-card" href="https://anestesiahmtforms.github.io/anestesiahmtforms.SAHMT.github.io/apps/gestao/" target="_top" aria-label="Abrir Segmento de Gestão"><img src="https://anestesiahmtforms.github.io/anestesiahmtforms.SAHMT.github.io/apps/gestao/assets/selo-qga-accredited-qmentum-diamond.png" alt="Gestão"><span>GESTÃO</span></a></nav><footer class="footer-banner">By Francisco Tadeu da Mota Albuquerque</footer><? } ?></section></main>
<script>
const state = <?!= state.trainingCatalogJson ?>;
const endpoint = <?!= JSON.stringify(state.endpoint) ?>;
const training = <?!= JSON.stringify(state.training) ?>;
const email = <?!= JSON.stringify(state.email) ?>;
const accessId = <?!= JSON.stringify(state.accessId) ?>;
const pwaTrainingUrl = "https://anestesiahmtforms.github.io/anestesiahmtforms.SAHMT.github.io/apps/treinamentos/";

function renderCatalog() {
  const catalog = document.getElementById("catalog");
  if (!catalog) return;
  state.forEach(function (item) {
    const link = document.createElement("a");
    link.className = "training-link";
    link.href = pwaTrainingUrl + "?trainingId=" + encodeURIComponent(item.id) + "&userEmail=" + encodeURIComponent(email);
    link.target = "_top";
    const title = document.createElement("span");
    title.className = "training-title";
    title.textContent = item.title;
    const points = document.createElement("span");
    const trainingPoints = item.accessPoints + item.completionPoints;
    points.className = "training-points";
    points.textContent = trainingPoints + (trainingPoints === 1 ? " Ponto" : " Pontos");
    link.appendChild(title);
    link.appendChild(points);
    catalog.appendChild(link);
  });
  requestAnimationFrame(fillUpcomingSlots);
}

function fillUpcomingSlots() {
  const catalog = document.getElementById("catalog");
  if (!catalog) return;
  const currentFill = catalog.querySelector(".catalog-fill");
  if (currentFill) currentFill.remove();

  const links = Array.from(catalog.querySelectorAll(".training-link"));
  const gap = parseFloat(getComputedStyle(catalog).gap) || 0;
  const linksHeight = links.reduce(function (total, link) {
    return total + link.getBoundingClientRect().height;
  }, 0);
  const gapsBetweenLinks = Math.max(0, links.length - 1) * gap;
  const gapBeforeFill = links.length ? gap : 0;
  const remainingHeight = catalog.clientHeight - linksHeight - gapsBetweenLinks - gapBeforeFill;
  if (remainingHeight < 34) return;

  const preferredHeight = 52;
  const slotCount = Math.max(1, Math.round((remainingHeight + gap) / (preferredHeight + gap)));
  const fill = document.createElement("div");
  fill.className = "catalog-fill";
  fill.style.gridTemplateRows = "repeat(" + slotCount + ",minmax(0,1fr))";
  for (let index = 0; index < slotCount; index += 1) {
    const slot = document.createElement("div");
    slot.className = "upcoming-training";
    slot.textContent = "Próximo Treinamento em breve aqui!";
    fill.appendChild(slot);
  }
  catalog.appendChild(fill);
}

function lockViewportHeight() {
  const visibleHeight = window.visualViewport
    ? window.visualViewport.height
    : window.innerHeight;
  document.documentElement.style.setProperty(
    "--app-height",
    Math.max(320, Math.round(visibleHeight)) + "px"
  );
  window.scrollTo(0, 0);
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
    width: "100%",
    height: "100%",
    videoId: training.videoId,
    playerVars: {
      playsinline: 1,
      autoplay: 0,
      loop: 0,
      cc_load_policy: 0,
      iv_load_policy: 3,
      controls: 0,
      disablekb: 1,
      rel: 0,
      origin: window.location.origin,
      widget_referrer: "https://anestesiahmtforms.github.io/anestesiahmtforms.SAHMT.github.io/"
    },
    events: { onReady: onPlayerReady, onStateChange: onPlayerStateChange, onError: onPlayerError, onApiChange: suppressCaptions }
  });
}

function onPlayerReady(event) {
  duration = event.target.getDuration() || 0;
  suppressCaptions(event);
  const playPause = document.getElementById("playPause");
  if (playPause) playPause.disabled = false;
  document.getElementById("status").textContent = "Reproducao pronta. Assista ao video completo.";
}

function suppressCaptions(event) {
  const target = event && event.target ? event.target : player;
  if (!target || typeof target.setOption !== "function") return;
  try { target.setOption("captions", "track", {}); } catch (ignored) {}
}

function onPlayerStateChange(event) {
  const playPause = document.getElementById("playPause");
  if (event.data === YT.PlayerState.PLAYING) {
    if (playPause) playPause.textContent = "PAUSAR";
    lastTime = player.getCurrentTime();
    window.clearInterval(timer);
    timer = window.setInterval(trackPlayback, 1000);
  } else {
    if (playPause && event.data !== YT.PlayerState.ENDED) playPause.textContent = "REPRODUZIR";
    window.clearInterval(timer);
  }
  if (event.data === YT.PlayerState.ENDED) {
    finished = true;
    if (playPause) {
      playPause.textContent = "VÍDEO FINALIZADO";
      playPause.disabled = true;
    }
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
  const playPause = document.getElementById("playPause");
  if (modal) modal.classList.add("visible");
  if (playPause) playPause.disabled = true;
  if (status) status.textContent = "Responda a pergunta para continuar o video.";
}

function answerQuestion() {
  questionAnswered = true;
  const modal = document.getElementById("questionModal");
  const status = document.getElementById("status");
  const playPause = document.getElementById("playPause");
  if (modal) modal.classList.remove("visible");
  if (playPause) playPause.disabled = false;
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
  const playPause = document.getElementById("playPause");
  if (playPause) playPause.disabled = true;
  status.className = "status error";
  status.textContent = "Nao foi possivel carregar este video do YouTube.";
}

function bindPlaybackControl() {
  const playPause = document.getElementById("playPause");
  if (!playPause) return;
  playPause.addEventListener("click", function () {
    if (!player || typeof player.getPlayerState !== "function") return;
    if (player.getPlayerState() === YT.PlayerState.PLAYING) player.pauseVideo();
    else player.playVideo();
  });
}

function bindCompletion() {
  const button = document.getElementById("complete");
  if (!button) return;
  const backToCatalog = document.getElementById("backToCatalog");
  if (backToCatalog) {
    backToCatalog.href = pwaTrainingUrl + "?userEmail=" + encodeURIComponent(email);
    backToCatalog.target = "_top";
  }
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
        button.hidden = true;
        if (backToCatalog) backToCatalog.hidden = false;
      })
      .withFailureHandler(function (error) {
        button.disabled = false;
        status.className = "status error";
        status.textContent = error && error.message ? error.message : "Nao foi possivel registrar a conclusao.";
      })
      .completeTraining(accessId, email, training.id);
  });
}

lockViewportHeight();
renderCatalog();
document.addEventListener("touchmove", function (event) {
  event.preventDefault();
}, { passive: false });
document.addEventListener("wheel", function (event) {
  event.preventDefault();
}, { passive: false });
window.addEventListener("orientationchange", function () {
  setTimeout(function () {
    lockViewportHeight();
    fillUpcomingSlots();
  }, 250);
});
if (training) { bindPlaybackControl(); bindCompletion(); loadPlayerApi(); }
</script>
</body>
</html>`;
}
