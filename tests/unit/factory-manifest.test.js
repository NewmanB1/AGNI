'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { describe, it } = require('../helpers/test-api');
const assert = require('node:assert/strict');

describe('hub-signed factory manifest (P0 #5)', () => {
  it('buildFactoryManifest returns version, factories, timestamp', () => {
    const factoryManifest = require('@agni/hub/lesson-server/factory-manifest');
    const manifest = factoryManifest.buildFactoryManifest({});
    assert.ok(manifest.version);
    assert.ok(Array.isArray(manifest.factories));
    assert.ok(manifest.timestamp);
    assert.ok(manifest.factories.length > 0, 'should list at least base factories');
    const first = manifest.factories[0];
    assert.ok(first.file);
    assert.ok(first.version);
    assert.ok(first.integrity && /^sha384-/.test(first.integrity));
  });

  it('buildFactoryManifest with privateKey includes signature', () => {
    const { privateKey } = crypto.generateKeyPairSync('ed25519', {
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    const pemPath = path.join(os.tmpdir(), 'agni-manifest-sig-test-' + Date.now() + '.pem');
    fs.writeFileSync(pemPath, privateKey, 'utf8');
    try {
      const factoryManifest = require('@agni/hub/lesson-server/factory-manifest');
      const manifest = factoryManifest.buildFactoryManifest({ privateKeyPath: pemPath });
      assert.ok(manifest.signature, 'manifest should have signature when key provided');
      assert.match(manifest.signature, /^[A-Za-z0-9+/]+=*$/);
    } finally {
      try { fs.unlinkSync(pemPath); } catch (e) { /* ignore */ }
    }
  });
});
