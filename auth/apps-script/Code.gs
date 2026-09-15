/** Autenticação central SAHMT, com compatibilidade para o serviço legado no mesmo projeto. */
function doGet(e){
  if(e?.parameter?.action==='health')return jsonResponse({ok:true,service:'SAHMT Autenticação Central',version:1});
  return legacyDoGet_(e);
}
function doPost(e){
  try {
    const payload=JSON.parse(e?.postData?.contents || '{}');
    const action=String(payload.action || e?.parameter?.action || '').trim();
    if(action==='auth')return handleAuth_(payload);
    if(action==='track')return handleTrack_(payload);
    return legacyDoPost_(e);
  }catch(error){return jsonResponse({ok:false,code:error.code || 'AUTH_ERROR',message:error.message || 'Não foi possível confirmar o acesso.'});}
}
