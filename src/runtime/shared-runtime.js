// src/runtime/shared-runtime.js
// AGNI Shared Runtime  v1.8.0
//
// The foundational module loaded by every lesson, always first.
// Provides:
//   - Sensor pub/sub with proper subscribe / unsubscribe / clear
//   - Vibration patterns
//   - Device capability detection
//   - Visual spec renderer (delegates to SVG factory registry)
//   - Lesson step visual mounting / teardown lifecycle
//   - DEV_MODE logging helpers
//
// All other runtime files (sensor-bridge, svg-factories, math-renderer, etc.)
// register themselves into window.AGNI_SHARED after they load.
// player.js reads everything lazily from window.AGNI_SHARED at call time,
// never at parse time, so load order is not a concern for the player.
//
// Changes from v1.7.0:
//   - Added unsubscribeFromSensor(sensorId, fn) — named unsubscribe method
//     for callers that need to unsubscribe by reference rather than by
//     the closure returned from subscribeToSensor(). svg-stage.js uses
//     this in destroy() so it no longer reaches into sensorSubscriptions
//     directly. See Section 1 for full rationale.
//   - Version bumped to 1.8.0
// ─────────────────────────────────────────────────────────────────────────────

(function (global) {
  'use strict';

  // ── Guard: only initialise once ─────────────────────────────────────────────
  // factory-loader may execute the same script twice on retry; be idempotent.
  if (global.AGNI_SHARED && global.AGNI_SHARED._version === '1.8.0') {
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
  //
  //    Three ways to unsubscribe, for different caller patterns:
  //
  //    A. Capture the return value of subscribeToSensor() and call it:
  //         var unsub = S.subscribeToSensor('accel.total', fn);
  //         unsub();   // clean unsubscribe
  //       This is the preferred pattern for new code — the unsub closure
  //       holds the exact reference and needs no external state.
  //
  //    B. Call unsubscribeFromSensor(sensorId, fn) by name:
  //         S.unsubscribeFromSensor('accel.total', fn);
  //       Used by svg-stage.js destroy() when it stores {sensorId, fn}
  //       pairs rather than closures. Both methods are equivalent.
  //       Neither errors if the subscription does not exist.
  //
  //    C. Call clearSensorSubscriptions(sensorId?) to bulk-clear:
  //         S.clearSensorSubscriptions('accel.total');  // one sensor
  //         S.clearSensorSubscriptions();               // all sensors
  //       Used by player.js on step transitions to ensure no stale
  //       subscribers fire into the next step's evaluation.
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
   * @returns {function}          unsubscribe closure — call to stop receiving
   */
  function subscribeToSensor(sensorId, callback) {
    if (!sensorSubscriptions.has(sensorId)) {
      sensorSubscriptions.set(sensorId, new Set());
    }
    sensorSubscriptions.get(sensorId).add(callback);

    // Return an unsubscribe closure so callers don't need to hold
    // a reference to the internal map. See pattern A in section 1.
    return function unsubscribe() {
      var subs = sensorSubscriptions.get(sensorId);
      if (subs) subs.delete(callback);
      // Intentionally leave empty Sets in the map — publishSensorReading
      // checks subs.forEach which is a no-op on empty Sets, and avoiding
      // map deletion prevents a has() check race on high-frequency sensors.
    };
  }

  /**
   * Unsubscribe a specific callback from a sensor stream by reference.
   * Equivalent to calling the closure returned by subscribeToSensor().
   * Idempotent — safe to call if the subscription does not exist.
   * See pattern B in section 1.
   *
   * This is the method svg-stage.js destroy() calls so it does not need
   * to reach into sensorSubscriptions directly. Any future caller that
   * stores {sensorId, fn} pairs rather than closures should use this.
   *
   * @param {string}   sensorId
   * @param {function} fn        the exact function reference passed to subscribeToSensor
   */
  function unsubscribeFromSensor(sensorId, fn) {
    var subs = sensorSubscriptions.get(sensorId);
    if (subs) subs.delete(fn);
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
   * Bulk-clear sensor subscriptions.
   * Called by player.js on step transitions to prevent stale sensor
   * subscribers from firing into the next step's threshold evaluator.
   * See pattern C in section 1.
   *
   * Leaves empty Sets in the map (does not delete keys) so that
   * publishSensorReading does not need a has() guard on every publish.
   *
   * @param {string} [sensorId]  omit to clear all sensors
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
      hasMotionEvents:      typeof DeviceMotionEvent !== 'undefined',
      hasOrientationEvents: typeof DeviceOrientationEvent !== 'undefined',
      // Rendering capabilities
      hasSVG:               typeof SVGElement !== 'undefined',
      hasCanvas:            !!document.createElement('canvas').getContext,
      // Network / caching
      hasServiceWorker:     'serviceWorker' in navigator,
      hasCacheAPI:          typeof caches !== 'undefined',
      // Vibration
      hasVibration:         'vibrate' in navigator,
      // Platform hints for degraded rendering
      isOldAndroid:         /Android [2-6]\./.test(ua),
      isLowEnd:             /Android [2-4]\./.test(ua) || /MSIE|Trident/.test(ua),
      // User agent for diagnostics
      ua:                   ua.slice(0, 120)
    };
  }());


  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Visual spec renderer
  //    Delegates to AGNI_SVG.fromSpec() once svg-registry.js has loaded.
  //    If the SVG library isn't loaded yet, queues the mount and flushes it
  //    when svg-registry.js registers itself via flushPendingMounts().
  // ═══════════════════════════════════════════════════════════════════════════

  var _pendingMounts = [];   // [{container, spec, resolve, reject}]

  /**
   * Mount a visual spec into a container.
   * Returns a Promise<{stage, result}> — the same shape as AGNI_SVG.preview().
   * Resolves immediately if the SVG library is already loaded, or after
   * the library loads if it is still in flight (factory-loader.js path).
   *
   * @param {HTMLElement} container
   * @param {object}      spec       { factory, opts } or compose spec
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
      // SVG library not yet loaded — queue for flush when it arrives
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
      console.log('[SHARED] Flushed', queue.length, 'pending visual mount(s)');
    }
  }

  /**
   * Destroy a mounted visual and release its stage resources.
   * Safe to call with null or undefined.
   * @param {{ stage } | null} handle  returned by mountVisual() / mountStepVisual()
   */
  function destroyVisual(handle) {
    if (handle && handle.stage && typeof handle.stage.destroy === 'function') {
      handle.stage.destroy();
    }
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // 5. Lesson step visual lifecycle
  //    Tracks the currently-mounted visual so player.js can tear it down
  //    on step navigation without knowing which factory was used.
  //
  //    player.js calls mountStepVisual() after renderStep() to attach a
  //    spec visual, and destroyStepVisual() in routeStep() before any
  //    navigation. This ensures the RAF loop and sensor subscriptions
  //    owned by the stage are always released before the next step renders.
  // ═══════════════════════════════════════════════════════════════════════════

  var _currentVisualHandle = null;

  /**
   * Mount a visual for the current step. Tears down the previous one first.
   * @param {HTMLElement} container
   * @param {object}      spec
   * @returns {Promise<{stage, result}>}
   */
  function mountStepVisual(container, spec) {
    destroyVisual(_currentVisualHandle);
    _currentVisualHandle = null;
    return mountVisual(container, spec).then(function (handle) {
      _currentVisualHandle = handle;
      return handle;
    });
  }

  /**
   * Tear down the current step's visual.
   * Called by player.js routeStep() before any step transition.
   * Cancels the RAF loop and releases all sensor subscriptions owned
   * by the stage. Safe to call when no visual is mounted.
   */
  function destroyStepVisual() {
    destroyVisual(_currentVisualHandle);
    _currentVisualHandle = null;
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // 6. Custom vibration pattern loader
  //    Reads lesson.vibration_patterns and registers them at lesson start.
  //    Called by player.js initPlayer() before any step renders.
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
  //    player.js (and factory-loader.js in Phase 3) can check which modules
  //    are available before calling them.
  // ═══════════════════════════════════════════════════════════════════════════

  var _modules = {};
  var _moduleReadyCallbacks = {};

  /**
   * Called by each runtime file when it finishes attaching to AGNI_SHARED.
   * @param {string} name     e.g. 'sensor-bridge'
   * @param {string} version  e.g. '1.8.0'
   */
  function registerModule(name, version) {
    _modules[name] = version || true;
    // Notify factory-loader if present
    if (global.AGNI_LOADER && typeof global.AGNI_LOADER.register === 'function') {
      global.AGNI_LOADER.register(name, version);
    }
    // Flush any onModuleReady callbacks registered before this module loaded
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
   * @param  {string}  name
   * @returns {boolean}
   */
  function hasModule(name) {
    return !!_modules[name];
  }

  /**
   * Register a callback to run when a module becomes available.
   * Fires immediately if the module is already loaded.
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
    _version: '1.8.0',

    // ── Sensor pub/sub ────────────────────────────────────────────────────────
    // Three unsubscribe paths — see Section 1 for when to use each.
    sensorSubscriptions:      sensorSubscriptions,   // exposed for diagnostic use only
    lastSensorValues:         lastSensorValues,
    subscribeToSensor:        subscribeToSensor,      // returns unsub closure (pattern A)
    unsubscribeFromSensor:    unsubscribeFromSensor,  // named method (pattern B) ← NEW v1.8.0
    publishSensorReading:     publishSensorReading,
    clearSensorSubscriptions: clearSensorSubscriptions, // bulk clear (pattern C)

    // ── Vibration ─────────────────────────────────────────────────────────────
    vibrate:                     vibrate,
    registerVibrationPattern:    registerVibrationPattern,
    loadLessonVibrationPatterns: loadLessonVibrationPatterns,
    VIBRATION_PATTERNS:          VIBRATION_PATTERNS,

    // ── Device ────────────────────────────────────────────────────────────────
    device: DEVICE,

    // ── Visual lifecycle ──────────────────────────────────────────────────────
    mountVisual:        mountVisual,
    mountStepVisual:    mountStepVisual,
    destroyVisual:      destroyVisual,
    destroyStepVisual:  destroyStepVisual,
    flushPendingMounts: flushPendingMounts,

    // ── Module registry ───────────────────────────────────────────────────────
    registerModule:   registerModule,
    hasModule:        hasModule,
    onModuleReady:    onModuleReady,
    modules:          _modules,

    // ── Logging ───────────────────────────────────────────────────────────────
    log: log
  };

  // ── Self-register with factory-loader if present ────────────────────────────
  if (global.AGNI_LOADER && typeof global.AGNI_LOADER.register === 'function') {
    global.AGNI_LOADER.register('shared-runtime', '1.8.0');
  }

  if (DEV_MODE) {
    console.log('[SHARED] shared-runtime v1.8.0 loaded');
    console.log('[SHARED] device:', DEVICE.ua.slice(0, 60));
    console.log('[SHARED] caps: motion=' + DEVICE.hasMotionEvents +
      ' svg=' + DEVICE.hasSVG + ' sw=' + DEVICE.hasServiceWorker +
      ' cache=' + DEVICE.hasCacheAPI + ' vibration=' + DEVICE.hasVibration);
  }

}(window));
