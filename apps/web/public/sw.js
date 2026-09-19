/**
 * P36a — the service worker.
 *
 * Two jobs, no more (Constitution §7):
 *   1. Precache the app shell so the installed client opens with no
 *      network at all.
 *   2. Runtime-cache the seller's day (`day.json`) network-first, so a
 *      seller who loses signal still sees today's orders, the next seven
 *      days of capacity, their contacts, and their catalog.
 *
 * It deliberately does NOT invent a queue: outbound actions are held by
 * the page in localStorage with the SAME idempotency keys the server
 * dedupes on (P34 `replayOfflineQueue`), and POSTs that fail while
 * offline are simply not retried here — one queue, one owner, one key.
 */

const VERSION = 'sycamore-v1';
const SHELL = `${VERSION}-shell`;
const DAY = `${VERSION}-day`;

const SHELL_URLS = ['/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

const isSellerDay = (url) => /^\/s\/[^/]+\/[^/]+\/day\.json$/.test(url.pathname);
const isSellerShell = (url) => /^\/s\/[^/]+\/[^/]+\/?$/.test(url.pathname);

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return; // actions POST straight through
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // The seller's day and shell: network-first, cache as the safety net.
  // A stale day is worth infinitely more than a blank screen; the page
  // labels how old it is rather than pretending it is live.
  if (isSellerDay(url) || isSellerShell(url)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(DAY).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((hit) => hit ?? Response.error())),
    );
    return;
  }

  // Everything else in the shell: cache-first, it never changes within
  // a version.
  if (SHELL_URLS.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((hit) => hit ?? fetch(request)));
  }
});
