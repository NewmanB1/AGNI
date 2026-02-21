// src/runtime/svg-stage.js
// AGNI SVG Stage System
// Owns a single SVG viewport, manages named layers, drives the RAF animation
// loop, and wires sensor subscriptions to update callbacks.
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
   *   w         {number}  viewBox width  (default 400)
   *   h         {number}  viewBox height (default 300)
   *   background {string} optional CSS colour for SVG background rect
   */
  function createStage(container, opts) {
    opts = opts || {};
    var W = opts.w || 400;
    var H = opts.h || 300;

    // ── SVG root ──────────────────────────────────────────────────────────────
    container.innerHTML = '';
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
    var _layers       = {};           // name → <g> element
    var _tickHandlers = [];           // [{id, fn}]
    var _sensorUnsubs = [];           // cleanup fns from subscribeToSensor
    var _rafId        = null;
    var _startTime    = null;
    var _lastTime     = null;
    var _destroyed    = false;

    // ── RAF loop ──────────────────────────────────────────────────────────────
    function _rafLoop(now) {
      if (_destroyed) return;
      if (_startTime === null) _startTime = now;
      if (_lastTime  === null) _lastTime  = now;
      var t  = (now - _startTime) / 1000;   // seconds since stage created
      var dt = (now - _lastTime)  / 1000;   // delta since last frame
      _lastTime = now;

      _tickHandlers.forEach(function (h) {
        try { h.fn(t, dt); } catch (e) { console.error('[STAGE] tick error:', e); }
      });

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
          var g = el('g', { id: 'layer-' + name });
          svg.appendChild(g);
          _layers[name] = g;
        }
        return _layers[name];
      },

      /**
       * Clear all children from a named layer (without removing the layer).
       * @param {string} name
       */
      clearLayer: function (name) {
        var g = _layers[name];
        if (g) { while (g.firstChild) g.removeChild(g.firstChild); }
      },

      /**
       * Register an animation tick handler.
       * @param  {function} fn  Called as fn(t, dt) each animation frame
       * @returns {string}      handler id — pass to offTick() to remove
       */
      onTick: function (fn) {
        var id = 'tick_' + Date.now() + '_' + Math.random().toString(36).slice(2);
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
       * @param {string}   sensorId   e.g. 'accel.magnitude'
       * @param {function} fn         called with {sensorId, value}
       */
      bindSensor: function (sensorId, fn) {
        var shared = global.AGNI_SHARED;
        if (!shared || typeof shared.subscribeToSensor !== 'function') {
          console.warn('[STAGE] AGNI_SHARED not available – sensor binding skipped:', sensorId);
          return;
        }
        shared.subscribeToSensor(sensorId, fn);
        // Store unsub as a closure (pub/sub doesn't return unsub, so we track manually)
        _sensorUnsubs.push({ sensorId: sensorId, fn: fn });
      },

      /**
       * Read the last known value for a sensor.
       * @param  {string} sensorId
       * @returns {number|null}
       */
      sensorValue: function (sensorId) {
        var shared = global.AGNI_SHARED;
        if (!shared || !shared.lastSensorValues) return null;
        var v = shared.lastSensorValues.get(sensorId);
        return v !== undefined ? v : null;
      },

      /**
       * Destroy the stage: cancel RAF, unsubscribe sensors, clear DOM.
       * Call this in the lesson player when navigating away from a step.
       */
      destroy: function () {
        _destroyed = true;
        _stopLoop();
        _tickHandlers = [];

        // Unsubscribe sensors
        // AGNI_SHARED pub/sub doesn't expose unsubscribe yet, so we zero the callbacks.
        // Phase 3 will add a proper unsubscribe to shared-runtime.
        var shared = global.AGNI_SHARED;
        if (shared && shared.sensorSubscriptions) {
          _sensorUnsubs.forEach(function (sub) {
            var set = shared.sensorSubscriptions.get(sub.sensorId);
            if (set) set.delete(sub.fn);
          });
        }
        _sensorUnsubs = [];

        // Clear SVG
        container.innerHTML = '';

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

  if (global.DEV_MODE) console.log('[SVG-STAGE] loaded');

}(window));
