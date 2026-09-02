const CACHE_NAME = "sahmt-pwa-v117";
const APP_SHELL = [
  "./",
  "./index.html",
  "./atualizar.html",
  "./atualizar-v2.html",
  "./atualizar-v3.html",
  "./atualizar-v4.html",
  "./atualizar-v5.html",
  "./atualizar-v6.html",
  "./escala-ferias.html",
  "./escala-ferias-v2.html",
  "./escala-ferias-imagens.html",
  "./escala-ferias-imagens.css",
  "./styles.css",
  "./app.js",
  "./sync-config.js",
  "./notices.js",
  "./data.js",
  "./contacts.js",
  "./manifest.webmanifest",
  "./escala-ferias-2026.pdf",
  "./escala-ferias-2026-v2.pdf",
  "./escala-ferias-2026-v3.pdf",
  "./escala-imagens/segunda-2026.jpg",
  "./escala-imagens/terca-2026.jpg",
  "./escala-imagens/quarta-2026.jpg",
  "./escala-imagens/quinta-2026.jpg",
  "./escala-imagens/sexta-2026.jpg",
  "./escala-imagens/sabado-2026.jpg",
  "./escala-imagens/ferias-2026.jpg",
  "./sahmt_option1_clean.png",
  "./gestao_operacional.png",
  "./apps/eventos/index.html",
  "./apps/eventos/styles.css",
  "./apps/eventos/app.js",
  "./apps/eventos/service-worker.js",
  "./apps/eventos/manifest.webmanifest",
  "./apps/eventos/data.js",
  "./apps/eventos/contacts.js",
  "./apps/eventos/notices.js",
  "./apps/eventos/sync-config.js",
  "./apps/eventos/sahmt_option1_clean.png",
  "./apps/eventos/gestao_operacional.png",
  "./apps/eventos/icons/icon-192.png",
  "./apps/eventos/icons/icon-512.png",
  "./apps/etiquetas/index.html",
  "./apps/etiquetas/styles.css",
  "./apps/etiquetas/app.js",
  "./apps/etiquetas/sw.js",
  "./apps/etiquetas/manifest.webmanifest",
  "./apps/gestao/index.html",
  "./apps/gestao/styles.css",
  "./apps/gestao/app.js",
  "./apps/gestao/sw.js",
  "./apps/gestao/manifest.webmanifest",
  "./apps/gestao/assets/icon-192.svg",
  "./apps/gestao/assets/icon-512.svg",
  "./apps/gestao/assets/sahmt-logo.png",
  "./apps/gestao/assets/selo-qga-accredited-qmentum-diamond.png",
  "./eventos/index.html",
  "./eventos/styles.css",
  "./eventos/app.js",
  "./eventos/config.js",
  "./eventos/sw.js",
  "./eventos/manifest.webmanifest",
  "./eventos/assets/hero-icon.png",
  "./eventos/assets/icon-192.png",
  "./eventos/assets/icon-512.png",
  "./logo_administrativo.png",
  "./logo_gestao.png",
  "./logo_equipe.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  // Serve the cached shell immediately, while refreshing it in the background.
  // External spreadsheet data is still fetched by the app with no-store.
  if (new URL(event.request.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    const network = fetch(event.request, { cache: "no-store" }).then((response) => {
      if (response.ok) {
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
      }
      return response;
    });

    if (cached) {
      event.waitUntil(network.catch(() => {}));
      return cached;
    }

    return network.catch(async () => {
      const requestUrl = new URL(event.request.url);
      if (requestUrl.pathname.includes("/apps/eventos/")) return caches.match("./apps/eventos/index.html");
      if (requestUrl.pathname.includes("/apps/etiquetas/")) return caches.match("./apps/etiquetas/index.html");
      if (requestUrl.pathname.includes("/apps/gestao/")) return caches.match("./apps/gestao/index.html");
      return caches.match("./index.html");
    });
  })());
});
