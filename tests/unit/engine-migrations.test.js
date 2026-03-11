'use strict';

const { describe, it } = require('../helpers/test-api');
const assert = require('node:assert/strict');
const { migrateLMSState, looksLikeLMSState } = require('@agni/engine/migrations');

// ── looksLikeLMSState ────────────────────────────────────────────────────────

describe('looksLikeLMSState', () => {
  it('returns true for a valid state shape', () => {
    assert.ok(looksLikeLMSState({ rasch: {}, embedding: {}, bandit: {} }));
  });

  it('returns false for null', () => {
    assert.ok(!looksLikeLMSState(null));
  });

  it('returns false for an array', () => {
    assert.ok(!looksLikeLMSState([]));
  });

  it('returns false for a string', () => {
    assert.ok(!looksLikeLMSState('not a state'));
  });

  it('returns false when missing required keys', () => {
    assert.ok(!looksLikeLMSState({ rasch: {}, embedding: {} })); // missing bandit
    assert.ok(!looksLikeLMSState({ bandit: {} })); // missing rasch and embedding
  });
});

// ── migrateLMSState ──────────────────────────────────────────────────────────

describe('migrateLMSState: fresh state from empty', () => {
  it('creates a valid state from empty object', () => {
    const { state, migrated } = migrateLMSState({});
    assert.ok(state.rasch);
    assert.ok(state.embedding);
    assert.ok(state.bandit);
    assert.ok(migrated);
  });

  it('creates a valid state from null', () => {
    const { state, migrated } = migrateLMSState(null);
    assert.ok(state.rasch);
    assert.ok(migrated);
  });

  it('sets embedding.dim to default 16', () => {
    const { state } = migrateLMSState({});
    assert.equal(state.embedding.dim, 16);
  });

  it('respects custom embeddingDim option', () => {
    const { state } = migrateLMSState({}, { embeddingDim: 32 });
    assert.equal(state.embedding.dim, 32);
  });

  it('sets featureDim = dim * 2', () => {
    const { state } = migrateLMSState({}, { embeddingDim: 8 });
    assert.equal(state.bandit.featureDim, 16);
  });
});

describe('migrateLMSState: preserves valid data', () => {
  it('preserves existing student abilities', () => {
    const raw = {
      rasch: { students: { s1: { ability: 2.5, variance: 0.5 } }, probes: {}, globalAnchor: { meanAbility: 0, stdAbility: 1 } },
      embedding: { dim: 16, lr: 0.01, reg: 0.001, forgetting: 0.98, students: {}, lessons: {} },
      bandit: { featureDim: 32, A: [], b: new Array(32).fill(0), forgetting: 0.98, observationCount: 5 }
    };
    const { state } = migrateLMSState(raw);
    assert.equal(state.rasch.students.s1.ability, 2.5);
    assert.equal(state.rasch.students.s1.variance, 0.5);
  });

  it('preserves existing probe difficulties', () => {
    const raw = {
      rasch: { students: {}, probes: { p1: { difficulty: 1.5, skill: 'math' } }, globalAnchor: { meanAbility: 0, stdAbility: 1 } },
      embedding: { dim: 16, lr: 0.01, reg: 0.001, forgetting: 0.98, students: {}, lessons: {} },
      bandit: { featureDim: 32, A: [], b: new Array(32).fill(0), forgetting: 0.98, observationCount: 0 }
    };
    const { state } = migrateLMSState(raw);
    assert.equal(state.rasch.probes.p1.difficulty, 1.5);
    assert.equal(state.rasch.probes.p1.skill, 'math');
  });
});

describe('migrateLMSState: repairs broken data', () => {
  it('repairs missing globalAnchor', () => {
    const raw = { rasch: { students: {}, probes: {} }, embedding: {}, bandit: {} };
    const { state, migrated } = migrateLMSState(raw);
    assert.equal(state.rasch.globalAnchor.meanAbility, 0);
    assert.equal(state.rasch.globalAnchor.stdAbility, 1);
    assert.ok(migrated);
  });

  it('repairs student with missing ability', () => {
    const raw = { rasch: { students: { s1: {} }, probes: {} }, embedding: {}, bandit: {} };
    const { state, migrated } = migrateLMSState(raw);
    assert.equal(state.rasch.students.s1.ability, 0);
    assert.ok(migrated);
  });

  it('repairs probe with missing difficulty', () => {
    const raw = { rasch: { students: {}, probes: { p1: { skill: 'x' } } }, embedding: {}, bandit: {} };
    const { state, migrated } = migrateLMSState(raw);
    assert.equal(state.rasch.probes.p1.difficulty, 0);
    assert.ok(migrated);
  });

  it('repairs mismatched bandit featureDim', () => {
    const raw = { rasch: {}, embedding: { dim: 8 }, bandit: { featureDim: 99 } };
    const { state, migrated } = migrateLMSState(raw);
    assert.equal(state.bandit.featureDim, 16); // 8 * 2
    assert.ok(migrated);
  });

  it('clamps embedding.dim to [4, 1024]', () => {
    const low = migrateLMSState({ rasch: {}, embedding: { dim: 1 }, bandit: {} });
    assert.ok(low.state.embedding.dim >= 4);
    const high = migrateLMSState({ rasch: {}, embedding: { dim: 9999 }, bandit: {} });
    assert.ok(high.state.embedding.dim <= 1024);
  });

  it('repairs wrong-length bandit b vector', () => {
    const raw = { rasch: {}, embedding: { dim: 8 }, bandit: { featureDim: 16, b: [1, 2, 3] } };
    const { state, migrated } = migrateLMSState(raw);
    assert.equal(state.bandit.b.length, 16);
    assert.ok(migrated);
  });

  it('repairs invalid embedding entity vectors by deleting them', () => {
    const raw = {
      rasch: {}, embedding: { dim: 4, students: { s1: { vector: 'bad' } }, lessons: {} }, bandit: {}
    };
    const { state, migrated } = migrateLMSState(raw);
    assert.ok(!('s1' in state.embedding.students));
    assert.ok(migrated);
  });

  it('repairs wrong-dimension embedding vectors by deleting them', () => {
    const raw = {
      rasch: {}, embedding: { dim: 4, students: {}, lessons: { L1: { vector: [1, 2] } } }, bandit: {}
    };
    const { state, migrated } = migrateLMSState(raw);
    assert.ok(!('L1' in state.embedding.lessons));
    assert.ok(migrated);
  });
});
