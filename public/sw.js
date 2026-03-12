self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open("confusynth-v1").then((cache) =>
      cache.addAll(["/", "/index.html", "/src/app.js", "/src/styles.css", "/public/manifest.webmanifest"])
    )
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
