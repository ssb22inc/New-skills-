/* PulseRN service worker.

   This exists as much for installability as for offline: Chrome and Edge will
   not offer "Add to Home screen" unless a service worker with a fetch handler
   is registered, so without this file the install prompt never fires no matter
   how complete the manifest is.

   The strategy is network-first on purpose. Study content changes with every
   deploy, and a student seeing a stale question is worse than one seeing an
   offline notice. The cache is only a fallback for when the network is gone. */

const CACHE = "pulsern-v1";

/* The shell only — never questions, never answers. Those come from Supabase
   and must always be fetched live so the bank stays current. */
const SHELL = ["/", "/index.html", "/manifest.json", "/icon.svg", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      // addAll rejects the whole batch if any single file 404s, which would
      // leave the worker uninstalled and silently kill installability.
      .then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Cross-origin (Supabase, Stripe, OpenRouter) is never touched — auth tokens
  // and billing calls must not pass through a cache under any circumstance.
  if (url.origin !== self.location.origin) return;

  // Our own serverless functions are dynamic and user-scoped. Never cache them.
  if (url.pathname.startsWith("/api/")) return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) => {
          if (hit) return hit;
          // A navigation with no cached match still needs the SPA shell so the
          // app can boot and show its own offline state.
          if (req.mode === "navigate") return caches.match("/index.html");
          return Response.error();
        })
      )
  );
});
