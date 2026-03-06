// packages/agni-runtime/integrity/binary-utils.js
// Centralized base64/bytes and UTF-8 helpers for the browser runtime.
// Used by shared-runtime and player for Phase 4 integrity verification.
// Must load before shared-runtime when used as a separate script.
// Backlog task 13 — ARCH §5.4.
// ES5 only — no const/let, no arrow functions (Android 4+, iOS 9+).

(function (global) {
  'use strict';

  /**
   * Decode a base64 string to a Uint8Array.
   * @param  {string} b64
   * @returns {Uint8Array}
   */
  function base64ToBytes(b64) {
    var binary = atob(b64);
    var bytes  = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * Encode bytes to a base64 string.
   * @param  {Uint8Array|ArrayBuffer} bytes
   * @returns {string}
   */
  function bytesToBase64(bytes) {
    var u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    var binary = '';
    for (var i = 0; i < u8.length; i++) {
      binary += String.fromCharCode(u8[i]);
    }
    return btoa(binary);
  }

  /**
   * Concatenate multiple Uint8Arrays into one.
   * @param  {...Uint8Array} arrays
   * @returns {Uint8Array}
   */
  function concatBytes() {
    var arrays = Array.prototype.slice.call(arguments);
    var total  = arrays.reduce(function (n, a) { return n + a.length; }, 0);
    var result = new Uint8Array(total);
    var offset = 0;
    arrays.forEach(function (a) {
      result.set(a, offset);
      offset += a.length;
    });
    return result;
  }

  global.OLS_BINARY = {
    base64ToBytes: base64ToBytes,
    bytesToBase64: bytesToBase64,
    concatBytes:   concatBytes
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
