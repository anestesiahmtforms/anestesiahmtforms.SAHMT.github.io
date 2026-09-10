/* Carregar no SAHMT-BH após auth/shared-auth.js. */
(() => {
  const origin=location.origin;
  const checklistUrl=new URL('../apps/checklist/',document.currentScript.src).href;
  const dialog=document.createElement('dialog');
  dialog.setAttribute('aria-label','Checklist do Arsenal');
  dialog.style.cssText='position:fixed;inset:0;width:100%;height:100dvh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:#0d3257';
  const frame=document.createElement('iframe');
  frame.title='Checklist do Arsenal tecnológico/estrutural';
  frame.style.cssText='width:100%;height:100%;border:0;display:block';
  frame.setAttribute('allow','camera');
  frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-modals');
  dialog.append(frame);document.body.append(dialog);
  function send(){frame.contentWindow?.postMessage({type:'sahmt-checklist-session',session:window.SAHMT_AUTH?.getSession() || null},origin);}
  function close(){dialog.close();frame.src='about:blank';}
  window.addEventListener('message',event=>{if(event.origin!==origin || event.source!==frame.contentWindow)return;if(event.data?.type==='sahmt-checklist-ready')send();if(event.data?.type==='sahmt-checklist-close')close();});
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  window.SAHMT_AUTH?.onChange(send);
  window.openArsenalChecklist=async()=>{
    if(!window.SAHMT_AUTH?.getSession()?.email)await window.SAHMT_AUTH.requireAccess({moduleId:'GESTAO',pageId:'checklist'});
    frame.src=checklistUrl;dialog.showModal();
  };
})();
