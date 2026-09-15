/* Usa as mesmas fontes da grade de EVENTOS. Não altera as permissões de assinatura. */
const SCHEDULE_ID='11ayJbQFmFPzLegFZHL8kPKCvudpPo60O4NyR3i7aofA';
const EVENT_RECORDS_ID='1ku56cds3LvaFuRHaNGysw-VI2jSq8l1Q6CFOsHmoCXg';
const CONTACTS_URL='https://anestesiahmtforms.github.io/anestesiahmtforms.SAHMT.github.io/apps/eventos/contacts.js';
const INACTIVE_UNIT_IDS=new Set(['100170004','100170010','100170011','100170016','100170022']);
function monthly_(book,month,user,today){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error('Mês inválido.');
  const sources=safeSources_(month.slice(0,4));
  const loaded={records:rows_(book,'Registros'),signatures:rows_(book,'Assinaturas'),units:rows_(book,'Unidades'),signers:rows_(book,'Assinantes')};
  const count=new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate();
  const days=[];
  for(let n=1;n<=count;n++){
    const day=month+'-'+String(n).padStart(2,'0');const r=report_(book,day,user,loaded,today);
    const status=day>today?'future':!r.items.length?'notApplicable':r.signature?'checked':'pending';
    days.push({day,status,responsible:selectResponsible_(day,sources),signature:r.signature,staleSignature:r.staleSignature,completed:r.items.filter(item=>item.record).length,total:r.items.length});
  }
  return {ok:true,month,days};
}
function responsibleForDay_(day){return selectResponsible_(day,safeSources_(day.slice(0,4)));}
function safeSources_(year){try{return responsibilitySources_(year);}catch(error){return {error:'Não foi possível atualizar a escala, férias ou eventos. Responsável indisponível.'};}}
function responsibilitySources_(year){
  const cache=CacheService.getScriptCache(),key='checklist-responsaveis-v3-'+year;
  const saved=cache.get(key);if(saved)return JSON.parse(saved);
  const titles=['SEGUNDA','TERCA','QUARTA','QUINTA','SEXTA','SABADO','DOMINGO'];
  const csvUrl=(title,range)=>'https://docs.google.com/spreadsheets/d/'+SCHEDULE_ID+'/gviz/tq?tqx=out:csv&sheet='+encodeURIComponent(title+' '+year)+'&range='+range;
  const urls=titles.map(title=>csvUrl(title,'A3:R400')).concat([csvUrl('FERIAS','A3:F80'),CONTACTS_URL]);
  const responses=UrlFetchApp.fetchAll(urls.map(url=>({url,muteHttpExceptions:true})));
  if(responses.some(r=>r.getResponseCode()!==200))throw new Error('Fonte indisponível.');
  const csvAt=i=>{const text=responses[i].getContentText();if(/^\s*</.test(text))throw new Error('Fonte inválida.');return Utilities.parseCsv(text);};
  const schedule={};titles.forEach((_,i)=>csvAt(i).forEach(row=>{const day=sourceDay_(row[0]);if(day)schedule[day]=row.slice(1).map(x=>String(x).trim().toUpperCase()).filter(Boolean);}));
  const vacations=csvAt(7).map(row=>({start:sourceDay_(row[2]),end:sourceDay_(row[3]),label:String(row[4] || '')})).filter(v=>v.start&&v.end);
  const contacts={},names={};const raw=responses[8].getContentText();
  const regex=/\{\s*sigla:\s*"([^"]+)"[^\n]*?name:\s*"([^"]+)"[^\n]*?email:\s*"([^"]*)"/g;let match;
  while((match=regex.exec(raw))){names[normalizeMember_(match[2])]=match[1];if(match[3])contacts[match[1]]=match[3].trim().toLowerCase();}
  const eventSheet=SpreadsheetApp.openById(EVENT_RECORDS_ID).getSheetByName('Registros');
  if(!eventSheet)throw new Error('Registros de eventos indisponíveis.');
  const eventRows=eventSheet.getLastRow()<2?[]:eventSheet.getRange(2,1,eventSheet.getLastRow()-1,7).getDisplayValues();
  const replacementEvents=replacementEvents_(eventRows,names,contacts);
  const override=PropertiesService.getScriptProperties().getProperty('RESPONSIBLE_EMAILS_JSON');
  if(override)Object.assign(contacts,JSON.parse(override));
  if(!Object.keys(schedule).length || !Object.keys(contacts).length)throw new Error('Cadastro indisponível.');
  const result={schedule,vacations,replacementEvents,contacts};const serialized=JSON.stringify(result);
  if(serialized.length<90000)cache.put(key,serialized,300);return result;
}
function sourceDay_(value){const s=String(value || '').trim();const m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);return m?m[3]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[1]).padStart(2,'0'):/^\d{4}-\d{2}-\d{2}$/.test(s)?s:null;}
function siglaParts_(token,day){
  if(token==='DC'){const weekday=new Date(day+'T12:00:00Z').getUTCDay();return ({1:['CR','LH'],2:['CR','LH','AD'],3:['CR','LH','AD'],4:['CR','LH'],5:['CR','LA']})[weekday] || ['AD','CR','LA','LH'];}
  return String(token).match(/L2|[A-Z]{2}/g) || [];
}
function selectResponsible_(day,sources){
  if(sources.error)return {email:null,sigla:null,reason:sources.error};
  const schedule=sources.schedule[day];if(!schedule)return {email:null,sigla:null,reason:'Escala não disponível para esta data.'};
  const vacation=new Set(sources.vacations.filter(v=>v.start<=day&&v.end>=day).flatMap(v=>siglaParts_(v.label.split('(')[0].toUpperCase(),day)));
  const replacements=sources.replacementEvents?.[day] || {people:[],unresolved:false};
  if(replacements.unresolved)return {email:null,sigla:null,reason:'Há evento com substituto cujo membro não foi identificado. Confira o registro em Eventos de Escala.'};
  const eventPeople=new Set(replacements.people);
  const available=schedule.map((token,index)=>({token,index,parts:siglaParts_(token,day).filter(p=>!vacation.has(p)&&!eventPeople.has(p))})).filter(item=>item.parts.length);
  const selected=available[0];if(!selected)return {email:null,sigla:null,reason:'Nenhuma sigla disponível na escala diária.'};
  const first=selected.parts[0];
  const email=sources.contacts[first];
  return {sigla:first,sourceSigla:selected.token,position:selected.index+1,email:email || null,reason:email?'Primeira posição disponível em Eventos de Escala, em ordem crescente; primeira sigla disponível do grupo.':'Referência de e-mail pendente para '+first+'.'};
}

function normalizeMember_(value){return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toUpperCase();}
function replacementEvents_(rows,names,contacts){
  const result={};
  rows.forEach(row=>{
    const day=sourceDay_(row[1]),member=normalizeMember_(row[2]),type=normalizeMember_(row[3]),substitute=String(row[6] || '').trim();
    // A delay does not use a substitute. SUPORTE is an additional staff assignment, not an absent scheduled member.
    if(!day || !substitute || type==='ATRASO' || member==='SUPORTE')return;
    const entry=result[day] || (result[day]={people:[],unresolved:false});
    let parts=names[member]?[names[member]]:[];
    if(!parts.length && /^(?:DC|L2|[A-Z]{2})(?:[/-](?:L2|[A-Z]{2}))*$/.test(member))parts=siglaParts_(member,day);
    if(!parts.length){entry.unresolved=true;return;}
    parts.forEach(part=>{if(!entry.people.includes(part))entry.people.push(part);});
  });
  return result;
}
