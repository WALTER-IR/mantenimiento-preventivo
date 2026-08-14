// ============================================================
//  Service Worker - SOLO CACHÉ (sin conexión a internet)
//  Mantiene el funcionamiento sin conexión pero NO sincroniza
//  nada externamente. La app solo se actualiza cuando el
//  usuario lo pide explícitamente.
// ============================================================
const CACHE_NAME = "mantenimiento-pwa-v35";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/styles.css",
  "./js/config.js",
  "./js/db.js",
  "./js/app.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

// Cache-only: NUNCA se conecta a la red. Todo se sirve desde la caché local.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  // app-version.json se consulta solo cuando el usuario pulsa "Buscar actualizaciones":
  // red primero (para detectar la versión nueva) y caché como respaldo sin conexión.
  if (url.pathname.endsWith("/app-version.json")) {
    event.respondWith(
      fetch(event.request)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return resp;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      if (event.request.mode === "navigate") return caches.match("./index.html");
      return new Response("", { status: 200, statusText: "ok" });
    })
  );
});
