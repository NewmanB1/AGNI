// src/runtime/integrity/integrity.js
// AGNI Integrity Verification Module
//
// Ed25519 signature verification for lesson content.
// Extracted from player.js Section 1 to isolate cryptographic concerns.
//
// Registers: window.AGNI_INTEGRITY
// Depends on: AGNI_SHARED (for binary helpers + canonicalJSON)
// Load order: after shared-runtime.js, before player.js
//
// SECURITY: devMode is derived from AGNI_SHARED._urlDevMode (URL parameter
//   ?dev=1), NOT from LESSON_DATA._devMode. The lesson payload must never
//   control whether its own integrity verification is skipped. [Sprint R10 P1.1]
//   In devMode, missing signatures are tolerated (returns true) to support
//   local development without a private key. In production, missing signatures
//   always fail verification.
//
// ES5 only — targets Android 6.0+ (Chrome 44 WebView).

(function (global) {
  'use strict';

  var S = global.AGNI_SHARED;

  function getBase64ToBytes() { return S.base64ToBytes; }
  function getConcatBytes()   { return S.concatBytes; }

  // Dev mode from URL parameter (?dev=1), NOT from lesson data [P1.1]
  function isDevMode() {
    return !!(S && S._urlDevMode);
  }

  // Canonical JSON: sorted keys, deterministic across platforms [P1.5]
  function canonicalize(obj) {
    return S.canonicalJSON ? S.canonicalJSON(obj) : JSON.stringify(obj);
  }

  function buildBindingHash(contentString, deviceId) {
    var contentBytes = utf8Encode(contentString);
    var sepBytes     = new Uint8Array([0x00]);
    var deviceBytes  = utf8Encode(deviceId);
    var combined     = getConcatBytes()(contentBytes, sepBytes, deviceBytes);
    return sha256Fallback(combined);
  }

  function verifyWithSubtleCrypto(lesson) {
    var base64ToBytes = getBase64ToBytes();
    var sigBytes    = base64ToBytes(global.OLS_SIGNATURE);
    var pubKeyBytes = base64ToBytes(global.OLS_PUBLIC_KEY);
    var owner       = global.OLS_INTENDED_OWNER;
    var content     = canonicalize(lesson);

    return crypto.subtle.importKey(
      'spki',
      pubKeyBytes,
      { name: 'Ed25519' },
      false,
      ['verify']
    ).then(function (publicKey) {
      return buildBindingHash(content, owner).then(function (bindingHash) {
        return crypto.subtle.verify(
          { name: 'Ed25519' },
          publicKey,
          sigBytes,
          bindingHash
        );
      });
    });
  }

  // Pure-JS UTF-8 encoder for Chrome 44 where TextEncoder may be missing
  function utf8Encode(str) {
    if (typeof TextEncoder === 'function') {
      return new TextEncoder().encode(str);
    }
    var bytes = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) { bytes.push(c); }
      else if (c < 0x800) { bytes.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F)); }
      else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < str.length) {
        var c2 = str.charCodeAt(++i);
        var cp = ((c - 0xD800) << 10) + (c2 - 0xDC00) + 0x10000;
        bytes.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3F),
                   0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F));
      } else {
        bytes.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
      }
    }
    return new Uint8Array(bytes);
  }

  // Pure-JS SHA-256 for Chrome 44 where crypto.subtle may be unavailable
  // (requires HTTPS context which the Pi may not provide)
  function sha256Fallback(data) {
    if (global.nacl && global.nacl.hash) {
      // TweetNaCl provides SHA-512; take first 32 bytes is NOT SHA-256.
      // Fall through to crypto.subtle if available.
    }
    if (global.crypto && global.crypto.subtle && typeof global.crypto.subtle.digest === 'function') {
      return global.crypto.subtle.digest('SHA-256', data);
    }
    // Last resort: if js-sha256 was loaded as a factory
    if (global.sha256) {
      var hash = global.sha256.arrayBuffer(data);
      return Promise.resolve(hash);
    }
    return Promise.reject(new Error('No SHA-256 implementation available'));
  }

  function verifyWithTweetNaCl(lesson) {
    var devMode = isDevMode();
    if (!global.nacl || !global.nacl.sign) {
      if (devMode) console.warn('[VERIFY] TweetNaCl not loaded');
      return Promise.resolve(false);
    }

    try {
      var base64ToBytes = getBase64ToBytes();
      var concatBytes   = getConcatBytes();
      var sigBytes  = base64ToBytes(global.OLS_SIGNATURE);
      var spkiBytes = base64ToBytes(global.OLS_PUBLIC_KEY);
      var rawPubKey = spkiBytes.slice(spkiBytes.length - 32);
      var owner     = global.OLS_INTENDED_OWNER;
      var content   = canonicalize(lesson);

      var contentBytes = utf8Encode(content);
      var sepBytes     = new Uint8Array([0x00]);
      var deviceBytes  = utf8Encode(owner);
      var combined     = concatBytes(contentBytes, sepBytes, deviceBytes);

      return sha256Fallback(combined).then(function (bindingHash) {
        var bindingBytes = new Uint8Array(bindingHash);
        var valid = global.nacl.sign.detached.verify(bindingBytes, sigBytes, rawPubKey);
        if (devMode) console.log('[VERIFY] TweetNaCl result:', valid);
        return valid;
      });
    } catch (err) {
      if (devMode) console.warn('[VERIFY] TweetNaCl error:', err.message);
      return Promise.resolve(false);
    }
  }

  /**
   * Verify lesson integrity. Returns Promise<boolean>.
   * devMode is derived from URL parameter, never from lesson data.
   * In dev mode without signatures, verification is skipped (lesson loads).
   * In production, missing signatures always fail verification.
   * @param {object} lesson LESSON_DATA
   */
  function verify(lesson) {
    var devMode = isDevMode();

    if (!global.OLS_SIGNATURE || !global.OLS_PUBLIC_KEY) {
      if (devMode) {
        return Promise.resolve(true);
      }
      console.error('[VERIFY] Missing signature globals');
      return Promise.resolve(false);
    }

    if (!global.OLS_INTENDED_OWNER) {
      console.error('[VERIFY] Missing OLS_INTENDED_OWNER');
      return Promise.resolve(false);
    }

    // Ed25519 SubtleCrypto requires Chrome 113+; target is Chrome 44 WebView.
    // Always prefer TweetNaCl on Android Marshmallow devices.
    return verifyWithTweetNaCl(lesson).then(function (result) {
      if (result !== false) {
        if (devMode) console.log('[VERIFY] TweetNaCl result:', result);
        return result;
      }
      // TweetNaCl unavailable or failed — try SubtleCrypto as last resort
      var canUseSubtle = global.crypto &&
                         global.crypto.subtle &&
                         typeof global.crypto.subtle.verify === 'function';
      if (!canUseSubtle) return false;
      return verifyWithSubtleCrypto(lesson).then(function (r) {
        if (devMode) console.log('[VERIFY] SubtleCrypto result:', r);
        return r;
      }).catch(function (err) {
        if (devMode) console.warn('[VERIFY] SubtleCrypto failed:', err.message);
        return false;
      });
    });
  }

  global.AGNI_INTEGRITY = {
    verify: verify
  };

})(typeof self !== 'undefined' ? self : this);
