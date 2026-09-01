const CACHE_NAME = "sahmt-gestao-shell-v29";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./assets/icon-192.svg",
  "./assets/icon-512.svg",
  "./assets/selo-qga-accredited-qmentum-diamond.png",
  "../../sahmt_option1.png",
  "../../gestao_operacional.png"
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
    return network.catch(() => caches.match("./index.html"));
  })());
});
