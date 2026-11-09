const CACHE = "ticket-inference-v1";
const FILES = [
  "/",
  "/index.html",
  "/src/app.js",
  "/src/model.js",
  "/src/engine.js",
  "/src/benchmark.js",
  "/public/model.json",
  "/public/kernel.wasm",
  "/public/manifest.json",
  "/data/fixtures.json",
];
self.addEventListener("install", (event) =>
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(FILES);
      await self.skipWaiting();
    })(),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    url.origin !== self.location.origin ||
    !FILES.includes(url.pathname) ||
    event.request.method !== "GET"
  )
    return;
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(event.request);
        if (response.ok) return response;
      } catch {}
      const cached = await (await caches.open(CACHE)).match(url.pathname);
      return cached ?? new Response("Offline asset missing", { status: 503 });
    })(),
  );
});
