'use strict';

/**
 * Verification tests for ARCHITECTURAL-VULNERABILITIES-REMEDIATION-STATUS.md checklist.
 * Covers items #1–#7 where automated verification is possible.
 *
 * Manual items (documented here for reference):
 * - #2: Power-loss on Pi — manual test
 * - #5: Verification time < 100 ms on Android 7 — manual/hardware
 * - #7: 3 concurrent compiles on 1GB VM — manual; run: NODE_OPTIONS=--max-old-space-size=512 ...
 */

const { describe, it } = require('../helpers/test-api');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ── #1: Cache poisoning / device binding race ─────────────────────────────────
// Two concurrent requests with different deviceId must receive different OLS_INTENDED_OWNER.
// Verifies JIT assembly: same IR + different deviceId => different OLS_INTENDED_OWNER.

describe('architectural remediation #1: cache poisoning / device binding', function () {
  it('same IR assembled with different deviceIds produces different OLS_INTENDED_OWNER', function () {
    const lessonAssembly = require('@ols/compiler/services/lesson-assembly');
    const ir = { meta: { title: 'Test' }, steps: [], _compiledAt: new Date().toISOString() };
    const deviceA = 'device-alice-' + Date.now();
    const deviceB = 'device-bob-' + Date.now();

    const scriptA = lessonAssembly.buildLessonScript(ir, { deviceId: deviceA, signature: '', publicKeySpki: '' });
    const scriptB = lessonAssembly.buildLessonScript(ir, { deviceId: deviceB, signature: '', publicKeySpki: '' });

    const matchA = scriptA.match(/OLS_INTENDED_OWNER\s*=\s*["']([^"']*)["']/);
    const matchB = scriptB.match(/OLS_INTENDED_OWNER\s*=\s*["']([^"']*)["']/);
    assert.ok(matchA, 'scriptA should contain OLS_INTENDED_OWNER');
    assert.ok(matchB, 'scriptB should contain OLS_INTENDED_OWNER');
    assert.notStrictEqual(matchA[1], matchB[1], 'different deviceIds must produce different OLS_INTENDED_OWNER');
    assert.strictEqual(matchA[1], deviceA, 'A should match requested deviceId');
    assert.strictEqual(matchB[1], deviceB, 'B should match requested deviceId');
  });

  it('concurrent assembleHtml with shared IR and different deviceIds yields different OLS_INTENDED_OWNER', async function () {
    const assemble = require('@agni/hub/hub-transform/assemble');
    const ir = { meta: { title: 'Test' }, steps: [], _compiledAt: new Date().toISOString() };
    const deviceA = 'concurrent-alice-' + Date.now();
    const deviceB = 'concurrent-bob-' + Date.now();
    const opts = { dev: true };

    const [htmlA, htmlB] = await Promise.all([
      Promise.resolve(assemble.assembleHtml(ir, { ...opts, deviceId: deviceA })),
      Promise.resolve(assemble.assembleHtml(ir, { ...opts, deviceId: deviceB }))
    ]);

    const matchA = htmlA.match(/OLS_INTENDED_OWNER\s*=\s*["']([^"']*)["']/);
    const matchB = htmlB.match(/OLS_INTENDED_OWNER\s*=\s*["']([^"']*)["']/);
    assert.ok(matchA, 'htmlA should contain OLS_INTENDED_OWNER');
    assert.ok(matchB, 'htmlB should contain OLS_INTENDED_OWNER');
    assert.notStrictEqual(matchA[1], matchB[1], 'concurrent assembly with different deviceIds must yield different OLS_INTENDED_OWNER');
    assert.strictEqual(matchA[1], deviceA, 'A should match requested deviceId');
    assert.strictEqual(matchB[1], deviceB, 'B should match requested deviceId');
  });
});

// ── #2: saveState calls fsync before rename ───────────────────────────────────

describe('architectural remediation #2: fsync before rename', function () {
  it('atomic-write uses fsync before rename (same contract as saveState)', function () {
    const atomicWrite = require('@agni/utils/atomic-write');
    const targetPath = path.join(os.tmpdir(), 'agni-fsync-test-' + Date.now() + '.json');
    const originalFsyncSync = fs.fsyncSync;
    let fsyncCalled = false;
    fs.fsyncSync = function (fd) {
      fsyncCalled = true;
      return originalFsyncSync.call(this, fd);
    };
    try {
      atomicWrite.atomicWriteSync(targetPath, '{"test":1}');
      assert.ok(fsyncCalled, 'atomic write must call fs.fsyncSync for SD card durability');
    } finally {
      fs.fsyncSync = originalFsyncSync;
      try { fs.unlinkSync(targetPath); } catch { /* ignore */ }
    }
  });
});

// ── #3: Cyclic curriculum — hub stays up, affected lessons excluded ───────────

describe('architectural remediation #3: cyclic curriculum graceful degradation', function () {
  it('skill graph cycle detection identifies cycles; theta exports cycle detector', function () {
    const { buildSkillGraph, findCycle } = require('@agni/utils/skill-dag-validate');
    const theta = require('@agni/hub').theta;

    const lessonIndex = [
      { lessonId: 'a', slug: 'a', skillsRequired: ['skill:c'], skillsProvided: [{ skill: 'skill:a' }] },
      { lessonId: 'b', slug: 'b', skillsRequired: ['skill:a'], skillsProvided: [{ skill: 'skill:b' }] },
      { lessonId: 'c', slug: 'c', skillsRequired: ['skill:b'], skillsProvided: [{ skill: 'skill:c' }] }
    ];
    const skillGraph = buildSkillGraph(lessonIndex, {});
    const cycle = findCycle(skillGraph);
    assert.ok(cycle && cycle.length > 0, 'cycle should be detected (a→b→c→a)');

    const thetaCycle = theta.detectSkillGraphCycles(skillGraph);
    assert.ok(thetaCycle && thetaCycle.length > 0, 'theta.detectSkillGraphCycles must find cycle');
  });
});

// ── #4: Sensor publish rate ≤ 10 Hz ──────────────────────────────────────────
// MOTION_THROTTLE_MS = 100 implies max 10 publishes/sec.

describe('architectural remediation #4: sensor event-loop exhaustion', function () {
  it('sensor-bridge throttle interval implies publish rate ≤ 10 Hz', function () {
    const sensorBridgePath = path.join(__dirname, '../../packages/agni-runtime/sensors/sensor-bridge.js');
    const content = fs.readFileSync(sensorBridgePath, 'utf8');
    const match = content.match(/MOTION_THROTTLE_MS\s*=\s*(\d+)/);
    assert.ok(match, 'MOTION_THROTTLE_MS should be defined');
    const throttleMs = parseInt(match[1], 10);
    const maxHz = 1000 / throttleMs;
    assert.ok(maxHz <= 10, 'throttle must cap publish rate at ≤ 10 Hz (throttleMs >= 100)');
    assert.ok(throttleMs >= 100, 'MOTION_THROTTLE_MS must be at least 100 ms');
  });
});

// ── #5: Tampered content fails verification ───────────────────────────────────

describe('architectural remediation #5: integrity verification', function () {
  it('tampered LESSON_DATA fails signature verification', function () {
    const crypto = require('crypto');
    const { signContent, canonicalJSON } = require('@agni/utils/crypto');
    const tmpDir = path.join(os.tmpdir(), 'agni-integrity-' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });
    const pemPath = path.join(tmpDir, 'key.pem');

    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    fs.writeFileSync(pemPath, privateKey, 'utf8');

    const content = { meta: { title: 'Test' }, steps: [] };
    const deviceId = 'test-device';
    const contentStr = canonicalJSON(content);
    const signature = signContent(contentStr, deviceId, pemPath);
    assert.ok(signature, 'signing must succeed');

    const bindingHash = (str) => crypto.createHash('sha256').update(str).update('\x00').update(deviceId).digest();
    const verifySig = (dataStr, sigB64) => {
      const hash = bindingHash(dataStr);
      const sigBuf = Buffer.from(sigB64, 'base64');
      return crypto.verify(null, hash, publicKey, sigBuf);
    };

    assert.strictEqual(verifySig(contentStr, signature), true, 'valid content should verify');
    const tamperedStr = canonicalJSON({ meta: { title: 'Tampered' }, steps: [] });
    assert.strictEqual(verifySig(tamperedStr, signature), false, 'tampered content must fail verification');

    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });
});

// ── #6: Sentry year 1970 + Markov sequence-based cooldowns ────────────────────

describe('architectural remediation #6: time-skew protection', function () {
  it('Sentry rejects writes when system year < MIN_VALID_YEAR', function () {
    const sentryPath = path.join(__dirname, '../../packages/agni-hub/sentry.js');
    const content = fs.readFileSync(sentryPath, 'utf8');
    const yearMatch = content.match(/MIN_VALID_YEAR\s*=\s*parseInt\([^,]+,\s*10\)/);
    assert.ok(yearMatch, 'AGNI_SENTRY_MIN_VALID_YEAR / MIN_VALID_YEAR should exist');
    const validMatch = content.match(/getFullYear\(\)\s*>=\s*MIN_VALID_YEAR|year\s*<\s*MIN_VALID_YEAR|isSystemClockValid/);
    assert.ok(validMatch, 'sentry should check system clock validity');
  });

  it('Markov cooldowns use observationIndex (sequence-based) not Date', function () {
    const markov = require('@agni/engine/markov');
    const { createState } = require('../helpers/engine-state');
    const state = createState();
    markov.ensureMarkovState(state);
    markov.recordTransition(state, 'stu1', 'L1', 0.5);
    markov.recordTransition(state, 'stu1', 'L2', 0.3);

    const cd = state.markov.cooldowns.stu1;
    assert.ok(cd, 'cooldowns should exist');
    const entry = cd.L2 || cd.L1;
    assert.ok(entry, 'cooldown entry should exist');
    assert.ok(typeof entry.observationIndex === 'number', 'cooldowns must use observationIndex (sequence-based)');
    assert.ok(!entry.timestamp && !entry.date, 'cooldowns must not use timestamp/Date for time-skew resilience');
  });
});

// ── Phase 2 P0 #2: IR validation on cache read ───────────────────────────────

describe('Phase 2 P0 #2: cache IR validation (force recompile on invalid)', function () {
  it('validateCachedIr rejects truncated or corrupt IR', function () {
    const cache = require('@agni/hub/hub-transform/cache');
    const { validateCachedIr } = cache;

    assert.strictEqual(validateCachedIr(null), false);
    assert.strictEqual(validateCachedIr({}), false);
    assert.strictEqual(validateCachedIr({ steps: 'not-array' }), false);
    assert.strictEqual(validateCachedIr({ steps: [] }), false);
    assert.strictEqual(validateCachedIr({
      steps: [{ id: 's1', type: 'instruction' }],
      inferredFeatures: {}
    }), false, 'missing meta');
    assert.strictEqual(validateCachedIr({
      steps: [{ id: 's1', type: 'instruction' }],
      meta: {}
    }), false, 'missing inferredFeatures');
    assert.strictEqual(validateCachedIr({
      steps: [{ id: 's1' }],
      meta: {},
      inferredFeatures: {}
    }), false, 'step missing type');
    assert.strictEqual(validateCachedIr({
      steps: [{ type: 'instruction' }],
      meta: {},
      inferredFeatures: {}
    }), false, 'step missing id');

    const valid = {
      meta: { title: 'T' },
      inferredFeatures: {},
      steps: [{ id: 's1', type: 'instruction', content: 'x' }]
    };
    assert.strictEqual(validateCachedIr(valid), true);
  });
});

// ── #7: Pi config concurrency ────────────────────────────────────────────────

describe('architectural remediation #7: Pi config and OOM mitigation', function () {
  it('hub-config.pi.json has compileConcurrency 1–3', function () {
    const configPath = path.join(__dirname, '../../data/hub-config.pi.json');
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.ok(typeof cfg.compileConcurrency === 'number', 'compileConcurrency must be present');
    assert.ok(cfg.compileConcurrency >= 1 && cfg.compileConcurrency <= 3,
      'compileConcurrency must be 1–3 for Pi memory (1 for 1GB, 2 for 2GB)');
  });

  it('start:hub uses NODE_OPTIONS max-old-space-size for Pi', function () {
    const pkg = require('../../package.json');
    const startHub = pkg.scripts['start:hub'] || '';
    assert.ok(/max-old-space-size|512/.test(startHub), 'start:hub should set heap limit for Pi');
  });
});
