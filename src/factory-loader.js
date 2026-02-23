// src/runtime/factory-loader.js
// AGNI Factory Loader  v1.0.0
//
// Resolves factory dependencies at lesson startup using a cache-first strategy:
//   1. Check ServiceWorker / Cache API for versioned factory file
//   2. If missing → request from village hub → cache → execute
//   3. Track which factories are registered to avoid double-loading
//
// This file is inlined into lesson HTML as the first script block.
// Everything else — factory code, shared runtime, SVG libraries — loads
// on demand via AGNI_LOADER.loadDependencies(LESSON_DATA).
//
// Village hub discovery order:
//   1. LESSON_DATA._hubUrl  (compiled in by html.js / hub-transform.js)
//   2. window.AGNI_HUB      (set by PWA install or local config)
//   3. Same origin as the lesson file (sneakernet folder delivery)
//   4. Offline fallback: queue requests, notify student
//
// Load order enforced by loadDependencies():
//   shared-runtime.js is always loaded first (before Promise.all on the rest)
//   so that AGNI_SHARED exists when sensor-bridge.js and svg-stage.js execute.
//
// ES5 only — this file runs on the device browser (Android 4+, iOS 9+).
// No const/let, no arrow functions, no template literals, no Promises from
// a polyfill. Native Promise is required (Android 4.4+ Chrome, iOS 8+).
// ─────────────────────────────────────────────────────────────────────────────

(function (global) {
  'use strict';

  var CACHE_NAME   = 'agni-factories-v1';
  var LOAD_TIMEOUT = 8000;   // ms before a hub request is considered failed

  // ── Internal state ──────────────────────────────────────────────────────────
  var _loaded      = {};   // { 'svg-factories.js@1.9.0': true }
  var _registered  = {};   // { factoryId: true }  — populated by factory files
  var _pending     = {};   // { url: Promise }      — deduplicate in-flight fetches
  var _hubUrl      = null;
  var _onlineQueue = [];   // deps queued while offline

  // ── Hub URL resolution ──────────────────────────────────────────────────────

  function resolveHubUrl(lessonData) {
    if (lessonData && lessonData._hubUrl) return lessonData._hubUrl;
    if (global.AGNI_HUB)                 return global.AGNI_HUB;
    // Same-origin: derive from current page location
    var base = '';
    try {
      base = window.location.origin +
        window.location.pathname.replace(/\/[^/]*$/, '');
    } catch (e) {}
    return base || '';
  }

  // ── Cache API helpers ───────────────────────────────────────────────────────

  function cacheSupported() {
    return typeof caches !== 'undefined';
  }

  function cacheKey(file, version) {
    return file + '@' + version;
  }

  function readFromCache(url) {
    if (!cacheSupported()) return Promise.resolve(null);
    return caches.open(CACHE_NAME).then(function (cache) {
      return cache.match(url).then(function (response) {
        return response ? response.text() : null;
      });
    }).catch(function () { return null; });
  }

  function writeToCache(url, text) {
    if (!cacheSupported()) return Promise.resolve();
    return caches.open(CACHE_NAME).then(function (cache) {
      var response = new Response(text, {
        headers: { 'Content-Type': 'application/javascript' }
      });
      return cache.put(url, response);
    }).catch(function (e) {
      console.warn('[LOADER] Cache write failed for', url, ':', e.message);
    });
  }

  // ── Script execution ────────────────────────────────────────────────────────

  function executeScript(text, url) {
    try {
      // Indirect eval executes in global scope so factory files can attach
      // to window.AGNI_SVG and window.AGNI_SHARED as expected.
      var fn = new Function(text);   // eslint-disable-line no-new-func
      fn();
      if (global.DEV_MODE) console.log('[LOADER] Executed:', url);
      return true;
    } catch (e) {
      console.error('[LOADER] Execute error for', url, ':', e.message);
      return false;
    }
  }

  // ── Fetch from hub with timeout ─────────────────────────────────────────────

  function fetchFromHub(url) {
    var timeoutPromise = new Promise(function (_, reject) {
      setTimeout(function () {
        reject(new Error('Timeout fetching: ' + url));
      }, LOAD_TIMEOUT);
    });
    var fetchPromise = fetch(url).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status + ': ' + url);
      return response.text();
    });
    return Promise.race([fetchPromise, timeoutPromise]);
  }

  // ── Core: load one factory file ─────────────────────────────────────────────

  /**
   * Load a single factory file. Resolves when the file is cached and executed.
   * Deduplicates concurrent requests for the same file.
   *
   * @param {{ file: string, version: string }} dep
   * @returns {Promise}
   */
  function loadOne(dep) {
    var key = cacheKey(dep.file, dep.version);
    if (_loaded[key]) return Promise.resolve();

    // Deduplicate: if a fetch for this file is already in flight, return
    // the existing Promise rather than issuing a second request.
    if (_pending[key]) return _pending[key];

    var url = _hubUrl + '/factories/' + dep.file;
    if (global.DEV_MODE) console.log('[LOADER] Loading:', key, 'from', url);

    var promise = readFromCache(url).then(function (cached) {
      if (cached) {
        if (global.DEV_MODE) console.log('[LOADER] Cache hit:', key);
        executeScript(cached, url);
        _loaded[key] = true;
        return;
      }

      if (global.DEV_MODE) console.log('[LOADER] Hub fetch:', key);
      return fetchFromHub(url).then(function (text) {
        writeToCache(url, text);   // fire-and-forget
        executeScript(text, url);
        _loaded[key] = true;
      });

    }).catch(function (err) {
      console.error('[LOADER] Failed to load', key, ':', err.message);
      _notifyMissing(dep);
      throw err;
    });

    // Clean up _pending entry when the Promise settles either way
    _pending[key] = promise.then(
      function () { delete _pending[key]; },
      function () { delete _pending[key]; }
    );
    // Return the original promise (not the .then above) so callers get the
    // rejection if the load failed
    return promise;
  }

  // ── Offline notification ────────────────────────────────────────────────────

  function _notifyMissing(dep) {
    _onlineQueue.push(dep);

    var banner = document.getElementById('agni-offline-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'agni-offline-banner';
      banner.style.cssText =
        'position:fixed;bottom:0;left:0;right:0;background:#1a1a2e;' +
        'border-top:2px solid #fcc419;color:#fcc419;font-family:sans-serif;' +
        'font-size:13px;padding:0.6rem 1rem;z-index:9999;text-align:center;';
      document.body.appendChild(banner);
    }
    banner.textContent =
      '\u26A0\uFE0F  Some lesson components need the village hub to load. ' +
      'Connect to the hub network and tap to retry.';
    banner.style.cursor = 'pointer';
    banner.onclick = function () { retryQueued(); };
  }

  function retryQueued() {
    var queue = _onlineQueue.slice();
    _onlineQueue = [];
    var banner = document.getElementById('agni-offline-banner');
    if (banner) banner.textContent = '\uD83D\uDD04 Retrying\u2026';

    Promise.all(queue.map(loadOne)).then(function () {
      if (banner) banner.remove();
      // Re-init the player now that all factories are available
      if (typeof global.initPlayer === 'function') global.initPlayer();
    }).catch(function () {
      if (banner) banner.textContent = '\u26A0\uFE0F  Still offline. Tap to retry.';
    });
  }

  // ── Core: load all dependencies for a lesson ────────────────────────────────

  /**
   * Load all factory dependencies declared in LESSON_DATA.requires.factories.
   * shared-runtime.js is always loaded first (sequentially) before all other
   * files so that AGNI_SHARED exists when sensor-bridge.js and svg-stage.js
   * execute. Remaining files are loaded in parallel via Promise.all.
   *
   * @param  {object} lessonData   window.LESSON_DATA
   * @returns {Promise}            resolves when all files are loaded and executed
   */
  function loadDependencies(lessonData) {
    _hubUrl = resolveHubUrl(lessonData);

    var deps = (lessonData &&
                lessonData.requires &&
                lessonData.requires.factories) || [];

    if (deps.length === 0) {
      if (global.DEV_MODE) console.log('[LOADER] No factory dependencies declared.');
      return Promise.resolve();
    }

    // shared-runtime.js is always the first entry (written by html.js Step 6).
    // Load it sequentially first — all other files depend on AGNI_SHARED.
    var sharedDep  = deps[0];
    var otherDeps  = deps.slice(1);

    return loadOne(sharedDep).then(function () {
      return Promise.all(otherDeps.map(loadOne));
    });
  }

  // ── Factory availability check ──────────────────────────────────────────────

  /**
   * Check whether a specific factory function is ready on AGNI_SVG.
   * Called by player.js before mounting a step that requires a specific factory.
   *
   * @param  {string} factoryId   e.g. 'barGraph', 'cartesianGrid'
   * @returns {boolean}
   */
  function isAvailable(factoryId) {
    return !!(_registered[factoryId] ||
              (global.AGNI_SVG && global.AGNI_SVG[factoryId]));
  }

  // ── Self-registration API (called by factory files on load) ─────────────────

  /**
   * Called by each factory file when it executes to declare itself ready.
   * Allows player.js to call isAvailable() before attempting to use a factory.
   *
   * @param {string} factoryId   registry id (e.g. 'barGraph')
   * @param {string} version     factory version string (optional)
   */
  function register(factoryId, version) {
    _registered[factoryId] = version || true;
    if (global.DEV_MODE) console.log('[LOADER] Registered:', factoryId, version || '');
  }

  // ── Cache management API ────────────────────────────────────────────────────

  /** List all cached factory file URLs (for a device info / debug screen). */
  function listCached() {
    if (!cacheSupported()) return Promise.resolve([]);
    return caches.open(CACHE_NAME).then(function (cache) {
      return cache.keys().then(function (keys) {
        return keys.map(function (k) { return k.url; });
      });
    });
  }

  /**
   * Remove a specific cached file, forcing a fresh fetch from hub on next load.
   * Useful when a factory file is updated and the operator wants to push the
   * new version to devices without bumping RUNTIME_VERSION.
   */
  function evict(file, version) {
    if (!cacheSupported()) return Promise.resolve();
    var url = _hubUrl + '/factories/' + file;
    var key = cacheKey(file, version);
    delete _loaded[key];
    return caches.open(CACHE_NAME).then(function (cache) {
      return cache.delete(url);
    });
  }

  /** Clear all cached factory files. Forces full re-fetch on next lesson load. */
  function clearCache() {
    _loaded = {};
    if (!cacheSupported()) return Promise.resolve();
    return caches.delete(CACHE_NAME);
  }

  // ── Export ──────────────────────────────────────────────────────────────────

  global.AGNI_LOADER = {
    loadDependencies: loadDependencies,
    loadOne:          loadOne,
    register:         register,
    isAvailable:      isAvailable,
    listCached:       listCached,
    evict:            evict,
    clearCache:       clearCache,
    retryQueued:      retryQueued,
    setHubUrl:        function (url) { _hubUrl = url; }
  };

  if (global.DEV_MODE) console.log('[LOADER] factory-loader.js v1.0.0 ready');

}(window));
