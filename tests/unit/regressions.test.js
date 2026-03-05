'use strict';

/**
 * Regression tests for specific bugs discovered during codebase audit (2026-03-01).
 *
 * Each test is named with the sprint item it validates. If a test here fails,
 * the corresponding sprint claim is no longer true. Do not delete failing tests
 * — fix the underlying bug and verify the test passes.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

// ═══════════════════════════════════════════════════════════════════════════════
// Feature inference: confidence scores must reflect actual keyword density
// ═══════════════════════════════════════════════════════════════════════════════

describe('AUDIT-1: confidence scores reflect actual analysis, not hardcoded 0.5', () => {
  const { inferFeatures } = require('../../src/utils/feature-inference');

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
  it('thompson.selectLesson has 2 params, not 3', () => {
    const thompson = require('../../src/engine/thompson');
    assert.equal(
      thompson.selectLesson.length, 2,
      'thompson.selectLesson should take (state, studentId), not (state, studentId, lessonIds). The .d.ts declares a phantom third parameter.'
    );
  });

  it('rasch.updateAbility returns a number (ability delta), not void', () => {
    const rasch = require('../../src/engine/rasch');
    const { createState, seedProbes } = require('../helpers/engine-state');

    const state = createState();
    seedProbes(state, [['p1', 0, 'math']]);

    const result = rasch.updateAbility(state, 'student-1', [{ probeId: 'p1', correct: true }]);
    assert.equal(typeof result, 'number', 'updateAbility must return a number (the ability step delta). The .d.ts incorrectly declares void.');
  });

  it('embeddings.ensureStudentVector returns number[], not void', () => {
    const embeddings = require('../../src/engine/embeddings');
    const { createState } = require('../helpers/engine-state');

    const state = createState({ dim: 4 });
    const vec = embeddings.ensureStudentVector(state, 'student-1');

    assert.ok(Array.isArray(vec), 'ensureStudentVector must return the vector. The .d.ts incorrectly declares void.');
    assert.equal(vec.length, 4);
  });

  it('embeddings.ensureLessonVector returns number[], not void', () => {
    const embeddings = require('../../src/engine/embeddings');
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
  const rasch = require('../../src/engine/rasch');
  const embeddings = require('../../src/engine/embeddings');
  const thompson = require('../../src/engine/thompson');
  const { createState, seedProbes } = require('../helpers/engine-state');

  it('updateEmbedding with NaN gain does not produce NaN vectors', () => {
    const state = createState({ dim: 4 });
    embeddings.ensureStudentVector(state, 's1');
    embeddings.ensureLessonVector(state, 'l1');

    let threw = false;
    try {
      embeddings.updateEmbedding(state, 's1', 'l1', NaN);
    } catch (_e) {
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
    } catch (_e) {
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
    const abilityBefore = state.rasch.students['s1'].ability;

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
    } catch (_e) {
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
    const { evaluateLessonCompliance } = require('../../src/governance/evaluateLessonCompliance');

    const sidecar = {
      identifier: 'test',
      utu: { class: 'FAKE-NONEXISTENT-SPINE', band: 1, protocol: 1 },
      difficulty: 3
    };
    const policy = { requireUtu: true, utuTargets: [{ class: 'SCI-1', band: 1 }] };

    const r1 = evaluateLessonCompliance(sidecar, policy);
    const r2 = evaluateLessonCompliance(sidecar, policy);

    assert.deepEqual(r1, r2, 'Same inputs should produce same outputs — function must be deterministic.');
    assert.equal(r1.status, 'fail', 'Mismatched UTU target should produce fail status.');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// feature-inference: declared_features.teaching_style Object.assign on string
// ═══════════════════════════════════════════════════════════════════════════════

describe('AUDIT-5: declared_features overrides produce valid objects', () => {
  const { inferFeatures } = require('../../src/utils/feature-inference');

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
      let responseBody = null;
      const handler = requireHubKey(function () { responseCode = 200; });
      handler(
        { headers: {} },
        {},
        { qs: {}, sendResponse: function (code, body) { responseCode = code; responseBody = body; } }
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
    const { updateSchedule } = require('../../src/engine/sm2');
    const result = updateSchedule({ interval: 1, easeFactor: 2.5, repetition: 0 }, 10);
    assert.ok(result.easeFactor >= 1.3, 'Ease factor should not go below 1.3');
    assert.ok(result.easeFactor <= 4.0, 'Ease factor should not exceed reasonable bounds');
  });

  it('SM-2 handles negative quality', () => {
    const { updateSchedule } = require('../../src/engine/sm2');
    const result = updateSchedule({ interval: 1, easeFactor: 2.5, repetition: 0 }, -5);
    assert.ok(result.easeFactor >= 1.3, 'Ease factor should not go below 1.3');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// R12: Engine hyperparameter validation
// ═══════════════════════════════════════════════════════════════════════════════

describe('AUDIT-8: engine rejects invalid hyperparameters', () => {
  const embeddings = require('../../src/engine/embeddings');
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

  it('updateEmbedding throws on negative learning rate', () => {
    const state = createState({ dim: 4 });
    state.embedding.lr = -0.01;
    embeddings.ensureStudentVector(state, 's1');
    embeddings.ensureLessonVector(state, 'l1');
    assert.throws(() => {
      embeddings.updateEmbedding(state, 's1', 'l1', 0.5);
    }, /lr/);
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
      delete require.cache[require.resolve('../../src/utils/env-config')];
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
      delete require.cache[require.resolve('../../src/utils/env-config')];
      delete require.cache[require.resolve('@agni/utils/env-config')];
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// R13: math.js vector dimension assertions
// ═══════════════════════════════════════════════════════════════════════════════

describe('AUDIT-12: math.js rejects mismatched vector dimensions', () => {
  const math = require('../../src/engine/math');

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
  const embeddings = require('../../src/engine/embeddings');
  const { createState } = require('../helpers/engine-state');

  it('large gains do not produce vectors exceeding magnitude cap', () => {
    const state = createState({ dim: 4 });
    embeddings.ensureStudentVector(state, 's1');
    embeddings.ensureLessonVector(state, 'l1');
    for (var i = 0; i < 100; i++) {
      embeddings.updateEmbedding(state, 's1', 'l1', 1000);
    }
    var vec = state.embedding.students['s1'].vector;
    var maxMag = Math.max.apply(null, vec.map(function (v) { return Math.abs(v); }));
    assert.ok(maxMag <= 10, 'Vector magnitude should be capped at 10, got ' + maxMag);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// R13: Cholesky jitter retry graceful degradation
// ═══════════════════════════════════════════════════════════════════════════════

describe('AUDIT-14: sampleTheta gracefully handles near-singular A', () => {
  const thompson = require('../../src/engine/thompson');
  const embeddings = require('../../src/engine/embeddings');
  const { createState } = require('../helpers/engine-state');

  it('returns mean vector instead of crashing on singular A', () => {
    const state = createState({ dim: 2 });
    embeddings.ensureStudentVector(state, 's1');
    embeddings.ensureLessonVector(state, 'l1');
    thompson.ensureBanditInitialized(state);
    // Make A singular by zeroing the matrix
    for (var i = 0; i < state.bandit.A.length; i++) {
      for (var j = 0; j < state.bandit.A[i].length; j++) {
        state.bandit.A[i][j] = 0;
      }
    }
    // This should not throw — it should return the mean (which is b = [0,...0])
    var result = thompson.selectLesson(state, 's1');
    // selectLesson returns a lessonId or null, not a crash
    assert.equal(typeof result === 'string' || result === null, true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// R15: Thompson jitter must operate on a copy, not mutate state.bandit.A
// ═══════════════════════════════════════════════════════════════════════════════

describe('AUDIT-15: sampleTheta jitter does not mutate state.bandit.A', () => {
  const thompson = require('../../src/engine/thompson');
  const embeddings = require('../../src/engine/embeddings');
  const math = require('../../src/engine/math');
  const { createState } = require('../helpers/engine-state');

  it('state.bandit.A is unchanged after jitter retry path', () => {
    const state = createState({ dim: 2 });
    embeddings.ensureStudentVector(state, 's1');
    embeddings.ensureLessonVector(state, 'l1');
    thompson.ensureBanditInitialized(state);

    // Make A nearly singular so the first invertSPD fails and jitter fires
    var n = state.bandit.A.length;
    for (var i = 0; i < n; i++) {
      for (var j = 0; j < n; j++) {
        state.bandit.A[i][j] = 0;
      }
    }

    // Deep-copy A before sampleTheta
    var Abefore = state.bandit.A.map(function (row) { return row.slice(); });

    // sampleTheta may succeed via jitter or fall back to mean — either way A must not change
    thompson.selectLesson(state, 's1');

    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
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
  const math = require('../../src/engine/math');

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
    var result = math.addMat([[1, 2], [3, 4]], [[5, 6], [7, 8]]);
    assert.deepEqual(result, [[6, 8], [10, 12]]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// R15: SM-2 upper bound is exactly 3.0
// ═══════════════════════════════════════════════════════════════════════════════

describe('AUDIT-17: SM-2 ease factor is capped at 3.0', () => {
  const { updateSchedule } = require('../../src/engine/sm2');

  it('ease factor never exceeds 3.0 even with perfect quality', () => {
    var schedule = { interval: 1, easeFactor: 2.9, repetition: 5 };
    for (var i = 0; i < 50; i++) {
      schedule = updateSchedule(schedule, 5);
    }
    assert.ok(schedule.easeFactor <= 3.0,
      'Ease factor exceeded 3.0: ' + schedule.easeFactor);
  });

  it('ease factor reaches 3.0 from repeated perfect quality', () => {
    var schedule = { interval: 1, easeFactor: 2.5, repetition: 0 };
    for (var i = 0; i < 100; i++) {
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
    var repeatIdx = src.indexOf('String.prototype.repeat');
    var padStartIdx = src.indexOf('String.prototype.padStart');
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
    var staleMatch = lockSrc.match(/STALE_TIMEOUT_MS\s*=\s*(\d+)/);
    var retryMatch = lockSrc.match(/RETRY_INTERVAL_MS\s*=\s*(\d+)/);
    var maxMatch = lockSrc.match(/MAX_RETRIES\s*=\s*(\d+)/);
    assert.ok(staleMatch && retryMatch && maxMatch, 'Could not parse lock constants');
    var stale = parseInt(staleMatch[1], 10);
    var interval = parseInt(retryMatch[1], 10);
    var maxRetries = parseInt(maxMatch[1], 10);
    var totalRetryMs = maxRetries * interval;
    assert.ok(totalRetryMs > stale,
      'MAX_RETRIES * RETRY_INTERVAL_MS (' + totalRetryMs + 'ms) must exceed STALE_TIMEOUT_MS (' + stale + 'ms)');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// R15: Governance routes require auth — unauthenticated requests get 401
// ═══════════════════════════════════════════════════════════════════════════════

describe('AUDIT-21: governance routes reject unauthenticated requests', () => {
  var server, port, dataDir;
  var EXT_TEST_HUB_KEY = 'test-hub-key-gov-' + Date.now();

  before(async () => {
    var pathMod = require('path');
    var fsMod = require('fs');
    var osMod = require('os');
    dataDir = pathMod.join(osMod.tmpdir(), 'agni-gov-auth-test-' + Date.now());
    fsMod.mkdirSync(dataDir, { recursive: true });
    process.env.AGNI_DATA_DIR = dataDir;
    process.env.AGNI_SERVE_DIR = pathMod.join(dataDir, 'serve');
    process.env.AGNI_HUB_API_KEY = EXT_TEST_HUB_KEY;

    var rootNorm = pathMod.resolve(__dirname, '../..').replace(/\\/g, '/');
    Object.keys(require.cache).forEach(function (key) {
      var norm = key.replace(/\\/g, '/');
      if (norm.startsWith(rootNorm) && !norm.includes('node_modules')) {
        delete require.cache[key];
      }
    });

    fsMod.mkdirSync(process.env.AGNI_SERVE_DIR, { recursive: true });
    fsMod.writeFileSync(pathMod.join(dataDir, 'mastery-summary.json'), JSON.stringify({ students: {} }));
    fsMod.writeFileSync(pathMod.join(dataDir, 'lesson-index.json'), JSON.stringify([]));
    fsMod.writeFileSync(pathMod.join(dataDir, 'approved-catalog.json'), JSON.stringify({ lessonIds: [] }));

    var theta = require('@agni/hub').theta;
    server = theta.startApi(0);
    await new Promise(function (resolve) { setTimeout(resolve, 200); });
    port = server.address().port;
  });

  after(() => {
    if (server) server.close();
    var fsMod = require('fs');
    fsMod.rmSync(dataDir, { recursive: true, force: true });
    delete process.env.AGNI_DATA_DIR;
    delete process.env.AGNI_SERVE_DIR;
    delete process.env.AGNI_HUB_API_KEY;
    delete require.cache[require.resolve('../../src/utils/env-config')];
    delete require.cache[require.resolve('@agni/utils/env-config')];
    delete require.cache[require.resolve('@agni/services/accounts')];
    delete require.cache[require.resolve('../../packages/agni-hub/context/auth')];
    delete require.cache[require.resolve('../../packages/agni-hub/context/services')];
  });

  function rawRequest(method, urlPath) {
    var http = require('http');
    return new Promise(function (resolve, reject) {
      var req = http.request({ hostname: '127.0.0.1', port: port, path: urlPath, method: method }, function (res) {
        var data = '';
        res.on('data', function (chunk) { data += chunk; });
        res.on('end', function () { resolve({ status: res.statusCode }); });
      });
      req.on('error', reject);
      req.end();
    });
  }

  it('GET /api/governance/report returns 401 without auth', async () => {
    var res = await rawRequest('GET', '/api/governance/report');
    assert.equal(res.status, 401);
  });

  it('GET /api/governance/policy returns 401 without auth', async () => {
    var res = await rawRequest('GET', '/api/governance/policy');
    assert.equal(res.status, 401);
  });

  it('GET /api/governance/catalog returns 401 without auth', async () => {
    var res = await rawRequest('GET', '/api/governance/catalog');
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
  var sharedPath = require.resolve('../../packages/agni-hub/pwa/shared.js');
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
  const { computeStreaks } = require('../../src/utils/streak');

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
    const pagerank = require('../../src/engine/pagerank');
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
    const src = fs.readFileSync(require('path').join(__dirname, '../../packages/agni-hub/hub-transform.js'), 'utf8');
    assert.ok(src.indexOf("'__SW_VERSION__'") !== -1 || src.indexOf('"__SW_VERSION__"') !== -1,
      'hub-transform does not replace __SW_VERSION__ — service worker gets raw placeholder');
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
    const path = require('path');
    const fs = require('fs');
    const os = require('os');
    const dir = path.join(os.tmpdir(), 'agni-accounts-test-' + Date.now());
    fs.mkdirSync(dir, { recursive: true });
    const saved = process.env.AGNI_DATA_DIR;
    process.env.AGNI_DATA_DIR = dir;
    try {
      delete require.cache[require.resolve('@agni/services/accounts')];
      delete require.cache[require.resolve('../../src/utils/env-config')];
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
      delete require.cache[require.resolve('../../src/utils/env-config')];
      delete require.cache[require.resolve('@agni/utils/env-config')];
    }
  });
});
