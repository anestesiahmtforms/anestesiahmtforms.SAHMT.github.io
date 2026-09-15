/* SAHMT-BH Checklist. Defina SPREADSHEET_ID nas propriedades do script. */
const AUTH_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzdtxNDDOwGyZ44oMbx4LPktnQvdKemF0c2kdbpD63rmzAsF-tiUDOtheBAgej1SWaH/exec';
const TZ = 'America/Sao_Paulo';
const DIRECT_RECORD_USERS = new Set(['marcio.henrique82@gmail.com','wx2064@gmail.com']);
const TRAINING_SPREADSHEET_ID = '1NSICSqiTpmntdzEiuuc9CSBHgeZrSKw65X5yXfFq5x4';
const CHECKLIST_SCORE_NAME = 'CHECKLIST DIÁRIO';
const CHECKLIST_SCORE_SHEET = 'Participações';
const DECLARATION = 'Declaro que acompanhei os checklists e tomei as providências necessárias em caso de riscos do Arsenal tecnológico/estrutural da Anestesiologia.';
const HEADERS = {
  Unidades: ['ID','Unidade / equipamento','Conteúdo exato do QR Code','Início (AAAA-MM-DD)','Fim (AAAA-MM-DD)'],
  Assinantes: ['E-mail','Nome','Ativo'],
  Registros: ['ID do envio','Data','Horário UTC','ID da unidade','Unidade / equipamento','Condição','Ocorrência','E-mail','Nome'],
  Assinaturas: ['ID do envio','Data','Horário UTC','E-mail','Nome','Revisão','Declaração','Retrato do relatório JSON','Justificativa da assinatura']
};
function doGet(){return json_({ok:true,service:'SAHMT-BH Checklist',version:10,features:['native-pwa','scheduled-score-opt-in','cached-auth','cached-units','read-without-lock','persistent-history','carry-forward-alerts','direct-report-record','training-daily-score','sign-without-complete']});}
function doPost(e){
  let lock;
  try{
    const p=JSON.parse(e.postData.contents || '{}');
    if(!['resolve','record','report','monthly','sign'].includes(p.action))throw new Error('Operação inválida.');
    const user=authenticate_(p);
    if(p.action==='record' || p.action==='sign'){
      lock=LockService.getScriptLock();lock.waitLock(25000);
    }
    const book=SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || '1zM5Mb_Us-Xt_kPJAVEPmYb-Z1tQR93A-laK-PZCXyCs');
    const day=Utilities.formatDate(new Date(),TZ,'yyyy-MM-dd');
    if(p.action==='monthly')return json_(monthly_(book,String(p.month || day.slice(0,7)),user,day));
    if(p.action==='resolve'){
      const qr=String(p.qr || '').trim();
      if(!qr || qr.length>4096)throw new Error('QR Code inválido.');
      const units=unitsForDay_(book,day).filter(unit=>unit.qr===qr);
      if(units.length!==1)throw new Error(units.length?'QR Code duplicado no cadastro. Solicite a correção.':'QR Code não cadastrado para esta data.');
      return json_({ok:true,unit:{id:units[0].id,name:units[0].name}});
    }
    if(p.action==='record'){
      if(p.direct===true && !DIRECT_RECORD_USERS.has(user.email))throw new Error('Registro direto disponível apenas para usuários autorizados.');
      requestId_(p.requestId);
      const previous=rows_(book,'Registros').find(row=>row[0]===p.requestId);
      if(previous){if(previous[7]!==user.email)throw new Error('Identificador de envio já utilizado.');return json_({ok:true,id:previous[0]});}
      const unit=unitsForDay_(book,day).find(unit=>unit.id===p.unitId);
      if(!unit)throw new Error('Unidade não cadastrada para hoje.');
      if(!['SIM','NAO'].includes(p.condition))throw new Error('Selecione SIM ou NÃO.');
      const occurrence=p.condition==='NAO'?String(p.occurrence || '').trim():'';
      if(p.condition==='NAO'&&!occurrence)throw new Error('Descreva a ocorrência.');
      if(occurrence.length>4000)throw new Error('A ocorrência deve ter até 4.000 caracteres.');
      append_(book,'Registros',[p.requestId,day,new Date().toISOString(),unit.id,unit.name,p.condition,occurrence,user.email,user.name]);
      SpreadsheetApp.flush();return json_({ok:true,id:p.requestId});
    }
    const selected=String(p.day || day);validateDay_(selected);
    if(selected>day)throw new Error('Não é possível consultar uma data futura.');
    const report=report_(book,selected,user,undefined,day);
    if(p.action==='report'){
      report.responsible=responsibleForDay_(selected);
      // Retain legacy recovery until the score trigger has been explicitly installed.
      if(PropertiesService.getScriptProperties().getProperty('CHECKLIST_SCHEDULED_SCORE')!=='1'){
        const scoreDay=selected===day?shiftDay_(day,-1):selected;
        syncChecklistScore_(book,scoreDay,user,day);
        if(report.signature)syncChecklistScore_(book,selected,user,day,report);
      }
      return json_(report);
    }
    if(selected!==day)throw new Error('Relatórios históricos são somente para consulta.');
    if(!report.canSign)throw new Error('Sua conta não pertence ao grupo autorizado a assinar.');
    requestId_(p.requestId);
    const existing=rows_(book,'Assinaturas').find(row=>row[0]===p.requestId);
    if(existing){if(existing[3]!==user.email)throw new Error('Identificador de envio já utilizado.');return json_(report);}
    if(p.accepted!==true)throw new Error('Confirme a declaração para assinar.');
    const signWithoutComplete=p.signWithoutComplete===true;
    const justification=String(p.justification || '').trim();
    if(signWithoutComplete && !justification)throw new Error('Informe o motivo da assinatura sem concluir.');
    if(justification.length>4000)throw new Error('A justificativa deve ter até 4.000 caracteres.');
    const requiredItems=report.items.filter(item=>!INACTIVE_UNIT_IDS.has(String(item.id || '').trim()));
    if(!signWithoutComplete && (!requiredItems.length || requiredItems.some(item=>!item.record)))throw new Error('Existem checklists pendentes.');
    if(p.revision!==report.revision)throw new Error('O relatório mudou. Confira os registros atualizados antes de assinar.');
    if(report.signature)throw new Error('Esta versão do relatório já está assinada.');
    const snapshot=JSON.stringify(report.items);
    if(snapshot.length>45000)throw new Error('O relatório excede o limite de arquivamento. Contate o administrador.');
    ensureSignatureJustificationHeader_(book);
    append_(book,'Assinaturas',[p.requestId,selected,new Date().toISOString(),user.email,user.name,report.revision,DECLARATION,snapshot,justification]);
    const finalReport=report_(book,selected,user,undefined,day);
    finalReport.responsible=responsibleForDay_(selected);
    syncChecklistScore_(book,selected,user,day,finalReport,true);
    SpreadsheetApp.flush();return json_(finalReport);
  }catch(error){return json_({ok:false,message:error.message || 'Erro ao processar o checklist.'});}
  finally{if(lock && lock.hasLock())lock.releaseLock();}
}function authenticate_(p){
  if(!p.authToken && !(p.deviceToken && p.userEmail))throw new Error('Autentique-se pelo SAHMT-BH.');
  const cache=scriptCache_();
  const cacheKey=authCacheKey_(p);
  const cached=cache && cache.get(cacheKey);
  if(cached){try{return JSON.parse(cached);}catch(error){cache.remove(cacheKey);}}
  const response=UrlFetchApp.fetch(AUTH_ENDPOINT,{method:'post',contentType:'text/plain;charset=utf-8',payload:JSON.stringify({action:'auth',authToken:String(p.authToken || ''),deviceToken:String(p.deviceToken || ''),userEmail:String(p.userEmail || ''),moduleId:'checklist',pageId:'arsenal',embedded:true}),muteHttpExceptions:true});
  const result=JSON.parse(response.getContentText());
  if(response.getResponseCode()!==200 || result.ok!==true || !result.email)throw new Error('Sessão não autorizada. Entre novamente pelo SAHMT-BH.');
  const user={email:String(result.email).trim().toLowerCase(),name:String(result.name || '')};
  if(cache)cache.put(cacheKey,JSON.stringify(user),60);
  return user;
}
function scriptCache_(){return typeof CacheService==='undefined'?null:CacheService.getScriptCache();}
function authCacheKey_(p){
  const raw=[String(p.authToken || ''),String(p.deviceToken || ''),String(p.userEmail || '')].join('\u0001');
  const digest=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,raw);
  return 'checklist-auth-v4-'+Utilities.base64EncodeWebSafe(digest).slice(0,80);
}
function units_(book,day,raw){
  const seen=new Set(),qrs=new Set();
  return (raw || rows_(book,'Unidades')).filter(row=>row[0]).map(row=>{
    const unit={id:row[0].trim(),name:row[1].trim(),qr:row[2].trim(),start:row[3],end:row[4]};
    if(!unit.id || !unit.name || !unit.qr)throw new Error('Há uma unidade com cadastro incompleto.');
    if(unit.start)validateDay_(unit.start);if(unit.end)validateDay_(unit.end);
    if(unit.start && unit.end && unit.start>unit.end)throw new Error('Período inválido no cadastro de unidades.');
    if(seen.has(unit.id))throw new Error('ID de unidade duplicado.');seen.add(unit.id);
    return unit;
  }).filter(unit=>(!unit.start || unit.start<=day)&&(!unit.end || unit.end>=day)).map(unit=>{if(qrs.has(unit.qr))throw new Error('QR Code duplicado no cadastro.');qrs.add(unit.qr);return unit;});
}
function unitsForDay_(book,day){
  const cache=scriptCache_();
  const key='checklist-units-v4-'+day;
  const saved=cache && cache.get(key);
  if(saved){try{return units_(book,day,JSON.parse(saved));}catch(error){cache.remove(key);}}
  const units=units_(book,day);
  if(cache){const rows=units.map(unit=>[unit.id,unit.name,unit.qr,unit.start,unit.end]);const serialized=JSON.stringify(rows);if(serialized.length<90000)cache.put(key,serialized,300);}
  return units;
}
function report_(book,day,user,loaded,today){
  const records=loaded?loaded.records:rows_(book,'Registros');
  const latest={},prior={};
  records.forEach(row=>{
    const unitId=String(row[3] || '').trim(),rowDay=String(row[1] || '').trim();
    if(!unitId || !/^\d{4}-\d{2}-\d{2}$/.test(rowDay))return;
    const record={id:row[0],at:row[2],condition:row[5],occurrence:row[6],email:row[7],name:row[8]};
    if(rowDay===day){latest[unitId]=record;return;}
    if(rowDay<day && (!prior[unitId] || prior[unitId].sourceDay<=rowDay))prior[unitId]={...record,sourceDay:rowDay};
  });
  const sourceUnits=loaded ? units_(book,day,loaded.units) : unitsForDay_(book,day);
  const currentDay=String(today || Utilities.formatDate(new Date(),TZ,'yyyy-MM-dd'));
  if(day===currentDay)sourceUnits.forEach(unit=>{
    if(latest[unit.id] || INACTIVE_UNIT_IDS.has(unit.id))return;
    const previous=prior[unit.id];
    if(previous?.condition==='NAO')latest[unit.id]={...previous,inherited:true};
  });
  const items=sourceUnits.map(unit=>({id:unit.id,name:unit.name,record:latest[unit.id] || null}));
  const revision=Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(items)));
  const signatures=(loaded?loaded.signatures:rows_(book,'Assinaturas')).filter(row=>row[1]===day);
  const signed=signatures.filter(row=>row[5]===revision).pop();
  const canSign=(loaded?loaded.signers:rows_(book,'Assinantes')).some(row=>row[0].trim().toLowerCase()===user.email && row[2].trim().toUpperCase()==='SIM');
  return {ok:true,day,items,revision,canSign,signature:signed?{email:signed[3],name:signed[4],at:signed[2],incomplete:String(signed[8] || '').trim().length>0,justification:String(signed[8] || '').trim()}:null,staleSignature:signatures.length>0&&!signed};
}
function installChecklistScoreTrigger(){
  const handler='finalizePreviousChecklistScore_';
  const props=PropertiesService.getScriptProperties();
  // Create the replacement before deleting the current user's previous trigger.
  const previous=ScriptApp.getProjectTriggers().filter(trigger=>trigger.getHandlerFunction()===handler);
  ScriptApp.newTrigger(handler).timeBased().everyDays(1).atHour(0).inTimezone(TZ).create();
  previous.forEach(trigger=>ScriptApp.deleteTrigger(trigger));
  props.setProperty('CHECKLIST_SCHEDULED_SCORE','1');
  return 'Gatilho diário instalado no fuso America/Sao_Paulo. Consultas não gravam pontuação; assinatura e fechamento diário mantêm a atualização.';
}
function finalizePreviousChecklistScore_(){
  const book=SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || '1zM5Mb_Us-Xt_kPJAVEPmYb-Z1tQR93A-laK-PZCXyCs');
  const today=Utilities.formatDate(new Date(),TZ,'yyyy-MM-dd');
  syncChecklistScore_(book,shiftDay_(today,-1),{email:''},today);
}function shiftDay_(day,offset){
  const date=new Date(String(day)+'T12:00:00Z');
  date.setUTCDate(date.getUTCDate()+Number(offset || 0));
  return date.toISOString().slice(0,10);
}
function syncChecklistScore_(book,scoreDay,user,today,loadedReport,alreadyLocked){
  const day=String(today || Utilities.formatDate(new Date(),TZ,'yyyy-MM-dd'));
  if(!scoreDay || scoreDay>day)return;
  const markerKey='checklist-score-v1-'+scoreDay;
  const props=PropertiesService.getScriptProperties();
  if(scoreDay<day && props.getProperty(markerKey)==='1')return;
  let scoreLock;
  if(!alreadyLocked){scoreLock=LockService.getScriptLock();scoreLock.waitLock(25000);}
  try{
    if(scoreDay<day && props.getProperty(markerKey)==='1')return;
    const trainingBook=SpreadsheetApp.openById(TRAINING_SPREADSHEET_ID);
    const sheet=trainingBook.getSheetByName(CHECKLIST_SCORE_SHEET);
    if(!sheet)throw new Error('Aba de pontuação não encontrada: '+CHECKLIST_SCORE_SHEET);
    const scoreId='checklist-diario:'+scoreDay;
    const lastRow=sheet.getLastRow();
    const existing=lastRow<2?[]:sheet.getRange(2,1,lastRow-1,8).getDisplayValues();
    const existingIndex=existing.findIndex(row=>String(row[0] || '').trim()===scoreId);
    const report=loadedReport || report_(book,scoreDay,user,undefined,day);
    const responsible=report.responsible || responsibleForDay_(scoreDay);
    const responsibleEmail=String(responsible && responsible.email || '').trim().toLowerCase();
    if(!responsibleEmail || !report.items || !report.items.length)return;
    if(scoreDay===day && !report.signature)return;
    const signerEmail=String(report.signature && report.signature.email || '').trim().toLowerCase();
    const points=signerEmail && signerEmail===responsibleEmail ? 1 : -1;
    const now=new Date();
    const rowValues=[[scoreId,responsibleEmail,CHECKLIST_SCORE_NAME,scoreDay,now,'Concluido',points,now]];
    if(existingIndex>=0){
      if(scoreDay===day)sheet.getRange(existingIndex+2,1,1,8).setValues(rowValues);
      if(scoreDay<day && props.setProperty)props.setProperty(markerKey,'1');
      SpreadsheetApp.flush();return;
    }
    const next=sheet.getLastRow()+1;
    if(next>sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),100);
    sheet.getRange(next,1,1,8).setValues(rowValues);
    SpreadsheetApp.flush();
    if(props.setProperty)props.setProperty(markerKey,'1');
  }catch(error){if(typeof Logger!=='undefined')Logger.log('Falha ao registrar pontuação '+scoreDay+': '+error.message);}
  finally{if(scoreLock && scoreLock.hasLock())scoreLock.releaseLock();}
}function validateDay_(day){if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||isNaN(Date.parse(day+'T12:00:00Z'))||new Date(day+'T12:00:00Z').toISOString().slice(0,10)!==day)throw new Error('Data inválida. Use AAAA-MM-DD.');}
function requestId_(id){if(typeof id!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(id))throw new Error('Identificador de envio inválido.');}
function rows_(book,name){const sheet=book.getSheetByName(name);if(!sheet)throw new Error('Aba não encontrada: '+name);return sheet.getLastRow()<2?[]:sheet.getRange(2,1,sheet.getLastRow()-1,HEADERS[name].length).getDisplayValues();}
function ensureSignatureJustificationHeader_(book){const sheet=book.getSheetByName('Assinaturas');if(!sheet)return;const cell=sheet.getRange(1,9,1,1);const current=cell.getDisplayValues()[0][0];if(current!==HEADERS.Assinaturas[8])cell.setValues([[HEADERS.Assinaturas[8]]]);}
function append_(book,name,row){const sheet=book.getSheetByName(name);const next=sheet.getLastRow()+1;if(next>sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),100);sheet.getRange(next,1,1,row.length).setNumberFormat('@').setValues([row.map(value=>{const s=String(value);return /^[=+@-]/.test(s)?"'"+s:s;})]);}
function json_(data){return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);}