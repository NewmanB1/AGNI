// src/runtime/integrity.js
// AGNI Integrity Verification Module
//
// Ed25519 signature verification for lesson content.
// Extracted from player.js Section 1 to isolate cryptographic concerns.
//
// Registers: window.AGNI_INTEGRITY
// Depends on: AGNI_SHARED (optional, for binary helpers)
// Load order: after shared-runtime.js, before player.js
//
// ES5 only — targets Android 6.0+ (Chrome 44 WebView).

(function (global) {
  'use strict';

  var S = global.AGNI_SHARED;

  function getBase64ToBytes() { return S.base64ToBytes; }
  function getConcatBytes()   { return S.concatBytes; }

  function buildBindingHash(contentString, deviceId) {
    var enc          = new TextEncoder();
    var contentBytes = enc.encode(contentString);
    var sepBytes     = new Uint8Array([0x00]);
    var deviceBytes  = enc.encode(deviceId);
    var combined     = getConcatBytes()(contentBytes, sepBytes, deviceBytes);
    return crypto.subtle.digest('SHA-256', combined);
  }

  function verifyWithSubtleCrypto(lesson) {
    var base64ToBytes = getBase64ToBytes();
    var sigBytes    = base64ToBytes(global.OLS_SIGNATURE);
    var pubKeyBytes = base64ToBytes(global.OLS_PUBLIC_KEY);
    var owner       = global.OLS_INTENDED_OWNER;
    var content     = JSON.stringify(lesson);

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

  function verifyWithTweetNaCl(lesson, devMode) {
    if (!global.nacl || !global.nacl.sign) {
      if (devMode) console.warn('[VERIFY] TweetNaCl not loaded');
      return Promise.resolve(devMode);
    }

    try {
      var base64ToBytes = getBase64ToBytes();
      var concatBytes   = getConcatBytes();
      var sigBytes  = base64ToBytes(global.OLS_SIGNATURE);
      var spkiBytes = base64ToBytes(global.OLS_PUBLIC_KEY);
      var rawPubKey = spkiBytes.slice(spkiBytes.length - 32);
      var owner     = global.OLS_INTENDED_OWNER;
      var content   = JSON.stringify(lesson);

      var enc          = new TextEncoder();
      var contentBytes = enc.encode(content);
      var sepBytes     = new Uint8Array([0x00]);
      var deviceBytes  = enc.encode(owner);
      var combined     = concatBytes(contentBytes, sepBytes, deviceBytes);

      return crypto.subtle.digest('SHA-256', combined).then(function (bindingHash) {
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
   * @param {object}  lesson   LESSON_DATA
   * @param {boolean} devMode  skip verification in dev mode
   */
  function verify(lesson, devMode) {
    if (devMode) return Promise.resolve(true);

    if (!global.OLS_SIGNATURE || !global.OLS_PUBLIC_KEY || !global.OLS_INTENDED_OWNER) {
      console.error('[VERIFY] Missing signature globals');
      return Promise.resolve(false);
    }

    var canUseSubtle = global.crypto &&
                       global.crypto.subtle &&
                       typeof global.crypto.subtle.verify === 'function';

    if (!canUseSubtle) {
      return verifyWithTweetNaCl(lesson, devMode);
    }

    return verifyWithSubtleCrypto(lesson).then(function (result) {
      if (devMode) console.log('[VERIFY] SubtleCrypto result:', result);
      return result;
    }).catch(function (err) {
      if (devMode) console.warn('[VERIFY] SubtleCrypto failed, falling back:', err.message);
      return verifyWithTweetNaCl(lesson, devMode);
    });
  }

  global.AGNI_INTEGRITY = {
    verify: verify
  };

})(typeof self !== 'undefined' ? self : this);
