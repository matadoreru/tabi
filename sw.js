const CACHE = "tabi-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/icon.svg",
  "./src/styles.css",
  "./src/app.js",
  "./src/data.js",
  "./src/countries.js",
  "./src/domain.js",
  "./src/store.js",
  "./src/ui.js",
  "./src/permissions.js",
];
self.addEventListener(
  "install",
  (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())),
);
self.addEventListener(
  "activate",
  (event) =>
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
        .then(() => self.clients.claim()),
    ),
);
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const pathname = new URL(event.request.url).pathname;
  if (pathname.startsWith("/api/") || pathname.startsWith("/invite/")) return;
  event.respondWith(
    fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match(event.request).then((match) => match || caches.match("./index.html"))),
  );
});
