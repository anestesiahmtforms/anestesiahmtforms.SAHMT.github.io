import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const assets=['index.html','manifest.webmanifest','auth/shared-auth.js','core/app.js','core/runtime.js','core/checklist-contract.js',...(await fs.readdir('core/views')).map(p=>'core/views/'+p),'icons/icon-192.png'];
const hash=createHash('sha256');for(const asset of assets)hash.update(await fs.readFile(asset));
const release=hash.digest('hex').slice(0,16);
const worker=`// One cache owner for the complete SAHMT PWA. APIs and clinical records are never cached here.
const CACHE='sahmt-unified-${release}';
const ASSETS=${JSON.stringify(assets.map(p=>'./'+p))};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('message',event=>{if(event.data==='ACTIVATE_UPDATE')self.skipWaiting();});
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const root=new URL('./',self.location.href).href;
  for(const key of await caches.keys())if(key.startsWith('sahmt-unified-')&&key!==CACHE)await caches.delete(key);
  // Remove only this app's old entries; caches on the same github.io origin may belong to other apps.
  const owned=/^(sahmt-pwa-|etiqueta-sahmt-ia-|sahmt-gestao-shell-|sahmt-checklist-)/;
  for(const key of await caches.keys())if(owned.test(key)){const c=await caches.open(key);for(const req of await c.keys())if(req.url.startsWith(root))await c.delete(req);if(!(await c.keys()).length)await caches.delete(key);}
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url),root=new URL('./',self.location.href);
  if(url.origin!==root.origin||!url.pathname.startsWith(root.pathname))return;
  // Only immutable interface assets from the release list enter the app cache.
  const clean=new URL(url);clean.search='';
  const known=ASSETS.some(p=>new URL(p,root).href===clean.href);
  if(!known&&event.request.mode!=='navigate')return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    if(known){const cached=await cache.match(clean.href);if(cached)return cached;const response=await fetch(event.request);if(response.ok)await cache.put(clean.href,response.clone());return response;}
    try{return await fetch(event.request);}catch{return (await cache.match(new URL('index.html',root).href))||Response.error();}
  })());
});
`;
await fs.writeFile('service-worker.js',worker);
const legacy=['apps/checklist/sw.js','apps/etiquetas/sw.js','apps/gestao/sw.js','apps/eventos/service-worker.js','apps/eventos/eventos/sw.js','eventos/sw.js'];
for(const p of legacy)await fs.writeFile(p,"// Retired local worker. The root PWA now owns caching.\nself.addEventListener('install',()=>self.skipWaiting());\nself.addEventListener('activate',event=>event.waitUntil(self.registration.unregister()));\n");
const modules=['eventos','etiquetas','gestao','checklist','treinamentos'];
const redirects=modules.map(id=>['apps/'+id+'/index.html',id]);
redirects.push(['eventos/index.html','eventos'],['apps/eventos/eventos/index.html','eventos']);
for(const folder of ['', 'apps/eventos/'])for(const file of await fs.readdir(folder||'.'))if(/^atualizar(?:-v\d+)?\.html$/.test(file))redirects.push([folder+file,folder?'eventos':'home']);
for(const [file,id] of redirects){
  const target=path.posix.relative(path.posix.dirname(file),'index.html')||'index.html';
  const route=id==='home'?'/':'/apps/'+id+'/';
  await fs.writeFile(file,`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SAHMT</title><body><p>Abrindo SAHMT…</p><a href="${target}#${route}">Abrir aplicativo</a><script>const u=new URL('${target}',location.href);const q=new URLSearchParams(location.search);for(const k of ['authToken','deviceToken','userEmail','userName'])q.delete(k);u.hash='${route}'+(q.size?'?'+q:'');location.replace(u.href);</script></body></html>`);
}
console.log('Single PWA cache and legacy route redirects generated.');
