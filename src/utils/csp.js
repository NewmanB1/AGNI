'use strict';

const crypto = require('crypto');

/**
 * Generate a cryptographic nonce for CSP script-src.
 * @returns {string} base64-encoded 16-byte random nonce
 */
function generateNonce() {
  return crypto.randomBytes(16).toString('base64');
}

/**
 * Build a CSP meta tag with nonce-based script-src.
 * @param {string} nonce
 * @returns {string} HTML meta tag
 */
function buildCspMeta(nonce) {
  return '<meta http-equiv="Content-Security-Policy" content="' +
    "default-src 'self'; " +
    "script-src 'nonce-" + nonce + "'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data:; " +
    "connect-src 'self'; " +
    "font-src 'self'; " +
    "media-src 'self'" +
    '">';
}

module.exports = { generateNonce, buildCspMeta };
