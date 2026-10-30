// Pathfinder service worker (Phase 6E). Deliberately small: road data must be fresh, so pages and the API
// always go to the network. Only the offline page + icons are cached, and shown when the network is down.
const CACHE = "pf-shell-v1";
const SHELL = ["/offline.html", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  // Page navigations: network first, the offline page when there's no connection.
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
  }
  // Everything else (API, tiles, scripts) is left to the browser — never served stale from here.
});
