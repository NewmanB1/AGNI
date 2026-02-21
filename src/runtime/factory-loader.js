// src/runtime/factory-loader.js
// AGNI Factory Loader
//
// Resolves factory dependencies at lesson startup using a cache-first strategy:
//   1. Check ServiceWorker / Cache API for versioned factory file
//   2. If missing → request from village hub → cache → execute
//   3. Track which factories are registered to avoid double-loading
//
// This file is the only script inlined in lesson HTML (besides the lesson data).
// Everything else — factory code, shared runtime, SVG libraries — loads on demand.
//
// Village hub discovery order:
//   1. lesson._hubUrl  (compiled in by author)
//   2. window.AGNI_HUB (set by PWA install or local config)
//   3. Same origin as the lesson file (works for sneakernet folder delivery)
//   4. Offline fallback: queue requests, notify student
// ─────────────────────────────────────────────────────────────────────────────

(function (global) {
  'use strict';

  var CACHE_NAME   = 'agni-factories-v1';
  var LOAD_TIMEOUT = 8000;   // ms before a hub request is considered failed

  // ── Internal state ──────────────────────────────────────────────────────────
  var _loaded      = {};   // { 'svg-factories.js@1.7.0': true }
  var _registered  = {};   // { factoryId: true }  — populated by factory files
  var _pending     = {};   // { url: Promise }      — deduplicate in-flight fetches
  var _hubUrl      = null;
  var _onlineQueue = [];   // specs queued while offline

  // ── Hub URL resolution ──────────────────────────────────────────────────────

  function resolveHubUrl(lessonData) {
    if (lessonData && lessonData._hubUrl)    return lessonData._hubUrl;
    if (global.AGNI_HUB)                    return global.AGNI_HUB;
    // Same-origin: derive from current script location
    var base = '';
    try {
      // Works in module context or when loader is inlined
      base = window.location.origin + window.location.pathname
               .replace(/\/[^/]*$/, '');
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

  /** Try to read a factory script from the Cache API */
  function readFromCache(url) {
    if (!cacheSupported()) return Promise.resolve(null);
    return caches.open(CACHE_NAME).then(function (cache) {
      return cache.match(url).then(function (response) {
        return response ? response.text() : null;
      });
    }).catch(function () { return null; });
  }

  /** Write a factory script to the Cache API */
  function writeToCache(url, text) {
    if (!cacheSupported()) return Promise.resolve();
    return caches.open(CACHE_NAME).then(function (cache) {
      var response = new Response(text, {
        headers: { 'Content-Type': 'application/javascript' }
      });
      return cache.put(url, response);
    }).catch(function (e) {
      console.warn('[LOADER] Cache write failed for', url, e.message);
    });
  }

  // ── Script execution ────────────────────────────────────────────────────────

  function executeScript(text, url) {
    try {
      // Use indirect eval so factory scripts run in global scope
      var fn = new Function(text);   // eslint-disable-line no-new-func
      fn();
      if (global.DEV_MODE) console.log('[LOADER] Executed:', url);
      return true;
    } catch (e) {
      console.error('[LOADER] Execute error for', url, ':', e.message);
      return false;
    }
  }

  function injectScriptTag(url) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = url;
      s.onload  = function () { resolve(); };
      s.onerror = function () { reject(new Error('Script load failed: ' + url)); };
      document.head.appendChild(s);
    });
  }

  // ── Fetch from hub with timeout ─────────────────────────────────────────────

  function fetchFromHub(url) {
    var timeoutPromise = new Promise(function (_, reject) {
      setTimeout(function () { reject(new Error('Timeout: ' + url)); }, LOAD_TIMEOUT);
    });
    var fetchPromise = fetch(url).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status + ': ' + url);
      return response.text();
    });
    return Promise.race([fetchPromise, timeoutPromise]);
  }

  // ── Core: load one factory file ─────────────────────────────────────────────

  /**
   * Load a single factory file.
   * Returns a Promise that resolves when the file is executed.
   *
   * @param {object} dep  { file, version, factoryIds[] }
   */
  function loadOne(dep) {
    var key = cacheKey(dep.file, dep.version);
    if (_loaded[key]) return Promise.resolve();       // already loaded this session

    // Deduplicate concurrent requests for the same file
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

      // Not in cache — fetch from hub
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

    _pending[key] = promise.finally(function () {
      delete _pending[key];
    });

    return _pending[key];
  }

  // ── Notify student of missing factory ──────────────────────────────────────

  function _notifyMissing(dep) {
    // Queue for when connectivity returns
    _onlineQueue.push(dep);

    // Show a non-blocking UI hint
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
      '⚠️  Some lesson components need the village hub to load. ' +
      'Connect to the hub network and tap to retry.';
    banner.style.cursor = 'pointer';
    banner.onclick = function () { retryQueued(); };
  }

  function retryQueued() {
    var queue = _onlineQueue.slice();
    _onlineQueue = [];
    var banner = document.getElementById('agni-offline-banner');
    if (banner) banner.textContent = '🔄 Retrying…';
    Promise.all(queue.map(loadOne)).then(function () {
      if (banner) banner.remove();
      // Re-init the player now that all factories are available
      if (typeof global.initPlayer === 'function') global.initPlayer();
    }).catch(function () {
      if (banner) banner.textContent = '⚠️  Still offline. Tap to retry.';
    });
  }

  // ── Core: load all dependencies for a lesson ────────────────────────────────

  /**
   * Load all factory dependencies declared in lesson data.
   * Returns a Promise that resolves when all files are loaded and executed.
   *
   * @param {object} lessonData   window.LESSON_DATA
   */
  function loadDependencies(lessonData) {
    _hubUrl = resolveHubUrl(lessonData);

    var deps = (lessonData && lessonData.requires && lessonData.requires.factories) || [];
    if (deps.length === 0) {
      if (global.DEV_MODE) console.log('[LOADER] No factory dependencies declared.');
      return Promise.resolve();
    }

    // Always load shared runtime first, then others in parallel
    var sharedDep = deps.find(function (d) { return d.file === 'shared-runtime.js'; });
    var otherDeps = deps.filter(function (d) { return d.file !== 'shared-runtime.js'; });

    var chain = sharedDep ? loadOne(sharedDep) : Promise.resolve();
    return chain.then(function () {
      return Promise.all(otherDeps.map(loadOne));
    });
  }

  // ── Check if a specific factory is available ────────────────────────────────

  function isAvailable(factoryId) {
    return !!(_registered[factoryId] || (global.AGNI_SVG && global.AGNI_SVG[factoryId]));
  }

  // ── Self-registration API (called by factory files on load) ─────────────────

  /**
   * Called by each factory file when it executes.
   * @param {string}   factoryId
   * @param {string}   version
   */
  function register(factoryId, version) {
    _registered[factoryId] = version || true;
    if (global.DEV_MODE) console.log('[LOADER] Registered factory:', factoryId, version || '');
  }

  // ── Cache management API ────────────────────────────────────────────────────

  /** List all cached factory files (for a device info screen) */
  function listCached() {
    if (!cacheSupported()) return Promise.resolve([]);
    return caches.open(CACHE_NAME).then(function (cache) {
      return cache.keys().then(function (keys) {
        return keys.map(function (k) { return k.url; });
      });
    });
  }

  /** Remove a specific cached file (force refresh from hub) */
  function evict(file, version) {
    if (!cacheSupported()) return Promise.resolve();
    var url = _hubUrl + '/factories/' + file;
    var key = cacheKey(file, version);
    delete _loaded[key];
    return caches.open(CACHE_NAME).then(function (cache) {
      return cache.delete(url);
    });
  }

  /** Clear all cached factory files */
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

  if (global.DEV_MODE) console.log('[LOADER] factory-loader.js ready');

}(window));
