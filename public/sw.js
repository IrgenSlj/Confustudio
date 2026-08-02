// Bump this on every release so returning users purge stale precached assets
// on the next activate. A static cache name was the root cause of stale-shell
// "blank page" reports — keep it moving.
const CACHE_NAME = 'confustudio-v5';
// Only URLs that exist both when serving sources and when serving a production
// build. Bundled entry points are hashed, so naming /src/app.js here would 404
// in a build — and addAll() rejects as a unit, which would fail install
// outright and leave the app with no service worker at all.
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      // Added individually so one missing entry cannot abort the install.
      .then((cache) => Promise.allSettled(APP_SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isAppSource =
    url.origin === self.location.origin &&
    (url.pathname === '/' ||
      url.pathname === '/index.html' ||
      url.pathname.startsWith('/src/') ||
      // Hashed build output. Network-first like the sources: a new build
      // changes the filenames anyway, and stale shells were the original bug.
      url.pathname.startsWith('/assets/') ||
      url.pathname.startsWith('/docs/'));

  if (isAppSource) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request)),
    );
    return;
  }

  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
