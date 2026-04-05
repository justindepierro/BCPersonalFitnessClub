/* ===================================================
   Service Worker — BC Personal Fitness Club
   Cache-first strategy for offline support
   =================================================== */

const CACHE_NAME = "bc-fitness-v2";
const APP_SHELL = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/app.bundle.js",
  "./data/athletes.json",
  "./manifest.json",
];

function shouldHandle(request) {
  return request.method === "GET";
}

function isLocalAsset(url) {
  return url.origin === self.location.origin;
}

function isAppShellRequest(request, url) {
  return (
    request.mode === "navigate" ||
    request.destination === "script" ||
    request.destination === "style" ||
    request.destination === "document" ||
    url.pathname.endsWith(".webmanifest") ||
    url.pathname.endsWith("manifest.json")
  );
}

function cacheResponse(request, response) {
  if (!response || !response.ok) return response;
  const copy = response.clone();
  caches.open(CACHE_NAME).then(function (cache) {
    cache.put(request, copy);
  });
  return response;
}

function networkFirst(request) {
  return fetch(request)
    .then(function (response) {
      return cacheResponse(request, response);
    })
    .catch(function () {
      return caches.match(request);
    });
}

// Install — cache core assets
self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_SHELL);
    }),
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (k) {
            return k !== CACHE_NAME;
          })
          .map(function (k) {
            return caches.delete(k);
          }),
      );
    }),
  );
  self.clients.claim();
});

// Fetch — network-first for data, cache-first for assets
self.addEventListener("fetch", function (event) {
  if (!shouldHandle(event.request)) return;
  var url = new URL(event.request.url);
  if (!isLocalAsset(url)) return;

  // For JSON data files and app shell assets, prefer fresh network data.
  if (url.pathname.endsWith(".json")) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  if (isAppShellRequest(event.request, url)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // For everything else, cache-first with network fill.
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      if (cached) return cached;
      return fetch(event.request).then(function (response) {
        return cacheResponse(event.request, response);
      });
    }),
  );
});
