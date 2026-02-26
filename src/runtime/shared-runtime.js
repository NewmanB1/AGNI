// src/runtime/shared-runtime.js
// AGNI Shared Runtime  v1.8.1
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
    } catch (e) { /* localStorage unavailable */ }
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
          reject(e);
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
        pending.reject(e);
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
  // 10. Assemble and expose AGNI_SHARED
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
    concatBytes:   concatBytes
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
