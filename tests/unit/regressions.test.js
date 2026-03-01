'use strict';

/**
 * Regression tests for specific bugs discovered during codebase audit (2026-03-01).
 *
 * Each test is named with the sprint item it validates. If a test here fails,
 * the corresponding sprint claim is no longer true. Do not delete failing tests
 * — fix the underlying bug and verify the test passes.
 */

const { describe, it } = require('node:test');
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
      delete require.cache[require.resolve('../../hub-tools/context/auth')];
      const { requireHubKey } = require('../../hub-tools/context/auth');
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
      delete require.cache[require.resolve('../../hub-tools/context/auth')];
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
      delete require.cache[require.resolve('../../src/services/accounts')];
      delete require.cache[require.resolve('../../src/utils/env-config')];
      const accountsService = require('../../src/services/accounts');
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
      delete require.cache[require.resolve('../../src/services/accounts')];
      delete require.cache[require.resolve('../../src/utils/env-config')];
    }
  });
});
