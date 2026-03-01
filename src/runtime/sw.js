// AGNI Runtime Service Worker v3 — aggressive offline-first caching
// Edge device (Android 6.0+) may lose hub connectivity for days.
// Cache everything possible: shell assets, factory scripts, lessons, KaTeX CSS.
const CACHE_SHELL = 'agni-runtime-v4';
const CACHE_LESSONS = 'agni-lessons-v2';
const CACHE_FACTORIES = 'agni-factories-v1';

const SHELL_ASSETS = [
  './shared.js',
  './player.js',
  './telemetry.js',
  './i18n.js',
  './a11y.js',
  './gate-renderer.js',
  './integrity.js',
  './checkpoint.js',
  './frustration.js',
  './completion.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_SHELL).then(cache => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  const KEEP = [CACHE_SHELL, CACHE_LESSONS, CACHE_FACTORIES];
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => KEEP.indexOf(k) === -1).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Lessons: network-first, cache fallback (supports offline playback)
  if (url.pathname.startsWith('/lessons/')) {
    event.respondWith(
      fetch(event.request)
        .then(resp => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_LESSONS).then(c => {
              c.put(event.request, clone);
              trimLessonCache();
            });
          }
          return resp;
        })
        .catch(() => caches.match(event.request).then(r =>
          r || new Response('Lesson not available offline', { status: 503 })
        ))
    );
    return;
  }

  // Factory scripts + KaTeX CSS: cache-first (immutable between versions)
  if (url.pathname.startsWith('/factories/') || url.pathname.startsWith('/katex/')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(resp => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_FACTORIES).then(c => c.put(event.request, clone));
          }
          return resp;
        });
      })
    );
    return;
  }

  // API calls: network-only with offline fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => new Response(
        JSON.stringify({ error: 'offline', offline: true }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      ))
    );
    return;
  }

  // Everything else: cache-first, network fallback
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

const MAX_LESSON_CACHE_ENTRIES = 50;

function trimLessonCache() {
  caches.open(CACHE_LESSONS).then(cache => {
    cache.keys().then(keys => {
      if (keys.length <= MAX_LESSON_CACHE_ENTRIES) return;
      var toRemove = keys.length - MAX_LESSON_CACHE_ENTRIES;
      keys.slice(0, toRemove).forEach(req => cache.delete(req));
    });
  });
}

function checkHubHealth() {
  fetch('/api/health', { method: 'HEAD', cache: 'no-store' })
    .then(() => {
      self.clients.matchAll().then(clients => {
        clients.forEach(c => c.postMessage({ type: 'HUB_REACHABLE' }));
      });
    })
    .catch(() => {});
}

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'CHECK_HEALTH') {
    checkHubHealth();
    return;
  }
  if (!event.data) return;

  // Pre-cache a specific lesson URL (triggered by player on completion)
  if (event.data.type === 'CACHE_LESSON' && event.data.url) {
    caches.open(CACHE_LESSONS).then(cache => {
      cache.add(event.data.url).catch(() => {});
    });
  }

  // Batch pre-cache: prefetch next N recommended lessons while student works
  // Sent by theta API response or navigator.js when connectivity is available
  if (event.data.type === 'PREFETCH_LESSONS' && Array.isArray(event.data.urls)) {
    caches.open(CACHE_LESSONS).then(cache => {
      event.data.urls.forEach(url => {
        cache.match(url).then(existing => {
          if (!existing) cache.add(url).catch(() => {});
        });
      });
    });
  }

  // Purge old lessons to free storage on low-memory Marshmallow devices
  if (event.data.type === 'PURGE_OLD_LESSONS') {
    var maxAge = event.data.maxAgeMs || 7 * 86400000; // default 7 days
    caches.open(CACHE_LESSONS).then(cache => {
      cache.keys().then(keys => {
        keys.forEach(req => {
          cache.match(req).then(resp => {
            if (resp) {
              var dateHeader = resp.headers.get('date');
              if (dateHeader && (Date.now() - new Date(dateHeader).getTime()) > maxAge) {
                cache.delete(req);
              }
            }
          });
        });
      });
    });
  }
});
