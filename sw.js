/* ===================================================
   Service Worker — BC Personal Fitness Club
   Cache-first strategy for offline support
   =================================================== */

const CACHE_NAME = "bc-fitness-v1";
const ASSETS = [
  "/index.html",
  "/css/styles.css",
  "/js/state.js",
  "/js/constants.js",
  "/js/helpers.js",
  "/js/data.js",
  "/js/overview.js",
  "/js/profile.js",
  "/js/tabs.js",
  "/js/compare.js",
  "/js/test-views.js",
  "/js/test-history.js",
  "/js/data-mgmt.js",
  "/js/edit-panel.js",
  "/js/print.js",
  "/data/athletes.json",
  "/manifest.json",
];

// Install — cache core assets
self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (k) { return k !== CACHE_NAME; })
          .map(function (k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

// Fetch — network-first for data, cache-first for assets
self.addEventListener("fetch", function (event) {
  var url = new URL(event.request.url);

  // For JSON data files, try network first (so updates show immediately)
  if (url.pathname.endsWith(".json")) {
    event.respondWith(
      fetch(event.request)
        .then(function (response) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(event.request, clone);
          });
          return response;
        })
        .catch(function () {
          return caches.match(event.request);
        })
    );
    return;
  }

  // For everything else, cache-first
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      if (cached) return cached;
      return fetch(event.request).then(function (response) {
        // Don't cache external CDN resources (they have their own caching)
        if (url.origin === self.location.origin) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      });
    })
  );
});
