const CACHE = 'sahmt-checklist-v17';
const FILES = ['./','./index.html','./styles.css','./premium-icons.css','./report-layout.css','./app.js','./config.js','./manifest.webmanifest','./icons/icon.svg','./vendor/zxing.min.js'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('sahmt-checklist-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET' || !FILES.some(file => new URL(file,self.registration.scope).href === event.request.url)) return;
  event.respondWith(fetch(event.request).then(response => { if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));}return response; }).catch(()=>caches.match(event.request)));
});

\n