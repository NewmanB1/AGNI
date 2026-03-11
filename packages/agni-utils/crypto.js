// packages/agni-utils/crypto.js
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
//
// SIGNATURE SCOPE (v2.2 — narrow scope, remediation #5c)
//   Content = canonicalJSON(LESSON_DATA) + NUL + OLS_INTENDED_OWNER.
//   This narrow scope reduces verification time (especially with TweetNaCl on Chrome 51)
//   and eliminates UI blocking. Protects lesson content integrity and device watermark.
//   HTML wrapper, factories, and player code are NOT signed (unchanged).
//   BREAKING: Signatures from v2.1 (full-script scope) will fail verification.
//   Lessons must be re-signed with hub/CLI after upgrading.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const crypto = require('crypto');
const fs     = require('fs');
const { createLogger } = require('./logger');

const log = createLogger('crypto');

let _keyCache = { path: null, mtime: 0, key: null };

/**
 * Canonical JSON: sorted keys, deterministic across platforms. [R10 P1.5]
 * Must produce identical output to AGNI_SHARED.canonicalJSON in the browser.
 * @param {*} obj
 * @returns {string}
 */
function canonicalJSON(obj) {
  if (obj === null || obj === undefined) return 'null';
  const type = typeof obj;
  if (type === 'number') {
    if (!isFinite(obj)) return 'null';
    return String(obj);
  }
  if (type === 'boolean') return String(obj);
  if (type === 'string') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJSON).join(',') + ']';
  }
  if (type === 'object') {
    const keys = Object.keys(obj).sort();
    /** @type {string[]} */
    const pairs = keys
      .filter(k => obj[k] !== undefined)
      .map(k => JSON.stringify(k) + ':' + canonicalJSON(obj[k]));
    return '{' + pairs.join(',') + '}';
  }
  return 'null';
}

/**
 * Signs lesson content bound to a specific device, using Ed25519.
 *
 * The signing input is SHA-256(contentString + '\x00' + deviceId), a
 * pre-hash that eliminates concatenation ambiguity and keeps the Ed25519
 * payload fixed at 32 bytes regardless of lesson size.
 *
 * @param  {string}      contentString  canonical JSON of LESSON_DATA (lesson IR). Signer passes canonicalJSON(ir).
 * @param  {string}      deviceId       intended device UUID
 * @param  {string}      privateKeyPath path to PEM-encoded Ed25519 private key
 * @returns {string|null}               base64 Ed25519 signature, or null
 */
function signContent(contentString, deviceId, privateKeyPath) {
  if (typeof contentString !== 'string') throw new Error('contentString must be a string');
  if (typeof deviceId !== 'string' || !deviceId) return null;
  if (typeof privateKeyPath !== 'string' || !privateKeyPath) return null;

  try {
    const stat = fs.statSync(privateKeyPath);
    if (_keyCache.path !== privateKeyPath || _keyCache.mtime !== stat.mtimeMs) {
      _keyCache = { path: privateKeyPath, mtime: stat.mtimeMs, key: fs.readFileSync(privateKeyPath, 'utf8') };
    }
    const privateKey = _keyCache.key;

    // ── Step 1: canonical binding hash ───────────────────────────────────────
    // NUL separator prevents boundary-shift attacks. The browser verifier
    // must reconstruct this exact byte sequence before verifying.
    const bindingHash = crypto
      .createHash('sha256')
      .update(contentString)
      .update('\x00')      // NUL separator — never present in a UUID
      .update(deviceId)
      .digest();           // raw Buffer (32 bytes)

    // ── Step 2: Ed25519 signature ─────────────────────────────────────────────
    // crypto.sign(null, data, key) — null algorithm is correct for Ed25519.
    // No dsaEncoding option. Signatures are fixed 64 bytes, no ASN.1 framing.
    const signature = crypto.sign(null, bindingHash, privateKey);

    return signature.toString('base64');

  } catch (err) {
    throw new Error('Signing failed');
  }
}

/**
 * Compute Subresource Integrity (SRI) hash for a resource. SHA-384, base64.
 * Used for resource bundle integrity (factories, shared-runtime, etc.).
 * @param  {string|Buffer} content  file content (string or Buffer)
 * @returns {string}  "sha384-<base64>"
 */
function computeSRI(content) {
  const buf = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
  const hash = crypto.createHash('sha384').update(buf).digest('base64');
  return 'sha384-' + hash;
}

/**
 * Signs an arbitrary payload (e.g. factory manifest) with Ed25519.
 * No device binding — used for hub-signed resource manifests.
 * @param  {string} payloadString  canonical JSON of the payload
 * @param  {string} privateKeyPath path to PEM-encoded Ed25519 private key
 * @returns {string|null}          base64 Ed25519 signature, or null
 */
function signManifestPayload(payloadString, privateKeyPath) {
  if (typeof payloadString !== 'string') return null;
  if (typeof privateKeyPath !== 'string' || !privateKeyPath) return null;
  try {
    const stat = fs.statSync(privateKeyPath);
    if (_keyCache.path !== privateKeyPath || _keyCache.mtime !== stat.mtimeMs) {
      _keyCache = { path: privateKeyPath, mtime: stat.mtimeMs, key: fs.readFileSync(privateKeyPath, 'utf8') };
    }
    const privateKey = _keyCache.key;
    const data = Buffer.from(payloadString, 'utf8');
    const signature = crypto.sign(null, data, privateKey);
    return signature.toString('base64');
  } catch (err) {
    log.warn('Manifest signing failed: ' + (err && err.message));
    return null;
  }
}

/**
 * Export public key as base64 SPKI DER from a PEM file (private or public).
 * @param  {string} keyPath path to PEM file
 * @returns {string|null} base64 SPKI or null
 */
function getPublicKeySpki(keyPath) {
  if (!keyPath || typeof keyPath !== 'string') return null;
  try {
    const pemContent = fs.readFileSync(keyPath, 'utf8');
    const keyObject = crypto.createPublicKey({ key: pemContent, format: 'pem' });
    const derBuffer = keyObject.export({ type: 'spki', format: 'der' });
    return derBuffer.toString('base64');
  } catch (err) {
    log.warn('Could not read public key: ' + (err && err.message));
    return null;
  }
}


module.exports = { signContent, signManifestPayload, canonicalJSON, getPublicKeySpki, computeSRI };
