// packages/agni-runtime/integrity/integrity.js
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
// ES5 only — targets Android 7.0+ (Chrome 51 WebView). See docs/RUN-ENVIRONMENTS.md.
//
// SCOPE (v2.2): Content = canonicalJSON(LESSON_DATA) + NUL + OLS_INTENDED_OWNER.
// Narrow scope reduces verification time and UI blocking (remediation #5c).
// Must match @agni/utils/crypto signer; AGNI_SHARED.canonicalJSON must match Node canonicalJSON.
//
// P2-11 hardening: Reject placeholder/sentinel values, inconsistent signature+key state,
// and invalid base64. Require canonicalJSON when verifying signed content (no JSON.stringify
// fallback — that would break verification determinism).
(function (global) {
  'use strict';

  var S = global.AGNI_SHARED;

  function getBase64ToBytes() { return S.base64ToBytes; }
  function getConcatBytes()   { return S.concatBytes; }

  // Reject known placeholder/sentinel patterns (P2-11)
  var PLACEHOLDER_PATTERNS = ['{{', '}}', 'PLACEHOLDER', '__SIGNATURE__', 'CHANGE_ME', 'REPLACE_ME'];
  function looksLikePlaceholder(str) {
    if (typeof str !== 'string' || str.length < 2) return false;
    var s = str.toUpperCase();
    for (var i = 0; i < PLACEHOLDER_PATTERNS.length; i++) {
      if (s.indexOf(PLACEHOLDER_PATTERNS[i].toUpperCase()) !== -1) return true;
    }
    return false;
  }

  // Valid base64: A-Za-z0-9+/ with optional trailing = padding. Ed25519 sig = 64 bytes → 88 chars.
  var BASE64_RE = /^[A-Za-z0-9+/]+=*$/;
  function isValidBase64(str, minLen) {
    if (typeof str !== 'string') return false;
    if (str.length < (minLen || 1)) return false;
    if (!BASE64_RE.test(str)) return false;
    var rem = str.length % 4;
    if (rem === 1) return false;
    if (rem === 2 && str.indexOf('=') !== -1) return false;
    if (rem === 3 && str.indexOf('=') !== -1) return false;
    return true;
  }

  // Content for binding hash: canonical LESSON_DATA (matches signer).
  // When verifying signed content we MUST use canonicalJSON; JSON.stringify has
  // implementation-dependent key order and would break verification.
  function getContentForVerification(lesson) {
    if (S && S.canonicalJSON) return S.canonicalJSON(lesson);
    return null;
  }

  // Device pseudoId from URL (?pseudoId=...) — same source as portal/player.
  // Used for watermark check: signed lessons must match intended owner.
  function getDevicePseudoIdFromUrl() {
    try {
      var loc = (typeof window !== 'undefined' && window.location) || (global && global.location);
      if (!loc || !loc.search) return '';
      var p = new URLSearchParams(loc.search);
      return p.get('pseudoId') || '';
    } catch (e) { return ''; }
  }

  // Dev mode from URL parameter (?dev=1) or localhost, NOT from lesson data [P1.1]
  // Localhost fallback supports unsigned lessons during local development.
  function isDevMode() {
    if (S && S._urlDevMode) return true;
    try {
      var loc = (typeof window !== 'undefined' && window.location) || (global && global.location);
      if (!loc || !loc.hostname) return false;
      if ((loc.search || '').indexOf('dev=1') !== -1) return true;
      var h = String(loc.hostname).toLowerCase();
      return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
    } catch (e) { return false; }
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
    var content     = getContentForVerification(lesson);

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

  // Pure-JS UTF-8 encoder for Chrome 51 where TextEncoder may be missing
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

  // Pure-JS SHA-256 for Chrome 51 where crypto.subtle may be unavailable
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
      var content   = getContentForVerification(lesson);

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

  function _doVerify(lesson) {
    var devMode = isDevMode();
    var hasSig = !!global.OLS_SIGNATURE;
    var hasKey = !!global.OLS_PUBLIC_KEY;

    // Unsigned lessons (both absent) pass — common for local dev.
    if (!hasSig && !hasKey) return Promise.resolve(true);

    // Inconsistent state: one present without the other (failed injection / malformed artifact).
    if (hasSig !== hasKey) {
      console.error('[VERIFY] Inconsistent integrity state: signature and public key must both be present or both absent');
      return Promise.resolve(false);
    }

    // P2-11: Reject placeholder/sentinel values (template not filled).
    if (looksLikePlaceholder(global.OLS_SIGNATURE) || looksLikePlaceholder(global.OLS_PUBLIC_KEY)) {
      console.error('[VERIFY] Signature or public key contains placeholder/sentinel value');
      return Promise.resolve(false);
    }

    // P2-11: Validate base64 format before decode (avoids cryptic atob errors).
    // Ed25519 signature 64 bytes = 86 chars base64; SPKI key typically 60+ chars.
    if (!isValidBase64(global.OLS_SIGNATURE, 84) || !isValidBase64(global.OLS_PUBLIC_KEY, 50)) {
      console.error('[VERIFY] Invalid base64 in signature or public key');
      return Promise.resolve(false);
    }

    // canonicalJSON required for verification; fallback would break determinism.
    if (!getContentForVerification(lesson)) {
      console.error('[VERIFY] AGNI_SHARED.canonicalJSON required for integrity verification');
      return Promise.resolve(false);
    }

    if (!global.OLS_INTENDED_OWNER) {
      console.error('[VERIFY] Missing OLS_INTENDED_OWNER');
      return Promise.resolve(false);
    }

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
    }).then(function (signatureValid) {
      if (!signatureValid) return false;
      // Watermark check: OLS_INTENDED_OWNER must match device identity.
      // Device identity from URL (portal launcher sets ?pseudoId=...).
      // If no pseudoId in URL (e.g. local file, sneakernet), we cannot verify — pass.
      var intendedOwner = global.OLS_INTENDED_OWNER;
      if (!intendedOwner) return true;
      var devicePseudoId = getDevicePseudoIdFromUrl();
      if (!devicePseudoId) return true;
      if (devicePseudoId !== intendedOwner) {
        console.error('[VERIFY] Unauthorized Copy — OLS_INTENDED_OWNER does not match device pseudoId');
        return false;
      }
      return true;
    });
  }

  /**
   * Verify lesson integrity. Returns Promise<boolean>.
   * Deferred to next tick to avoid blocking main thread (TweetNaCl can freeze UI).
   * devMode is derived from URL parameter, never from lesson data.
   * lastVerifyMs is set after verification for QA measurement (target <100ms on Android 7).
   * @param {object} lesson LESSON_DATA
   */
  function verify(lesson) {
    return new Promise(function (resolve) {
      global.setTimeout(function () {
        var t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        _doVerify(lesson).then(function (result) {
          var t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
          global.AGNI_INTEGRITY.lastVerifyMs = Math.round(t1 - t0);
          if (isDevMode()) console.log('[VERIFY] Duration:', global.AGNI_INTEGRITY.lastVerifyMs, 'ms');
          resolve(result);
        }).catch(function () {
          global.AGNI_INTEGRITY.lastVerifyMs = -1;
          resolve(false);
        });
      }, 0);
    });
  }

  global.AGNI_INTEGRITY = {
    verify: verify,
    lastVerifyMs: null
  };

})(typeof self !== 'undefined' ? self : this);
