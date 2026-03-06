// packages/agni-runtime/ui/factory-loader.js
// AGNI Factory Loader  v1.1.0
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
//   3. document.baseURI     (correct even in deep subdirectory paths)
//   4. Offline fallback: queue requests, notify student
//
// Load order enforced by loadDependencies() three-phase strategy:
//   Phase 1: polyfills.js (ES5 shims for Chrome 44 WebView)
//   Phase 2: shared-runtime.js + binary-utils.js (no cross-deps, safe in parallel)
//   Phase 3: everything else (depends on AGNI_SHARED / AGNI_SVG being available)
//
// Changes from v1.0.0:
//   - executeScript() replaces new Function(text) with dynamic <script> element
//     injection. This allows a strict Content-Security-Policy that omits
//     'unsafe-eval'. The hub's CSP header should be:
//       script-src 'self' 'nonce-<per-request-nonce>';
//     The inline loader block in lesson HTML needs a matching nonce attribute.
//     Injected <script> elements from the same origin are covered by 'self'
//     without needing 'unsafe-eval'. Stack traces now include source URLs.
//   - LOAD_TIMEOUT is now configurable via window.AGNI_LOAD_TIMEOUT (ms).
//     A second tier RETRY_TIMEOUT (default 20000ms) is used for retryQueued()
//     to accommodate slower hub responses after a period offline.
//   - executeScript() records the first execution error on AGNI_LOADER
//     .lastError so player.js and devtools can surface it without scanning
//     the console.
//   - resolveHubUrl() now prefers document.baseURI over window.location
//     manipulation. document.baseURI is correct even in deep subdirectory
//     paths and respects any <base href> tag the hub might inject.
//
// ES5 syntax only — runs on device browser (Android 4+, iOS 9+).
// No const/let, no arrow functions, no template literals.
// Native Promise required (Android 4.4+ Chrome, iOS 8+).
// ─────────────────────────────────────────────────────────────────────────────

(function (global) {
  'use strict';

  var CACHE_NAME    = 'agni-factories-v1';

  // Configurable timeouts. Set window.AGNI_LOAD_TIMEOUT before lesson HTML
  // executes to override. RETRY_TIMEOUT is used by retryQueued() — longer
  // because the device may have just regained connectivity.
  var LOAD_TIMEOUT  = (global.AGNI_LOAD_TIMEOUT  || 8000);
  var RETRY_TIMEOUT = (global.AGNI_RETRY_TIMEOUT || 20000);

  // ── Internal state ──────────────────────────────────────────────────────────
  var _loaded      = {};   // { 'svg-factories.js@1.9.0': true }
  var _registered  = {};   // { factoryId: true }  — populated by factory files
  var _pending     = {};   // { cacheKey: Promise } — deduplicate in-flight fetches
  var _hubUrl      = null;
  var _onlineQueue = [];   // deps queued while offline
  var _lastError   = null; // first execution error encountered this session

  // ── Hub URL resolution ──────────────────────────────────────────────────────

  var HUB_URL_KEY = 'agni_hub_url';

  function resolveHubUrl(lessonData) {
    if (lessonData && lessonData._hubUrl) return lessonData._hubUrl;
    if (global.AGNI_HUB)                 return global.AGNI_HUB;

    // Student/facilitator-configured hub URL, stored via the setup prompt
    // or setHubUrl() API.
    try {
      var stored = localStorage.getItem(HUB_URL_KEY);
      if (stored) return stored;
    } catch (e) {}

    // document.baseURI is correct even in deep subdirectory paths and
    // respects any <base href> tag the hub may inject. Preferred over
    // window.location manipulation which breaks in subdirectories.
    try {
      if (document.baseURI) {
        // Strip trailing filename component if present (baseURI ends in the
        // HTML filename when there is no <base> tag).
        return document.baseURI.replace(/\/[^/]*$/, '');
      }
    } catch (e) {}

    // Fallback for very old browsers without document.baseURI
    try {
      return window.location.origin +
        window.location.pathname.replace(/\/[^/]*$/, '');
    } catch (e) {}

    return '';
  }

  /**
   * Persist hub URL to localStorage so the student/facilitator only
   * needs to set it once. Immediately updates the in-memory value.
   */
  function persistHubUrl(url) {
    _hubUrl = url;
    try { localStorage.setItem(HUB_URL_KEY, url); } catch (e) {}
  }

  /**
   * Show a one-time setup banner asking the student/facilitator to
   * enter their village hub URL. The banner is non-blocking — lessons
   * still work offline; this just enables hub connectivity.
   *
   * Shown only when no hub URL was resolved from any source.
   * ES5 syntax only.
   */
  function showHubSetup() {
    if (document.getElementById('agni-hub-setup')) return;

    var wrap = document.createElement('div');
    wrap.id = 'agni-hub-setup';
    wrap.style.cssText =
      'position:fixed;bottom:0;left:0;right:0;background:#2D2D2D;' +
      'border-top:2px solid #0B5FFF;color:#FFFFFF;font-family:sans-serif;' +
      'font-size:14px;padding:16px 1rem;z-index:9999;text-align:center;';

    var label = document.createElement('div');
    label.textContent = 'Enter your village hub address to enable syncing:';
    label.style.cssText = 'margin-bottom:8px;font-weight:bold;';

    var row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;justify-content:center;align-items:center;flex-wrap:wrap;';

    var input = document.createElement('input');
    input.type = 'url';
    input.placeholder = 'http://192.168.1.1:3000';
    input.style.cssText =
      'padding:10px 12px;font-size:14px;border:2px solid #555;' +
      'border-radius:2px;background:#FFFFFF;color:#1A1A1A;min-width:220px;';

    var btn = document.createElement('button');
    btn.textContent = 'Save';
    btn.style.cssText =
      'padding:10px 20px;font-size:14px;font-weight:bold;border:none;' +
      'border-radius:2px;background:#0B5FFF;color:#FFFFFF;cursor:pointer;';

    var skip = document.createElement('button');
    skip.textContent = 'Skip';
    skip.style.cssText =
      'padding:10px 16px;font-size:14px;border:1px solid #555;' +
      'border-radius:2px;background:transparent;color:#FFFFFF;cursor:pointer;';

    btn.onclick = function () {
      var val = input.value.trim().replace(/\/+$/, '');
      if (!val) return;
      persistHubUrl(val);
      wrap.remove();
    };

    skip.onclick = function () {
      wrap.remove();
    };

    row.appendChild(input);
    row.appendChild(btn);
    row.appendChild(skip);
    wrap.appendChild(label);
    wrap.appendChild(row);
    document.body.appendChild(wrap);
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

  /**
   * Execute factory script text by injecting a <script> element into <head>.
   *
   * Replaces the previous new Function(text) approach. Benefits:
   *   1. Compatible with a strict CSP that omits 'unsafe-eval'. Hub CSP:
   *        script-src 'self' 'nonce-<per-request-nonce>';
   *      The inline loader block in lesson HTML needs the matching nonce.
   *      Dynamically injected <script> elements are covered by 'self'.
   *   2. Browser devtools show the correct source URL in stack traces via
   *      the data-loader-src attribute (visible in the Sources panel).
   *   3. Execution errors surface in window.onerror with line numbers.
   *
   * The injected element is removed after execution. Factory files attach
   * to window.AGNI_SVG / window.AGNI_SHARED during execution so the DOM
   * node does not need to persist.
   *
   * Errors: caught via synchronous try/catch (synchronous scripts execute
   * inline on appendChild). First error stored in _lastError; subsequent
   * errors are typically cascades of the same root cause.
   *
   * @param  {string} text   factory script source
   * @param  {string} url    original URL — used for devtools identification
   * @returns {boolean}      true if executed without throwing
   */
  function executeScript(text, url) {
    var script = document.createElement('script');
    script.dataset.loaderSrc = url;
    script.textContent = text;

    try {
      document.head.appendChild(script);
      document.head.removeChild(script);
      if (global.DEV_MODE) console.log('[LOADER] Executed:', url);
      return true;
    } catch (e) {
      console.error('[LOADER] Execute error for', url, ':', e.message);
      // Record first error only — subsequent errors are typically cascades.
      if (!_lastError) {
        _lastError = { url: url, message: e.message, error: e };
      }
      try { document.head.removeChild(script); } catch (_) {}
      return false;
    }
  }

  // ── Fetch from hub with timeout ─────────────────────────────────────────────

  /**
   * Fetch a factory file from the hub with a configurable timeout.
   *
   * @param  {string} url
   * @param  {number} [timeoutMs]   defaults to LOAD_TIMEOUT
   * @returns {Promise<string>}
   */
  function fetchFromHub(url, timeoutMs) {
    var ms = timeoutMs || LOAD_TIMEOUT;
    var timeoutPromise = new Promise(function (_, reject) {
      setTimeout(function () {
        reject(new Error('Timeout (' + ms + 'ms) fetching: ' + url));
      }, ms);
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
   * Deduplicates concurrent requests for the same cache key.
   *
   * @param {{ file: string, version: string }} dep
   * @param {number} [timeoutMs]   optional timeout override (used by retryQueued)
   * @returns {Promise}
   */
  function loadOne(dep, timeoutMs) {
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
      return fetchFromHub(url, timeoutMs).then(function (text) {
        writeToCache(url, text);   // fire-and-forget
        executeScript(text, url);
        _loaded[key] = true;
      });

    }).catch(function (err) {
      console.error('[LOADER] Failed to load', key, ':', err.message);
      _notifyMissing(dep);
      throw err;
    });

    // Store original promise in _pending so callers receive rejections.
    // Clean up entry when the promise settles either way.
    _pending[key] = promise;
    promise.then(
      function () { delete _pending[key]; },
      function () { delete _pending[key]; }
    );
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
        'position:fixed;bottom:0;left:0;right:0;background:#2D2D2D;' +
        'border-top:2px solid #FFFFFF;color:#FFFFFF;font-family:sans-serif;' +
        'font-size:14px;padding:18px 1rem;z-index:9999;text-align:center;font-weight:bold;';
      document.body.appendChild(banner);
    }
    banner.textContent =
      '\u26A0\uFE0F  Some lesson components need the village hub to load. ' +
      'Connect to the hub network and tap to retry.';
    banner.style.cursor = 'pointer';
    banner.onclick = function () { retryQueued(); };
  }

  /**
   * Retry all queued failed loads using RETRY_TIMEOUT.
   * Called when the offline banner is tapped, or programmatically from a
   * network-status change handler.
   */
  function retryQueued() {
    var queue = _onlineQueue.slice();
    _onlineQueue = [];
    var banner = document.getElementById('agni-offline-banner');
    if (banner) banner.textContent = '\uD83D\uDD04 Retrying\u2026';

    // Use RETRY_TIMEOUT — longer than LOAD_TIMEOUT because the device may
    // have just regained connectivity and the hub may need a moment.
    Promise.all(queue.map(function (dep) {
      return loadOne(dep, RETRY_TIMEOUT);
    })).then(function () {
      if (banner) banner.remove();
      if (typeof global.initPlayer === 'function') global.initPlayer();
    }).catch(function () {
      if (banner) banner.textContent = '\u26A0\uFE0F  Still offline. Tap to retry.';
    });
  }

  // ── Core: load all dependencies for a lesson ────────────────────────────────

  /**
   * Load all factory dependencies declared in LESSON_DATA.requires.factories.
   *
   * Load order (critical for Chrome 44 / Android 6.0):
   *   Phase 1 — polyfills.js      (ES5 shims must exist before anything runs)
   *   Phase 2 — shared-runtime.js (AGNI_SHARED must exist for svg-stage etc.)
   *   Phase 3 — everything else   (svg-stage, svg-factories, registry — parallel)
   *
   * binary-utils.js loads in Phase 2 alongside shared-runtime because it has
   * no dependency on AGNI_SHARED and shared-runtime doesn't depend on it.
   *
   * @param  {object} lessonData   window.LESSON_DATA
   * @returns {Promise}
   */
  function loadDependencies(lessonData) {
    _hubUrl = resolveHubUrl(lessonData);

    if (!_hubUrl && !(lessonData && lessonData._hubUrl)) {
      try { showHubSetup(); } catch (e) {}
    }

    var deps = (lessonData &&
                lessonData.requires &&
                lessonData.requires.factories) || [];

    if (deps.length === 0) {
      if (global.DEV_MODE) console.log('[LOADER] No factory dependencies declared.');
      return Promise.resolve();
    }

    var phase1 = [];  // polyfills
    var phase2 = [];  // shared-runtime + binary-utils (no cross-dependency)
    var phase3 = [];  // everything else (depends on AGNI_SHARED / AGNI_SVG)

    for (var i = 0; i < deps.length; i++) {
      var f = deps[i].file;
      if (f === 'polyfills.js') {
        phase1.push(deps[i]);
      } else if (f === 'shared-runtime.js' || f === 'binary-utils.js') {
        phase2.push(deps[i]);
      } else {
        phase3.push(deps[i]);
      }
    }

    function runPhase(list) {
      if (list.length === 0) return Promise.resolve();
      if (list.length === 1) return loadOne(list[0]);
      return Promise.all(list.map(function (dep) { return loadOne(dep); }));
    }

    return runPhase(phase1).then(function () {
      return runPhase(phase2);
    }).then(function () {
      return runPhase(phase3);
    });
  }

  // ── Factory availability check ──────────────────────────────────────────────

  /**
   * Check whether a specific factory function is ready on AGNI_SVG.
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
   * @param {string} factoryId
   * @param {string} [version]
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

  /** Remove a specific cached file, forcing a fresh hub fetch on next load. */
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
    setHubUrl:        persistHubUrl,
    showHubSetup:     showHubSetup,
    get hubUrl()      { return _hubUrl; },
    get lastError()   { return _lastError; }
  };

  if (global.DEV_MODE) console.log('[LOADER] factory-loader.js v1.1.0 ready');

}(window));
