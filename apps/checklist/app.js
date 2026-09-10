(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const cfg = window.CHECKLIST_CONFIG;
  let session = null, stream = null, scanning = false, current = null, report = null, prefetchedReport = null;
  let pendingRecord = null, pendingSignature = null, busy = false;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', {willReadFrequently:true});
  const dateKey = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const notice = message => {
    $('message').textContent = message;
    document.querySelectorAll('.dialog-message').forEach(node=>node.remove());
    const dialog=document.querySelector('dialog[open]');
    if(message && dialog){const node=document.createElement('p');node.className='dialog-message';node.setAttribute('role','alert');node.textContent=message;dialog.querySelector('.dialog-head').after(node);}
  };
  function authPayload() {
    try { const live = window.parent.SAHMT_AUTH?.getSession(); if(live) session=live; } catch {}
    if(!session?.email) throw new Error('Abra este checklist pelo SAHMT-BH e entre com sua conta.');
    return {authToken:session.token || '',deviceToken:session.deviceToken || '',userEmail:session.email};
  }
  async function api(action, payload={}) {
    if(!cfg.apiUrl) throw new Error('A conexão com a planilha ainda está em configuração.');
    if(!navigator.onLine) throw new Error('Sem conexão. Conecte-se à internet para consultar ou registrar o checklist.');
    const controller = new AbortController(); const timeout = setTimeout(()=>controller.abort(),60000);
    try {
      const response = await fetch(cfg.apiUrl,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({...payload,...authPayload(),action}),signal:controller.signal,cache:'no-store',redirect:'follow'});
      const result=await response.json();
      if(!response.ok || result.ok !== true) throw new Error(result.message || 'Não foi possível concluir a operação.');
      return result;
    } catch(error) {
      if(error.name==='AbortError') throw new Error('A resposta demorou. Tente novamente; o mesmo envio não será duplicado.');
      throw error;
    } finally {clearTimeout(timeout);}
  }
  function stopCamera(){scanning=false;stream?.getTracks().forEach(track=>track.stop());stream=null;$('video').srcObject=null;}
  function close(id){if(id==='cameraDialog')stopCamera();$(id).close();}
  function fail(error){ notice(error.message || 'Não foi possível concluir.'); }
  async function identify(raw){
    stopCamera();close('cameraDialog');notice('Identificando unidade…');
    const data=await api('resolve',{qr:String(raw)});current=data.unit;pendingRecord=null;
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
      const tick=()=>{if(!scanning)return;try{const v=$('video');if(v.readyState>=2){const qr=decode(v,v.videoWidth,v.videoHeight);if(qr){identify(qr).catch(fail);return;}}setTimeout(tick,220);}catch(error){stopCamera();close('cameraDialog');fail(error);}};tick();
    }catch(error){stopCamera();throw new Error(error.name==='NotAllowedError'?'Permita o acesso à câmera ou use uma foto do QR Code.':error.message);}
  }
  function addText(parent,tag,text){const node=document.createElement(tag);node.textContent=text;parent.append(node);return node;}
  function renderReport(data){
    if(!data.responsible && report?.day===data.day)data.responsible=report.responsible;
    report=data;const done=data.items.filter(item=>item.record).length;
    $('responsible').replaceChildren();addText($('responsible'),'strong','RESPONSÁVEL');
    addText($('responsible'),'p',data.responsible?.email || data.responsible?.reason || 'Responsável indisponível.');
    $('responsible').className='signature responsible-compact';
    $('equipmentList').replaceChildren();
    if(!data.items.length)addText($('equipmentList'),'p','A relação de unidades ainda não foi cadastrada.');
    data.items.forEach(item=>{const state=item.record?(item.record.condition==='SIM'?'SIM':'NAO'):'PENDENTE';const card=document.createElement('article');card.className='equipment '+state;const button=document.createElement('button');button.type='button';button.className='arsenal-icon sigla-button';button.dataset.unitId=item.id;button.setAttribute('aria-label',`${item.name}, ${state==='SIM'?'Checklist realizado':state==='NAO'?'Alerta de ocorrência':'Checklist não realizado'}`);const badge=document.createElement('span');badge.className='arsenal-number';badge.textContent=item.id.replace(/^.*?(\d+)$/,'$1');button.append(badge);button.onclick=()=>showStatus(item,state);card.append(button);const banner=document.createElement('section');banner.className='status-banner '+state;banner.hidden=true;card.append(banner);if(item.record){const audit=document.createElement('span');audit.className='sr-only';audit.textContent=item.record.email;card.append(audit);}$('equipmentList').append(card);});
    $('signatureStatus').replaceChildren();
    const text=data.signature?`Assinado por ${data.signature.name || data.signature.email} (${data.signature.email}), em ${new Date(data.signature.at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}.`:data.staleSignature?'O checklist mudou após a assinatura. É necessária uma nova assinatura.':!data.canSign?'A assinatura está reservada ao grupo autorizado.':done!==data.items.length || !done?'Conclua todos os checklists para assinar.':'Relatório pronto para assinatura.';
    addText($('signatureStatus'),'p',text).className='signature';
    $('signForm').hidden=!!data.signature;$('declaration').checked=false;
    $('sign').disabled=!!data.signature || !data.canSign || !done || done!==data.items.length;
  }
  function showStatus(item,state){document.querySelectorAll('.equipment .status-banner').forEach(node=>{node.hidden=true;});const card=[...$('equipmentList').children].find(node=>node.querySelector('[data-unit-id]')?.dataset.unitId===item.id);const banner=card?.querySelector('.status-banner');if(!banner)return;banner.replaceChildren();const title=state==='SIM'?'Checklist Realizado!':state==='NAO'?'Alerta!':'Checklist não realizado!';addText(banner,'strong',title);if(state==='NAO'&&item.record?.occurrence)addText(banner,'p',item.record.occurrence);if(item.record){addText(banner,'p',`Registrado por: ${item.record.email}`).className='status-email';}banner.hidden=false;}
  async function loadReport(){const day=$('reportDate').value;if(!day)return;$('sign').disabled=true;const data=prefetchedReport?.day===day?prefetchedReport:await api('report',{day});prefetchedReport=null;renderReport(data);pendingSignature=null;}
  async function loadMonthly(){
    const month=$('reportMonth').value;if(!month)return;$('monthlyDays').replaceChildren();$('monthlySummary').textContent='Consultando o mês…';
    try{const data=await api('monthly',{month});$('monthlySummary').textContent=`${data.days.filter(d=>d.status==='checked').length} dias com checagem final assinada.`;
      for(const day of data.days){const card=document.createElement('article');card.className='monthly-day '+day.status;addText(card,'h3',day.day.split('-').reverse().join('/'));addText(card,'span','RESPONSÁVEL');addText(card,'p',day.responsible?.email || day.responsible?.reason || 'Referência de e-mail pendente.').className='responsible-email';
        addText(card,'p',day.status==='checked'?'Checagem final concluída':day.status==='future'?'Dia futuro':day.status==='notApplicable'?'Sem checklists previstos':day.staleSignature?'Alterado após assinatura. Nova checagem necessária.':'Checagem final pendente');
        if(day.signature)addText(card,'p',`Assinado por: ${day.signature.email}`);
        if(day.status!=='future'&&day.status!=='notApplicable'){const button=addText(card,'button','Abrir relatório diário');button.type='button';button.onclick=()=>run(async()=>{$('reportDate').value=day.day;await loadReport();close('monthlyDialog');$('reportDialog').showModal();});}
        $('monthlyDays').append(card);
      }
    }catch(error){$('monthlySummary').textContent='Não foi possível carregar o mês.';throw error;}
  }
  async function run(action){if(busy)return;busy=true;try{await action();}catch(error){fail(error);}finally{busy=false;}}
  $('scan').onclick=()=>run(startCamera);
  $('photo').onchange=()=>run(async()=>{const file=$('photo').files[0];if(!file)return;try{const bitmap=await createImageBitmap(file);let qr;try{qr=decode(bitmap,bitmap.width,bitmap.height);}finally{bitmap.close();}if(!qr)throw new Error('QR Code não identificado. Fotografe de frente, com boa iluminação.');await identify(qr);}finally{$('photo').value='';}});
  document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>close(button.dataset.close));
  $('cameraDialog').addEventListener('cancel',stopCamera);document.addEventListener('visibilitychange',()=>{if(document.hidden){stopCamera();close('cameraDialog');}});
  $('recordForm').onchange=()=>{const no=$('recordForm').elements.condition.value==='NAO';$('occurrenceLabel').hidden=!no;$('occurrence').required=no;pendingRecord=null;};
  $('recordForm').onsubmit=event=>{event.preventDefault();run(async()=>{
    const condition=$('recordForm').elements.condition.value;const occurrence=condition==='NAO'?$('occurrence').value.trim():'';
    if(condition==='NAO'&&!occurrence)throw new Error('Descreva a ocorrência antes de salvar.');
    pendingRecord ||= crypto.randomUUID();const button=$('recordForm').querySelector('[type=submit]');button.disabled=true;
    try{await api('record',{unitId:current.id,condition,occurrence,requestId:pendingRecord});pendingRecord=null;close('recordDialog');notice('Checklist registrado na planilha com sucesso.');}finally{button.disabled=false;}
  });};
  $('report').onclick=()=>run(async()=>{$('reportDate').value=dateKey();$('reportDialog').showModal();await loadReport();});
  $('reportDate').onchange=()=>run(async()=>{$('sign').disabled=true;await loadReport();});
  $('reportDate').max=dateKey();
  $('monthly').onclick=()=>run(async()=>{$('reportMonth').value=dateKey().slice(0,7);$('monthlyDialog').showModal();await loadMonthly();});
  $('reportMonth').onchange=()=>run(loadMonthly);
  $('signForm').onsubmit=event=>{event.preventDefault();run(async()=>{
    if(!$('declaration').checked || !report || $('sign').disabled)return;
    pendingSignature ||= crypto.randomUUID();$('sign').disabled=true;
    try{const result=await api('sign',{day:report.day,revision:report.revision,accepted:true,requestId:pendingSignature});renderReport(result);pendingSignature=null;notice('Relatório diário assinado e registrado na planilha.');}catch(error){await loadReport().catch(()=>{});throw error;}
  });};
  $('return').onclick=()=>{stopCamera();if(window.parent!==window){window.parent.postMessage({type:'sahmt-checklist-close'},cfg.parentOrigin);}else{location.href=cfg.parentOrigin+cfg.parentPath;}};
  function receiveSession(value){session=value; $('identity').textContent=value?.email?`${value.name || 'Usuário identificado'} • ${value.email}`:'Entre no SAHMT-BH para registrar o checklist.';const enabled=!!value?.email&&!!cfg.apiUrl;$('scan').disabled=!enabled;$('photo').disabled=!enabled;$('report').disabled=!enabled;$('monthly').disabled=!enabled;if(enabled){const day=dateKey();api('report',{day}).then(data=>{if($('reportDate').value===day)prefetchedReport=data;}).catch(()=>{});}}
  window.addEventListener('message',event=>{if(event.origin!==cfg.parentOrigin || event.source!==window.parent || event.data?.type!=='sahmt-checklist-session')return;receiveSession(event.data.session);});
  $('today').textContent=new Intl.DateTimeFormat('pt-BR',{dateStyle:'full',timeZone:'America/Sao_Paulo'}).format(new Date());
  try{if(window.parent!==window && window.parent.location.origin===cfg.parentOrigin)receiveSession(window.parent.SAHMT_AUTH?.getSession());}catch{}
  if(window.parent!==window)window.parent.postMessage({type:'sahmt-checklist-ready'},cfg.parentOrigin);
  if(!cfg.apiUrl)notice('Cadastro das unidades e conexão com a planilha em configuração.');
  else if(!session)notice('Abra este checklist pelo app principal SAHMT-BH.');
  if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{});
})();
