const CACHE_NAME = "smart-shopping-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(["/", "/manifest.webmanifest"])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const saved = await cache.match(event.request);
      if (saved) return saved;
      try {
        const response = await fetch(event.request);
        if (response.ok) void cache.put(event.request, response.clone());
        return response;
      } catch {
        if (event.request.mode === "navigate") return (await cache.match("/")) ?? Response.error();
        return Response.error();
      }
    }),
  );
});
