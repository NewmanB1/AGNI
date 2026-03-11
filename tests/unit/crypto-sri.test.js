'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { describe, it } = require('../helpers/test-api');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { computeSRI, signManifestPayload, canonicalJSON, verifyPayload, getPublicKeySpki } = require('@agni/utils/crypto');

describe('computeSRI', () => {
  it('returns sha384-<base64> format', () => {
    const sri = computeSRI('hello');
    assert.match(sri, /^sha384-[A-Za-z0-9+/]+=*$/);
    assert.ok(sri.startsWith('sha384-'));
  });

  it('produces deterministic output for same input', () => {
    const content = 'var x = 1;';
    assert.equal(computeSRI(content), computeSRI(content));
  });

  it('produces different hashes for different content', () => {
    assert.notEqual(computeSRI('a'), computeSRI('b'));
    assert.notEqual(computeSRI('script1'), computeSRI('script2'));
  });

  it('matches Node crypto SHA-384 base64', () => {
    const content = '// factory code';
    const expected = crypto.createHash('sha384').update(content, 'utf8').digest('base64');
    const sri = computeSRI(content);
    assert.equal(sri, 'sha384-' + expected);
  });

  it('accepts Buffer input', () => {
    const buf = Buffer.from('test', 'utf8');
    const sri = computeSRI(buf);
    assert.equal(sri, computeSRI('test'));
  });

  it('handles empty string', () => {
    const sri = computeSRI('');
    assert.match(sri, /^sha384-[A-Za-z0-9+/]+=*$/);
  });

  it('handles unicode content', () => {
    const content = '// \u{1F4DA}';
    const sri = computeSRI(content);
    assert.match(sri, /^sha384-/);
  });
});

describe('signManifestPayload (hub-signed manifest P0 #5)', () => {
  let pemPath;

  before(() => {
    const { privateKey } = crypto.generateKeyPairSync('ed25519', {
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' }
    });
    pemPath = path.join(os.tmpdir(), 'agni-manifest-test-' + Date.now() + '.pem');
    fs.writeFileSync(pemPath, privateKey, 'utf8');
  });

  after(() => {
    try { fs.unlinkSync(pemPath); } catch (e) { /* ignore */ }
  });

  it('signs payload and produces base64 signature', () => {
    const payload = canonicalJSON({ version: '1.0', factories: [], timestamp: '2026-01-01T00:00:00.000Z' });
    const sig = signManifestPayload(payload, pemPath);
    assert.ok(sig, 'signature should be non-null');
    assert.match(sig, /^[A-Za-z0-9+/]+=*$/, 'signature should be base64');
    assert.ok(sig.length >= 64, 'Ed25519 signature is 64 bytes base64');
  });

  it('returns null for empty privateKeyPath', () => {
    assert.strictEqual(signManifestPayload('{}', ''), null);
    assert.strictEqual(signManifestPayload('{}', null), null);
  });

  it('signature verifies with Node crypto', () => {
    const manifest = { version: '1.0', factories: [{ file: 'x.js', version: '1', integrity: 'sha384-x' }], timestamp: '2026-01-01T00:00:00.000Z' };
    const payload = canonicalJSON(manifest);
    const sig = signManifestPayload(payload, pemPath);
    assert.ok(sig);
    const sigBuf = Buffer.from(sig, 'base64');
    const keyObject = crypto.createPublicKey({ key: fs.readFileSync(pemPath, 'utf8'), format: 'pem' });
    const data = Buffer.from(payload, 'utf8');
    assert.ok(crypto.verify(null, data, keyObject, sigBuf), 'signature should verify');
  });
});

describe('verifyPayload (sneakernet/manifest verification)', () => {
  let pemPath;

  before(() => {
    const { privateKey } = crypto.generateKeyPairSync('ed25519', {
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' }
    });
    pemPath = path.join(os.tmpdir(), 'agni-verify-test-' + Date.now() + '.pem');
    fs.writeFileSync(pemPath, privateKey, 'utf8');
  });

  after(() => {
    try { fs.unlinkSync(pemPath); } catch (e) { /* ignore */ }
  });

  it('verifies payload signed with signManifestPayload', () => {
    const payload = 'H4sIAAAAAAAA/6tWykhUslJSUKrISdNLLErVUcpLLEpVslJQgnEVJOUX5eelK1VwAQB2qJHwEQAAAA==';
    const sig = signManifestPayload(payload, pemPath);
    const spki = getPublicKeySpki(pemPath);
    assert.ok(verifyPayload(payload, sig, spki), 'valid signature should verify');
  });

  it('rejects tampered payload', () => {
    const payload = 'original';
    const sig = signManifestPayload(payload, pemPath);
    const spki = getPublicKeySpki(pemPath);
    assert.ok(verifyPayload(payload, sig, spki));
    assert.ok(!verifyPayload('tampered', sig, spki), 'tampered payload should fail');
  });

  it('returns false for invalid inputs', () => {
    assert.ok(!verifyPayload('', 'sig', 'key'));
    assert.ok(!verifyPayload('p', '', 'key'));
    assert.ok(!verifyPayload('p', 'sig', ''));
  });
});
