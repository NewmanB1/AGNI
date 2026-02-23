// src/utils/crypto.js
// AGNI Crypto Utilities  v2.0.0
//
// Changes from v1.x:
//   - signContent() now uses Ed25519 via crypto.sign(null, ...) instead of
//     RSA/ECDSA via crypto.createSign('SHA256'). The algorithms are not
//     compatible — the runtime verifier expects Ed25519.
//   - Binding input is SHA-256(content + NUL + deviceId) rather than two
//     separate .update() calls on the signer. The NUL-byte separator closes
//     the concatenation-ambiguity attack from the Phase 4 security review.
//   - Version bumped to 2.0.0.
//
// SIGNING ALGORITHM
//   Ed25519. crypto.sign(null, data, key) — the null algorithm argument is
//   correct because Ed25519 has its own internal hashing; the algorithm is
//   determined by the key type, not by the argument. Do NOT use
//   crypto.createSign('SHA256') (RSA/ECDSA) and do NOT pass
//   { dsaEncoding: 'ieee-p1363' } — that option is for ECDSA only.
//   Signatures are fixed 64 bytes, returned as a base64 string.
//
// BINDING HASH
//   We pre-hash the binding before signing:
//     SHA-256(contentString + '\x00' + deviceId)
//
//   Without a separator, update("abc") + update("def") and
//   update("abcd") + update("ef") produce identical inputs — a boundary-shift
//   allows a crafted lesson to match a legitimate signature from a different
//   device. The NUL byte (\x00) is safe here because device UUIDs are hex
//   strings with hyphens and can never contain NUL.
//
//   The browser verifier (player.js) reconstructs the same binding:
//     concat(encode(contentString), [0x00], encode(deviceId))
//     → crypto.subtle.digest('SHA-256', combined)
//   and passes the result to SubtleCrypto.verify() or TweetNaCl.
//
// KEY FORMAT
//   Generate:
//     openssl genpkey -algorithm Ed25519 -out hub-private.pem
//     openssl pkey -in hub-private.pem -pubout -out hub-public.pem
//   Export public key as base64 SPKI for embedding in HTML:
//     openssl pkey -in hub-private.pem -pubout -outform DER | base64
//   Embed the base64 SPKI in html.js as OLS_PUBLIC_KEY.
//   In the browser, import with format: 'spki' — do NOT strip the DER
//   wrapper. SubtleCrypto requires SPKI; raw 32-byte import gives a wrong key.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

var crypto = require('crypto');
var fs     = require('fs');


/**
 * Signs lesson content bound to a specific device, using Ed25519.
 *
 * The signing input is SHA-256(contentString + '\x00' + deviceId), a
 * pre-hash that eliminates concatenation ambiguity and keeps the Ed25519
 * payload fixed at 32 bytes regardless of lesson size.
 *
 * @param  {string}      contentString  serialised lesson IR (JSON)
 * @param  {string}      deviceId       intended device UUID
 * @param  {string}      privateKeyPath path to PEM-encoded Ed25519 private key
 * @returns {string|null}               base64 Ed25519 signature, or null
 */
function signContent(contentString, deviceId, privateKeyPath) {
  if (!deviceId || !privateKeyPath) return null;

  try {
    var privateKey = fs.readFileSync(privateKeyPath, 'utf8');

    // ── Step 1: canonical binding hash ───────────────────────────────────────
    // NUL separator prevents boundary-shift attacks. The browser verifier
    // must reconstruct this exact byte sequence before verifying.
    var bindingHash = crypto
      .createHash('sha256')
      .update(contentString)
      .update('\x00')      // NUL separator — never present in a UUID
      .update(deviceId)
      .digest();           // raw Buffer (32 bytes)

    // ── Step 2: Ed25519 signature ─────────────────────────────────────────────
    // crypto.sign(null, data, key) — null algorithm is correct for Ed25519.
    // No dsaEncoding option. Signatures are fixed 64 bytes, no ASN.1 framing.
    var signature = crypto.sign(null, bindingHash, privateKey);

    return signature.toString('base64');

  } catch (err) {
    console.warn('\u26A0\uFE0F  Crypto Warning: ' + err.message);
    return null;
  }
}


module.exports = { signContent };
