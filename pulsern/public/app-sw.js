/* PulseRN study-app service worker. It controls /app/ only. Public marketing,
   pricing, trust, and Learn pages always remain normal network documents. */

const CACHE = "pulsern-app-v2";
const APP_SHELL = ["/app/", "/app/index.html", "/app.webmanifest", "/icon.svg", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.all(APP_SHELL.map((url) => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key === "pulsern-v1" || (key.startsWith("pulsern-app-") && key !== CACHE)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith("/app/") && !url.pathname.startsWith("/assets/") && !APP_SHELL.includes(url.pathname)) return;
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response?.status === 200 && response.type === "basic") {
          caches.open(CACHE).then((cache) => cache.put(request, response.clone())).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => {
        if (cached) return cached;
        if (request.mode === "navigate" && url.pathname.startsWith("/app/")) return caches.match("/app/index.html");
        return Response.error();
      }))
  );
});
