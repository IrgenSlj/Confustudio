// Bump this on every release so returning users purge stale precached assets
// on the next activate. A static cache name was the root cause of stale-shell
// "blank page" reports — keep it moving.
const CACHE_NAME = 'confustudio-v4';
const APP_SHELL = [
  '/',
  '/index.html',
  '/src/app.js',
  '/src/assistant-client.js',
  '/src/styles.css',
  '/src/css/tokens.css',
  '/public/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
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
