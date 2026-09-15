// One cache owner for the complete SAHMT PWA. APIs and clinical records are never cached here.
const CACHE='sahmt-unified-20260915-etiquetas-ai-preflight3';
const ASSETS=["./index.html","./manifest.webmanifest","./auth/shared-auth.js","./core/app.js","./core/runtime.js","./core/checklist-contract.js","./core/views/checklist.js","./core/views/checklist.json","./core/views/etiquetas.js","./core/views/etiquetas.json","./core/views/eventos.js","./core/views/eventos.json","./core/views/gestao.js","./core/views/gestao.json","./core/views/home.js","./core/views/home.json","./core/views/treinamentos.js","./core/views/treinamentos.json","./icons/icon-192.png"];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('message',event=>{if(event.data==='ACTIVATE_UPDATE')self.skipWaiting();});
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const root=new URL('./',self.location.href).href;
  for(const key of await caches.keys())if(key.startsWith('sahmt-unified-')&&key!==CACHE)await caches.delete(key);
  const owned=/^(sahmt-pwa-|etiqueta-sahmt-ia-|sahmt-gestao-shell-|sahmt-checklist-)/;
  for(const key of await caches.keys())if(owned.test(key)){const c=await caches.open(key);for(const req of await c.keys())if(req.url.startsWith(root))await c.delete(req);if(!(await c.keys()).length)await caches.delete(key);}
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url),root=new URL('./',self.location.href);
  if(url.origin!==root.origin||!url.pathname.startsWith(root.pathname))return;
  const clean=new URL(url);clean.search='';
  const known=ASSETS.some(p=>new URL(p,root).href===clean.href);
  if(!known&&event.request.mode!=='navigate')return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    if(known){const cached=await cache.match(clean.href);if(cached)return cached;const response=await fetch(event.request);if(response.ok)await cache.put(clean.href,response.clone());return response;}
    try{return await fetch(event.request);}catch{return (await cache.match(new URL('index.html',root).href))||Response.error();}
  })());
});
