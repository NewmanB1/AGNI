// packages/agni-utils/binary.js
// Centralized binary/base64 encoding for Node (builders, crypto, CLI).
// Browser runtime uses @agni/runtime/integrity/binary-utils (atob/btoa).
// Backlog task 13 — ARCH §5.4.

'use strict';

/**
 * Decode a base64 string to a Buffer (Node).
 * @param {string} b64
 * @returns {Buffer}
 */
function base64ToBytes(b64) {
  return Buffer.from(b64, 'base64');
}

/**
 * Encode bytes to a base64 string (Node).
 * @param {Buffer|Uint8Array|ArrayBuffer} bytes
 * @returns {string}
 */
function bytesToBase64(bytes) {
  const buf = Buffer.isBuffer(bytes)
    ? bytes
    : (bytes instanceof ArrayBuffer ? Buffer.from(new Uint8Array(bytes)) : Buffer.from(/** @type {Uint8Array} */ (bytes)));
  return buf.toString('base64');
}

/**
 * Encode a UTF-8 string to a Buffer.
 * @param {string} str
 * @returns {Buffer}
 */
function utf8ToBytes(str) {
  return Buffer.from(str, 'utf8');
}

/**
 * Decode a Buffer to a UTF-8 string.
 * @param {Buffer|Uint8Array} bytes
 * @returns {string}
 */
function bytesToUtf8(bytes) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  return buf.toString('utf8');
}

module.exports = {
  base64ToBytes,
  bytesToBase64,
  utf8ToBytes,
  bytesToUtf8
};
