'use strict';

const { describe, it } = require('../helpers/test-api');
const assert = require('node:assert/strict');
const { base64ToBytes, bytesToBase64, utf8ToBytes, bytesToUtf8 } = require('@agni/utils/binary');

describe('bytesToBase64 / base64ToBytes', () => {
  it('round-trips a simple string', () => {
    const original = Buffer.from('Hello, AGNI!');
    const b64 = bytesToBase64(original);
    assert.equal(typeof b64, 'string');
    const decoded = base64ToBytes(b64);
    assert.ok(Buffer.isBuffer(decoded));
    assert.deepEqual(decoded, original);
  });

  it('handles empty buffer', () => {
    const b64 = bytesToBase64(Buffer.alloc(0));
    assert.equal(b64, '');
    assert.equal(base64ToBytes('').length, 0);
  });

  it('handles binary data (all byte values)', () => {
    const buf = Buffer.alloc(256);
    for (let i = 0; i < 256; i++) buf[i] = i;
    const b64 = bytesToBase64(buf);
    const decoded = base64ToBytes(b64);
    assert.deepEqual(decoded, buf);
  });

  it('accepts Uint8Array input', () => {
    const arr = new Uint8Array([72, 101, 108, 108, 111]);
    const b64 = bytesToBase64(arr);
    assert.equal(b64, 'SGVsbG8=');
  });

  it('produces valid base64 characters only', () => {
    const b64 = bytesToBase64(Buffer.from('test data for encoding'));
    assert.ok(/^[A-Za-z0-9+/=]*$/.test(b64));
  });
});

describe('utf8ToBytes / bytesToUtf8', () => {
  it('round-trips ASCII', () => {
    assert.equal(bytesToUtf8(utf8ToBytes('Hello')), 'Hello');
  });

  it('round-trips unicode (multibyte)', () => {
    const text = 'こんにちは世界 🌍';
    assert.equal(bytesToUtf8(utf8ToBytes(text)), text);
  });

  it('round-trips empty string', () => {
    assert.equal(bytesToUtf8(utf8ToBytes('')), '');
  });

  it('handles mixed ASCII and multibyte', () => {
    const text = 'AGNI: Éducation pour tous';
    assert.equal(bytesToUtf8(utf8ToBytes(text)), text);
  });

  it('utf8ToBytes returns a Buffer', () => {
    assert.ok(Buffer.isBuffer(utf8ToBytes('test')));
  });

  it('bytesToUtf8 accepts Uint8Array', () => {
    const arr = new Uint8Array([65, 71, 78, 73]);
    assert.equal(bytesToUtf8(arr), 'AGNI');
  });
});

describe('cross-encoding', () => {
  it('base64 encode of utf8 bytes round-trips', () => {
    const text = 'Leçon de mathématiques: $x² + 1$';
    const bytes = utf8ToBytes(text);
    const b64 = bytesToBase64(bytes);
    const decoded = bytesToUtf8(base64ToBytes(b64));
    assert.equal(decoded, text);
  });
});
