const CACHE_NAME = "poros-shell-v4";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./settings.css",
  "./manifest.webmanifest",
  "./static/logo.svg",
  "./assets/main.js",
  "./assets/ui/settings.js",
  "./assets/core/model.js",
  "./assets/core/config.js",
  "./assets/core/resolve.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("poros-shell-") && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match("./index.html")));
    return;
  }
  event.respondWith(
    fetch(event.request).then((response) => {
      if (response.ok) void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
      return response;
    }).catch(async () => (await caches.match(event.request)) ?? Response.error()),
  );
});
