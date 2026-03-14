// packages/agni-runtime/shared-runtime.js
// AGNI Shared Runtime  v1.8.1
//
// Runs on: Edge device (Android 7.0 Nougat, API 24, Chrome 51 WebView). ES5 only.
//
// The foundational module loaded by every lesson, always first.
// Provides:
//   - Sensor pub/sub with subscribe / unsubscribe / clear
//   - Vibration patterns
//   - Device capability detection
//   - Visual spec renderer (delegates to SVG factory registry)
//   - Lesson step visual mounting / teardown lifecycle
//   - DEV_MODE logging helpers
//   - base64ToBytes() utility for Phase 4 integrity verification
//
// All other runtime files (sensor-bridge, svg-factories, math-renderer, etc.)
// register themselves into window.AGNI_SHARED after they load.
// player.js reads everything lazily from window.AGNI_SHARED at call time,
// never at parse time, so load order is not a concern for the player.
//
// Changes from v1.8.0:
//   - Added base64ToBytes(b64) utility. Decodes a base64 string to Uint8Array.
//     Used by player.js verifyIntegrity() to decode OLS_SIGNATURE and
//     OLS_PUBLIC_KEY before passing to SubtleCrypto / TweetNaCl. Exposed on
//     AGNI_SHARED so it can be used by any future module that needs binary
//     decoding without re-implementing atob().
//   - Version bumped to 1.8.1.
//
// Changes from v1.7.0 (carried from v1.8.0):
//   - Added unsubscribeFromSensor(sensorId, fn) — named unsubscribe method
//     for callers that store {sensorId, fn} pairs rather than closures.
//     svg-stage.js destroy() uses this. See Section 1.
// ─────────────────────────────────────────────────────────────────────────────

/** @param {Window} global */
(function (global) {
  'use strict';

  // ── Guard: only initialise once ─────────────────────────────────────────────
  if (global.AGNI_SHARED && global.AGNI_SHARED._version === '1.8.1') {
    if (global.DEV_MODE) console.log('[SHARED] already loaded, skipping re-init');
    return;
  }

  var DEV_MODE = !!(global.LESSON_DATA && global.LESSON_DATA._devMode);


  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Sensor pub/sub
  //
  //    Three unsubscribe paths — see comments below for when to use each:
  //
  //    A. Return value of subscribeToSensor() — preferred for new code.
  //         var unsub = S.subscribeToSensor('accel.total', fn);
  //         unsub();
  //
  //    B. unsubscribeFromSensor(sensorId, fn) — for callers storing pairs.
  //         S.unsubscribeFromSensor('accel.total', fn);
  //
  //    C. clearSensorSubscriptions(sensorId?) — bulk clear on step transitions.
  //         S.clearSensorSubscriptions();
  // ═══════════════════════════════════════════════════════════════════════════

  var sensorSubscriptions = new Map();
  var lastSensorValues    = new Map();

  function subscribeToSensor(sensorId, callback) {
    if (!sensorSubscriptions.has(sensorId)) {
      sensorSubscriptions.set(sensorId, new Set());
    }
    sensorSubscriptions.get(sensorId).add(callback);
    return function unsubscribe() {
      var subs = sensorSubscriptions.get(sensorId);
      if (subs) subs.delete(callback);
    };
  }

  function unsubscribeFromSensor(sensorId, fn) {
    var subs = sensorSubscriptions.get(sensorId);
    if (subs) subs.delete(fn);
  }

  function publishSensorReading(reading) {
    reading.timestamp = reading.timestamp || Date.now();
    lastSensorValues.set(reading.sensorId, reading.value);
    var subs = sensorSubscriptions.get(reading.sensorId);
    if (subs) {
      subs.forEach(function (cb) {
        try { cb(reading); }
        catch (e) { console.error('[SHARED] Subscriber error for', reading.sensorId, e); }
      });
    }
  }

  function clearSensorSubscriptions(sensorId) {
    if (sensorId) {
      var subs = sensorSubscriptions.get(sensorId);
      if (subs) subs.clear();
    } else {
      sensorSubscriptions.forEach(function (s) { s.clear(); });
    }
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Vibration
  // ═══════════════════════════════════════════════════════════════════════════

  var VIBRATION_PATTERNS = {
    short:           [70],
    long:            [250],
    double:          [70, 80, 70],
    success_pattern: [100, 50, 100, 50, 150],
    error:           [250],
    tick:            [30],
    correct:         [70, 80, 150],
    incorrect:       [250],
    attention:       [100, 60, 100]
  };

  function getHapticIntensity() {
    try {
      var val = localStorage.getItem('agni_haptic_intensity');
      if (val !== null) return Math.max(0, Math.min(1, parseFloat(val)));
      if (getReducedMotion()) return 0;
    } catch (e) { /* localStorage unavailable */ }
    try {
      if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 0;
    } catch (e2) { /* matchMedia unavailable */ }
    return 1;
  }

  function getReducedMotion() {
    try {
      if (localStorage.getItem('agni_reduced_motion') === 'true') return true;
    } catch (e) { /* localStorage unavailable */ }
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return false;
  }

  function vibrate(pattern) {
    if (!('vibrate' in navigator)) return;
    var intensity = getHapticIntensity();
    if (intensity === 0) return;
    var ms = Array.isArray(pattern)
      ? pattern
      : (VIBRATION_PATTERNS[pattern] || VIBRATION_PATTERNS.short);
    if (intensity < 1) {
      ms = ms.map(function(v) { return Math.round(v * intensity); });
    }
    navigator.vibrate(ms);
    if (DEV_MODE) console.log('[VIBRATE]', typeof pattern === 'string' ? pattern : JSON.stringify(ms), 'intensity=' + intensity);
  }

  function registerVibrationPattern(name, msArray) {
    VIBRATION_PATTERNS[name] = msArray;
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Device capability detection
  // ═══════════════════════════════════════════════════════════════════════════

  var DEVICE = (function () {
    var ua = navigator.userAgent || '';
    return {
      hasMotionEvents:      typeof DeviceMotionEvent !== 'undefined',
      hasOrientationEvents: typeof DeviceOrientationEvent !== 'undefined',
      hasSVG:               typeof SVGElement !== 'undefined',
      hasCanvas:            !!document.createElement('canvas').getContext,
      hasServiceWorker:     'serviceWorker' in navigator,
      hasCacheAPI:          typeof caches !== 'undefined',
      hasVibration:         'vibrate' in navigator,
      isOldAndroid:         /Android [2-6]\./.test(ua),
      isLowEnd:             /Android [2-4]\./.test(ua) || /MSIE|Trident/.test(ua),
      ua:                   ua.slice(0, 120)
    };
  }());


  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Visual spec renderer
  // ═══════════════════════════════════════════════════════════════════════════

  var _pendingMounts = [];

  function mountVisual(container, spec) {
    return new Promise(function (resolve, reject) {
      if (global.AGNI_SVG && global.AGNI_SVG.fromSpec) {
        try {
          resolve(global.AGNI_SVG.fromSpec(spec, container));
        } catch (e) {
          console.error('[SHARED] AGNI_SVG.fromSpec failed, showing placeholder:', e && e.message);
          var placeholder = document.createElement('p');
          placeholder.style.cssText = 'color:#996600;font-size:0.9em;';
          placeholder.textContent = 'SVG preview unavailable' + (e && e.message ? ' (' + e.message + ')' : '');
          if (container) container.appendChild(placeholder);
          resolve({ stage: null });
        }
        return;
      }
      _pendingMounts.push({ container: container, spec: spec,
                            resolve: resolve, reject: reject });
    });
  }

  function flushPendingMounts() {
    var queue = _pendingMounts.splice(0);
    queue.forEach(function (pending) {
      try {
        pending.resolve(global.AGNI_SVG.fromSpec(pending.spec, pending.container));
      } catch (e) {
        console.error('[SHARED] AGNI_SVG.fromSpec failed (pending), showing placeholder:', e && e.message);
        var placeholder = document.createElement('p');
        placeholder.style.cssText = 'color:#996600;font-size:0.9em;';
        placeholder.textContent = 'SVG preview unavailable' + (e && e.message ? ' (' + e.message + ')' : '');
        if (pending.container) pending.container.appendChild(placeholder);
        pending.resolve({ stage: null });
      }
    });
    if (DEV_MODE && queue.length > 0) {
      console.log('[SHARED] Flushed', queue.length, 'pending visual mount(s)');
    }
  }

  function destroyVisual(handle) {
    if (handle && handle.stage && typeof handle.stage.destroy === 'function') {
      handle.stage.destroy();
    }
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // 5. Lesson step visual lifecycle
  // ═══════════════════════════════════════════════════════════════════════════

  var _currentVisualHandle = null;

  function mountStepVisual(container, spec) {
    destroyVisual(_currentVisualHandle);
    _currentVisualHandle = null;
    return mountVisual(container, spec).then(function (handle) {
      _currentVisualHandle = handle;
      return handle;
    });
  }

  function destroyStepVisual() {
    destroyVisual(_currentVisualHandle);
    _currentVisualHandle = null;
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // 6. Custom vibration pattern loader
  // ═══════════════════════════════════════════════════════════════════════════

  function loadLessonVibrationPatterns(lessonData) {
    var patterns = lessonData && lessonData.vibration_patterns;
    if (!patterns) return;
    Object.keys(patterns).forEach(function (name) {
      registerVibrationPattern(name, patterns[name]);
      if (DEV_MODE) console.log('[SHARED] Vibration pattern registered:', name);
    });
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // 7. Logging helpers
  // ═══════════════════════════════════════════════════════════════════════════

  var log = {
    debug: function () {
      if (DEV_MODE) {
        console.log.apply(console, ['[AGNI]'].concat(Array.prototype.slice.call(arguments)));
      }
    },
    warn: function () {
      console.warn.apply(console, ['[AGNI]'].concat(Array.prototype.slice.call(arguments)));
    },
    error: function () {
      console.error.apply(console, ['[AGNI]'].concat(Array.prototype.slice.call(arguments)));
    }
  };


  // ═══════════════════════════════════════════════════════════════════════════
  // 8. Module registration table
  // ═══════════════════════════════════════════════════════════════════════════

  var _modules = {};
  var _moduleReadyCallbacks = {};

  function registerModule(name, version) {
    _modules[name] = version || true;
    if (global.AGNI_LOADER && typeof global.AGNI_LOADER.register === 'function') {
      global.AGNI_LOADER.register(name, version);
    }
    var cbs = _moduleReadyCallbacks[name];
    if (cbs) {
      cbs.forEach(function (fn) {
        try { fn(); } catch (e) { log.error('onModuleReady callback error:', e); }
      });
      delete _moduleReadyCallbacks[name];
    }
    log.debug(name + ' v' + version + ' registered');
  }

  function hasModule(name) {
    return !!_modules[name];
  }

  function onModuleReady(name, fn) {
    if (_modules[name]) { fn(); return; }
    if (!_moduleReadyCallbacks[name]) _moduleReadyCallbacks[name] = [];
    _moduleReadyCallbacks[name].push(fn);
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // 9. Binary / encoding utilities (Phase 4; Backlog task 13)
  //    Use OLS_BINARY from binary-utils.js when loaded first; else fallback.
  // ═══════════════════════════════════════════════════════════════════════════

  var OLS_BINARY = global.OLS_BINARY;
  function base64ToBytes(b64) {
    if (OLS_BINARY && typeof OLS_BINARY.base64ToBytes === 'function') {
      return OLS_BINARY.base64ToBytes(b64);
    }
    var binary = atob(b64);
    var bytes  = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  function concatBytes() {
    if (OLS_BINARY && typeof OLS_BINARY.concatBytes === 'function') {
      return OLS_BINARY.concatBytes.apply(OLS_BINARY, arguments);
    }
    var arrays = Array.prototype.slice.call(arguments);
    var total  = arrays.reduce(function (n, a) { return n + a.length; }, 0);
    var result = new Uint8Array(total);
    var offset = 0;
    arrays.forEach(function (a) { result.set(a, offset); offset += a.length; });
    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. Canonical JSON — deterministic serialization for integrity hashing
  //     [R10 P1.5] JSON.stringify key order is implementation-dependent.
  //     This function sorts object keys recursively so the same data
  //     produces the same string on Node and Chrome.
  // ═══════════════════════════════════════════════════════════════════════════

  function canonicalJSON(obj) {
    if (obj === null || obj === undefined) return 'null';
    var type = typeof obj;
    if (type === 'number') {
      if (!isFinite(obj)) return 'null';
      return String(obj);
    }
    if (type === 'boolean') return String(obj);
    if (type === 'string') return JSON.stringify(obj);
    if (Array.isArray(obj)) {
      var items = [];
      for (var i = 0; i < obj.length; i++) items.push(canonicalJSON(obj[i]));
      return '[' + items.join(',') + ']';
    }
    if (type === 'object') {
      var keys = Object.keys(obj).sort();
      var pairs = [];
      for (var k = 0; k < keys.length; k++) {
        var val = obj[keys[k]];
        if (val !== undefined) {
          pairs.push(JSON.stringify(keys[k]) + ':' + canonicalJSON(val));
        }
      }
      return '{' + pairs.join(',') + '}';
    }
    return 'null';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 10b. URL-derived dev mode [R10 P1.1]
  //      Dev mode from URL parameter (?dev=1), NOT from lesson data.
  //      Lesson data must never control its own integrity verification.
  // ═══════════════════════════════════════════════════════════════════════════

  var _urlDevMode = false;
  try {
    var search = global.location ? global.location.search : '';
    _urlDevMode = search.indexOf('dev=1') !== -1;
  } catch (e) { /* location not available */ }

  // ═══════════════════════════════════════════════════════════════════════════
  // 10c. innerHTML sanitizer — defense-in-depth against XSS [R10 P1.2]
  //      Strips <script>, on* attributes, and javascript: URIs from HTML
  //      before assigning to innerHTML. Content should already be sanitized
  //      at compile time via rehype-sanitize, but this is a runtime backstop.
  // ═══════════════════════════════════════════════════════════════════════════

  var UNSAFE_TAG_RE = /<\s*\/?\s*script\b[^>]*>/gi;
  var ON_ATTR_RE = /\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
  var JS_URI_RE = /javascript\s*:/gi;

  function _decodeNumericEntities(str) {
    return str
      .replace(/&colon;/gi, ':')
      .replace(/&#x([0-9a-fA-F]+);/gi, function (match, hex) {
        var code = parseInt(hex, 16);
        if (code === 38 || code === 60 || code === 62 || code === 34 || code === 39) return match;
        return String.fromCharCode(code);
      })
      .replace(/&#(\d+);/g, function (match, dec) {
        var code = parseInt(dec, 10);
        if (code === 38 || code === 60 || code === 62 || code === 34 || code === 39) return match;
        return String.fromCharCode(code);
      });
  }

  function sanitizeHtml(html) {
    if (typeof html !== 'string') return '';
    var normalized = _decodeNumericEntities(html.replace(/\x00/g, ''));
    return normalized
      .replace(UNSAFE_TAG_RE, '')
      .replace(ON_ATTR_RE, '')
      .replace(JS_URI_RE, '');
  }

  function setSafeHtml(element, html) {
    element.innerHTML = sanitizeHtml(html);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 11. DOM & formatting helpers
  // ═══════════════════════════════════════════════════════════════════════════

  /** Create an element, set class/text, optionally append to parent. ES5-safe. */
  function el(tag, cls, text, parent) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    if (parent) parent.appendChild(node);
    return node;
  }

  /** Parse ISO 8601 duration (e.g. PT2M, PT30S) to milliseconds. */
  function parseDurationMs(str) {
    if (!str || typeof str !== 'string') return 0;
    var m = str.match(/^P(?:T(?=(\d)))?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
    if (!m) return 0;
    var h = parseInt(m[2], 10) || 0;
    var min = parseInt(m[3], 10) || 0;
    var s = parseInt(m[4], 10) || 0;
    return (h * 3600 + min * 60 + s) * 1000;
  }

  /** Format "N attempt(s) remaining" with consistent pluralisation. */
  function formatRemainingAttempts(prefix, remaining) {
    return prefix + ' (' + remaining + ' attempt' + (remaining === 1 ? '' : 's') + ' remaining)';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 10b. Sensor dependency availability (P2-19)
  //
  // Check whether the sensor required by a hardware_trigger step is available
  // *before* execution, so we can show fallback UI instead of blocking.
  // Uses sensor ID (e.g. accel.total, light) and device/sensorBridge state.
  // ═══════════════════════════════════════════════════════════════════════════

  function getRequiredSensorIdForStep(step) {
    if (!step) return 'accel.total';
    var threshold = step.threshold || '';
    var m = threshold.match(/([a-zA-Z_][\w.]*)/);
    var fromThreshold = m ? m[1] : null;
    if (fromThreshold && fromThreshold !== 'steady' && fromThreshold !== 'freefall') {
      return fromThreshold;
    }
    if (fromThreshold === 'freefall' || fromThreshold === 'steady') return 'accel.total';
    var s = step.sensor || 'accel.total';
    if (s === 'accelerometer' || s === 'gyroscope') return 'accel.total';
    return s;
  }

  function isSensorRequiredAvailable(sensorId) {
    var S = global.AGNI_SHARED;
    if (!S || !sensorId) return false;
    var base = sensorId.split('.')[0];
    var motionFamily = base === 'accel' || base === 'gyro' || base === 'rotation' ||
      sensorId === 'orientation' || sensorId === 'freefall' || sensorId === 'steady' || sensorId === 'shake';
    if (motionFamily) {
      return !!(S.device && S.device.hasMotionEvents &&
        S.sensorBridge && typeof S.sensorBridge.isActive === 'function' && S.sensorBridge.isActive());
    }
    if (base === 'light') {
      return false;
    }
    if (base === 'sound' || sensorId === 'mic') {
      return false;
    }
    return false;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 11. Assemble and expose AGNI_SHARED
  // ═══════════════════════════════════════════════════════════════════════════

  global.AGNI_SHARED = {
    _version: '1.8.1',

    // ── Sensor pub/sub ────────────────────────────────────────────────────────
    sensorSubscriptions:      sensorSubscriptions,
    lastSensorValues:         lastSensorValues,
    subscribeToSensor:        subscribeToSensor,
    unsubscribeFromSensor:    unsubscribeFromSensor,
    publishSensorReading:     publishSensorReading,
    clearSensorSubscriptions: clearSensorSubscriptions,

    // ── Vibration ─────────────────────────────────────────────────────────────
    vibrate:                     vibrate,
    registerVibrationPattern:    registerVibrationPattern,
    loadLessonVibrationPatterns: loadLessonVibrationPatterns,
    VIBRATION_PATTERNS:          VIBRATION_PATTERNS,
    getHapticIntensity:          getHapticIntensity,
    getReducedMotion:            getReducedMotion,

    // ── Device ────────────────────────────────────────────────────────────────
    device: DEVICE,

    // ── Visual lifecycle ──────────────────────────────────────────────────────
    mountVisual:        mountVisual,
    mountStepVisual:    mountStepVisual,
    destroyVisual:      destroyVisual,
    destroyStepVisual:  destroyStepVisual,
    flushPendingMounts: flushPendingMounts,

    // ── Module registry ───────────────────────────────────────────────────────
    registerModule: registerModule,
    hasModule:      hasModule,
    onModuleReady:  onModuleReady,
    modules:        _modules,

    // ── Logging ───────────────────────────────────────────────────────────────
    log: log,

    // ── Encoding (Phase 4; from binary-utils.js when present) ───────────────────
    base64ToBytes: base64ToBytes,
    concatBytes:   concatBytes,

    // ── Canonical JSON & dev mode [R10 P1.1, P1.5] ─────────────────────────
    canonicalJSON:  canonicalJSON,
    _urlDevMode:    _urlDevMode,

    // ── HTML sanitizer [R10 P1.2] ────────────────────────────────────────────
    sanitizeHtml:   sanitizeHtml,
    setSafeHtml:    setSafeHtml,

    // ── DOM & formatting helpers ─────────────────────────────────────────────
    el:                       el,
    parseDurationMs:          parseDurationMs,
    formatRemainingAttempts:  formatRemainingAttempts,

    // ── Sensor dependency (P2-19) ────────────────────────────────────────────
    getRequiredSensorIdForStep:  getRequiredSensorIdForStep,
    isSensorRequiredAvailable:   isSensorRequiredAvailable
  };

  // ── Self-register with factory-loader if present ────────────────────────────
  if (global.AGNI_LOADER && typeof global.AGNI_LOADER.register === 'function') {
    global.AGNI_LOADER.register('shared-runtime', '1.8.1');
  }

  if (DEV_MODE) {
    console.log('[SHARED] shared-runtime v1.8.1 loaded');
    console.log('[SHARED] device:', DEVICE.ua.slice(0, 60));
    console.log('[SHARED] caps: motion=' + DEVICE.hasMotionEvents +
      ' svg=' + DEVICE.hasSVG + ' sw=' + DEVICE.hasServiceWorker +
      ' cache=' + DEVICE.hasCacheAPI + ' vibration=' + DEVICE.hasVibration);
  }

}(window));
