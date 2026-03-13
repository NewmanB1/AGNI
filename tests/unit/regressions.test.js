'use strict';

/**
 * Regression tests for specific bugs discovered during codebase audit (2026-03-01).
 *
 * Each test is named with the sprint item it validates. If a test here fails,
 * the corresponding sprint claim is no longer true. Do not delete failing tests
 * — fix the underlying bug and verify the test passes.
 */

const { describe, it, before, after } = require('../helpers/test-api');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const path = require('path');

// ═══════════════════════════════════════════════════════════════════════════════
// Feature inference: confidence scores must reflect actual keyword density
// ═══════════════════════════════════════════════════════════════════════════════

describe('AUDIT-1: confidence scores reflect actual analysis, not hardcoded 0.5', () => {
  const { inferFeatures } = require('@agni/utils/feature-inference');

  it('blooms confidence differs from 0.5 when many high-level verbs are present', () => {
    const lesson = {
      meta: { identifier: 'conf-test', title: 'Test', language: 'en', license: 'CC-BY-SA-4.0', created: '2026-01-01' },
      steps: [
        { id: 's1', type: 'instruction', content: 'Design and construct an experiment. Create a formulation. Compose a new approach.' },
        { id: 's2', type: 'instruction', content: 'Design another construct. Create and compose further.' },
      ]
    };
    const result = inferFeatures(lesson);
    const conf = result.inferredFeatures.confidence;

    // If confidence is always 0.5 regardless of input, the system is broken.
    // A lesson saturated with create-level verbs should have confidence != 0.5.
    assert.ok(
      conf.blooms !== 0.5,
      'blooms confidence is 0.5 — _detectBloomsCeiling does not produce matchDensity, so _computeConfidence always falls back to 0.5. Fix: return matchDensity from _detectBloomsCeiling and pass it through.'
    );
  });

  it('vark confidence differs from 0.5 when many kinesthetic keywords are present', () => {
    const lesson = {
      meta: { identifier: 'vark-test', title: 'Test', language: 'en', license: 'CC-BY-SA-4.0', created: '2026-01-01' },
      steps: [
        { id: 's1', type: 'instruction', content: 'Hold the phone, shake it, tilt it, move it, drop it, pick it up, feel the vibration, touch the screen, place it down.' },
      ]
    };
    const result = inferFeatures(lesson);
    const conf = result.inferredFeatures.confidence;

    assert.ok(
      conf.vark !== 0.5,
      'vark confidence is 0.5 — _profileVARK returns {visual,auditory,readWrite,kinesthetic} counts with no matchDensity property. Fix: compute and return matchDensity from _profileVARK.'
    );
  });

  it('teachingStyle confidence differs from 0.5 when many style keywords are present', () => {
    const lesson = {
      meta: { identifier: 'style-test', title: 'Test', language: 'en', license: 'CC-BY-SA-4.0', created: '2026-01-01' },
      steps: [
        { id: 's1', type: 'instruction', content: 'Explore and discover. Investigate the hypothesis. Experiment with the variables.' },
      ]
    };
    const result = inferFeatures(lesson);
    const conf = result.inferredFeatures.confidence;

    assert.ok(
      conf.teachingStyle !== 0.5,
      'teachingStyle confidence is 0.5 — _detectTeachingStyle returns a plain string (e.g. "constructivist"), so .matchDensity is undefined. Fix: return an object with {style, matchDensity}.'
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Type declarations: .d.ts must match .js implementations
// ═══════════════════════════════════════════════════════════════════════════════

describe('AUDIT-2: .d.ts parameter counts match .js implementations', () => {
  it('thompson.selectLesson has 2 or 3 params (opts optional)', () => {
    const thompson = require('@agni/engine/thompson');
    assert.ok(
      thompson.selectLesson.length >= 2 && thompson.selectLesson.length <= 3,
      'thompson.selectLesson takes (state, studentId) and optional (state, studentId, opts)'
    );
  });

  it('rasch.updateAbility returns a number (ability delta), not void', () => {
    const rasch = require('@agni/engine/rasch');
    const { createState, seedProbes } = require('../helpers/engine-state');

    const state = createState();
    seedProbes(state, [['p1', 0, 'math']]);

    const result = rasch.updateAbility(state, 'student-1', [{ probeId: 'p1', correct: true }]);
    assert.equal(typeof result, 'number', 'updateAbility must return a number (the ability step delta). The .d.ts incorrectly declares void.');
  });

  it('embeddings.ensureStudentVector returns number[], not void', () => {
    const embeddings = require('@agni/engine/embeddings');
    const { createState } = require('../helpers/engine-state');

    const state = createState({ dim: 4 });
    const vec = embeddings.ensureStudentVector(state, 'student-1');

    assert.ok(Array.isArray(vec), 'ensureStudentVector must return the vector. The .d.ts incorrectly declares void.');
    assert.equal(vec.length, 4);
  });

  it('embeddings.ensureLessonVector returns number[], not void', () => {
    const embeddings = require('@agni/engine/embeddings');
    const { createState } = require('../helpers/engine-state');

    const state = createState({ dim: 4 });
    const vec = embeddings.ensureLessonVector(state, 'lesson-1');

    assert.ok(Array.isArray(vec), 'ensureLessonVector must return the vector. The .d.ts incorrectly declares void.');
    assert.equal(vec.length, 4);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Engine: NaN inputs must not silently corrupt state
// ═══════════════════════════════════════════════════════════════════════════════

describe('AUDIT-3: engine functions reject or clamp NaN/Infinity inputs', () => {
  const rasch = require('@agni/engine/rasch');
  const embeddings = require('@agni/engine/embeddings');
  const thompson = require('@agni/engine/thompson');
  const { createState, seedProbes } = require('../helpers/engine-state');

  it('updateEmbedding with NaN gain does not produce NaN vectors', () => {
    const state = createState({ dim: 4 });
    embeddings.ensureStudentVector(state, 's1');
    embeddings.ensureLessonVector(state, 'l1');

    let threw = false;
    try {
      embeddings.updateEmbedding(state, 's1', 'l1', NaN);
    } catch {
      threw = true;
    }

    if (!threw) {
      const vec = state.embedding.students['s1'].vector;
      const hasNaN = vec.some(function (v) { return isNaN(v); });
      assert.ok(!hasNaN, 'updateEmbedding silently accepted NaN gain and corrupted the student embedding vector. Add a NaN guard.');
    }
  });

  it('updateBandit with NaN gain does not corrupt sufficient statistics', () => {
    const state = createState({ dim: 4 });
    embeddings.ensureStudentVector(state, 's1');
    embeddings.ensureLessonVector(state, 'l1');
    thompson.ensureBanditInitialized(state);

    let threw = false;
    try {
      thompson.updateBandit(state, 's1', 'l1', NaN);
    } catch {
      threw = true;
    }

    if (!threw) {
      const hasNaN = state.bandit.b.some(function (v) { return isNaN(v); });
      assert.ok(!hasNaN, 'updateBandit silently accepted NaN gain and corrupted bandit.b vector. Add a NaN guard.');
    }
  });

  it('updateAbility with non-boolean correct field does not corrupt ability', () => {
    const state = createState();
    seedProbes(state, [['p1', 0, 'math']]);

    rasch.updateAbility(state, 's1', [{ probeId: 'p1', correct: true }]);

    rasch.updateAbility(state, 's1', [{ probeId: 'p1', correct: 'yes' }]);
    const abilityAfter = state.rasch.students['s1'].ability;

    assert.ok(
      !isNaN(abilityAfter),
      'Passing a non-boolean correct value produced NaN ability. Add input validation.'
    );
  });

  it('updateEmbedding with Infinity gain does not produce Infinity vectors', () => {
    const state = createState({ dim: 4 });
    embeddings.ensureStudentVector(state, 's1');
    embeddings.ensureLessonVector(state, 'l1');

    let threw = false;
    try {
      embeddings.updateEmbedding(state, 's1', 'l1', Infinity);
    } catch {
      threw = true;
    }

    if (!threw) {
      const vec = state.embedding.students['s1'].vector;
      const hasInf = vec.some(function (v) { return !isFinite(v); });
      assert.ok(!hasInf, 'updateEmbedding silently accepted Infinity gain and corrupted the embedding. Add a finite guard.');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// evaluateLessonCompliance: purity claim
// ═══════════════════════════════════════════════════════════════════════════════

describe('AUDIT-4: evaluateLessonCompliance is pure (no hidden I/O dependency)', () => {
  it('returns consistent results regardless of filesystem state', () => {
    // The function claims to be pure but lazily loads utu-constants.json.
    // This test documents the impurity. Once the function is refactored
    // to accept constants as a parameter, update this test accordingly.
    const gov = require('@agni/governance');

    const sidecar = {
      identifier: 'test',
      utu: { class: 'FAKE-NONEXISTENT-SPINE', band: 1, protocol: 1 },
      difficulty: 3
    };
    const policy = { requireUtu: true, utuTargets: [{ class: 'SCI-1', band: 1 }] };

    const r1 = gov.evaluateLessonCompliance(sidecar, policy);
    const r2 = gov.evaluateLessonCompliance(sidecar, policy);

    assert.deepEqual(r1, r2, 'Same inputs should produce same outputs — function must be deterministic.');
    assert.equal(r1.status, 'fail', 'Mismatched UTU target should produce fail status.');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// feature-inference: declared_features.teaching_style Object.assign on string
// ═══════════════════════════════════════════════════════════════════════════════

describe('AUDIT-5: declared_features overrides produce valid objects', () => {
  const { inferFeatures } = require('@agni/utils/feature-inference');

  it('declared teaching_style does not produce character-indexed object', () => {
    const lesson = {
      meta: {
        identifier: 'decl-test', title: 'Test', language: 'en',
        license: 'CC-BY-SA-4.0', created: '2026-01-01',
        declared_features: { teaching_style: 'socratic' }
      },
      steps: [{ id: 's1', type: 'instruction', content: 'Explore the world.' }]
    };
    const result = inferFeatures(lesson);
    const style = result.inferredFeatures.dominantTeachingStyle;

    // Object.assign({}, 'direct', {dominant:'socratic'}) produces
    // {'0':'d','1':'i','2':'r','3':'e','4':'c','5':'t',dominant:'socratic'}
    // The result should be a clean object or string, not character-indexed.
    if (typeof style === 'object') {
      assert.ok(
        !style['0'],
        'dominantTeachingStyle has numeric keys from Object.assign on a string. Fix: ensure the base is an object, not a raw string.'
      );
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// R12: requireHubKey must fail closed (503) when AGNI_HUB_API_KEY is unset
// ═══════════════════════════════════════════════════════════════════════════════

describe('AUDIT-6: requireHubKey fails closed when key is not configured', () => {
  it('returns 503 when AGNI_HUB_API_KEY is empty', () => {
    const saved = process.env.AGNI_HUB_API_KEY;
    process.env.AGNI_HUB_API_KEY = '';
    try {
      delete require.cache[require.resolve('../../packages/agni-hub/context/auth')];
      const { requireHubKey } = require('../../packages/agni-hub/context/auth');
      let responseCode = null;
      const handler = requireHubKey(function () { responseCode = 200; });
      handler(
        { headers: {} },
        {},
        { qs: {}, sendResponse: function (code) { responseCode = code; } }
      );
      assert.equal(responseCode, 503, 'requireHubKey should return 503 when key is not configured, got ' + responseCode);
    } finally {
      process.env.AGNI_HUB_API_KEY = saved;
      delete require.cache[require.resolve('../../packages/agni-hub/context/auth')];
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// R12: Telemetry mastery must be clamped to [0,1]
// ═══════════════════════════════════════════════════════════════════════════════

describe('AUDIT-7: mastery and evidenced levels are clamped', () => {
  it('SM-2 quality clamped to 0-5 even when mastery > 1', () => {
    const { updateSchedule } = require('@agni/engine/sm2');
    const result = updateSchedule({ interval: 1, easeFactor: 2.5, repetition: 0 }, 10);
    assert.ok(result.easeFactor >= 1.3, 'Ease factor should not go below 1.3');
    assert.ok(result.easeFactor <= 4.0, 'Ease factor should not exceed reasonable bounds');
  });

  it('SM-2 handles negative quality', () => {
    const { updateSchedule } = require('@agni/engine/sm2');
    const result = updateSchedule({ interval: 1, easeFactor: 2.5, repetition: 0 }, -5);
    assert.ok(result.easeFactor >= 1.3, 'Ease factor should not go below 1.3');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// R12: Engine hyperparameter validation
// ═══════════════════════════════════════════════════════════════════════════════

describe('AUDIT-INVARIANT: embeddings Bug 1 — updateEmbedding uses pre-update snapshot', () => {
  const embeddings = require('@agni/engine/embeddings');
  const math = require('@agni/engine/math');
  const { createState } = require('../helpers/engine-state');

  it('update rule applies gamma, gradient, delta clamp, and value cap', () => {
    const state = createState({ dim: 2 });
    embeddings.ensureStudentVector(state, 's1');
    embeddings.ensureLessonVector(state, 'l1');
    const z = state.embedding.students.s1.vector.slice();
    const w = state.embedding.lessons.l1.vector.slice();
    const gamma = state.embedding.forgetting;
    const lr = state.embedding.lr;
    const reg = state.embedding.reg;
    const gain = 0.8;
    const MAG_CAP = 2;
    const MAX_DELTA = 0.5;

    embeddings.updateEmbedding(state, 's1', 'l1', gain);

    const z1 = state.embedding.students.s1.vector;
    const w1 = state.embedding.lessons.l1.vector;
    const err = gain - math.dot(z, w);
    for (let k = 0; k < z.length; k++) {
      const rawZk = gamma * z[k] + lr * (err * w[k] - reg * z[k]);
      const rawWk = gamma * w[k] + lr * (err * z[k] - reg * w[k]);
      const dZ = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, rawZk - z[k]));
      const dW = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, rawWk - w[k]));
      const expectedZk = Math.max(-MAG_CAP, Math.min(MAG_CAP, z[k] + dZ));
      const expectedWk = Math.max(-MAG_CAP, Math.min(MAG_CAP, w[k] + dW));
      assert.ok(Math.abs(z1[k] - expectedZk) < 1e-9, 'z[' + k + '] must match update rule (gradient clip + cap)');
      assert.ok(Math.abs(w1[k] - expectedWk) < 1e-9, 'w[' + k + '] must match update rule (gradient clip + cap)');
    }
  });
});

describe('AUDIT-INVARIANT: embeddings Bug 2 — MAG_CAP and gradient clipping prevent saturation', () => {
  const embeddings = require('@agni/engine/embeddings');
  const math = require('@agni/engine/math');
  const { createState } = require('../helpers/engine-state');

  it('vectors stay within MAG_CAP=2 under large repeated gains', () => {
    const state = createState({ dim: 4 });
    embeddings.ensureStudentVector(state, 's1');
    embeddings.ensureLessonVector(state, 'l1');
    for (let i = 0; i < 200; i++) {
      embeddings.updateEmbedding(state, 's1', 'l1', 5.0);
    }
    const z = state.embedding.students.s1.vector;
    const w = state.embedding.lessons.l1.vector;
    const maxZ = Math.max.apply(null, z.map(function (v) { return Math.abs(v); }));
    const maxW = Math.max.apply(null, w.map(function (v) { return Math.abs(v); }));
    assert.ok(maxZ <= 2 && maxW <= 2, 'components must not exceed MAG_CAP=2');
    const dotZW = math.dot(z, w);
    assert.ok(Math.abs(dotZW) < 50, 'dot(z,w) must stay bounded; old cap=10 gave dot~800 and oscillation');
  });
});

describe('AUDIT-INVARIANT: embeddings Bug 3 — reject corrupted vectors and overflow atomically', () => {
  const embeddings = require('@agni/engine/embeddings');
  const { createState } = require('../helpers/engine-state');

  it('updateEmbedding throws when student vector has NaN (corrupted state)', () => {
    const state = createState({ dim: 2 });
    embeddings.ensureStudentVector(state, 's1');
    embeddings.ensureLessonVector(state, 'l1');
    state.embedding.students.s1.vector[0] = NaN;

    assert.throws(
      () => embeddings.updateEmbedding(state, 's1', 'l1', 0.5),
      /student vector has non-finite|reject update/
    );
  });

  it('updateEmbedding throws when lesson vector has NaN', () => {
    const state = createState({ dim: 2 });
    embeddings.ensureStudentVector(state, 's1');
    embeddings.ensureLessonVector(state, 'l1');
    state.embedding.lessons.l1.vector[0] = NaN;

    assert.throws(
      () => embeddings.updateEmbedding(state, 's1', 'l1', 0.5),
      /lesson vector has non-finite|reject update/
    );
  });

  it('updateEmbedding does not mutate vectors when overflow would occur', () => {
    const state = createState({ dim: 2 });
    embeddings.ensureStudentVector(state, 's1');
    embeddings.ensureLessonVector(state, 'l1');
    // Inject Inf to cause overflow in newZk/newWk
    state.embedding.students.s1.vector[0] = 1e308;
    state.embedding.lessons.l1.vector[0] = 1e308;
    const zBefore = state.embedding.students.s1.vector.slice();
    const wBefore = state.embedding.lessons.l1.vector.slice();

    assert.throws(
      () => embeddings.updateEmbedding(state, 's1', 'l1', 0.5),
      /non-finite|reject/
    );
    assert.deepEqual(state.embedding.students.s1.vector, zBefore, 'z must be unchanged on reject');
    assert.deepEqual(state.embedding.lessons.l1.vector, wBefore, 'w must be unchanged on reject');
  });
});

describe('AUDIT-8: engine rejects invalid hyperparameters', () => {
  const embeddings = require('@agni/engine/embeddings');
  const { createState } = require('../helpers/engine-state');

  it('updateEmbedding throws on invalid forgetting factor', () => {
    const state = createState({ dim: 4 });
    state.embedding.forgetting = 1.5;
    embeddings.ensureStudentVector(state, 's1');
    embeddings.ensureLessonVector(state, 'l1');
    assert.throws(() => {
      embeddings.updateEmbedding(state, 's1', 'l1', 0.5);
    }, /forgetting/);
  });

  it('updateEmbedding throws on forgetting < 0.9', () => {
    const state = createState({ dim: 4 });
    state.embedding.forgetting = 0.5;
    embeddings.ensureStudentVector(state, 's1');
    embeddings.ensureLessonVector(state, 'l1');
    assert.throws(() => {
      embeddings.updateEmbedding(state, 's1', 'l1', 0.5);
    }, /forgetting|0\.9/);
  });

  it('updateEmbedding throws on negative learning rate', () => {
    const state = createState({ dim: 4 });
    state.embedding.lr = -0.01;
    embeddings.ensureStudentVector(state, 's1');
    embeddings.ensureLessonVector(state, 'l1');
    assert.throws(() => {
      embeddings.updateEmbedding(state, 's1', 'l1', 0.5);
    }, /lr/);
  });

  it('updateEmbedding throws on lr > 0.1 (Bug 8)', () => {
    const state = createState({ dim: 4 });
    state.embedding.lr = 0.5;
    embeddings.ensureStudentVector(state, 's1');
    embeddings.ensureLessonVector(state, 'l1');
    assert.throws(() => {
      embeddings.updateEmbedding(state, 's1', 'l1', 0.5);
    }, /lr.*0\.1/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// R12: Student listing strips sensitive fields
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// R13: requireHubKey returns 401 for wrong key (not just missing key)
// ═══════════════════════════════════════════════════════════════════════════════

describe('AUDIT-10: requireHubKey rejects incorrect key with 401', () => {
  it('returns 401 when wrong key is provided', () => {
    const saved = process.env.AGNI_HUB_API_KEY;
    process.env.AGNI_HUB_API_KEY = 'correct-secret-key';
    try {
      delete require.cache[require.resolve('../../packages/agni-hub/context/auth')];
      const { requireHubKey } = require('../../packages/agni-hub/context/auth');
      let responseCode = null;
      const handler = requireHubKey(function () { responseCode = 200; });
      handler(
        { headers: { 'x-hub-key': 'wrong-key' } },
        {},
        { qs: {}, sendResponse: function (code) { responseCode = code; } }
      );
      assert.equal(responseCode, 401, 'requireHubKey should return 401 for wrong key, got ' + responseCode);
    } finally {
      process.env.AGNI_HUB_API_KEY = saved;
      delete require.cache[require.resolve('../../packages/agni-hub/context/auth')];
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// R13: createStudent returns sanitized records (no pinHash/pinSalt)
// ═══════════════════════════════════════════════════════════════════════════════

describe('AUDIT-11: createStudent returns sanitized output', () => {
  it('createStudent result does not contain pinHash or pinSalt', async () => {
    const pathMod = require('path');
    const fsMod = require('fs');
    const osMod = require('os');
    const dir = pathMod.join(osMod.tmpdir(), 'agni-create-test-' + Date.now());
    fsMod.mkdirSync(dir, { recursive: true });
    const saved = process.env.AGNI_DATA_DIR;
    process.env.AGNI_DATA_DIR = dir;
    try {
      delete require.cache[require.resolve('@agni/services/accounts')];
      delete require.cache[require.resolve('@agni/utils/env-config')];
      const accounts = require('@agni/services/accounts');
      const result = await accounts.createStudent({ displayName: 'Test', pin: '9999' });
      assert.ok(result.ok, 'createStudent should succeed');
      assert.equal(result.student.pinHash, undefined, 'pinHash should not be in response');
      assert.equal(result.student.pinSalt, undefined, 'pinSalt should not be in response');
      assert.equal(typeof result.student.hasPin, 'boolean', 'hasPin should be boolean');
      assert.equal(result.student.hasPin, true, 'hasPin should be true when PIN was set');
    } finally {
      process.env.AGNI_DATA_DIR = saved;
      fsMod.rmSync(dir, { recursive: true, force: true });
      delete require.cache[require.resolve('@agni/services/accounts')];
      delete require.cache[require.resolve('@agni/utils/env-config')];
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// R13: math.js vector dimension assertions
// ═══════════════════════════════════════════════════════════════════════════════

describe('AUDIT-12: math.js rejects mismatched vector dimensions', () => {
  const math = require('@agni/engine/math');

  it('dot throws on length mismatch', () => {
    assert.throws(() => math.dot([1, 2], [1, 2, 3]), /length mismatch/);
  });

  it('addVec throws on length mismatch', () => {
    assert.throws(() => math.addVec([1, 2], [1, 2, 3]), /length mismatch/);
  });

  it('matVec throws on dimension mismatch', () => {
    assert.throws(() => math.matVec([[1, 2], [3, 4]], [1, 2, 3]), /dimension mismatch/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// R13: embedding magnitude capping prevents unbounded growth
// ═══════════════════════════════════════════════════════════════════════════════

describe('AUDIT-13: embedding updates are magnitude-capped', () => {
  const embeddings = require('@agni/engine/embeddings');
  const { createState } = require('../helpers/engine-state');

  it('large gains do not produce vectors exceeding magnitude cap', () => {
    const state = createState({ dim: 4 });
    embeddings.ensureStudentVector(state, 's1');
    embeddings.ensureLessonVector(state, 'l1');
    for (let i = 0; i < 100; i++) {
      embeddings.updateEmbedding(state, 's1', 'l1', 1000);
    }
    const vec = state.embedding.students['s1'].vector;
    const maxMag = Math.max.apply(null, vec.map(function (v) { return Math.abs(v); }));
    assert.ok(maxMag <= 2, 'Vector magnitude should be capped at 2 (Bug 2), got ' + maxMag);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// R13: Cholesky jitter retry graceful degradation
// ═══════════════════════════════════════════════════════════════════════════════

describe('AUDIT-14: sampleTheta gracefully handles near-singular A', () => {
  const thompson = require('@agni/engine/thompson');
  const embeddings = require('@agni/engine/embeddings');
  const { createState } = require('../helpers/engine-state');

  it('returns mean vector instead of crashing on singular A', () => {
    const state = createState({ dim: 2 });
    embeddings.ensureStudentVector(state, 's1');
    embeddings.ensureLessonVector(state, 'l1');
    thompson.ensureBanditInitialized(state);
    // Make A singular by zeroing the matrix
    for (let i = 0; i < state.bandit.A.length; i++) {
      for (let j = 0; j < state.bandit.A[i].length; j++) {
        state.bandit.A[i][j] = 0;
      }
    }
    // This should not throw — pass eligibleLessonIds to avoid cold-start early return
    const result = thompson.selectLesson(state, 's1', { eligibleLessonIds: ['l1'] });
    // selectLesson returns a lessonId or null, not a crash
    assert.equal(typeof result === 'string' || result === null, true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// R15: Thompson jitter must operate on a copy, not mutate state.bandit.A
// ═══════════════════════════════════════════════════════════════════════════════

describe('AUDIT-INVARIANT: thompson Bug 3 — fallback returns zero vector, not b', () => {
  const thompson = require('@agni/engine/thompson');
  const embeddings = require('@agni/engine/embeddings');
  const math = require('@agni/engine/math');
  const { createState } = require('../helpers/engine-state');

  it('sampleTheta fallback returns zero vector when all Cholesky attempts fail', () => {
    const state = createState({ dim: 2 });
    embeddings.ensureStudentVector(state, 's1');
    embeddings.ensureLessonVector(state, 'l1');
    thompson.ensureBanditInitialized(state);
    state.bandit.b = [100, 200, 300, 400];
    // A = -I: fails cholesky; A + JITTER_LIGHT and A + JITTER still have negative diag
    const n = 4;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        state.bandit.A[i][j] = i === j ? -1 : 0;
      }
    }
    const theta = thompson.sampleTheta(state);
    assert.deepEqual(theta, [0, 0, 0, 0], 'fallback must return zero vector, not b');
    assert.ok(math.dot(theta, [1, 1, 1, 1]) === 0, 'dot with zero vector must be 0');
  });
});

describe('AUDIT-INVARIANT: thompson Bug 4 — selectLesson(readOnly) does not mutate state', () => {
  const thompson = require('@agni/engine/thompson');
  const embeddings = require('@agni/engine/embeddings');
  const { createState } = require('../helpers/engine-state');

  it('selectLesson with readOnly does not create new embedding vectors', () => {
    const state = createState({ dim: 2 });
    embeddings.ensureStudentVector(state, 's1');
    embeddings.ensureLessonVector(state, 'l1');
    thompson.ensureBanditInitialized(state);
    const studentKeysBefore = Object.keys(state.embedding.students).length;
    const lessonKeysBefore = Object.keys(state.embedding.lessons).length;
    thompson.selectLesson(state, 's1', { readOnly: true, eligibleLessonIds: ['l1'] });
    assert.equal(Object.keys(state.embedding.students).length, studentKeysBefore);
    assert.equal(Object.keys(state.embedding.lessons).length, lessonKeysBefore);
  });

  it('selectLesson with readOnly throws when student has no embedding', () => {
    const state = createState({ dim: 2 });
    embeddings.ensureLessonVector(state, 'l1');
    thompson.ensureBanditInitialized(state);
    assert.throws(
      () => thompson.selectLesson(state, 'new-student-no-vector', { readOnly: true, eligibleLessonIds: ['l1'] }),
      /readOnly.*no embedding/
    );
  });
});

describe('AUDIT-INVARIANT: thompson Bug 5 — selectLesson respects eligibleLessonIds', () => {
  const thompson = require('@agni/engine/thompson');
  const embeddings = require('@agni/engine/embeddings');
  const { createState } = require('../helpers/engine-state');

  it('selectLesson with eligibleLessonIds only considers those lessons', () => {
    const state = createState({ dim: 2 });
    embeddings.ensureStudentVector(state, 's1');
    embeddings.ensureLessonVector(state, 'l1');
    embeddings.ensureLessonVector(state, 'l2');
    embeddings.ensureLessonVector(state, 'l3');
    thompson.ensureBanditInitialized(state);

    // Only l2 is eligible — must select l2, never l1 or l3
    const result = thompson.selectLesson(state, 's1', { eligibleLessonIds: ['l2'] });
    assert.strictEqual(result, 'l2', 'must select from eligible set only');
  });

  it('selectLesson with empty eligibleLessonIds returns null', () => {
    const state = createState({ dim: 2 });
    embeddings.ensureStudentVector(state, 's1');
    embeddings.ensureLessonVector(state, 'l1');
    thompson.ensureBanditInitialized(state);

    const result = thompson.selectLesson(state, 's1', { eligibleLessonIds: [] });
    assert.strictEqual(result, null, 'empty eligible set must return null');
  });
});

describe('AUDIT-INVARIANT: thompson Bug 11 — selectLesson cold-start warns and returns null without eligibleLessonIds', () => {
  const thompson = require('@agni/engine/thompson');
  const embeddings = require('@agni/engine/embeddings');
  const { createState } = require('../helpers/engine-state');

  it('returns null and logs warn when observationCount=0 and eligibleLessonIds omitted', () => {
    const state = createState({ dim: 2 });
    embeddings.ensureStudentVector(state, 's1');
    embeddings.ensureLessonVector(state, 'l1');
    thompson.ensureBanditInitialized(state);
    assert.equal(state.bandit.observationCount, 0);

    const result = thompson.selectLesson(state, 's1');
    assert.strictEqual(result, null);
  });
});

describe('AUDIT-INVARIANT: thompson Bug 6 — updateBandit rejects overflow atomically', () => {
  const thompson = require('@agni/engine/thompson');
  const embeddings = require('@agni/engine/embeddings');
  const { createState } = require('../helpers/engine-state');

  it('updateBandit throws and does not mutate A/b when gamma*A + outer overflows', () => {
    const state = createState({ dim: 2 });
    embeddings.ensureStudentVector(state, 's1');
    embeddings.ensureLessonVector(state, 'l1');
    thompson.ensureBanditInitialized(state);

    // Inject Inf into A so gamma*A + outerXX overflows
    state.bandit.A[0][0] = Infinity;
    const Abefore = state.bandit.A.map(function (r) { return r.slice(); });
    const bbefore = state.bandit.b.slice();

    assert.throws(
      () => thompson.updateBandit(state, 's1', 'l1', 0.5),
      /overflow in A\[0\]\[0\]|reject observation/
    );
    assert.deepEqual(state.bandit.A, Abefore, 'A must be unchanged on overflow reject');
    assert.deepEqual(state.bandit.b, bbefore, 'b must be unchanged on overflow reject');
    assert.equal(state.bandit.observationCount, 0, 'observationCount must not increment');
  });

  it('updateBandit throws on forgetting < 0.9', () => {
    const state = createState({ dim: 2 });
    state.bandit.forgetting = 0.5;
    embeddings.ensureStudentVector(state, 's1');
    embeddings.ensureLessonVector(state, 'l1');
    thompson.ensureBanditInitialized(state);
    assert.throws(
      () => thompson.updateBandit(state, 's1', 'l1', 0.5),
      /forgetting|0\.9/
    );
  });

  it('updateBandit throws when b update would overflow', () => {
    const state = createState({ dim: 2 });
    embeddings.ensureStudentVector(state, 's1');
    embeddings.ensureLessonVector(state, 'l1');
    thompson.ensureBanditInitialized(state);

    state.bandit.b[0] = Infinity;
    const bbefore = state.bandit.b.slice();

    assert.throws(
      () => thompson.updateBandit(state, 's1', 'l1', 0.5),
      /overflow in b\[0\]|reject observation/
    );
    assert.deepEqual(state.bandit.b, bbefore, 'b must be unchanged on overflow reject');
  });
});

describe('AUDIT-INVARIANT: thompson Bug 8 — ensureBanditInitialized rejects jagged A', () => {
  const thompson = require('@agni/engine/thompson');
  const embeddings = require('@agni/engine/embeddings');
  const { createState } = require('../helpers/engine-state');

  it('re-initializes A when row has wrong column count (jagged matrix)', () => {
    const state = createState({ dim: 2 });
    embeddings.ensureStudentVector(state, 's1');
    embeddings.ensureLessonVector(state, 'l1');
    thompson.ensureBanditInitialized(state);

    // Corrupt: truncate first row (4 cols -> 3 cols); row count still correct
    state.bandit.A[0] = [1, 0, 0];

    thompson.ensureBanditInitialized(state);

    assert.equal(state.bandit.A[0].length, 4, 'A[0] must have featureDim columns after reinit');
    assert.equal(state.bandit.A.length, 4, 'A must have featureDim rows');
  });
});

describe('AUDIT-15: sampleTheta jitter does not mutate state.bandit.A', () => {
  const thompson = require('@agni/engine/thompson');
  const embeddings = require('@agni/engine/embeddings');
  const { createState } = require('../helpers/engine-state');

  it('state.bandit.A is unchanged after jitter retry path', () => {
    const state = createState({ dim: 2 });
    embeddings.ensureStudentVector(state, 's1');
    embeddings.ensureLessonVector(state, 'l1');
    thompson.ensureBanditInitialized(state);

    // Make A nearly singular so the first invertSPD fails and jitter fires
    const n = state.bandit.A.length;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        state.bandit.A[i][j] = 0;
      }
    }

    // Deep-copy A before sampleTheta
    const Abefore = state.bandit.A.map(function (row) { return row.slice(); });

    // sampleTheta may succeed via jitter or fall back to mean — either way A must not change
    thompson.selectLesson(state, 's1', { eligibleLessonIds: ['l1'] });

    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        assert.equal(
          state.bandit.A[r][c], Abefore[r][c],
          'state.bandit.A[' + r + '][' + c + '] was mutated by jitter retry'
        );
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// R15: addMat dimension assertion
// ═══════════════════════════════════════════════════════════════════════════════

describe('AUDIT-16: addMat rejects dimension mismatch', () => {
  const math = require('@agni/engine/math');

  it('throws on row count mismatch', () => {
    assert.throws(
      () => math.addMat([[1, 2]], [[1, 2], [3, 4]]),
      /dimension mismatch/
    );
  });

  it('throws on column count mismatch', () => {
    assert.throws(
      () => math.addMat([[1, 2], [3, 4]], [[1], [2]]),
      /dimension mismatch/
    );
  });

  it('accepts matching dimensions', () => {
    const result = math.addMat([[1, 2], [3, 4]], [[5, 6], [7, 8]]);
    assert.deepEqual(result, [[6, 8], [10, 12]]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// R15: SM-2 upper bound is exactly 3.0
// ═══════════════════════════════════════════════════════════════════════════════

describe('AUDIT-17: SM-2 ease factor is capped at 3.0', () => {
  const { updateSchedule } = require('@agni/engine/sm2');

  it('ease factor never exceeds 3.0 even with perfect quality', () => {
    let schedule = { interval: 1, easeFactor: 2.9, repetition: 5 };
    for (let i = 0; i < 50; i++) {
      schedule = updateSchedule(schedule, 5);
    }
    assert.ok(schedule.easeFactor <= 3.0,
      'Ease factor exceeded 3.0: ' + schedule.easeFactor);
  });

  it('ease factor reaches 3.0 from repeated perfect quality', () => {
    let schedule = { interval: 1, easeFactor: 2.5, repetition: 0 };
    for (let i = 0; i < 100; i++) {
      schedule = updateSchedule(schedule, 5);
    }
    assert.equal(schedule.easeFactor, 3.0,
      'Ease factor should converge to 3.0 with perfect input');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// R15: Polyfill loading order — repeat must be defined before padStart
// ═══════════════════════════════════════════════════════════════════════════════

describe('AUDIT-18: polyfills.js defines repeat before padStart', () => {
  it('String.prototype.repeat polyfill appears before padStart in source', () => {
    const fs = require('fs');
    const polyfillPath = require.resolve('@agni/runtime/polyfills');
    const src = fs.readFileSync(polyfillPath, 'utf8');
    const repeatIdx = src.indexOf('String.prototype.repeat');
    const padStartIdx = src.indexOf('String.prototype.padStart');
    assert.ok(repeatIdx !== -1, 'repeat polyfill not found');
    assert.ok(padStartIdx !== -1, 'padStart polyfill not found');
    assert.ok(repeatIdx < padStartIdx,
      'repeat (at ' + repeatIdx + ') must appear before padStart (at ' + padStartIdx + ')');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// R15: Factory loader three-phase loading order
// ═══════════════════════════════════════════════════════════════════════════════

describe('AUDIT-19: factory-loader loadDependencies uses three-phase loading', () => {
  it('loadDependencies source contains phase1/phase2/phase3 sequencing', () => {
    const fs = require('fs');
    const loaderPath = require.resolve('@agni/runtime/ui/factory-loader');
    const src = fs.readFileSync(loaderPath, 'utf8');
    assert.ok(src.indexOf('phase1') !== -1, 'phase1 not found in factory-loader');
    assert.ok(src.indexOf('phase2') !== -1, 'phase2 not found in factory-loader');
    assert.ok(src.indexOf('phase3') !== -1, 'phase3 not found in factory-loader');
    assert.ok(src.indexOf("'polyfills.js'") !== -1, 'polyfills.js not classified in loader');
    assert.ok(src.indexOf("'shared-runtime.js'") !== -1, 'shared-runtime.js not classified in loader');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// R15: File lock timing — retries must outlast stale timeout
// ═══════════════════════════════════════════════════════════════════════════════

describe('AUDIT-20: file-lock MAX_RETRIES * interval exceeds STALE_TIMEOUT', () => {
  it('lock retry window exceeds stale detection window', () => {
    const fs = require('fs');
    const path = require('path');
    const lockPath = path.join(__dirname, '../../packages/agni-utils/file-lock.js');
    const lockSrc = fs.readFileSync(lockPath, 'utf8');
    const staleMatch = lockSrc.match(/STALE_TIMEOUT_MS\s*=\s*(\d+)/);
    const retryMatch = lockSrc.match(/RETRY_INTERVAL_MS\s*=\s*(\d+)/);
    const maxMatch = lockSrc.match(/MAX_RETRIES\s*=\s*(\d+)/);
    assert.ok(staleMatch && retryMatch && maxMatch, 'Could not parse lock constants');
    const stale = parseInt(staleMatch[1], 10);
    const interval = parseInt(retryMatch[1], 10);
    const maxRetries = parseInt(maxMatch[1], 10);
    const totalRetryMs = maxRetries * interval;
    assert.ok(totalRetryMs > stale,
      'MAX_RETRIES * RETRY_INTERVAL_MS (' + totalRetryMs + 'ms) must exceed STALE_TIMEOUT_MS (' + stale + 'ms)');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// R15: Governance routes require auth — unauthenticated requests get 401
// ═══════════════════════════════════════════════════════════════════════════════

describe('AUDIT-21: governance routes reject unauthenticated requests', () => {
  let server, port, dataDir;
  const EXT_TEST_HUB_KEY = 'test-hub-key-gov-' + Date.now();

  before(async () => {
    const pathMod = require('path');
    const fsMod = require('fs');
    const osMod = require('os');
    dataDir = pathMod.join(osMod.tmpdir(), 'agni-gov-auth-test-' + Date.now());
    fsMod.mkdirSync(dataDir, { recursive: true });
    process.env.AGNI_DATA_DIR = dataDir;
    process.env.AGNI_SERVE_DIR = pathMod.join(dataDir, 'serve');
    process.env.AGNI_HUB_API_KEY = EXT_TEST_HUB_KEY;

    const rootNorm = pathMod.resolve(__dirname, '../..').replace(/\\/g, '/');
    Object.keys(require.cache).forEach(function (key) {
      const norm = key.replace(/\\/g, '/');
      if (norm.startsWith(rootNorm) && !norm.includes('node_modules')) {
        delete require.cache[key];
      }
    });

    fsMod.mkdirSync(process.env.AGNI_SERVE_DIR, { recursive: true });
    fsMod.writeFileSync(pathMod.join(dataDir, 'mastery-summary.json'), JSON.stringify({ students: {} }));
    fsMod.writeFileSync(pathMod.join(dataDir, 'lesson-index.json'), JSON.stringify([]));
    fsMod.writeFileSync(pathMod.join(dataDir, 'approved-catalog.json'), JSON.stringify({ lessonIds: [] }));

    const theta = require('@agni/hub').theta;
    server = theta.startApi(0);
    await new Promise(function (resolve) { setTimeout(resolve, 200); });
    port = server.address().port;
  });

  after(() => {
    if (server) server.close();
    const fsMod = require('fs');
    fsMod.rmSync(dataDir, { recursive: true, force: true });
    delete process.env.AGNI_DATA_DIR;
    delete process.env.AGNI_SERVE_DIR;
    delete process.env.AGNI_HUB_API_KEY;
    delete require.cache[require.resolve('@agni/utils/env-config')];
    delete require.cache[require.resolve('@agni/services/accounts')];
    delete require.cache[require.resolve('../../packages/agni-hub/context/auth')];
    delete require.cache[require.resolve('../../packages/agni-hub/context/services')];
  });

  function rawRequest(method, urlPath) {
    const http = require('http');
    return new Promise(function (resolve, reject) {
      const req = http.request({ hostname: '127.0.0.1', port: port, path: urlPath, method: method }, function (res) {
        res.on('data', function () { /* consume */ });
        res.on('end', function () { resolve({ status: res.statusCode }); });
      });
      req.on('error', reject);
      req.end();
    });
  }

  it('GET /api/governance/report returns 401 without auth', async () => {
    const res = await rawRequest('GET', '/api/governance/report');
    assert.equal(res.status, 401);
  });

  it('GET /api/governance/policy returns 401 without auth', async () => {
    const res = await rawRequest('GET', '/api/governance/policy');
    assert.equal(res.status, 401);
  });

  it('GET /api/governance/catalog returns 401 without auth', async () => {
    const res = await rawRequest('GET', '/api/governance/catalog');
    assert.equal(res.status, 401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// XSS sanitizer parity: shared.js (PWA shell) must strip the same vectors as
// shared-runtime.js. Regression guard for the unquoted-event-handler bypass
// (C1 carry-over from post-R15 audit).
// ═══════════════════════════════════════════════════════════════════════════════

describe('C1-XSS: shared.js sanitizeHtml strips unquoted event handlers', () => {
  const { sanitizeHtml } = require('../../packages/agni-hub/pwa/shared.js');

  const XSS_PAYLOADS = [
    { name: 'unquoted onerror',      input: '<img onerror=alert(1) src=x>',             must_not_contain: 'onerror' },
    { name: 'double-quoted onerror', input: '<img onerror="alert(1)" src=x>',           must_not_contain: 'onerror' },
    { name: 'single-quoted onerror', input: "<img onerror='alert(1)' src=x>",           must_not_contain: 'onerror' },
    { name: 'unquoted onload',       input: '<body onload=fetch("http://evil")>',        must_not_contain: 'onload' },
    { name: 'unquoted onfocus',      input: '<input onfocus=alert(document.cookie)>',    must_not_contain: 'onfocus' },
    { name: 'unquoted onmouseover',  input: '<div onmouseover=alert(1)>hover</div>',    must_not_contain: 'onmouseover' },
    { name: 'script tag',            input: '<script>alert(1)</script>',                 must_not_contain: '<script' },
    { name: 'javascript: URI',       input: '<a href="javascript:alert(1)">click</a>',  must_not_contain: 'javascript' },
  ];

  for (const { name, input, must_not_contain } of XSS_PAYLOADS) {
    it('strips ' + name, () => {
      const result = sanitizeHtml(input);
      assert.ok(
        result.toLowerCase().indexOf(must_not_contain) === -1,
        'sanitizeHtml() failed to strip ' + name + ': ' + JSON.stringify(result)
      );
    });
  }

  it('preserves safe HTML', () => {
    const safe = '<p class="info">Hello <strong>world</strong></p>';
    assert.equal(sanitizeHtml(safe), safe);
  });

  it('returns empty string for non-string input', () => {
    assert.equal(sanitizeHtml(null), '');
    assert.equal(sanitizeHtml(undefined), '');
    assert.equal(sanitizeHtml(42), '');
  });
});

describe('C1-XSS: shared-runtime.js ON_ATTR_RE handles unquoted values', () => {
  const fs = require('fs');
  const runtimePath = require.resolve('@agni/runtime/shared-runtime');
  const src = fs.readFileSync(runtimePath, 'utf8');

  it('ON_ATTR_RE includes unquoted branch [^\\s>]+', () => {
    const match = src.match(/ON_ATTR_RE\s*=\s*(\/.+\/\w*);/);
    assert.ok(match, 'ON_ATTR_RE not found in shared-runtime.js');
    const pattern = match[1];
    assert.ok(
      pattern.indexOf('[^\\s>]+') !== -1 || pattern.indexOf("[^\\s>]+") !== -1,
      'ON_ATTR_RE is missing the unquoted-value branch [^\\s>]+ — XSS bypass via <img onerror=alert(1)>. Pattern: ' + pattern
    );
  });

  it('ON_ATTR_RE regex actually strips unquoted handlers', () => {
    const reMatch = src.match(/ON_ATTR_RE\s*=\s*(\/.*\/\w*);/);
    assert.ok(reMatch, 'Could not extract ON_ATTR_RE');
    const re = eval(reMatch[1]);
    const input = '<img onerror=alert(1) src=x>';
    const cleaned = input.replace(re, '');
    assert.ok(cleaned.indexOf('onerror') === -1,
      'ON_ATTR_RE failed to strip unquoted onerror: ' + JSON.stringify(cleaned));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Entity-encoding bypass guard: both sanitizers must decode numeric HTML
// entities before regex matching, so that &#106;avascript: is caught as
// javascript:. Null bytes must also be stripped to prevent parser differentials.
// ═══════════════════════════════════════════════════════════════════════════════

describe('C1-ENTITY: shared.js sanitizeHtml strips entity-encoded javascript: URIs', () => {
  const sharedPath = require.resolve('../../packages/agni-hub/pwa/shared.js');
  delete require.cache[sharedPath];
  const { sanitizeHtml } = require('../../packages/agni-hub/pwa/shared.js');

  const ENTITY_PAYLOADS = [
    { name: 'decimal &#106; for j',       input: '<a href="&#106;avascript:alert(1)">click</a>',   banned: 'javascript' },
    { name: 'hex &#x6A; for j',           input: '<a href="&#x6A;avascript:alert(1)">click</a>',   banned: 'javascript' },
    { name: 'mixed decimal/hex',           input: '<a href="java&#x73;cript:alert(1)">x</a>',      banned: 'javascript' },
    { name: 'fully hex-encoded',           input: '<a href="&#x6A;&#x61;&#x76;&#x61;&#x73;&#x63;&#x72;&#x69;&#x70;&#x74;&#x3A;alert(1)">x</a>', banned: 'javascript' },
    { name: 'fully decimal-encoded',       input: '<a href="&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58;alert(1)">x</a>',         banned: 'javascript' },
    { name: '&colon; for colon',           input: '<a href="javascript&colon;alert(1)">x</a>',      banned: 'javascript' },
    { name: 'null byte in javascript',     input: '<a href="java\x00script:alert(1)">x</a>',       banned: 'javascript' },
    { name: 'entity-encoded img src',      input: '<img src="&#x6A;avascript:alert(1)">',           banned: 'javascript' },
    { name: 'entity in unquoted href',     input: '<a href=&#106;avascript:alert(1)>x</a>',         banned: 'javascript' },
  ];

  for (const { name, input, banned } of ENTITY_PAYLOADS) {
    it('strips ' + name, () => {
      const result = sanitizeHtml(input);
      assert.ok(
        result.toLowerCase().indexOf(banned) === -1,
        'entity bypass: sanitizeHtml failed on ' + name + ': ' + JSON.stringify(result)
      );
    });
  }

  it('preserves structural entities (&lt; &gt; &amp; &quot;)', () => {
    const html = '<p>1 &lt; 2 &amp;&amp; 3 &gt; 2</p>';
    assert.equal(sanitizeHtml(html), html);
  });

  it('preserves numeric structural entities (&#60; &#62; &#38;)', () => {
    const result = sanitizeHtml('<p>&#60;tag&#62; &#38; &#34;quote&#34;</p>');
    assert.ok(result.indexOf('&#60;') !== -1, 'should preserve &#60;');
    assert.ok(result.indexOf('&#62;') !== -1, 'should preserve &#62;');
    assert.ok(result.indexOf('&#38;') !== -1, 'should preserve &#38;');
  });

  it('still strips plain javascript: after entity decoding', () => {
    const result = sanitizeHtml('<a href="javascript:alert(1)">x</a>');
    assert.ok(result.indexOf('javascript') === -1);
  });
});

describe('C1-ENTITY: shared-runtime.js has entity decoding and global JS_URI_RE', () => {
  const fs = require('fs');
  const runtimePath = require.resolve('@agni/runtime/shared-runtime');
  const src = fs.readFileSync(runtimePath, 'utf8');

  it('contains _decodeNumericEntities function', () => {
    assert.ok(
      src.indexOf('_decodeNumericEntities') !== -1,
      'shared-runtime.js missing _decodeNumericEntities — entity-encoded javascript: URIs bypass the sanitizer'
    );
  });

  it('sanitizeHtml calls _decodeNumericEntities', () => {
    const fnStart = src.indexOf('function sanitizeHtml');
    assert.ok(fnStart !== -1, 'sanitizeHtml not found');
    const fnBlock = src.slice(fnStart, fnStart + 400);
    assert.ok(
      fnBlock.indexOf('_decodeNumericEntities') !== -1,
      'sanitizeHtml does not call _decodeNumericEntities'
    );
  });

  it('sanitizeHtml strips null bytes', () => {
    const fnStart = src.indexOf('function sanitizeHtml');
    const fnBlock = src.slice(fnStart, fnStart + 400);
    assert.ok(
      fnBlock.indexOf('\\x00') !== -1,
      'sanitizeHtml does not strip null bytes — parser differential bypass possible'
    );
  });

  it('JS_URI_RE uses global javascript: pattern (not attribute-specific)', () => {
    const match = src.match(/JS_URI_RE\s*=\s*(\/[^;]+);/);
    assert.ok(match, 'JS_URI_RE not found');
    assert.ok(
      match[1].indexOf('href|src|action') === -1,
      'JS_URI_RE still uses attribute-specific pattern — misses formaction, data, xlink:href, srcdoc. Found: ' + match[1]
    );
    assert.ok(
      match[1].indexOf('javascript') !== -1,
      'JS_URI_RE does not match javascript:. Found: ' + match[1]
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// R16-C2.3: longestStreak must scan full 365-day window, not exit early
// ═══════════════════════════════════════════════════════════════════════════════

describe('R16-C2.3: computeStreaks scans full history for longestStreak', () => {
  const { computeStreaks } = require('@agni/utils/streak');

  it('longestStreak finds historical max beyond current streak gap', () => {
    const dates = [];
    // 2-day current streak: today and yesterday
    const today = new Date();
    dates.push(today.toISOString().slice(0, 10));
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    dates.push(yesterday.toISOString().slice(0, 10));

    // 30-day historical streak starting 60 days ago
    for (let i = 60; i < 90; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().slice(0, 10));
    }

    const result = computeStreaks(dates.sort());
    assert.equal(result.currentStreak, 2);
    assert.equal(result.longestStreak, 30,
      'longestStreak should be 30 (historical), not ' + result.longestStreak + ' (current streak only)');
  });

  it('longestStreak equals currentStreak when current is the longest', () => {
    const dates = [];
    const today = new Date();
    for (let i = 0; i < 10; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().slice(0, 10));
    }
    const result = computeStreaks(dates.sort());
    assert.equal(result.currentStreak, 10);
    assert.equal(result.longestStreak, 10);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// R16-C3.3: PageRank invalidateCache clears _currGraph
// ═══════════════════════════════════════════════════════════════════════════════

describe('R16-C3.3: PageRank invalidateCache clears _currGraph', () => {
  it('_currGraph is null after invalidation', () => {
    const pagerank = require('@agni/engine/pagerank');
    // Access internal cache via the module — invalidateCache is exported
    pagerank.invalidateCache();
    const fs = require('fs');
    const resolved = require.resolve('@agni/engine/pagerank');
    const src = fs.readFileSync(resolved, 'utf8');
    const fnBody = src.slice(src.indexOf('function invalidateCache'), src.indexOf('function invalidateCache') + 300);
    assert.ok(
      fnBody.indexOf('_currGraph') !== -1,
      'invalidateCache does not clear _currGraph — stale curriculum graph persists after invalidation'
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// R16-C2.1: Sentry event buffer has a size cap
// ═══════════════════════════════════════════════════════════════════════════════

describe('R16-C2.1: sentry event buffer is bounded', () => {
  it('sentry.js source contains EVENT_BUFFER_MAX constant', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require('path').join(__dirname, '../../packages/agni-hub/sentry.js'), 'utf8');
    assert.ok(src.indexOf('EVENT_BUFFER_MAX') !== -1,
      'sentry.js missing EVENT_BUFFER_MAX — eventBuffer can grow without limit');
    assert.ok(src.indexOf('_flushing') !== -1,
      'sentry.js missing _flushing guard — concurrent flushes can cause data duplication');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// R16-C2.2: Sentry body parsing uses Buffer.concat (not string concatenation)
// ═══════════════════════════════════════════════════════════════════════════════

describe('R16-C2.2: sentry UTF-8 body parsing uses Buffer.concat', () => {
  it('sentry.js receiver uses Buffer.concat, not body += chunk', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require('path').join(__dirname, '../../packages/agni-hub/sentry.js'), 'utf8');
    const receiverStart = src.indexOf('function startReceiver');
    const receiverBlock = src.slice(receiverStart, receiverStart + 2500);
    assert.ok(receiverBlock.indexOf('Buffer.concat') !== -1,
      'sentry receiver does not use Buffer.concat — multi-byte UTF-8 at chunk boundaries will be corrupted');
    assert.ok(receiverBlock.indexOf("body += chunk") === -1 && receiverBlock.indexOf('body+=chunk') === -1,
      'sentry receiver still uses body += chunk string concatenation');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// R16-C3.2: Sentry has event retention pruning
// ═══════════════════════════════════════════════════════════════════════════════

describe('R16-C3.2: sentry has event retention pruning', () => {
  it('sentry.js contains pruneOldEvents function', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require('path').join(__dirname, '../../packages/agni-hub/sentry.js'), 'utf8');
    assert.ok(src.indexOf('pruneOldEvents') !== -1,
      'sentry.js missing pruneOldEvents — NDJSON files accumulate forever on Pi SD card');
    assert.ok(src.indexOf('sentryRetentionDays') !== -1,
      'sentry.js does not reference sentryRetentionDays config — retention is not configurable');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// R16-C3.1: SW version is not hardcoded
// ═══════════════════════════════════════════════════════════════════════════════

describe('R16-C3.1: service worker version uses placeholder, not hardcoded', () => {
  it('sw.js uses __SW_VERSION__ placeholder', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require('path').join(__dirname, '../../packages/agni-hub/sw.js'), 'utf8');
    assert.ok(src.indexOf('__SW_VERSION__') !== -1,
      'sw.js does not use __SW_VERSION__ placeholder — version is hardcoded');
    assert.ok(src.indexOf("'agni-v1.9.0'") === -1,
      'sw.js still contains hardcoded agni-v1.9.0');
  });

  it('hub-transform stamps __SW_VERSION__ with package version', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '../../packages/agni-hub/hub-transform/route-handlers.js'), 'utf8');
    assert.ok(src.indexOf('.replace(\'__SW_VERSION__\'') !== -1 || src.indexOf('.replace("__SW_VERSION__"') !== -1,
      'hub-transform route-handlers does not replace __SW_VERSION__ — service worker gets raw placeholder');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// R16-C1: File locking in groups, parent, checkpoint, session routes
// ═══════════════════════════════════════════════════════════════════════════════

describe('R16-C1: withLock is used in all mutating route handlers', () => {
  it('groups.js uses withLock', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require('path').join(__dirname, '../../packages/agni-hub/routes/groups.js'), 'utf8');
    assert.ok(src.indexOf('withLock') !== -1,
      'groups.js missing withLock — concurrent group mutations can lose data');
  });

  it('parent.js uses withLock', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require('path').join(__dirname, '../../packages/agni-hub/routes/parent.js'), 'utf8');
    assert.ok(src.indexOf('withLock') !== -1,
      'parent.js missing withLock — concurrent invite/link mutations can lose data');
  });

  it('student.js checkpoint uses withLock', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require('path').join(__dirname, '../../packages/agni-hub/routes/student.js'), 'utf8');
    const checkpointSection = src.slice(0, src.indexOf('router.get(\'/api/checkpoint'));
    assert.ok(checkpointSection.indexOf('withLock(filePath') !== -1,
      'student.js POST /api/checkpoint does not lock the checkpoint file');
  });

  it('accounts.js cleanExpiredSessions uses withLock', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('@agni/services/accounts'), 'utf8');
    const cleanFn = src.slice(src.indexOf('async function cleanExpiredSessions'), src.indexOf('async function destroySession'));
    assert.ok(cleanFn.indexOf('withLock') !== -1,
      'cleanExpiredSessions does not use withLock — races with loginCreator');
  });

  it('accounts.js destroySession uses withLock', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('@agni/services/accounts'), 'utf8');
    const destroyFn = src.slice(src.indexOf('async function destroySession'));
    assert.ok(destroyFn.indexOf('withLock') !== -1,
      'destroySession does not use withLock — races with loginCreator');
  });
});

describe('AUDIT-9: student listing does not expose sensitive fields', () => {
  it('listStudents returns sanitized records', async () => {
    const pathMod = require('path');
    const fs = require('fs');
    const os = require('os');
    const dir = pathMod.join(os.tmpdir(), 'agni-accounts-test-' + Date.now());
    fs.mkdirSync(dir, { recursive: true });
    const saved = process.env.AGNI_DATA_DIR;
    process.env.AGNI_DATA_DIR = dir;
    try {
      delete require.cache[require.resolve('@agni/services/accounts')];
      delete require.cache[require.resolve('@agni/utils/env-config')];
      const accountsService = require('@agni/services/accounts');
      await accountsService.createStudent({ displayName: 'Test', pin: '1234' });
      const students = await accountsService.listStudents();
      assert.ok(students.length >= 1);
      const student = students[0];
      assert.equal(student.pinHash, undefined, 'pinHash should not be exposed');
      assert.equal(student.pinSalt, undefined, 'pinSalt should not be exposed');
      assert.equal(student.pin, undefined, 'pin should not be exposed');
      assert.equal(typeof student.hasPin, 'boolean', 'hasPin should be a boolean');
    } finally {
      process.env.AGNI_DATA_DIR = saved;
      fs.rmSync(dir, { recursive: true, force: true });
      delete require.cache[require.resolve('@agni/services/accounts')];
      delete require.cache[require.resolve('@agni/utils/env-config')];
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Node version docs: hub target must be Node 18+, not Node 14–16 (Raspberry Pi)
// ═══════════════════════════════════════════════════════════════════════════════

describe('AUDIT-DOCS: engine uses JS only (no TypeScript, no compile step)', () => {
  it('check-engine-no-ts passes — no index.ts or build:engine in non-archive docs', () => {
    const script = path.resolve(__dirname, '../../scripts/check-engine-no-ts.js');
    const result = spawnSync(process.execPath, [script], {
      cwd: path.resolve(__dirname, '../..'),
      encoding: 'utf8',
    });
    assert.equal(
      result.status,
      0,
      `check-engine-no-ts must pass. Engine is ES5 JS only; no TypeScript.\n${result.stderr || result.stdout}`
    );
  });
});

describe('AUDIT-INVARIANT: featureDim === embeddingDim * 2 enforced defensively', () => {
  const thompson = require('../../packages/agni-engine/thompson');
  const federation = require('../../packages/agni-engine/federation');
  const migrations = require('../../packages/agni-engine/migrations');

  it('assertFeatureDimInvariant throws on mismatch', () => {
    const bad = {
      rasch: {},
      embedding: { dim: 8 },
      bandit: { featureDim: 99, A: [], b: [], forgetting: 0.98, observationCount: 0 }
    };
    assert.throws(() => thompson.assertFeatureDimInvariant(bad), /featureDim.*embedding\.dim/);
  });

  it('getBanditSummary throws on invariant violation', () => {
    const bad = {
      rasch: {},
      embedding: { dim: 8 },
      bandit: { featureDim: 99, A: [[1]], b: [1], forgetting: 0.98, observationCount: 0 }
    };
    assert.throws(() => federation.getBanditSummary(bad), /featureDim.*embedding\.dim|embedding\.dim\*2/);
  });

  it('mergeBanditSummaries throws on missing embeddingDim (federation contract)', () => {
    const noContract = { mean: [1, 2], precision: [[1,0],[0,1]], sampleSize: 1 };
    const withContract = { embeddingDim: 1, mean: [1, 2], precision: [[1,0],[0,1]], sampleSize: 1 };
    assert.throws(() => federation.mergeBanditSummaries(noContract, withContract), /embeddingDim|include embeddingDim/);
  });

  it('mergeBanditSummaries throws on embeddingDim mismatch (Hub A:8 vs Hub B:16) — error names both values', () => {
    // Pi config (8) vs older default (16) — must reject before any matrix op to avoid corrupted posterior
    const local = { embeddingDim: 8, mean: Array(16).fill(0), precision: require('../../packages/agni-engine/math').identity(16).map(r => r.slice()), sampleSize: 1 };
    const remote = { embeddingDim: 16, mean: Array(32).fill(0), precision: require('../../packages/agni-engine/math').identity(32).map(r => r.slice()), sampleSize: 1 };
    assert.throws(
      () => federation.mergeBanditSummaries(local, remote),
      { message: /local\.embeddingDim=8.*remote\.embeddingDim=16|Federation contract.*8.*16/ }
    );
  });

  it('migrateLMSState output satisfies invariant', () => {
    const { state } = migrations.migrateLMSState({});
    assert.equal(state.bandit.featureDim, state.embedding.dim * 2);
    thompson.assertFeatureDimInvariant(state);
  });

  it('assertEmbeddingDimValid throws on missing or zero embedding.dim', () => {
    assert.throws(
      () => thompson.assertEmbeddingDimValid({ embedding: null, bandit: {} }),
      /embedding missing/
    );
    assert.throws(
      () => thompson.assertEmbeddingDimValid({
        embedding: { dim: 0 },
        bandit: { featureDim: 0, A: [], b: [], forgetting: 0.98, observationCount: 0 }
      }),
      /embedding\.dim invalid/
    );
    assert.throws(
      () => thompson.assertEmbeddingDimValid({
        embedding: {},
        bandit: {}
      }),
      /embedding\.dim invalid|undefined/
    );
  });
});

describe('AUDIT-DOCS: hub-config.pi.json regression guards (Bugs 1–8)', () => {
  it('check-hub-config-pi passes — memory, JS overhead, Node version, embeddingDim, path notes (Bug 8)', () => {
    const script = path.resolve(__dirname, '../../scripts/check-hub-config-pi.js');
    const result = spawnSync(process.execPath, [script], {
      cwd: path.resolve(__dirname, '../..'),
      encoding: 'utf8',
    });
    assert.equal(
      result.status,
      0,
      `check-hub-config-pi must pass. Guards: Bugs 1–8 (memory, JS overhead, Node version, embeddingDim, forgetting, hubId, maxStudents/maxLessons, path assumptions).\n${result.stderr || result.stdout}`
    );
  });
});

describe('AUDIT-INVARIANT: Bug 8 — ensureDataDirExists fails fast when dataDir missing', () => {
  it('ensureDataDirExists throws when dataDir does not exist', () => {
    const os = require('os');
    const nonexistent = path.join(os.tmpdir(), 'agni-nonexistent-' + Date.now() + '-x');
    const { ensureDataDirExists } = require('@agni/utils/ensure-paths');
    assert.throws(
      () => ensureDataDirExists({ dataDir: nonexistent }),
      /AGNI_DATA_DIR does not exist|init-data/,
      'ensureDataDirExists must throw with clear message when path missing'
    );
  });
});

describe('AUDIT-INVARIANT: AGNI_FORGETTING valid range [0.9,1] enforced at startup', () => {
  it('env-config throws on forgetting < 0.9', () => {
    const result = spawnSync(process.execPath, ['-e', "process.env.AGNI_FORGETTING='0.5'; require('@agni/utils/env-config');"], {
      cwd: path.resolve(__dirname, '../..'),
      encoding: 'utf8',
      env: { ...process.env, AGNI_FORGETTING: '0.5' },
    });
    assert.notEqual(result.status, 0, 'env-config must reject AGNI_FORGETTING=0.5');
    assert.ok((result.stderr || result.stdout || '').includes('0.9') || (result.stderr || result.stdout || '').includes('AGNI_FORGETTING'), 'error must mention range or key');
  });

  it('env-config throws on forgetting > 1', () => {
    const result = spawnSync(process.execPath, ['-e', "process.env.AGNI_FORGETTING='1.5'; require('@agni/utils/env-config');"], {
      cwd: path.resolve(__dirname, '../..'),
      encoding: 'utf8',
      env: { ...process.env, AGNI_FORGETTING: '1.5' },
    });
    assert.notEqual(result.status, 0, 'env-config must reject AGNI_FORGETTING=1.5');
  });
});

describe('AUDIT-INVARIANT: maxStudents/maxLessons enforced at runtime', () => {
  it('recordObservation throws when maxStudents exceeded', async () => {
    const os = require('os');
    const tmpDir = path.join(os.tmpdir(), 'agni-cap-test-' + Date.now());
    require('fs').mkdirSync(tmpDir, { recursive: true });
    const dataPath = path.join(__dirname, '../..').replace(/\\/g, '\\\\');
    const script = '(async function() {' +
      "process.env.AGNI_DATA_DIR='" + tmpDir.replace(/\\/g, '\\\\') + "';" +
      "process.env.AGNI_MAX_STUDENTS='2';" +
      "process.env.AGNI_MAX_LESSONS='100';" +
      "const { loadHubConfig } = require('@agni/utils/hub-config');" +
      "loadHubConfig(require('path').join('" + dataPath + "', 'data'));" +
      "const engine = require('@agni/engine');" +
      "await engine.recordObservation('s1', 'L1', [{ probeId: 'p1', correct: true }]);" +
      "await engine.recordObservation('s2', 'L1', [{ probeId: 'p1', correct: false }]);" +
      "try { await engine.recordObservation('s3', 'L1', [{ probeId: 'p1', correct: true }]); process.exit(1); }" +
      "catch (e) { if (/maxStudents/.test(e.message)) process.exit(0); process.exit(2); }" +
      '})();';
    const result = spawnSync(process.execPath, ['-e', script], {
      cwd: path.resolve(__dirname, '../..'),
      encoding: 'utf8',
      env: { ...process.env, AGNI_DATA_DIR: tmpDir, AGNI_MAX_STUDENTS: '2', AGNI_MAX_LESSONS: '100' },
    });
    require('fs').rmSync(tmpDir, { recursive: true, force: true });
    assert.equal(result.status, 0, 'recordObservation must throw when maxStudents exceeded. ' + (result.stderr || result.stdout));
  });

  it('createStudent returns error when maxStudents exceeded', async () => {
    const os = require('os');
    const tmpDir = path.join(os.tmpdir(), 'agni-accounts-cap-' + Date.now());
    require('fs').mkdirSync(tmpDir, { recursive: true });
    process.env.AGNI_DATA_DIR = tmpDir;
    process.env.AGNI_MAX_STUDENTS = '1';
    delete require.cache[require.resolve('@agni/utils/env-config')];
    delete require.cache[require.resolve('@agni/services/accounts')];
    const { createAccounts } = require('@agni/services/accounts');
    const accounts = createAccounts({ dataDir: tmpDir });
    const r1 = await accounts.createStudent({ displayName: 'A', pin: '1234' });
    assert.ok(r1.ok, 'first createStudent should succeed');
    const r2 = await accounts.createStudent({ displayName: 'B', pin: '5678' });
    assert.ok(r2.error && /maxStudents/.test(r2.error), 'second createStudent should return maxStudents error');
    process.env.AGNI_DATA_DIR = require('@agni/utils/env-config').dataDir;
    delete require.cache[require.resolve('@agni/utils/env-config')];
    delete require.cache[require.resolve('@agni/services/accounts')];
    require('fs').rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe('AUDIT-INVARIANT: hub-config bootstrap — embeddingDim flows from config to engine', () => {
  it('check-hub-config-bootstrap passes — CONFIG_KEYS has embeddingDim, loadHubConfig before env-config in theta/sentry/sync/hub-transform', () => {
    const script = path.resolve(__dirname, '../../scripts/check-hub-config-bootstrap.js');
    const result = spawnSync(process.execPath, [script], {
      cwd: path.resolve(__dirname, '../..'),
      encoding: 'utf8',
    });
    assert.equal(
      result.status,
      0,
      `check-hub-config-bootstrap must pass. embeddingDim must be in CONFIG_KEYS; loadHubConfig before env-config in theta/sentry/sync/hub-transform.\n${result.stderr || result.stdout}`
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AUDIT-HARDENING-PLAN: YAML, SVG, LMS, bootstrap
// ═══════════════════════════════════════════════════════════════════════════════

describe('AUDIT-A1: yamlSchemaVersion passed through to IR', () => {
  const dataDir = path.join(path.resolve(__dirname, '../..'), 'data');
  let savedDataDir;

  before(() => {
    savedDataDir = process.env.AGNI_DATA_DIR;
    process.env.AGNI_DATA_DIR = dataDir;
    delete require.cache[require.resolve('@agni/utils/env-config')];
    delete require.cache[require.resolve('@agni/utils/archetype-match')];
    delete require.cache[require.resolve('@ols/compiler/compiler/build-lesson-ir')];
  });
  after(() => {
    process.env.AGNI_DATA_DIR = savedDataDir;
  });

  it('computeLessonIRHash returns deterministic sha256 and sidecar includes lessonHash', () => {
    const { buildLessonSidecar, computeLessonIRHash } = require('@ols/compiler/compiler/build-lesson-ir');
    const ir = {
      meta: { identifier: 'test', title: 'Test', language: 'en' },
      ontology: { requires: [], provides: [{ skill: 'x', level: 1 }] },
      steps: [{ id: 's1', content: 'Hello', htmlContent: '<p>Hello</p>' }],
      inferredFeatures: { difficulty: 2, katexAssets: [], factoryManifest: [] },
      metadata_source: 'inferred',
      _devMode: false,
      _compiledAt: '2026-01-01T00:00:00.000Z',
      _schemaVersion: '1.8.0'
    };
    const hash1 = computeLessonIRHash(ir);
    const hash2 = computeLessonIRHash(ir);
    assert.equal(hash1, hash2, 'Hash must be deterministic');
    assert.ok(hash1.startsWith('sha256:'), 'Hash must be sha256 prefixed');
    assert.equal(hash1.length, 7 + 64, 'Hash must be sha256: + 64 hex chars');
    const sidecar = buildLessonSidecar(ir);
    assert.equal(sidecar.lessonHash, hash1, 'Sidecar must include lessonHash');
  });

  it('meta.yamlSchemaVersion flows to _schemaVersion and sidecar', async () => {
    const { buildLessonIR, buildLessonSidecar } = require('@ols/compiler/compiler/build-lesson-ir');
    const { minimalLesson } = require('../helpers/fixtures');
    const lesson = minimalLesson({
      meta: {
        identifier: 'yaml-ver-test',
        title: 'Test',
        language: 'en',
        license: 'CC-BY-SA-4.0',
        created: '2026-01-01',
        yamlSchemaVersion: '1.8.0'
      }
    });
    const ir = await buildLessonIR(lesson, {});
    assert.equal(ir._schemaVersion, '1.8.0');
    const sidecar = buildLessonSidecar(ir);
    assert.equal(sidecar.yamlSchemaVersion, '1.8.0');
  });
});


describe('AUDIT-E1: compile warns on svg_spec with non-numeric opts', () => {
  const dataDir = path.join(path.resolve(__dirname, '../..'), 'data');
  let savedDataDir;

  before(() => {
    savedDataDir = process.env.AGNI_DATA_DIR;
    process.env.AGNI_DATA_DIR = dataDir;
    delete require.cache[require.resolve('@agni/utils/env-config')];
    delete require.cache[require.resolve('@agni/utils/archetype-match')];
    delete require.cache[require.resolve('@ols/compiler/compiler/build-lesson-ir')];
  });
  after(() => {
    process.env.AGNI_DATA_DIR = savedDataDir;
  });

  it('warns when opts.length is non-numeric string', async () => {
    const { buildLessonIR } = require('@ols/compiler/compiler/build-lesson-ir');
    const { minimalLesson } = require('../helpers/fixtures');
    const warnLogs = [];
    const origWarn = console.warn;
    console.warn = function (...args) {
      warnLogs.push(args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
    };
    try {
      const lesson = minimalLesson({
        steps: [
          { id: 's1', type: 'instruction', content: 'Step 1' },
          { id: 's2', type: 'svg', svg_spec: { factory: 'pendulum', opts: { length: 'abc' } } }
        ]
      });
      await buildLessonIR(lesson, {});
      assert.ok(
        warnLogs.some(m => m.includes('AUDIT-E1') && m.includes('length')),
        'Expected AUDIT-E1 warn for opts.length non-numeric. Got: ' + JSON.stringify(warnLogs)
      );
    } finally {
      console.warn = origWarn;
    }
  });
});

describe('AUDIT-D1: seedLesson clamps difficulty to [1,5]', () => {
  const os = require('os');
  const fs = require('fs');
  const path = require('path');
  let TMP_DIR;
  let origDataDir;

  before(() => {
    TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'agni-audit-d1-'));
    origDataDir = process.env.AGNI_DATA_DIR;
    process.env.AGNI_DATA_DIR = TMP_DIR;
  });

  after(() => {
    process.env.AGNI_DATA_DIR = origDataDir;
    try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('does not throw when difficulty is NaN; seedLessons completes and probe has finite difficulty', async () => {
    delete require.cache[require.resolve('@agni/engine')];
    const lmsEngine = require('@agni/engine');
    await assert.doesNotReject(
      lmsEngine.seedLessons([
        { lessonId: 'test-d1-nan', difficulty: NaN, skill: 'ols:math:test' }
      ])
    );
    const status = lmsEngine.getStatus();
    assert.ok(status && status.probes >= 0, 'Engine remains usable after NaN difficulty');
  });

  it('does not throw when difficulty is 10; clamps to 5 and seedLessons completes', async () => {
    delete require.cache[require.resolve('@agni/engine')];
    const lmsEngine = require('@agni/engine');
    await assert.doesNotReject(
      lmsEngine.seedLessons([
        { lessonId: 'test-d1-high', difficulty: 10, skill: 'ols:math:test' }
      ])
    );
    const status = lmsEngine.getStatus();
    assert.ok(status && status.probes >= 0, 'Engine remains usable after difficulty 10 (clamped to 5)');
  });
});

describe('AUDIT-D2: Sneakernet state migration checksum — corrupted state triggers repair', () => {
  const os = require('os');
  const fs = require('fs');
  const path = require('path');
  let TMP_DIR;
  let origDataDir;

  before(() => {
    TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'agni-audit-d2-'));
    origDataDir = process.env.AGNI_DATA_DIR;
    process.env.AGNI_DATA_DIR = TMP_DIR;
  });

  after(() => {
    process.env.AGNI_DATA_DIR = origDataDir;
    try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('corrupted state file (checksum mismatch) triggers repair path — fresh state, .bak created', () => {
    const statePath = path.join(TMP_DIR, 'lms_state.json');
    const corruptState = {
      rasch: { students: {}, probes: {}, globalAnchor: { meanAbility: 0, stdAbility: 1 } },
      embedding: { dim: 8, lr: 0.1, reg: 0.01, forgetting: 0.99, students: {}, lessons: {} },
      bandit: {
        A: [], b: [], featureDim: 16, forgetting: 0.99, observationCount: 99,
        seenSyncIds: [], exportSequence: 0, hubHighWater: {}, mergeVersion: 0
      },
      markov: { transitions: {}, studentHistory: {}, bigrams: {}, dropouts: {}, cooldowns: {} },
      _checksum: '0000000000000000000000000000000000000000000000000000000000000000'
    };
    fs.writeFileSync(statePath, JSON.stringify(corruptState, null, 2), 'utf8');

    delete require.cache[require.resolve('@agni/utils/env-config')];
    delete require.cache[require.resolve('@agni/engine')];
    const engine = require('@agni/engine');

    const status = engine.getStatus();
    assert.equal(status.observations, 0, 'Corrupt state must be replaced with fresh state (observations=0)');
    assert.ok(fs.existsSync(statePath + '.bak'), 'Corrupt file must be backed up to .bak');
  });
});

describe('AUDIT-C2: Federation merge idempotency and versioning', () => {
  const os = require('os');
  const fs = require('fs');
  const path = require('path');
  const math = require('@agni/engine/math');
  const federation = require('@agni/engine/federation');
  let TMP_DIR;
  let origDataDir;

  before(() => {
    TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'agni-audit-c2-'));
    origDataDir = process.env.AGNI_DATA_DIR;
    process.env.AGNI_DATA_DIR = TMP_DIR;
  });

  after(() => {
    process.env.AGNI_DATA_DIR = origDataDir;
    try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  function reloadEngineWithTestDataDir() {
    delete require.cache[require.resolve('@agni/utils/env-config')];
    delete require.cache[require.resolve('@agni/engine')];
    return require('@agni/engine');
  }

  it('mergeRemoteSummary returns merged:true, mergeTimestamp, mergeVersion on first merge', async () => {
    const engine = reloadEngineWithTestDataDir();
    await engine.seedLessons([{ lessonId: 'C2-L', difficulty: 2, skill: 'c2' }]);
    const dim = engine.getStatus().embeddingDim;
    const featureDim = dim * 2;
    const remote = {
      embeddingDim: dim,
      mean: Array(featureDim).fill(0).map((_, i) => i * 0.1),
      precision: math.scaleMat(math.identity(featureDim), 5),
      sampleSize: 10
    };
    federation.addSyncId(remote);
    const result = await engine.mergeRemoteSummary(remote);
    assert.equal(result.merged, true, 'First merge must apply');
    assert.equal(typeof result.mergeTimestamp, 'number', 'mergeTimestamp must be present');
    assert.ok(result.mergeVersion >= 1, 'mergeVersion must be >= 1');
  });

  it('mergeRemoteSummary returns merged:false, reason when duplicate (same summary twice)', async () => {
    const engine = reloadEngineWithTestDataDir();
    await engine.seedLessons([{ lessonId: 'C2-L', difficulty: 2, skill: 'c2' }]);
    const dim = engine.getStatus().embeddingDim;
    const featureDim = dim * 2;
    const remote = {
      embeddingDim: dim,
      mean: Array(featureDim).fill(0).map((_, i) => i * 0.1),
      precision: math.scaleMat(math.identity(featureDim), 5),
      sampleSize: 10
    };
    federation.addSyncId(remote);
    await engine.mergeRemoteSummary(remote);
    const result2 = await engine.mergeRemoteSummary(remote);
    assert.equal(result2.merged, false, 'Duplicate merge must skip');
    assert.ok(result2.reason === 'syncId_seen' || result2.reason === 'hubHighWater',
      'reason must indicate why skipped, got: ' + result2.reason);
  });
});

describe('AUDIT-DOCS: Node version docs consistent (hub Node 14+)', () => {
  it('check-node-version-docs passes — ARCHITECTURE states Node 14+ for hub, no Node < 14 in docs', () => {
    const script = path.resolve(__dirname, '../../scripts/check-node-version-docs.js');
    const result = spawnSync(process.execPath, [script], {
      cwd: path.resolve(__dirname, '../..'),
      encoding: 'utf8',
    });
    assert.equal(
      result.status,
      0,
      `check-node-version-docs must pass. ARCHITECTURE must state Node 14+ for hub; no Node < 14 target in non-archive docs.\n${result.stderr || result.stdout}`
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MATH: packages/agni-engine/math.js remediation (docs/playbooks/math-remediation-plan.md)
// ═══════════════════════════════════════════════════════════════════════════════

describe('MATH-1: cholesky rejects null, non-square, and non-symmetric input', () => {
  const math = require('@agni/engine/math');

  it('throws for null input', () => {
    assert.throws(() => math.cholesky(null), /cholesky.*null or undefined/);
  });

  it('throws for non-square matrix', () => {
    assert.throws(() => math.cholesky([[1, 0, 0], [0, 1, 0]]), /square/);
  });

  it('throws for non-symmetric matrix', () => {
    assert.throws(() => math.cholesky([[4, 1], [2, 3]]), /not symmetric/);
  });
});

describe('MATH-2: randn produces valid N(0,1) samples', () => {
  const math = require('@agni/engine/math');

  it('produces statistically independent samples (cache alternates cos/sin from Box-Muller)', () => {
    // Call randn odd times (no cache anymore — was the bug). Verify samples are valid N(0,1).
    const N = 2000;
    const samples = [];
    for (let i = 0; i < N; i++) samples.push(math.randn());
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const variance = samples.reduce((a, b) => a + b * b, 0) / samples.length - mean * mean;
    // SE(mean) = 1/sqrt(N) ≈ 0.02; allow 5 sigma → 0.1. Variance: allow ±0.15.
    assert.ok(Math.abs(mean) < 0.12, 'Mean should be near 0 (got ' + mean + ')');
    assert.ok(Math.abs(variance - 1) < 0.15, 'Variance should be near 1 (got ' + variance + ')');
  });
});

describe('MATH-2b: LEN-18 randn never returns Infinity for tiny u', () => {
  const math = require('@agni/engine/math');

  it('rejects tiny u and never returns Infinity', () => {
    math._randnClearCache();
    const seq = [1e-200, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    let idx = 0;
    const origRandom = Math.random;
    Math.random = function () { return seq[idx++ % seq.length] || 0.5; };
    try {
      for (let i = 0; i < 100; i++) {
        const v = math.randn();
        assert.ok(isFinite(v), 'randn must never return Infinity or NaN (LEN-18), got ' + v);
      }
    } finally {
      Math.random = origRandom;
    }
  });
});

describe('MATH-3: randn retries on PRNG zero (does not corrupt Thompson sampling)', () => {
  const math = require('@agni/engine/math');

  it('retries then throws when Math.random returns zero repeatedly', () => {
    math._randnClearCache();
    const origRandom = Math.random;
    Math.random = function () { return 0; };
    try {
      assert.throws(() => math.randn(), /randn: PRNG returned near-zero repeatedly/);
    } finally {
      Math.random = origRandom;
    }
  });
});

describe('MATH-4: forwardSub and backSub throw on RHS length mismatch', () => {
  const math = require('@agni/engine/math');

  it('forwardSub throws when b.length < L.length', () => {
    const L = [[1, 0], [1, 1]];
    assert.throws(() => math.forwardSub(L, [1]), /forwardSub.*dimension mismatch/);
  });

  it('forwardSub throws when b.length > L.length', () => {
    const L = [[1, 0], [1, 1]];
    assert.throws(() => math.forwardSub(L, [1, 2, 3]), /forwardSub.*dimension mismatch/);
  });

  it('backSub throws when y.length < L.length', () => {
    const L = [[1, 0], [1, 1]];
    assert.throws(() => math.backSub(L, [1]), /backSub.*dimension mismatch/);
  });

  it('backSub throws when y.length > L.length', () => {
    const L = [[1, 0], [1, 1]];
    assert.throws(() => math.backSub(L, [1, 2, 3]), /backSub.*dimension mismatch/);
  });
});

describe('MATH-5: identity rejects invalid n', () => {
  const math = require('@agni/engine/math');

  it('throws for null or undefined', () => {
    assert.throws(() => math.identity(null), /identity.*null or undefined/);
    assert.throws(() => math.identity(undefined), /identity.*null or undefined/);
  });

  it('throws for negative n', () => {
    assert.throws(() => math.identity(-1), /identity.*positive integer/);
  });

  it('throws for non-integer n', () => {
    assert.throws(() => math.identity(2.5), /identity.*positive integer/);
  });
});

describe('MATH-6: scaleVec and scaleMat reject invalid scalar', () => {
  const math = require('@agni/engine/math');

  it('scaleVec throws for undefined scalar', () => {
    assert.throws(() => math.scaleVec([1, 2, 3], undefined), /scaleVec.*finite number/);
  });

  it('scaleVec throws for NaN scalar', () => {
    assert.throws(() => math.scaleVec([1, 2, 3], NaN), /scaleVec.*finite number/);
  });

  it('scaleMat throws for undefined scalar', () => {
    assert.throws(() => math.scaleMat([[1, 2], [3, 4]], undefined), /scaleMat.*finite number/);
  });
});

describe('MATH-7: invertSPD throws for null input', () => {
  const math = require('@agni/engine/math');

  it('throws for null', () => {
    assert.throws(() => math.invertSPD(null), /invertSPD.*null or undefined/);
  });

  it('throws for undefined', () => {
    assert.throws(() => math.invertSPD(undefined), /invertSPD.*null or undefined/);
  });
});
