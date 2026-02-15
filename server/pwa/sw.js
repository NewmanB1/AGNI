// sw.js - caches shared code and lesson data
const CACHE_NAME = 'agni-pwa-v1';

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll([
        '/shared.js',
        '/style.css',
        '/player.js'  // if separate
      ]);
    })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
