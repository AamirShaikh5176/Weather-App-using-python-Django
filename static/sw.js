/* AtmosWeather service worker: offline shell + static caching.
   API responses are network-only (weather must be fresh); the app
   shows friendly error states when offline. */

const CACHE_NAME = "atmosweather-v1";
const CORE_ASSETS = [
  "/",
  "/static/css/style.css",
  "/static/js/app.js",
  "/static/js/weather.js",
  "/static/js/animations.js",
  "/static/manifest.json",
  "/static/icons/favicon.svg"
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

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never cache API weather data
  if (url.pathname.startsWith("/api/")) return;

  if (event.request.mode === "navigate") {
    // Network-first for pages, fall back to the cached shell offline
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put("/", copy));
          return res;
        })
        .catch(() => caches.match("/"))
    );
    return;
  }

  // Stale-while-revalidate for static assets
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
