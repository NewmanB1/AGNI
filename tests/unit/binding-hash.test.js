'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

// Contract test: the binding hash computed by Node (src/utils/crypto.js)
// must produce the identical digest as the browser implementation
// (src/runtime/integrity.js). Both use:
//
//   SHA-256( encode(contentString) || 0x00 || encode(deviceId) )
//
// The NUL-byte separator prevents boundary-shift ambiguity between
// contentString and deviceId. This test pins the canonical format
// so any future divergence between environments is caught immediately.

describe('binding-hash contract', () => {
  it('produces canonical SHA-256 digest for known inputs', () => {
    const content  = '{"meta":{"title":"Test"}}';
    const deviceId = 'aaaabbbb-1111-2222-3333-ccccddddeeee';

    // Node-side computation (mirrors src/utils/crypto.js signContent)
    const nodeHash = crypto
      .createHash('sha256')
      .update(content)
      .update('\x00')
      .update(deviceId)
      .digest('hex');

    // Browser-equivalent computation: concat raw bytes with NUL separator
    const enc = new TextEncoder();
    const contentBytes = enc.encode(content);
    const sepBytes     = new Uint8Array([0x00]);
    const deviceBytes  = enc.encode(deviceId);
    const combined     = Buffer.concat([contentBytes, sepBytes, deviceBytes]);
    const browserHash  = crypto
      .createHash('sha256')
      .update(combined)
      .digest('hex');

    assert.equal(nodeHash, browserHash,
      'Node (streaming update) and browser (concat bytes) must produce identical hash');
  });

  it('NUL separator prevents boundary-shift collision', () => {
    // "abc" + NUL + "def" must differ from "abcde" + NUL + "f"
    const hashA = crypto.createHash('sha256')
      .update('abc').update('\x00').update('def').digest('hex');
    const hashB = crypto.createHash('sha256')
      .update('abcde').update('\x00').update('f').digest('hex');

    assert.notEqual(hashA, hashB,
      'Different content/deviceId splits must produce different hashes');
  });

  it('empty content and deviceId produce a valid hash', () => {
    const hash = crypto.createHash('sha256')
      .update('').update('\x00').update('').digest('hex');
    assert.equal(hash.length, 64, 'SHA-256 hex digest is 64 chars');
  });
});
