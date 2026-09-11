(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const cfg = window.CHECKLIST_CONFIG;
  let session = null, stream = null, scanning = false, current = null, report = null, prefetchStartedDay = '', lastValidReportDay = '';
  const reportCache = new Map(), pendingReads = new Map(), REPORT_CACHE_MS = 15000;
  const MAINTENANCE_UNITS = new Set(['100170004','100170010','100170011','100170016','100170022']);
  let activatedMaintenance = new Set(), activatedMaintenanceDay = '';
  const unitKey = item => String(item?.id || '').replace(/\D/g, '');
  const isMaintenance = item => MAINTENANCE_UNITS.has(unitKey(item));
  function syncMaintenanceDay(day = dateKey()) {
    if (activatedMaintenanceDay !== day) { activatedMaintenanceDay = day; activatedMaintenance = new Set(); }
    return activatedMaintenance;
  }
  const isInactiveMaintenance = (item, day = dateKey()) => isMaintenance(item) && !item.record && !(day === activatedMaintenanceDay && activatedMaintenance.has(unitKey(item)));
  const numericUnitId = item => Number(unitKey(item)) || Number.MAX_SAFE_INTEGER;
  const isIsoDay = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
  let pendingRecord = null, pendingSignature = null, busy = false, reportSyncTimer = null, reportSyncStartedAt = 0;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', {willReadFrequently:true});
  const dateKey = () => {const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const values=Object.fromEntries(parts.filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));return `${values.year}-${values.month}-${values.day}`;};
  const notice = message => {
    $('message').textContent = message;
    $('message').dataset.state = /identificando unidade/i.test(message) ? 'identifying' : message ? 'notice' : '';
    document.querySelectorAll('.dialog-message').forEach(node=>node.remove());
    const dialog=document.querySelector('dialog[open]');
    if(message && dialog){const node=document.createElement('p');node.className='dialog-message';node.setAttribute('role','alert');node.textContent=message;dialog.querySelector('.dialog-head').after(node);}
  };
  function syncIndicator(state, elapsed = 0) {
    const node=$('reportSyncStatus'),label=$('reportSyncLabel');if(!node||!label)return;
    node.dataset.state=state;
    label.textContent=state==='syncing'?`Sincronizando ${String(elapsed).padStart(2,'0')}s`:state==='updated'?'Atualizado':state==='error'?'Falha na atualização':'Aguardando atualização';
  }
  function startReportSync() {
    clearInterval(reportSyncTimer);reportSyncStartedAt=Date.now();syncIndicator('syncing',0);
    reportSyncTimer=setInterval(()=>syncIndicator('syncing',Math.floor((Date.now()-reportSyncStartedAt)/1000)),1000);
  }
  function finishReportSync() {const elapsed=Math.floor((Date.now()-reportSyncStartedAt)/1000);clearInterval(reportSyncTimer);reportSyncTimer=null;syncIndicator('updated',elapsed);}
  function failReportSync() {clearInterval(reportSyncTimer);reportSyncTimer=null;syncIndicator('error');}
  function shiftDay(day,delta) {const value=new Date(`${day}T12:00:00Z`);value.setUTCDate(value.getUTCDate()+delta);return value.toISOString().slice(0,10);}
  function authPayload() {
    try { const live = window.parent.SAHMT_AUTH?.getSession(); if(live) session=live; } catch {}
    if(!session?.email) throw new Error('Abra este checklist pelo SAHMT-BH e entre com sua conta.');
    return {authToken:session.token || '',deviceToken:session.deviceToken || '',userEmail:session.email};
  }
  function requestKey(action,payload){return action+':'+JSON.stringify(payload || {});}
  function rememberReport(data){if(data?.day)reportCache.set(requestKey('report',{day:data.day}),{at:Date.now(),data});return data;}
  function patchCachedReport(day,record){
    const key=requestKey('report',{day});const cached=reportCache.get(key);if(!cached?.data?.items)return;
    const data=JSON.parse(JSON.stringify(cached.data));const item=data.items.find(entry=>String(entry.id)===String(record.unitId));if(!item)return;
    item.record={id:record.id,at:record.at,condition:record.condition,occurrence:record.occurrence,email:record.email,name:record.name};data.signature=null;data.staleSignature=true;data.revision='';reportCache.set(key,{at:Date.now(),data});
  }
  async function refreshReport(day){startReportSync();try{const data=await api('report',{day},{force:true});if(report?.day===day)renderReport(data);finishReportSync();return data;}catch{failReportSync();return null;}}
  async function api(action, payload={}, options={}) {
    if(!cfg.apiUrl) throw new Error('A conexão com a planilha ainda está em configuração.');
    if(!navigator.onLine) throw new Error('Sem conexão. Conecte-se à internet para consultar ou registrar o checklist.');
    const isRead=action==='report' || action==='monthly';const key=isRead?requestKey(action,payload):'';
    if(isRead){const running=pendingReads.get(key);if(running)return running;if(!options.force){const cached=reportCache.get(key);if(cached && Date.now()-cached.at<REPORT_CACHE_MS)return cached.data;}}
    const request=(async()=>{const controller = new AbortController(); const timeout = setTimeout(()=>controller.abort(),60000);
      try {
        const response = await fetch(cfg.apiUrl,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({...payload,...authPayload(),action}),signal:controller.signal,cache:'no-store',redirect:'follow'});
        const result=await response.json();
        if(!response.ok || result.ok !== true) throw new Error(result.message || 'Não foi possível concluir a operação.');
        if(action==='report')rememberReport(result);
        return result;
      } catch(error) {
        if(error.name==='AbortError') throw new Error('A resposta demorou. Tente novamente; o mesmo envio não será duplicado.');
        throw error;
      } finally {clearTimeout(timeout);}
    })();
    if(!isRead)return request;
    pendingReads.set(key,request);try{return await request;}finally{pendingReads.delete(key);}
  }
  function stopCamera(){scanning=false;stream?.getTracks().forEach(track=>track.stop());stream=null;$('video').srcObject=null;}
  function close(id){if(id==='cameraDialog')stopCamera();$(id).close();}
  function fail(error){ notice(error.message || 'Não foi possível concluir.'); }
  async function identify(raw){
    stopCamera();close('cameraDialog');notice('Identificando unidade…');
    const data=await api('resolve',{qr:String(raw)});current=data.unit;if(isMaintenance(current))syncMaintenanceDay(dateKey()).add(unitKey(current));pendingRecord=null;
    $('recordForm').reset();$('occurrenceLabel').hidden=true;$('occurrence').required=false;
    $('unitName').textContent=current.name;notice('');$('recordDialog').showModal();
  }
  function decode(source,width,height){
    const ratio=Math.min(1,1400/Math.max(width,height));canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
    ctx.drawImage(source,0,0,canvas.width,canvas.height);
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
    const gray=new Uint8ClampedArray(pixels.width*pixels.height);
    for(let i=0;i<gray.length;i++){const p=i*4;gray[i]=(pixels.data[p]+2*pixels.data[p+1]+pixels.data[p+2])/4;}
    const bitmap=new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(new ZXing.RGBLuminanceSource(gray,pixels.width,pixels.height)));
    try{return new ZXing.QRCodeReader().decode(bitmap).getText();}catch{return null;}
  }
  async function startCamera(){
    if(!navigator.mediaDevices?.getUserMedia) throw new Error('A câmera exige HTTPS e permissão do navegador. Use a leitura de uma foto.');
    if(!window.ZXing) throw new Error('Não foi possível carregar o leitor. Atualize a página.');
    stopCamera();scanning=true;
    try {
      const acquired=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
      if(!scanning){acquired.getTracks().forEach(track=>track.stop());return;}
      stream=acquired;$('video').srcObject=stream;$('cameraDialog').showModal();await $('video').play();
      let lastQr='', stableReads=0;
      const tick=()=>{if(!scanning)return;try{const v=$('video');if(v.readyState>=2){const qr=decode(v,v.videoWidth,v.videoHeight);if(qr){if(qr===lastQr){stableReads+=1;}else{lastQr=qr;stableReads=1;}if(stableReads>=3){identify(qr).catch(fail);return;}}else{lastQr='';stableReads=0;}}setTimeout(tick,350);}catch(error){stopCamera();close('cameraDialog');fail(error);}};tick();
    }catch(error){stopCamera();throw new Error(error.name==='NotAllowedError'?'Permita o acesso à câmera ou use uma foto do QR Code.':error.message);}
  }
  function addText(parent,tag,text){const node=document.createElement(tag);node.textContent=text;parent.append(node);return node;}
  function normalizedEmail(value){return String(value || '').trim().toLowerCase();}
  function signatureState(responsible,signature){
    const signer=normalizedEmail(signature && signature.email), expected=normalizedEmail(responsible && responsible.email);
    if(!signer)return 'pending';
    return expected && signer===expected ? 'responsible' : 'other';
  }
  function signatureLabel(state){return state==='responsible'?'Concluído pelo responsável':state==='other'?'Concluído por outro autorizado':'Checagem final pendente';}
  function appendEmail(parent,label,email,className){
    if(label)addText(parent,'span',label).className='email-label';
    return addText(parent,'p',email || 'E-mail não disponível.').className=className;
  }
  function renderReport(data){
    if(!data.responsible && report && report.day===data.day)data.responsible=report.responsible;
    report=data;const orderedItems=[...data.items].sort((a,b)=>Number(isInactiveMaintenance(a,data.day))-Number(isInactiveMaintenance(b,data.day)) || numericUnitId(a)-numericUnitId(b));const activeItems=orderedItems.filter(item=>!isInactiveMaintenance(item,data.day));const done=activeItems.filter(item=>item.record).length;const isToday=data.day===dateKey();const state=signatureState(data.responsible,data.signature);
    $('responsible').replaceChildren();addText($('responsible'),'strong','RESPONSÁVEL DO DIA');
    const responsibleEmail=data.responsible && data.responsible.email;
    appendEmail($('responsible'),'',
      responsibleEmail || (data.responsible && data.responsible.reason) || 'Responsável indisponível.',
      'responsible-email signature-' + state);
    if(data.signature && state==='other')appendEmail($('responsible'),'ASSINADO POR',data.signature.email,'signer-email signature-signed');
    $('responsible').className='signature responsible-compact signature-' + state;
    $('equipmentList').replaceChildren();
    if(!data.items.length)addText($('equipmentList'),'p','A relação de unidades ainda não foi cadastrada.');
    orderedItems.forEach(item=>{const maintenance=isInactiveMaintenance(item,data.day);const state=maintenance?'MANUTENCAO':item.record?(item.record.condition==='SIM'?'SIM':'NAO'):'PENDENTE';const card=document.createElement('article');card.className='equipment '+state;const button=document.createElement('button');button.type='button';button.className='arsenal-icon sigla-button '+state;button.dataset.unitId=item.id;button.setAttribute('aria-label',item.name+', '+(maintenance?'Em manutenção':state==='SIM'?'Checklist realizado':state==='NAO'?'Alerta de ocorrência':'Checklist não realizado'));const badge=document.createElement('span');badge.className='arsenal-number';badge.textContent=item.id.replace(/^.*?(\d+)$/,'$1');button.append(badge);button.onclick=()=>maintenance?showMaintenance(item):showStatus(item,state);card.append(button);const banner=document.createElement('section');banner.className='status-banner '+state;banner.hidden=true;card.append(banner);if(item.record){const audit=document.createElement('span');audit.className='sr-only';audit.textContent=item.record.email;card.append(audit);}$('equipmentList').append(card);});
    $('signatureStatus').replaceChildren();
    const text=data.signature?signatureLabel(state)+' — '+(data.signature.name || data.signature.email)+' ('+data.signature.email+'), em '+new Date(data.signature.at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})+'.':!isToday?'Histórico do dia — somente consulta.':data.staleSignature?'O checklist mudou após a assinatura. É necessária uma nova assinatura.':!data.canSign?'A assinatura está reservada ao grupo autorizado.':done!==activeItems.length || !done?'Conclua todos os checklists para assinar.':'Relatório pronto para assinatura.';
    addText($('signatureStatus'),'p',text).className='signature';
    $('signForm').hidden=!!data.signature || !isToday;$('declaration').checked=false;
    $('sign').disabled=!!data.signature || !isToday || !data.canSign || !done || done!==activeItems.length;
  }
  function showStatus(item,state){document.querySelectorAll('.equipment .status-banner').forEach(node=>{node.hidden=true;});const card=[...$('equipmentList').children].find(node=>node.querySelector('[data-unit-id]')?.dataset.unitId===item.id);const banner=card?.querySelector('.status-banner');if(!banner)return;banner.replaceChildren();const title=state==='SIM'?'Checklist Realizado!':state==='NAO'?'Alerta!':'Checklist não realizado!';addText(banner,'strong',title);if(state==='NAO'&&item.record?.occurrence)addText(banner,'p',item.record.occurrence);if(item.record){addText(banner,'p',`Registrado por: ${item.record.email}`).className='status-email';}banner.hidden=false;}
  function showMaintenance(item){document.querySelectorAll('.equipment .status-banner').forEach(node=>{node.hidden=true;});const card=[...$('equipmentList').children].find(node=>node.querySelector('[data-unit-id]')?.dataset.unitId===item.id);const banner=card?.querySelector('.status-banner');if(!banner)return;banner.replaceChildren();addText(banner,'strong','Em manutenção');addText(banner,'p','Checklist temporariamente inativo para este arsenal.');banner.hidden=false;}
  function openReportDialog(){const dialog=$('reportDialog');dialog.showModal();dialog.focus({preventScroll:true});}
  async function loadReport(){const today=dateKey();const day=$('reportDate').value;$('reportDate').max=today;if(!isIsoDay(day) || day>today){$('reportDate').value=lastValidReportDay || today;return;}lastValidReportDay=day;$('sign').disabled=true;startReportSync();try{const cached=reportCache.get(requestKey('report',{day}));if(cached)renderReport(cached.data);const data=await api('report',{day},{force:true});renderReport(data);pendingSignature=null;finishReportSync();}catch(error){failReportSync();throw error;}}
  async function loadMonthly(){
    const month=$('reportMonth').value;if(!month)return;$('monthlyDays').replaceChildren();$('monthlySummary').textContent='Consultando o mês…';
    try{const data=await api('monthly',{month});$('monthlySummary').textContent=data.days.filter(d=>d.status==='checked').length+' dias com checagem final assinada.';
      for(const day of data.days){
        const state=day.status==='future'||day.status==='notApplicable'?'pending':signatureState(day.responsible,day.signature);
        const card=document.createElement('article');card.className='monthly-day '+day.status+' signature-'+state;card.setAttribute('role','row');
        addText(card,'h3',day.day.split('-').reverse().join('/')).className='monthly-date';
        const people=document.createElement('div');people.className='monthly-people';
        const responsibleBox=document.createElement('div');responsibleBox.className='monthly-person';
        appendEmail(responsibleBox,'RESPONSÁVEL DO DIA',(day.responsible && day.responsible.email) || (day.responsible && day.responsible.reason) || 'Referência de e-mail pendente.','responsible-email signature-'+state);
        people.append(responsibleBox);
        if(day.signature && state==='other'){const signerBox=document.createElement('div');signerBox.className='monthly-person';appendEmail(signerBox,'ASSINADO POR',day.signature.email,'signer-email signature-signed');people.append(signerBox);}
        card.append(people);
        addText(card,'p',day.status==='future'?'Dia futuro':day.status==='notApplicable'?'Sem checklists previstos':day.staleSignature?'Alterado após assinatura. Nova checagem necessária.':signatureLabel(state)).className='monthly-status';
        if(day.status!=='future'&&day.status!=='notApplicable'){const button=addText(card,'button','Abrir relatório diário');button.type='button';button.onclick=()=>run(async()=>{$('reportDate').value=day.day;await loadReport();close('monthlyDialog');openReportDialog();});card.append(button);}
        $('monthlyDays').append(card);
      }
    }catch(error){$('monthlySummary').textContent='Não foi possível carregar o mês.';throw error;}
  }
  async function run(action){if(busy)return;busy=true;try{await action();}catch(error){fail(error);}finally{busy=false;}}
  $('scan').onclick=()=>run(startCamera);
  $('scanSymbol').onclick=()=>run(startCamera);
  $('photo').onchange=()=>run(async()=>{const file=$('photo').files[0];if(!file)return;try{const bitmap=await createImageBitmap(file);let qr;try{qr=decode(bitmap,bitmap.width,bitmap.height);}finally{bitmap.close();}if(!qr)throw new Error('QR Code não identificado. Fotografe de frente, com boa iluminação.');await identify(qr);}finally{$('photo').value='';}});
  document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>close(button.dataset.close));
  $('cameraDialog').addEventListener('cancel',stopCamera);document.addEventListener('visibilitychange',()=>{if(document.hidden){stopCamera();close('cameraDialog');}});
  $('recordForm').onchange=()=>{const no=$('recordForm').elements.condition.value==='NAO';$('occurrenceLabel').hidden=!no;$('occurrence').required=no;pendingRecord=null;};
  $('recordForm').onsubmit=event=>{event.preventDefault();run(async()=>{
    const condition=$('recordForm').elements.condition.value;const occurrence=condition==='NAO'?$('occurrence').value.trim():'';
    if(condition==='NAO'&&!occurrence)throw new Error('Descreva a ocorrência antes de salvar.');
    pendingRecord ||= crypto.randomUUID();const button=$('recordForm').querySelector('[type=submit]');button.disabled=true;
    try{const requestId=pendingRecord;await api('record',{unitId:current.id,condition,occurrence,requestId});const day=dateKey();patchCachedReport(day,{unitId:current.id,id:requestId,at:new Date().toISOString(),condition,occurrence,email:session.email,name:session.name || ''});pendingRecord=null;close('recordDialog');notice('Checklist registrado na planilha com sucesso.');void refreshReport(day);}finally{button.disabled=false;}
  });};
  $('report').onclick=()=>run(async()=>{const today=dateKey();lastValidReportDay=today;$('reportDate').max=today;$('reportDate').value=today;openReportDialog();await loadReport();});
  $('previousReportDay').onclick=()=>run(async()=>{const currentDay=isIsoDay($('reportDate').value)?$('reportDate').value:lastValidReportDay || dateKey();const previous=shiftDay(currentDay,-1);lastValidReportDay=previous;$('reportDate').value=previous;await loadReport();});
  $('reportDate').oninput=()=>{const today=dateKey();$('reportDate').max=today;if($('reportDate').value>today)$('reportDate').value=lastValidReportDay || today;};
  $('reportDate').onchange=()=>{const today=dateKey();$('reportDate').max=today;const selected=$('reportDate').value;if(!isIsoDay(selected) || selected>today){$('reportDate').value=lastValidReportDay || today;return;}lastValidReportDay=selected;run(async()=>{$('sign').disabled=true;await loadReport();});};
  lastValidReportDay=dateKey();$('reportDate').value=lastValidReportDay;$('reportDate').max=lastValidReportDay;
  $('monthly').onclick=()=>run(async()=>{$('reportMonth').value=dateKey().slice(0,7);$('monthlyDialog').showModal();await loadMonthly();});
  $('reportMonth').onchange=()=>run(loadMonthly);
  $('signForm').onsubmit=event=>{event.preventDefault();run(async()=>{
    if(!$('declaration').checked || !report || $('sign').disabled)return;
    pendingSignature ||= crypto.randomUUID();$('sign').disabled=true;
    try{const result=await api('sign',{day:report.day,revision:report.revision,accepted:true,requestId:pendingSignature});rememberReport(result);renderReport(result);pendingSignature=null;notice('Relatório diário assinado e registrado na planilha.');}catch(error){await loadReport().catch(()=>{});throw error;}
  });};
  $('return').onclick=()=>{stopCamera();if(window.parent!==window){window.parent.postMessage({type:'sahmt-checklist-close'},cfg.parentOrigin);}else{location.href=cfg.parentOrigin+cfg.parentPath;}};
  function receiveSession(value){session=value; $('identity').textContent=value?.email?`${value.name || 'Usuário identificado'} • ${value.email}`:'Entre no SAHMT-BH para registrar o checklist.';const enabled=!!value?.email&&!!cfg.apiUrl;$('scan').disabled=!enabled;$('scanSymbol').disabled=!enabled;$('photo').disabled=!enabled;$('report').disabled=!enabled;$('monthly').disabled=!enabled;if(enabled){const day=dateKey();syncMaintenanceDay(day);lastValidReportDay=day;$('reportDate').value=day;$('reportDate').max=day;if(prefetchStartedDay!==day){prefetchStartedDay=day;api('report',{day}).catch(()=>{});}}}
  window.addEventListener('message',event=>{if(event.origin!==cfg.parentOrigin || event.source!==window.parent || event.data?.type!=='sahmt-checklist-session')return;receiveSession(event.data.session);});
  $('today').textContent=new Intl.DateTimeFormat('pt-BR',{dateStyle:'full',timeZone:'America/Sao_Paulo'}).format(new Date());
  lastValidReportDay=dateKey();$('reportDate').value=lastValidReportDay;$('reportDate').max=lastValidReportDay;
  ['reportDialog','monthlyDialog','recordDialog','cameraDialog'].forEach(id=>{const dialog=$(id);if(dialog?.open)dialog.close();dialog?.removeAttribute('open');});
  try{if(window.parent!==window && window.parent.location.origin===cfg.parentOrigin)receiveSession(window.parent.SAHMT_AUTH?.getSession());}catch{}
  if(window.parent!==window)window.parent.postMessage({type:'sahmt-checklist-ready'},cfg.parentOrigin);
  if(!cfg.apiUrl)notice('Cadastro das unidades e conexão com a planilha em configuração.');
  else if(!session)notice('Abra este checklist pelo app principal SAHMT-BH.');
  if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{});
})();

