// packages/agni-runtime/polyfills.js
// ES5 polyfills — augmentations declared in polyfills.d.ts to avoid lib.dom conflicts
// ES5 polyfills for Chrome 51 WebView (Android 7.0 Nougat). See docs/RUN-ENVIRONMENTS.md.
//
// Loaded FIRST by factory-loader before any other runtime code.
// Provides shims for ES6+ APIs used across the factory pipeline.
// Each polyfill guards with a feature check so modern browsers skip it.
//
// ES5 only — no const, let, arrow, template literals, destructuring.

(function (global) {
  'use strict';

  // ── Object.assign (Chrome 45+) ──────────────────────────────────────────────
  if (typeof Object.assign !== 'function') {
    Object.assign = function (target) {
      if (target == null) throw new TypeError('Cannot convert undefined or null to object');
      var to = Object(target);
      for (var i = 1; i < arguments.length; i++) {
        var src = arguments[i];
        if (src != null) {
          for (var key in src) {
            if (Object.prototype.hasOwnProperty.call(src, key)) {
              to[key] = src[key];
            }
          }
        }
      }
      return to;
    };
  }

  // ── Array.prototype.find (Chrome 45+) ───────────────────────────────────────
  if (!Array.prototype.find) {
    Array.prototype.find = function (predicate, thisArg) {
      if (this == null) throw new TypeError('Array.prototype.find called on null or undefined');
      if (typeof predicate !== 'function') throw new TypeError('predicate must be a function');
      var list = Object(this);
      var length = list.length >>> 0;
      for (var i = 0; i < length; i++) {
        var value = list[i];
        if (predicate.call(thisArg, value, i, list)) return value;
      }
      return undefined;
    };
  }

  // ── String.prototype.repeat (Chrome 41+) ──────────────────────────────────
  // Must be defined before padStart, which depends on it.
  if (!String.prototype.repeat) {
    String.prototype.repeat = function (count) {
      if (this == null) throw new TypeError("can't convert " + this + " to object");
      var str = '' + this;
      count = +count;
      if (count < 0 || count === Infinity) throw new RangeError('Invalid count value');
      count = Math.floor(count);
      if (str.length === 0 || count === 0) return '';
      var result = '';
      while (count > 0) {
        if (count & 1) result += str;
        count >>= 1;
        if (count) str += str;
      }
      return result;
    };
  }

  // ── String.prototype.padStart (Chrome 57+) ─────────────────────────────────
  if (!String.prototype.padStart) {
    String.prototype.padStart = function (targetLength, padString) {
      targetLength = targetLength >> 0;
      padString = String(typeof padString !== 'undefined' ? padString : ' ');
      if (this.length >= targetLength) return String(this);
      targetLength = targetLength - this.length;
      if (targetLength > padString.length) {
        padString += padString.repeat(Math.ceil(targetLength / padString.length));
      }
      return padString.slice(0, targetLength) + String(this);
    };
  }

  // ── NodeList.prototype.forEach (Chrome 51+) ────────────────────────────────
  // SHIM-3-1: querySelectorAll returns NodeList; older environments lack .forEach.
  // This polyfill ensures table-renderer and other DOM iteration work on ES5 baseline.
  if (typeof NodeList !== 'undefined' && !NodeList.prototype.forEach) {
    NodeList.prototype.forEach = /** @type {*} */ (Array.prototype.forEach);
  }

  // ── Minimal URLSearchParams (Chrome 49+) ───────────────────────────────────
  // Only implements .get() and .has() — sufficient for AGNI runtime usage.
  // Uses internal _params; type assertion avoids conflict with full lib.dom.d.ts.
  if (typeof global.URLSearchParams !== 'function') {
    /** @constructor */
    function MinimalURLSearchParams(search) {
      /** @type {Record<string, string>} */
      this._params = {};
      if (typeof search !== 'string') return;
      if (search.charAt(0) === '?') search = search.slice(1);
      var pairs = search.split('&');
      for (var i = 0; i < pairs.length; i++) {
        var idx = pairs[i].indexOf('=');
        if (idx === -1) continue;
        var key = decodeURIComponent(pairs[i].slice(0, idx).replace(/\+/g, ' '));
        var val = decodeURIComponent(pairs[i].slice(idx + 1).replace(/\+/g, ' '));
        this._params[key] = val;
      }
    }
    MinimalURLSearchParams.prototype.get = function (name) {
      return Object.prototype.hasOwnProperty.call(this._params, name) ? this._params[name] : null;
    };
    MinimalURLSearchParams.prototype.has = function (name) {
      return Object.prototype.hasOwnProperty.call(this._params, name);
    };
    MinimalURLSearchParams.prototype.toString = function () {
      var parts = [];
      for (var key in this._params) {
        if (Object.prototype.hasOwnProperty.call(this._params, key)) {
          parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(this._params[key]));
        }
      }
      return parts.join('&');
    };
    MinimalURLSearchParams.prototype.set = function (name, val) {
      this._params[name] = String(val);
    };
    // @ts-expect-error — minimal polyfill; full URLSearchParams interface not implemented
    global.URLSearchParams = MinimalURLSearchParams;
  }

})(typeof self !== 'undefined' ? self : this);
