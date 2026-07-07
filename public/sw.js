const SHELL_CACHE = "radar-shell-v1";
const DATA_CACHE = "radar-data-v1";

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(clients.claim());
});

// Network-first for everything, falling back to cache when offline.
// Successful GET responses for same-origin requests are cached.
self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  const cacheName = url.pathname.startsWith("/api/") ? DATA_CACHE : SHELL_CACHE;
  e.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(cacheName).then((c) => c.put(request, copy));
        }
        return res;
      })
      .catch(() => caches.match(request))
  );
});
