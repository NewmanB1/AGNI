// @ts-nocheck — bindSensor callback type, Function vs specific signature
// packages/agni-runtime/rendering/svg-stage.js
// AGNI SVG Stage System  v1.8.2
//
// Owns a single SVG viewport, manages named layers, drives the RAF animation
// loop, and wires sensor subscriptions to update callbacks.
//
// Changes from v1.8.1 (3-3 tick ID uniqueness):
//   - onTick: use monotonic counter for handler IDs instead of Date.now+random.
// Changes from v1.8.0 (P2-23 memory leak fix):
//   - destroy(): clear _layers map to release DOM references.
//   - RAF loop: check _destroyed before each tick callback (handlers cannot run
//     after synchronous destroy from within a callback).
//
// Changes from v1.7.0:
//   - bindSensor() now stores the unsubscribe closure returned by
//     AGNI_SHARED.subscribeToSensor() rather than {sensorId, fn} pairs.
//   - destroy() calls stored unsubscribe closures directly instead of
//     reaching into AGNI_SHARED.sensorSubscriptions. This uses the
//     unsubscribeFromSensor() API added to shared-runtime v1.8.0.
//   - Version bumped to 1.8.0.
//
// Usage:
//   var stage = AGNI_SVG.stage(container, { w:400, h:300 });
//   var bg    = stage.layer('background');
//   var fg    = stage.layer('foreground');
//   stage.onTick(function(t, dt) { ... });         // animation loop
//   stage.bindSensor('accel.magnitude', fn);       // sensor → callback
//   stage.destroy();                               // call on step change
// ─────────────────────────────────────────────────────────────────────────────

(function (global) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }

  // ── Stage factory ───────────────────────────────────────────────────────────

  /**
   * Create a Stage: a managed SVG viewport with layers, a RAF loop, and
   * sensor subscriptions that clean up automatically on destroy().
   *
   * @param {HTMLElement} container  DOM element to render into
   * @param {object}      opts
   *   w          {number}  viewBox width  (default 400)
   *   h          {number}  viewBox height (default 300)
   *   background {string}  optional CSS colour for SVG background rect
   */
  function createStage(container, opts) {
    opts = opts || {};
    var W = opts.w || 400;
    var H = opts.h || 300;

    // ── SVG root ──────────────────────────────────────────────────────────────
    while (container.firstChild) container.removeChild(container.firstChild);
    var svg = el('svg', {
      xmlns: NS,
      viewBox: '0 0 ' + W + ' ' + H,
      width: '100%',
      height: 'auto',
      style: 'display:block;'
    });

    if (opts.background) {
      svg.appendChild(el('rect', { x:0, y:0, width:W, height:H, fill: opts.background }));
    }

    container.appendChild(svg);

    // ── Internal state ────────────────────────────────────────────────────────
    var _layers       = {};    // name → <g> element
    var _tickHandlers = [];    // [{id, fn}]
    var _tickIdNext   = 0;     // monotonic counter for unique tick handler IDs (3-3)

    // Stores the unsubscribe closures returned by subscribeToSensor().
    // destroy() calls each one — no need to reach into sensorSubscriptions.
    // This is the pattern A unsubscribe path (see shared-runtime.js Section 1).
    var _sensorUnsubs = [];    // [unsubscribeFn, ...]

    var _rafId      = null;
    var _startTime  = null;
    var _lastTime   = null;
    var _destroyed  = false;

    // ── RAF loop ──────────────────────────────────────────────────────────────
    function _rafLoop(now) {
      if (_destroyed) return;
      if (_startTime === null) _startTime = now;
      if (_lastTime  === null) _lastTime  = now;
      var t  = (now - _startTime) / 1000;
      var dt = (now - _lastTime)  / 1000;
      _lastTime = now;

      for (var i = 0; i < _tickHandlers.length; i++) {
        if (_destroyed) return;
        try { _tickHandlers[i].fn(t, dt); } catch (e) { console.error('[STAGE] tick error:', e); }
      }

      _rafId = requestAnimationFrame(_rafLoop);
    }

    function _startLoop() {
      if (_rafId === null && _tickHandlers.length > 0) {
        _rafId = requestAnimationFrame(_rafLoop);
      }
    }

    function _stopLoop() {
      if (_rafId !== null) {
        cancelAnimationFrame(_rafId);
        _rafId = null;
      }
    }

    // ── Public API ────────────────────────────────────────────────────────────

    var stage = {

      /** SVG element – for direct manipulation if needed */
      svg: svg,
      w: W,
      h: H,

      /**
       * Get or create a named layer (<g> element).
       * Layers are stacked in creation order (later = on top).
       * @param  {string} name
       * @returns {SVGGElement}
       */
      layer: function (name) {
        if (!_layers[name]) {
          var safeName = String(name).replace(/[^\w-]/g, '_');
          var g = el('g', { id: 'layer-' + safeName });
          svg.appendChild(g);
          _layers[name] = g;
        }
        return _layers[name];
      },

      /**
       * Clear all children from a named layer without removing the layer.
       * @param {string} name
       */
      clearLayer: function (name) {
        var g = _layers[name];
        if (g) { while (g.firstChild) g.removeChild(g.firstChild); }
      },

      /**
       * Register an animation tick handler.
       * @param  {function} fn  called as fn(t, dt) each animation frame
       * @returns {string}      handler id — pass to offTick() to remove
       */
      onTick: function (fn) {
        var id = 'tick_' + (++_tickIdNext);
        _tickHandlers.push({ id: id, fn: fn });
        _startLoop();
        return id;
      },

      /**
       * Remove a tick handler by id.
       * @param {string} id
       */
      offTick: function (id) {
        _tickHandlers = _tickHandlers.filter(function (h) { return h.id !== id; });
        if (_tickHandlers.length === 0) _stopLoop();
      },

      /**
       * Bind a sensor stream to a callback.
       * The subscription is automatically cancelled on stage.destroy().
       *
       * Stores the unsubscribe closure returned by subscribeToSensor()
       * rather than {sensorId, fn} pairs. destroy() calls the closures
       * directly — no internal map access needed.
       *
       * @param {string}   sensorId   e.g. 'accel.magnitude'
       * @param {function} fn         called with {sensorId, value, timestamp}
       */
      bindSensor: function (sensorId, fn) {
        var shared = global.AGNI_SHARED;
        if (!shared || typeof shared.subscribeToSensor !== 'function') {
          console.warn('[STAGE] AGNI_SHARED not available — sensor binding skipped:', sensorId);
          return;
        }
        // Store the unsubscribe closure directly (pattern A)
        var unsub = shared.subscribeToSensor(sensorId, fn);
        if (unsub && typeof unsub === 'function') _sensorUnsubs.push(unsub);
      },

      /**
       * Read the last known value for a sensor without subscribing.
       * @param  {string} sensorId
       * @returns {number|null}
       */
      sensorValue: function (sensorId) {
        var shared = global.AGNI_SHARED;
        if (!shared || !shared.lastSensorValues || typeof shared.lastSensorValues.get !== 'function') return null;
        var v = shared.lastSensorValues.get(sensorId);
        return v !== undefined ? v : null;
      },

      /**
       * Export the stage as SVG string or PNG data URL.
       * @param {string} format  'svg' (sync) or 'png' (returns Promise)
       * @returns {string|Promise<string>}
       */
      export: function (format) {
        var svgEl = container.querySelector('svg');
        if (!svgEl) return '';
        if (format === 'svg') {
          return svgEl.outerHTML;
        }
        if (format === 'png') {
          return new Promise(function (resolve, reject) {
            var svgStr = svgEl.outerHTML;
            var b64;
            try {
              b64 = btoa(unescape(encodeURIComponent(svgStr)));
            } catch (e) {
              reject(new Error('SVG too large or invalid for base64 encoding (SHIM-3-10)'));
              return;
            }
            var img = new Image();
            img.onload = function () {
              var c = document.createElement('canvas');
              c.width = W;
              c.height = H;
              var ctx = c.getContext('2d');
              if (!ctx) {
                reject(new Error('Canvas 2d context unavailable'));
                return;
              }
              try {
                ctx.drawImage(img, 0, 0);
                var dataUrl = c.toDataURL('image/png');
                resolve(dataUrl);
              } catch (e) {
                var msg = (e && e.name === 'SecurityError') ? 'Canvas tainted; PNG export unavailable (SHIM-3-11)' : ('PNG export failed: ' + (e && e.message ? e.message : 'unknown'));
                reject(new Error(msg));
              }
            };
            img.onerror = function () { reject(new Error('Failed to load SVG for PNG export')); };
            img.src = 'data:image/svg+xml;base64,' + b64;
          });
        }
        return '';
      },

      /**
       * Destroy the stage: cancel RAF, unsubscribe all sensors, clear DOM.
       *
       * Sensor unsubscription calls the closures stored in _sensorUnsubs —
       * each was returned by subscribeToSensor() and holds the exact
       * callback reference. No direct access to sensorSubscriptions needed.
       *
       * Call this in player.js routeStep() before any step transition,
       * or via AGNI_SHARED.destroyStepVisual() which wraps this call.
       */
      destroy: function () {
        if (_destroyed) return;
        _destroyed = true;
        _stopLoop();
        _tickHandlers = [];

        // Unsubscribe all sensor bindings using stored closures (pattern A)
        _sensorUnsubs.forEach(function (unsub) {
          if (typeof unsub === 'function') { try { unsub(); } catch (e) { /* ignore */ } }
        });
        _sensorUnsubs = [];

        // Clear layers map to release DOM references (P2-23 memory leak fix)
        _layers = {};

        // Clear SVG DOM (removeChild preserves any external listeners)
        while (container.firstChild) container.removeChild(container.firstChild);

        if (global.DEV_MODE) console.log('[STAGE] destroyed');
      }
    };

    if (global.DEV_MODE) console.log('[STAGE] created', W + 'x' + H);
    return stage;
  }

  // ── Attach to AGNI_SVG ──────────────────────────────────────────────────────
  if (!global.AGNI_SVG) global.AGNI_SVG = {};
  global.AGNI_SVG.stage = createStage;

  if (global.AGNI_SHARED) global.AGNI_SHARED.svg = global.AGNI_SVG;

  if (global.DEV_MODE) console.log('[SVG-STAGE] v1.8.2 loaded');

}(window));
