(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const cfg = window.CHECKLIST_CONFIG;
  let session = null, stream = null, scanning = false, current = null, report = null;
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
    const controller = new AbortController(); const timeout = setTimeout(()=>controller.abort(),25000);
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
    report=data;const done=data.items.filter(item=>item.record).length;
    $('summary').textContent=`${done} de ${data.items.length} checklists concluídos em ${data.day.split('-').reverse().join('/')}.`;
    $('equipmentList').replaceChildren();
    if(!data.items.length)addText($('equipmentList'),'p','A relação de unidades ainda não foi cadastrada.');
    data.items.forEach(item=>{const card=document.createElement('article');card.className='equipment '+(item.record?.condition || 'PENDENTE');addText(card,'h3',item.name);addText(card,'strong',item.record?(item.record.condition==='SIM'?'Liberado':'Sem condições de uso'):'Checklist pendente');if(item.record){addText(card,'p',`${item.record.name || item.record.email} • ${new Date(item.record.at).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo'})}`);if(item.record.occurrence)addText(card,'p',item.record.occurrence);}$('equipmentList').append(card);});
    $('signatureStatus').replaceChildren();
    const text=data.signature?`Assinado por ${data.signature.name || data.signature.email} (${data.signature.email}), em ${new Date(data.signature.at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}.`:data.staleSignature?'O checklist mudou após a assinatura. É necessária uma nova assinatura.':!data.canSign?'A assinatura está reservada ao grupo autorizado.':done!==data.items.length || !done?'Conclua todos os checklists para assinar.':'Relatório pronto para assinatura.';
    addText($('signatureStatus'),'p',text).className='signature';
    $('signForm').hidden=!!data.signature;$('declaration').checked=false;
    $('sign').disabled=!!data.signature || !data.canSign || !done || done!==data.items.length;
  }
  async function loadReport(){const day=$('reportDate').value;if(!day)return;const data=await api('report',{day});renderReport(data);pendingSignature=null;}
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
  $('report').onclick=()=>run(async()=>{$('reportDate').value=dateKey();await loadReport();$('reportDialog').showModal();});
  $('reportDate').onchange=()=>run(async()=>{$('sign').disabled=true;await loadReport();});
  $('signForm').onsubmit=event=>{event.preventDefault();run(async()=>{
    if(!$('declaration').checked || !report || $('sign').disabled)return;
    pendingSignature ||= crypto.randomUUID();$('sign').disabled=true;
    try{const result=await api('sign',{day:report.day,revision:report.revision,accepted:true,requestId:pendingSignature});renderReport(result);pendingSignature=null;notice('Relatório diário assinado e registrado na planilha.');}catch(error){await loadReport().catch(()=>{});throw error;}
  });};
  $('return').onclick=()=>{stopCamera();if(window.parent!==window){window.parent.postMessage({type:'sahmt-checklist-close'},cfg.parentOrigin);}else{location.href=cfg.parentOrigin+cfg.parentPath;}};
  function receiveSession(value){session=value; $('identity').textContent=value?.email?`${value.name || 'Usuário identificado'} • ${value.email}`:'Entre no SAHMT-BH para registrar o checklist.';const enabled=!!value?.email&&!!cfg.apiUrl;$('scan').disabled=!enabled;$('photo').disabled=!enabled;$('report').disabled=!enabled;}
  window.addEventListener('message',event=>{if(event.origin!==cfg.parentOrigin || event.source!==window.parent || event.data?.type!=='sahmt-checklist-session')return;receiveSession(event.data.session);});
  $('today').textContent=new Intl.DateTimeFormat('pt-BR',{dateStyle:'full',timeZone:'America/Sao_Paulo'}).format(new Date());
  try{if(window.parent!==window && window.parent.location.origin===cfg.parentOrigin)receiveSession(window.parent.SAHMT_AUTH?.getSession());}catch{}
  if(window.parent!==window)window.parent.postMessage({type:'sahmt-checklist-ready'},cfg.parentOrigin);
  if(!cfg.apiUrl)notice('Cadastro das unidades e conexão com a planilha em configuração.');
  else if(!session)notice('Abra este checklist pelo app principal SAHMT-BH.');
  if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{});
})();
