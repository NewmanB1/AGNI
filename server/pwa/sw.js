// AGNI PWA Service Worker v2 — offline-first with dynamic lesson caching
const CACHE_SHELL = 'agni-shell-v2';
const CACHE_LESSONS = 'agni-lessons-v1';

const SHELL_ASSETS = [
  '/shared.js',
  '/style.css',
  '/player.js',
  '/telemetry.js',
  '/i18n.js',
  '/navigator.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_SHELL).then(cache => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_SHELL && k !== CACHE_LESSONS).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Lesson HTML pages: network-first with cache fallback
  if (url.pathname.startsWith('/lessons/')) {
    event.respondWith(
      fetch(event.request)
        .then(resp => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_LESSONS).then(c => c.put(event.request, clone));
          }
          return resp;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // API calls: network-only (telemetry buffered client-side)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => new Response(
        JSON.stringify({ error: 'offline', offline: true }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      ))
    );
    return;
  }

  // Shell assets: cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(resp => {
        if (resp.ok && event.request.method === 'GET') {
          const clone = resp.clone();
          caches.open(CACHE_SHELL).then(c => c.put(event.request, clone));
        }
        return resp;
      });
    })
  );
});

// Periodic hub reachability check — notify telemetry to flush
setInterval(() => {
  fetch('/api/health', { method: 'HEAD', cache: 'no-store' })
    .then(() => {
      self.clients.matchAll().then(clients => {
        clients.forEach(c => c.postMessage({ type: 'HUB_REACHABLE' }));
      });
    })
    .catch(() => {});
}, 60000);

// Accept CACHE_LESSON messages from client for pre-caching
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'CACHE_LESSON' && event.data.url) {
    caches.open(CACHE_LESSONS).then(cache => {
      cache.add(event.data.url).catch(() => {});
    });
  }
});
