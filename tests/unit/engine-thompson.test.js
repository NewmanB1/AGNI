'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { ensureBanditInitialized, selectLesson, updateBandit } = require('../../src/engine/thompson');
const { ensureLessonVector } = require('../../src/engine/embeddings');
const { createState, seedProbes } = require('../helpers/engine-state');

describe('ensureBanditInitialized', () => {
  it('initializes A and b when null', () => {
    const state = createState({ dim: 4 });
    ensureBanditInitialized(state);
    assert.ok(state.bandit.A);
    assert.equal(state.bandit.A.length, 8); // dim * 2
    assert.equal(state.bandit.A[0].length, 8);
    assert.ok(state.bandit.b);
    assert.equal(state.bandit.b.length, 8);
  });

  it('initializes A as scaled identity (weak prior)', () => {
    const state = createState({ dim: 4 });
    ensureBanditInitialized(state);
    assert.ok(state.bandit.A[0][0] > 0, 'Diagonal should be positive');
    assert.equal(state.bandit.A[0][1], 0, 'Off-diagonal should be zero');
  });

  it('throws on featureDim mismatch', () => {
    const state = createState({ dim: 4 });
    state.bandit.featureDim = 99;
    assert.throws(() => ensureBanditInitialized(state), /featureDim (invariant violated|mismatch)/);
  });

  it('is idempotent', () => {
    const state = createState({ dim: 4 });
    ensureBanditInitialized(state);
    const A_ref = state.bandit.A;
    ensureBanditInitialized(state);
    assert.equal(state.bandit.A, A_ref, 'Should not re-allocate if already correct');
  });
});

describe('selectLesson', () => {
  it('returns a lesson ID from the seeded set', () => {
    const state = createState({ dim: 4 });
    ensureLessonVector(state, 'L1');
    ensureLessonVector(state, 'L2');
    ensureLessonVector(state, 'L3');
    const selected = selectLesson(state, 'stu1', { eligibleLessonIds: ['L1', 'L2', 'L3'] });
    assert.ok(['L1', 'L2', 'L3'].includes(selected),
      'Expected one of L1/L2/L3, got: ' + selected);
  });

  it('returns null when no lessons are seeded', () => {
    const state = createState({ dim: 4 });
    const selected = selectLesson(state, 'stu1');
    assert.equal(selected, null);
  });

  it('returns a string (not undefined or object)', () => {
    const state = createState({ dim: 4 });
    ensureLessonVector(state, 'only-lesson');
    const selected = selectLesson(state, 'stu1', { eligibleLessonIds: ['only-lesson'] });
    assert.equal(typeof selected, 'string');
    assert.equal(selected, 'only-lesson');
  });
});

describe('updateBandit', () => {
  it('increments observation count', () => {
    const state = createState({ dim: 4 });
    ensureBanditInitialized(state);
    ensureLessonVector(state, 'L1');
    assert.equal(state.bandit.observationCount, 0);
    updateBandit(state, 'stu1', 'L1', 1.0);
    assert.equal(state.bandit.observationCount, 1);
    updateBandit(state, 'stu1', 'L1', 0.5);
    assert.equal(state.bandit.observationCount, 2);
  });

  it('modifies A matrix (rank-one update)', () => {
    const state = createState({ dim: 4 });
    ensureBanditInitialized(state);
    ensureLessonVector(state, 'L1');
    const A_before = state.bandit.A.map(r => r.slice());
    updateBandit(state, 'stu1', 'L1', 1.0);
    const changed = state.bandit.A.some((row, i) => row.some((v, j) => v !== A_before[i][j]));
    assert.ok(changed, 'A matrix should change after update');
  });

  it('modifies b vector', () => {
    const state = createState({ dim: 4 });
    ensureBanditInitialized(state);
    ensureLessonVector(state, 'L1');
    const b_before = state.bandit.b.slice();
    updateBandit(state, 'stu1', 'L1', 1.0);
    const changed = state.bandit.b.some((v, i) => v !== b_before[i]);
    assert.ok(changed, 'b vector should change after update');
  });

  it('does not crash after many sequential updates', () => {
    const state = createState({ dim: 4 });
    ensureLessonVector(state, 'L1');
    ensureLessonVector(state, 'L2');
    for (let i = 0; i < 50; i++) {
      updateBandit(state, 'stu1', i % 2 === 0 ? 'L1' : 'L2', Math.random());
    }
    assert.equal(state.bandit.observationCount, 50);
    const selected = selectLesson(state, 'stu1');
    assert.ok(selected, 'Should still select after many updates');
  });
});
