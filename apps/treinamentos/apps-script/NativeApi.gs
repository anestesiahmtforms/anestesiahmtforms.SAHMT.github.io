/** Native PWA API. Add this file to the existing training project, then deploy a new version. */
const NATIVE_AUTH_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzdtxNDDOwGyZ44oMbx4LPktnQvdKemF0c2kdbpD63rmzAsF-tiUDOtheBAgej1SWaH/exec';
function nativeJson_(value) { return ContentService.createTextOutput(JSON.stringify(Object.assign({apiVersion:1},value))).setMimeType(ContentService.MimeType.JSON); }
function nativeIdentity_(payload) {
  if (!payload || (!payload.authToken && !payload.deviceToken)) throw new Error('Autenticação necessária.');
  const response=UrlFetchApp.fetch(NATIVE_AUTH_ENDPOINT,{method:'post',contentType:'text/plain;charset=utf-8',payload:JSON.stringify({action:'auth',authToken:payload.authToken||'',deviceToken:payload.deviceToken||'',userEmail:payload.userEmail||'',moduleId:'TREINAMENTOS',pageId:'api'}),muteHttpExceptions:true});
  let verified;try{verified=JSON.parse(response.getContentText());}catch(e){throw new Error('Não foi possível confirmar o acesso.');}
  const email=normalizeEmail_(verified.email);
  if(response.getResponseCode()!==200 || verified.ok!==true || !email)throw new Error('Acesso não autorizado.');
  if(!isParticipantAllowed_(email))throw new Error('Este treinamento está disponível somente para participantes autorizados.');
  return email; // User identity comes exclusively from the authentication service response.
}
function doPost(e) {
  try {
    const payload=JSON.parse(e && e.postData && e.postData.contents || '{}');
    const allowedActions=['catalog','begin','complete'];
    if(allowedActions.indexOf(payload.action)===-1)throw new Error('Operação não reconhecida.');
    const email=nativeIdentity_(payload);
    const trainings=getTrainings_();
    if(payload.action==='catalog') {
      const completed=getCompletedTrainingIds_(email),total=getTotalPoints_(email);
      const available=trainings.reduce((sum,t)=>sum+t.accessPoints+t.completionPoints,0);
      return nativeJson_({ok:true,trainings:trainings.map(t=>Object.assign({},t,{completed:completed.indexOf(t.id)!==-1})),totalPoints:total,totalAvailablePoints:available,scorePercentage:available?Math.min(100,Math.round(total/available*100)):0});
    }
    const training=trainings.find(t=>t.id===String(payload.trainingId||''));
    if(!training)throw new Error('Treinamento não encontrado.');
    if(payload.action==='begin')return nativeJson_({ok:true,accessId:recordAccess_(email,training.id)});
    const duration=Number(payload.duration),watched=Number(payload.watchedSeconds);
    if(payload.ended!==true || !Number.isFinite(duration) || duration<=0 || !Number.isFinite(watched) || watched/duration<.95)throw new Error('Assista ao vídeo antes de concluir.');
    // Atomic and idempotent: simultaneous retries cannot credit the same access twice.
    const lock=LockService.getScriptLock();lock.waitLock(10000);
    try {const result=completeTraining_(String(payload.accessId||''),email,training.id);return nativeJson_(Object.assign({ok:true},result));}
    finally {lock.releaseLock();}
  } catch(error) {return nativeJson_({ok:false,message:error.message||'Não foi possível concluir a operação.'});}
}
