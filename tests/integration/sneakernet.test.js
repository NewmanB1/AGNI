'use strict';

/**
 * Integration tests for sneakernet export/import with signing (P2-21).
 */

const { describe, it, before, after } = require('../helpers/test-api');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'agni-sneakernet-'));
const KEY_PATH = path.join(TMP_DIR, 'test-key.pem');
const PACKET_PATH = path.join(TMP_DIR, 'packet.txt');

function makeEnv() {
  return {
    ...process.env,
    AGNI_DATA_DIR: TMP_DIR,
    AGNI_PRIVATE_KEY_PATH: KEY_PATH,
    AGNI_MAX_STUDENTS: '10',
    AGNI_MAX_LESSONS: '100'
  };
}

describe('sneakernet signing (P2-21)', () => {
  before(() => {
    const crypto = require('crypto');
    const { privateKey } = crypto.generateKeyPairSync('ed25519', {
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' }
    });
    fs.writeFileSync(KEY_PATH, privateKey, 'utf8');

    process.env.AGNI_DATA_DIR = TMP_DIR;
    process.env.AGNI_MAX_STUDENTS = '10';
    process.env.AGNI_MAX_LESSONS = '100';
    const engine = require('@agni/engine');
    return engine.seedLessons([{ lessonId: 'SN-L', difficulty: 2, skill: 'sn' }]).then(() => {
      return engine.recordObservation('sn-student', 'SN-L', [{ probeId: 'SN-L', correct: true }]);
    });
  });

  after(() => {
    try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  });

  it('export produces signed envelope when key is set', () => {
    execSync('node scripts/sneakernet.js export --out ' + PACKET_PATH, { encoding: 'utf8', env: makeEnv() });
    const raw = fs.readFileSync(PACKET_PATH, 'utf8').trim();
    const parsed = JSON.parse(raw);
    assert.ok(parsed.v === 1, 'envelope version');
    assert.ok(parsed.payload, 'payload present');
    assert.ok(parsed.signature, 'signature present');
    assert.ok(parsed.publicKey, 'publicKey present');
    assert.ok(parsed.hubId, 'hubId present');
  });

  it('import verifies and merges signed packet', () => {
    execSync('node scripts/sneakernet.js export --out ' + PACKET_PATH, { encoding: 'utf8', env: makeEnv() });
    const importDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agni-sn-import-'));
    const result = execSync('node scripts/sneakernet.js import --in ' + PACKET_PATH, {
      encoding: 'utf8',
      env: { ...makeEnv(), AGNI_DATA_DIR: importDir }
    });
    assert.ok(/Merged remote summary/.test(result));
  });

  it('import rejects tampered signed packet', () => {
    execSync('node scripts/sneakernet.js export --out ' + PACKET_PATH, { encoding: 'utf8', env: makeEnv() });
    const raw = fs.readFileSync(PACKET_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    parsed.payload = parsed.payload.slice(0, -2) + 'xx';
    fs.writeFileSync(PACKET_PATH, JSON.stringify(parsed), 'utf8');

    const rejectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agni-sn-reject-'));
    let err;
    try {
      execSync('node scripts/sneakernet.js import --in ' + PACKET_PATH, {
        encoding: 'utf8',
        env: { ...makeEnv(), AGNI_DATA_DIR: rejectDir }
      });
    } catch (e) {
      err = e;
    }
    assert.ok(err, 'should exit with error');
    assert.ok(/Signature verification failed|Exit status/.test(String(err.stderr || err.message)));
  });
});
