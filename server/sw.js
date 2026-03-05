// server/sw.js
// AGNI Service Worker  v1.0.0
//
// Cache-first strategy for factory files and KaTeX CSS.
// Network-first strategy for lesson HTML and sidecar JSON so students
// always receive the current compiled lesson version.
//
// Cache strategy by URL pattern:
//   /factories/*   — cache-first, long TTL (factory files change only on
//                    version bump; factory-loader.js versioned cache key
//                    handles invalidation)
//   /katex/*       — cache-first, very long TTL (KaTeX CSS changes only
//                    with KaTeX version bumps)
//   /lessons/*     — network-first with offline fallback to cached version
//                    (lesson content changes as authors update YAML)
//   /sw.js         — never cached (browser fetches it fresh to check updates)
//   everything else — network only
//
// Cache names are versioned so a SW update triggers old cache deletion.
// Bump SW_VERSION when deploying a new version of any factory file.
//
// ES5 only — Service Workers run on the device browser, which on Android 4
// Chrome 30+ does support SW but not ES6 syntax. Kept conservative.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

var SW_VERSION     = 'agni-v__SW_VERSION__';
var FACTORY_CACHE  = SW_VERSION + '-factories';
var KATEX_CACHE    = SW_VERSION + '-katex';
var LESSON_CACHE   = SW_VERSION + '-lessons';

// Factory files to pre-cache on install.
// Ensures they are available immediately even before a lesson loads them
// via factory-loader.js. This covers the most common set — lessons with
// exotic factories will still trigger a runtime fetch for missing files.
var PRECACHE_FACTORIES = [
  '/factories/polyfills.js',
  '/factories/shared-runtime.js',
  '/factories/sensor-bridge.js',
  '/factories/svg-stage.js',
  '/factories/svg-helpers.js',
  '/factories/svg-factories.js',
  '/factories/svg-registry.js'
];


// ── Install ───────────────────────────────────────────────────────────────────
// Pre-cache core factory files so the first lesson loads quickly even on
// a cold start. skipWaiting() activates the new SW immediately rather than
// waiting for all existing tabs to close.

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(FACTORY_CACHE).then(function (cache) {
      return cache.addAll(PRECACHE_FACTORIES);
    }).then(function () {
      return self.skipWaiting();
    }).catch(function (err) {
      // Pre-cache failure (e.g. hub offline at install time) should not
      // prevent the SW from installing — runtime fetches will populate
      // the cache on first lesson load.
      console.warn('[SW] Pre-cache failed (will populate at runtime):', err.message);
      return self.skipWaiting();
    })
  );
});


// ── Activate ──────────────────────────────────────────────────────────────────
// Delete caches from old SW versions. clients.claim() takes control of
// all existing pages immediately so they use the new factory versions.

self.addEventListener('activate', function (event) {
  var CURRENT_CACHES = [FACTORY_CACHE, KATEX_CACHE, LESSON_CACHE];

  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (key) {
          return CURRENT_CACHES.indexOf(key) === -1;
        }).map(function (key) {
          console.log('[SW] Deleting old cache:', key);
          return caches.delete(key);
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});


// ── Fetch ─────────────────────────────────────────────────────────────────────

self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);
  var pathname = url.pathname;

  // /factories/* — cache-first
  if (pathname.indexOf('/factories/') === 0) {
    event.respondWith(_cacheFirst(event.request, FACTORY_CACHE));
    return;
  }

  // /katex/* — cache-first
  if (pathname.indexOf('/katex/') === 0) {
    event.respondWith(_cacheFirst(event.request, KATEX_CACHE));
    return;
  }

  // /lessons/* — network-first with stale fallback
  if (pathname.indexOf('/lessons/') === 0) {
    event.respondWith(_networkFirst(event.request, LESSON_CACHE));
    return;
  }

  // /manifest.json — short-lived cache
  if (pathname === '/manifest.json') {
    event.respondWith(_cacheFirst(event.request, FACTORY_CACHE));
    return;
  }

  // /sw.js — always network (browser handles this natively, but be explicit)
  if (pathname === '/sw.js') {
    event.respondWith(fetch(event.request));
    return;
  }

  // Everything else — network only, no caching
  // (theta.js API routes, sidecar JSON — these should not be cached)
});


// ── Strategy helpers ──────────────────────────────────────────────────────────

/**
 * Cache-first: return cached response if available, otherwise fetch from
 * network, cache the result, and return it.
 * On network failure with no cached version, returns an offline error response.
 */
function _cacheFirst(request, cacheName) {
  return caches.open(cacheName).then(function (cache) {
    return cache.match(request).then(function (cached) {
      if (cached) return cached;

      return fetch(request).then(function (response) {
        if (response.ok) {
          // Clone before consuming — a response body can only be read once
          cache.put(request, response.clone());
        }
        return response;
      }).catch(function () {
        return _offlineResponse(request.url);
      });
    });
  });
}

/**
 * Network-first: fetch from network and cache the result. If the network
 * request fails, fall back to the cached version. If neither is available,
 * return an offline error response.
 * Used for lesson HTML so students always get fresh content when online.
 */
function _networkFirst(request, cacheName) {
  return fetch(request).then(function (response) {
    if (response.ok) {
      caches.open(cacheName).then(function (cache) {
        cache.put(request, response.clone());
      });
    }
    return response;
  }).catch(function () {
    return caches.open(cacheName).then(function (cache) {
      return cache.match(request).then(function (cached) {
        if (cached) return cached;
        return _offlineResponse(request.url);
      });
    });
  });
}

/**
 * Returns a minimal offline response when both network and cache fail.
 * The lesson player shows its own offline UI — this is just a safety net
 * for navigations that never loaded before.
 */
function _offlineResponse(url) {
  var body = [
    '<!DOCTYPE html><html><head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>Offline</title>',
    '<style>body{font-family:sans-serif;background:#1a1a2e;color:#fff;',
    'display:flex;align-items:center;justify-content:center;',
    'min-height:100vh;margin:0;text-align:center;}',
    'h2{color:#fcc419;}p{color:#aaa;}</style>',
    '</head><body>',
    '<div><h2>&#x26A1; Offline</h2>',
    '<p>Connect to the village hub to load this lesson.</p></div>',
    '</body></html>'
  ].join('');

  // 200 not 503 — browsers treat 503 as a genuine server error and may
  // suppress or delay retry in ways that interfere with the offline UX.
  // The page content makes the offline state clear to the user.
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}
