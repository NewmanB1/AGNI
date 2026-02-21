// src/runtime/shared-runtime.js
// AGNI Shared Runtime  v1.7.0
//
// The foundational module loaded by every lesson, always first.
// Provides:
//   - Sensor pub/sub with proper unsubscribe
//   - Vibration patterns
//   - Device capability detection
//   - Visual spec renderer (delegates to SVG factory registry)
//   - Lesson step visual mounting / teardown lifecycle
//   - DEV_MODE logging helpers
//
// All other runtime files (sensor-bridge, svg-factories, math-renderer, etc.)
// register themselves into window.AGNI_SHARED after they load.
// player.js reads everything lazily from window.AGNI_SHARED at call time,
// never at parse time, so load order is not a concern.
// ─────────────────────────────────────────────────────────────────────────────

(function (global) {
  'use strict';

  // ── Guard: only initialise once ─────────────────────────────────────────────
  // factory-loader may execute the same script twice on retry; be idempotent.
  if (global.AGNI_SHARED && global.AGNI_SHARED._version === '1.7.0') {
    if (global.DEV_MODE) console.log('[SHARED] already loaded, skipping re-init');
    return;
  }

  // ── DEV_MODE: read from LESSON_DATA if available, else default false ─────────
  // player.js also sets this, but factories that load before the player
  // need a consistent reference.
  var DEV_MODE = !!(global.LESSON_DATA && global.LESSON_DATA._devMode);


  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Sensor pub/sub
  //    Publishers: sensor-bridge.js (real hardware) and player.js (dev emulator)
  //    Subscribers: SVG factories, threshold-evaluator, player monitors
  // ═══════════════════════════════════════════════════════════════════════════

  // Map<sensorId, Set<callback>>
  var sensorSubscriptions = new Map();

  // Map<sensorId, lastValue>  — for factories that need the current value
  // without waiting for the next reading
  var lastSensorValues = new Map();

  /**
   * Subscribe to a sensor stream.
   * @param {string}   sensorId   e.g. 'accel.magnitude'
   * @param {function} callback   called with { sensorId, value, timestamp }
   * @returns {function}          unsubscribe — call this to stop receiving readings
   */
  function subscribeToSensor(sensorId, callback) {
    if (!sensorSubscriptions.has(sensorId)) {
      sensorSubscriptions.set(sensorId, new Set());
    }
    sensorSubscriptions.get(sensorId).add(callback);

    // Return an unsubscribe function so callers don't need to hold
    // a reference to the map
    return function unsubscribe() {
      var subs = sensorSubscriptions.get(sensorId);
      if (subs) subs.delete(callback);
    };
  }

  /**
   * Publish a sensor reading to all subscribers.
   * Called by sensor-bridge.js (hardware) or the dev emulator.
   * @param {{ sensorId: string, value: number, timestamp?: number }} reading
   */
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

  /**
   * Unsubscribe all callbacks for a sensor, or all sensors.
   * Called by svg-stage.destroy() and player step transitions.
   * @param {string} [sensorId]  omit to clear everything
   */
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
    // Lesson-authoring aliases
    correct:         [70, 80, 150],
    incorrect:       [250],
    attention:       [100, 60, 100]
  };

  /**
   * Trigger a vibration pattern by name or supply a custom ms array.
   * Silently no-ops on devices without the Vibration API.
   * @param {string|number[]} pattern  name or custom array
   */
  function vibrate(pattern) {
    if (!('vibrate' in navigator)) return;
    var ms = Array.isArray(pattern)
      ? pattern
      : (VIBRATION_PATTERNS[pattern] || VIBRATION_PATTERNS.short);
    navigator.vibrate(ms);
    if (DEV_MODE) console.log('[VIBRATE]', typeof pattern === 'string' ? pattern : JSON.stringify(ms));
  }

  /**
   * Register a custom vibration pattern for this lesson.
   * Lesson YAML can define patterns like:
   *   vibration_patterns:
   *     weave_beat: [80, 40, 80, 40, 200]
   */
  function registerVibrationPattern(name, msArray) {
    VIBRATION_PATTERNS[name] = msArray;
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Device capability detection
  //    Populated once at init; safe to read any time thereafter.
  // ═══════════════════════════════════════════════════════════════════════════

  var DEVICE = (function () {
    var ua = navigator.userAgent || '';
    return {
      // Sensor availability (actual permission handled by sensor-bridge.js)
      hasMotionEvents:  typeof DeviceMotionEvent !== 'undefined',
      hasOrientationEvents: typeof DeviceOrientationEvent !== 'undefined',
      // Rendering capabilities
      hasSVG:           typeof SVGElement !== 'undefined',
      hasCanvas:        !!document.createElement('canvas').getContext,
      // Network
      hasServiceWorker: 'serviceWorker' in navigator,
      hasCacheAPI:      typeof caches !== 'undefined',
      // Vibration
      hasVibration:     'vibrate' in navigator,
      // Platform hints for degraded rendering
      isOldAndroid:     /Android [2-6]\./.test(ua),
      isLowEnd:         /Android [2-4]\./.test(ua) || /MSIE|Trident/.test(ua),
      // User agent for diagnostics
      ua:               ua.slice(0, 120)
    };
  }());


  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Visual spec renderer
  //    Delegates to AGNI_SVG.fromSpec() once svg-registry.js has loaded.
  //    If the SVG library isn't loaded yet, queues the mount and flushes it
  //    when svg-registry.js registers itself.
  // ═══════════════════════════════════════════════════════════════════════════

  var _pendingMounts = [];   // [{container, spec, resolve, reject}]

  /**
   * Mount a visual spec into a container.
   * Returns a Promise<{stage, result}> — the same shape as AGNI_SVG.preview().
   * The promise resolves immediately if the SVG library is already loaded,
   * or after the library loads if it's still in flight.
   *
   * @param {HTMLElement} container
   * @param {object}      spec       AGNI visual spec { factory, opts } or compose spec
   * @returns {Promise<{stage, result}>}
   */
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
      // Not loaded yet — queue it
      _pendingMounts.push({ container: container, spec: spec,
                            resolve: resolve, reject: reject });
    });
  }

  /**
   * Called by svg-registry.js after it attaches AGNI_SVG.fromSpec.
   * Flushes any mounts that were queued before the library loaded.
   */
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
      console.log('[SHARED] Flushed', queue.length, 'pending visual mounts');
    }
  }

  /**
   * Destroy a mounted visual and release its stage resources.
   * Safe to call with null/undefined.
   * @param {{ stage } | null} handle  returned by mountVisual()
   */
  function destroyVisual(handle) {
    if (handle && handle.stage && typeof handle.stage.destroy === 'function') {
      handle.stage.destroy();
    }
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // 5. Lesson step visual lifecycle
  //    Tracks the currently-mounted visual so the player can tear it down
  //    on step navigation without knowing what factory was used.
  // ═══════════════════════════════════════════════════════════════════════════

  var _currentVisualHandle = null;

  /**
   * Mount a visual for the current step. Tears down the previous one first.
   * @param {HTMLElement} container
   * @param {object}      spec
   * @returns {Promise}
   */
  function mountStepVisual(container, spec) {
    destroyVisual(_currentVisualHandle);
    _currentVisualHandle = null;
    return mountVisual(container, spec).then(function (handle) {
      _currentVisualHandle = handle;
      return handle;
    });
  }

  /** Tear down the current step's visual. Called by player on step change. */
  function destroyStepVisual() {
    destroyVisual(_currentVisualHandle);
    _currentVisualHandle = null;
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // 6. Custom vibration pattern loader
  //    Reads lesson.vibration_patterns and registers them at lesson start.
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
  //    Other runtime files call AGNI_SHARED.registerModule() when they load.
  //    The player can check which modules are available before calling them.
  // ═══════════════════════════════════════════════════════════════════════════

  var _modules = {};    // { moduleName: version }
  var _moduleReadyCallbacks = {};  // { moduleName: [fn, ...] }

  /**
   * Called by each runtime file (sensor-bridge, math-renderer, etc.)
   * when it finishes loading and attaching itself to AGNI_SHARED.
   * @param {string} name     e.g. 'sensor-bridge'
   * @param {string} version  e.g. '1.7.0'
   */
  function registerModule(name, version) {
    _modules[name] = version || true;
    // Also tell factory-loader so it can track what's loaded
    if (global.AGNI_LOADER && typeof global.AGNI_LOADER.register === 'function') {
      global.AGNI_LOADER.register(name, version);
    }
    // Flush any onModuleReady callbacks
    var cbs = _moduleReadyCallbacks[name];
    if (cbs) {
      cbs.forEach(function (fn) {
        try { fn(); } catch (e) { log.error('onModuleReady callback error:', e); }
      });
      delete _moduleReadyCallbacks[name];
    }
    log.debug(name + ' v' + version + ' registered');
  }

  /**
   * Check whether a module has finished loading.
   * @param  {string}  name
   * @returns {boolean}
   */
  function hasModule(name) {
    return !!_modules[name];
  }

  /**
   * Register a callback to run when a module becomes available.
   * If the module is already loaded the callback fires immediately.
   * @param {string}   name
   * @param {function} fn
   */
  function onModuleReady(name, fn) {
    if (_modules[name]) { fn(); return; }
    if (!_moduleReadyCallbacks[name]) _moduleReadyCallbacks[name] = [];
    _moduleReadyCallbacks[name].push(fn);
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // 9. Assemble and expose AGNI_SHARED
  // ═══════════════════════════════════════════════════════════════════════════

  global.AGNI_SHARED = {
    _version: '1.7.0',

    // Sensor pub/sub
    sensorSubscriptions:      sensorSubscriptions,
    lastSensorValues:         lastSensorValues,
    subscribeToSensor:        subscribeToSensor,
    publishSensorReading:     publishSensorReading,
    clearSensorSubscriptions: clearSensorSubscriptions,

    // Vibration
    vibrate:                  vibrate,
    registerVibrationPattern: registerVibrationPattern,
    loadLessonVibrationPatterns: loadLessonVibrationPatterns,
    VIBRATION_PATTERNS:       VIBRATION_PATTERNS,

    // Device
    device: DEVICE,

    // Visual lifecycle
    mountVisual:      mountVisual,
    mountStepVisual:  mountStepVisual,
    destroyVisual:    destroyVisual,
    destroyStepVisual: destroyStepVisual,
    flushPendingMounts: flushPendingMounts,

    // Module registry
    registerModule:   registerModule,
    hasModule:        hasModule,
    onModuleReady:    onModuleReady,
    modules:          _modules,

    // Logging
    log: log
  };

  // ── Self-register with factory-loader ───────────────────────────────────────
  if (global.AGNI_LOADER && typeof global.AGNI_LOADER.register === 'function') {
    global.AGNI_LOADER.register('shared-runtime', '1.7.0');
  }

  if (DEV_MODE) {
    console.log('[SHARED] shared-runtime v1.7.0 loaded');
    console.log('[SHARED] device:', DEVICE.ua.slice(0, 60));
    console.log('[SHARED] caps: motion=' + DEVICE.hasMotionEvents +
      ' svg=' + DEVICE.hasSVG + ' sw=' + DEVICE.hasServiceWorker +
      ' cache=' + DEVICE.hasCacheAPI + ' vibration=' + DEVICE.hasVibration);
  }

}(window));
