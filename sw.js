const CACHE = "tabi-v19";
const PRIVATE_CACHE = "tabi-private-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/icon.svg",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./src/styles.css",
  "./src/app.js",
  "./src/backgrounds.js",
  "./src/api-client.js",
  "./src/data.js",
  "./src/countries.js",
  "./src/currency.js",
  "./src/money.js",
  "./src/contracts.js",
  "./src/finance.js",
  "./src/navigation.js",
  "./src/time.js",
  "./src/calendar.js",
  "./src/places.js",
  "./src/templates.js",
  "./src/trip-phase.js",
  "./src/reservation-import.js",
  "./src/task-templates.js",
  "./src/pwa.js",
  "./src/offline-cache.js",
  "./src/domain.js",
  "./src/emojis.js",
  "./src/lightbox.js",
  "./src/store.js",
  "./src/session.js",
  "./src/ui.js",
  "./src/visuals.js",
  "./src/permissions.js",
];
self.addEventListener(
  "install",
  (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS))),
);
self.addEventListener(
  "activate",
  (event) =>
    event.waitUntil(
      caches.keys().then((keys) =>
        Promise.all(keys.filter((key) => ![CACHE, PRIVATE_CACHE].includes(key)).map((key) => caches.delete(key)))
      )
        .then(() => self.clients.claim()),
    ),
);
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const pathname = new URL(event.request.url).pathname;
  if (pathname.startsWith("/api/media/")) {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response.ok) caches.open(PRIVATE_CACHE).then((cache) => cache.put(event.request, response.clone()));
        return response;
      }).catch(() => caches.match(event.request)),
    );
    return;
  }
  if (pathname.startsWith("/api/") || pathname.startsWith("/invite/")) return;
  event.respondWith(
    fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match(event.request).then((match) => match || caches.match("./index.html"))),
  );
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "CLEAR_PRIVATE_CACHE") event.waitUntil(caches.delete(PRIVATE_CACHE));
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
