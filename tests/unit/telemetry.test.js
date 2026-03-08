'use strict';

const { describe, it, before, after } = require('../helpers/test-api');
const assert = require('node:assert/strict');
const { setupGlobals, teardownGlobals } = require('../helpers/browser-globals');

describe('AGNI_TELEMETRY', () => {
  let telem;

  before(() => {
    setupGlobals();
    globalThis.LESSON_DATA = { _devMode: true, meta: { identifier: 'test' } };
    globalThis.indexedDB = {
      open() {
        return { onupgradeneeded: null, onsuccess: null, onerror: null };
      }
    };
    require('../../src/runtime/telemetry/telemetry');
    telem = globalThis.AGNI_TELEMETRY;
  });

  after(() => {
    delete globalThis.LESSON_DATA;
    delete globalThis.indexedDB;
    teardownGlobals();
  });

  describe('computeMastery', () => {
    it('empty array → mastery 0', () => {
      const { mastery, stepScores } = telem.computeMastery([]);
      assert.equal(mastery, 0);
      assert.deepStrictEqual(stepScores, []);
    });

    it('single instruction step (weight 0) → mastery 0 (zero weight contributes nothing)', () => {
      const { mastery, stepScores } = telem.computeMastery([
        { stepId: 'i1', type: 'instruction', weight: 0, passed: true, skipped: false, attempts: 1, maxAttempts: 1, durationMs: 3000 }
      ]);
      assert.equal(mastery, 0);
      assert.equal(stepScores.length, 1);
      assert.equal(stepScores[0].score, 1);
    });

    it('single quiz step passed on first attempt → mastery 1.0', () => {
      const { mastery } = telem.computeMastery([
        { stepId: 'q1', type: 'quiz', weight: 1, passed: true, skipped: false, attempts: 1, maxAttempts: 2, durationMs: 5000 }
      ]);
      assert.equal(mastery, 1);
    });

    it('single quiz step passed on 2nd of 2 max attempts → mastery ≈ 0.707', () => {
      const { mastery, stepScores } = telem.computeMastery([
        { stepId: 'q1', type: 'quiz', weight: 1, passed: true, skipped: false, attempts: 2, maxAttempts: 2, durationMs: 8000 }
      ]);
      assert.equal(mastery, 0.707);
      assert.equal(stepScores[0].score, 0.707);
    });

    it('single quiz step skipped → mastery 0', () => {
      const { mastery } = telem.computeMastery([
        { stepId: 'q1', type: 'quiz', weight: 1, passed: false, skipped: true, attempts: 0, maxAttempts: 2, durationMs: 1000 }
      ]);
      assert.equal(mastery, 0);
    });

    it('single quiz step failed (exhausted attempts) → mastery 0.15', () => {
      const { mastery } = telem.computeMastery([
        { stepId: 'q1', type: 'quiz', weight: 1, passed: false, skipped: false, attempts: 2, maxAttempts: 2, durationMs: 6000 }
      ]);
      assert.equal(mastery, 0.15);
    });

    it('mix: instruction(w=0) + quiz passed(w=1) + quiz failed(w=1) → mastery 0.575', () => {
      const { mastery } = telem.computeMastery([
        { stepId: 'i1', type: 'instruction', weight: 0, passed: true, skipped: false, attempts: 1, maxAttempts: 1, durationMs: 2000 },
        { stepId: 'q1', type: 'quiz', weight: 1, passed: true, skipped: false, attempts: 1, maxAttempts: 2, durationMs: 5000 },
        { stepId: 'q2', type: 'quiz', weight: 1, passed: false, skipped: false, attempts: 2, maxAttempts: 2, durationMs: 7000 }
      ]);
      assert.equal(mastery, 0.575);
    });

    it('all instruction steps with positive weight → mastery 1.0', () => {
      const { mastery } = telem.computeMastery([
        { stepId: 'i1', type: 'instruction', weight: 1, passed: true, skipped: false, attempts: 1, maxAttempts: 1, durationMs: 3000 },
        { stepId: 'i2', type: 'instruction', weight: 1, passed: true, skipped: false, attempts: 1, maxAttempts: 1, durationMs: 4000 },
        { stepId: 'i3', type: 'instruction', weight: 1, passed: true, skipped: false, attempts: 1, maxAttempts: 1, durationMs: 2000 }
      ]);
      assert.equal(mastery, 1);
    });
  });
});
