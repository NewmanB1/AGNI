'use strict';

const { describe, it } = require('../helpers/test-api');
const assert = require('node:assert/strict');
const math = require('@agni/engine/math');
const { ensureBanditInitialized, updateBandit } = require('@agni/engine/thompson');
const { ensureLessonVector } = require('@agni/engine/embeddings');
const { addSyncId, getBanditSummary, mergeBanditSummaries } = require('@agni/engine/federation');
const { createState } = require('../helpers/engine-state');

const EPSILON = 1e-6;

describe('getBanditSummary', () => {
  it('returns embeddingDim, mean, precision, and sampleSize', () => {
    const state = createState({ dim: 4 });
    ensureBanditInitialized(state);
    const summary = getBanditSummary(state);
    assert.equal(summary.embeddingDim, 4);
    assert.ok(Array.isArray(summary.mean));
    assert.equal(summary.mean.length, 8); // featureDim = dim * 2
    assert.ok(Array.isArray(summary.precision));
    assert.equal(summary.precision.length, 8);
    assert.equal(typeof summary.sampleSize, 'number');
  });

  it('reflects observation count', () => {
    const state = createState({ dim: 4 });
    ensureLessonVector(state, 'L1');
    ensureBanditInitialized(state);
    updateBandit(state, 's1', 'L1', 1.0);
    updateBandit(state, 's1', 'L1', 0.5);
    const summary = getBanditSummary(state);
    assert.equal(summary.sampleSize, 2);
  });

  it('Bug 1: precision is copy, not live reference', () => {
    const state = createState({ dim: 4 });
    ensureBanditInitialized(state);
    const summary = getBanditSummary(state);
    assert.notStrictEqual(summary.precision, state.bandit.A);
  });

  it('Bug 9: throws on NaN observationCount', () => {
    const state = createState({ dim: 4 });
    ensureBanditInitialized(state);
    state.bandit.observationCount = NaN;
    assert.throws(() => getBanditSummary(state), /\[FEDERATION\].*observationCount/);
  });

  it('P1: uses Cholesky solve — mean equals A⁻¹b (same as invertSPD path)', () => {
    const state = createState({ dim: 4 });
    ensureLessonVector(state, 'L1');
    ensureBanditInitialized(state);
    updateBandit(state, 's1', 'L1', 1.0);
    const summary = getBanditSummary(state);
    const expectedMean = math.matVec(math.invertSPD(state.bandit.A), state.bandit.b);
    for (let i = 0; i < summary.mean.length; i++) {
      assert.ok(Math.abs(summary.mean[i] - expectedMean[i]) < EPSILON,
        'mean[' + i + '] Cholesky=' + summary.mean[i] + ' vs invertSPD=' + expectedMean[i]);
    }
  });

  it('V1: works without pre-calling ensureBanditInitialized when n=0 (lazy init)', () => {
    const state = createState({ dim: 4 });
    // Do NOT call ensureBanditInitialized — getBanditSummary should init internally for n=0
    const summary = getBanditSummary(state);
    assert.equal(summary.embeddingDim, 4);
    assert.equal(summary.mean.length, 8);
    assert.equal(summary.sampleSize, 0);
  });

  it('N2: throws when observationCount > 0 but A/b missing (no silent repair)', () => {
    const state = createState({ dim: 4 });
    state.bandit.observationCount = 5;
    state.bandit.A = null;
    state.bandit.b = null;
    assert.throws(
      () => getBanditSummary(state),
      /\[FEDERATION\].*observationCount > 0.*A\/b missing/
    );
  });

  it('validates A/b when n>0: throws on jagged A or non-finite values', () => {
    const state = createState({ dim: 4 });
    ensureBanditInitialized(state);
    state.bandit.observationCount = 1;
    state.bandit.A[2] = state.bandit.A[2].slice(0, 4);
    assert.throws(() => getBanditSummary(state), /\[FEDERATION\].*jagged/);
    ensureBanditInitialized(state);
    state.bandit.A[1][1] = NaN;
    assert.throws(() => getBanditSummary(state), /\[FEDERATION\].*non-finite/);
  });

  it('E2: throws clear error on null state', () => {
    assert.throws(() => getBanditSummary(null), /\[FEDERATION\].*state.*non-null/);
  });

  it('E2: throws clear error on state with null bandit', () => {
    const state = createState({ dim: 4 });
    state.bandit = null;
    assert.throws(() => getBanditSummary(state), /\[FEDERATION\].*state.*bandit.*non-null/);
  });
});

describe('mergeBanditSummaries', () => {
  function makeSummary(featureDim, sampleSize) {
    const embeddingDim = featureDim / 2;  // featureDim === embeddingDim * 2
    return {
      embeddingDim,
      mean: Array(featureDim).fill(0).map((_, i) => i * 0.1),
      precision: math.scaleMat(math.identity(featureDim), 1.0),
      sampleSize
    };
  }

  it('returns a summary with combined sampleSize', () => {
    const a = makeSummary(4, 10);
    const b = makeSummary(4, 20);
    const merged = mergeBanditSummaries(a, b);
    assert.equal(merged.sampleSize, 30);
  });

  it('preserves mean dimension', () => {
    const a = makeSummary(4, 5);
    const b = makeSummary(4, 5);
    const merged = mergeBanditSummaries(a, b);
    assert.equal(merged.mean.length, 4);
    assert.equal(merged.precision.length, 4);
  });

  it('returns neutral summary when both sides have 0 observations', () => {
    const a = makeSummary(4, 0);
    const b = makeSummary(4, 0);
    const merged = mergeBanditSummaries(a, b);
    assert.equal(merged.sampleSize, 0);
    assert.ok(merged.mean.every(v => v === 0), 'Mean should be zeros');
  });

  it('Bug 2: Bayesian merge P1+P2 — larger hub dominates (not underweighted)', () => {
    const featureDim = 4;
    const embeddingDim = 2;
    // Precision matrices should reflect accumulated evidence (scale ~ sampleSize)
    const small = {
      embeddingDim,
      mean: Array(featureDim).fill(10),
      precision: math.scaleMat(math.identity(featureDim), 1.0),
      sampleSize: 1
    };
    const large = {
      embeddingDim,
      mean: Array(featureDim).fill(0),
      precision: math.scaleMat(math.identity(featureDim), 100.0),
      sampleSize: 100
    };
    const merged = mergeBanditSummaries(small, large);
    // With 100x more accumulated precision, large hub should dominate
    assert.ok(merged.mean[0] < 5, 'Merged mean should be closer to the larger hub, got: ' + merged.mean[0]);
  });

  it('throws on embeddingDim mismatch (federation contract)', () => {
    const a = makeSummary(4, 5);  // embeddingDim=2
    const b = makeSummary(8, 5);  // embeddingDim=4
    assert.throws(() => mergeBanditSummaries(a, b), /embeddingDim|Federation contract/);
  });

  it('merged precision is a valid SPD matrix (invertible)', () => {
    const a = makeSummary(4, 10);
    const b = makeSummary(4, 20);
    const merged = mergeBanditSummaries(a, b);
    assert.doesNotThrow(() => math.invertSPD(merged.precision));
  });

  it('Bug 3: one-zero sampleSize returns copy of non-zero side (no zero-matrix crash)', () => {
    const a = makeSummary(4, 0);
    const b = makeSummary(4, 10);
    const merged = mergeBanditSummaries(a, b);
    assert.equal(merged.sampleSize, 10);
    assert.doesNotThrow(() => math.invertSPD(merged.precision));
  });

  it('Bug 6: throws on invalid sampleSize', () => {
    const valid = makeSummary(4, 5);
    const bad = makeSummary(4, 5);
    bad.sampleSize = NaN;
    assert.throws(() => mergeBanditSummaries(valid, bad), /\[FEDERATION\].*sampleSize/);
  });

  it('Bug 5: throws on precision dimension mismatch', () => {
    const valid = makeSummary(4, 5);
    const bad = makeSummary(4, 5);
    bad.precision = math.identity(2);  // wrong size for embeddingDim*2=4
    assert.throws(() => mergeBanditSummaries(valid, bad), /\[FEDERATION\].*[Pp]recision/);
  });

  it('E2: throws clear error on null local', () => {
    const b = makeSummary(4, 5);
    assert.throws(() => mergeBanditSummaries(null, b), /\[FEDERATION\].*local.*remote.*non-null/);
  });

  it('E2: throws clear error on null remote', () => {
    const a = makeSummary(4, 5);
    assert.throws(() => mergeBanditSummaries(a, null), /\[FEDERATION\].*local.*remote.*non-null/);
  });

  it('V3: throws on jagged precision (truncated row)', () => {
    const valid = makeSummary(4, 5);
    const bad = makeSummary(4, 5);
    bad.precision = math.identity(4).map((row, i) => (i === 2 ? row.slice(0, 2) : row));
    assert.throws(() => mergeBanditSummaries(valid, bad), /\[FEDERATION\].*jagged.*row 2/);
  });

  it('V4: throws on NaN in mean', () => {
    const valid = makeSummary(4, 5);
    const bad = makeSummary(4, 5);
    bad.mean = [0, 0, NaN, 0];
    assert.throws(() => mergeBanditSummaries(valid, bad), /\[FEDERATION\].*mean.*non-finite/);
  });

  it('V4: throws on Infinity in mean', () => {
    const valid = makeSummary(4, 5);
    const bad = makeSummary(4, 5);
    bad.mean = [0, Infinity, 0, 0];
    assert.throws(() => mergeBanditSummaries(valid, bad), /\[FEDERATION\].*mean.*non-finite/);
  });

  it('V5: throws on embeddingDim > 1024 (OOM guard)', () => {
    const valid = makeSummary(4, 5);
    const big = { embeddingDim: 2048, mean: [], precision: [], sampleSize: 5 };
    // Upper-bound check runs before mean/precision validation — no huge alloc
    assert.throws(() => mergeBanditSummaries(valid, big), /\[FEDERATION\].*embeddingDim.*1024/);
  });

  it('LEN-001 #10: throws on embeddingDim=0 (zero-dim path)', () => {
    const valid = makeSummary(4, 5);
    const zeroDim = {
      embeddingDim: 0,
      mean: [],
      precision: [],
      sampleSize: 0
    };
    assert.throws(
      () => mergeBanditSummaries(zeroDim, zeroDim),
      /\[FEDERATION\].*embeddingDim.*positive integer|embeddingDim.*>= 1/
    );
  });

  it('E2: throws clear error on null mean', () => {
    const valid = makeSummary(4, 5);
    const bad = makeSummary(4, 5);
    bad.mean = null;
    assert.throws(() => mergeBanditSummaries(valid, bad), /\[FEDERATION\].*mean.*non-null/);
  });

  it('R5: throws on non-finite value in precision', () => {
    const valid = makeSummary(4, 5);
    const bad = makeSummary(4, 5);
    bad.precision[1][1] = NaN;
    assert.throws(() => mergeBanditSummaries(valid, bad), /\[FEDERATION\].*precision.*non-finite/);
  });

  it('addSyncId adds deterministic syncId — returns new object, does not mutate', () => {
    const a = makeSummary(4, 5);
    const aWithId = addSyncId(a);
    assert.ok(typeof aWithId.syncId === 'string' && aWithId.syncId.length === 16);
    assert.equal(a.syncId, undefined, 'Input should not be mutated');
    const b = makeSummary(4, 5);
    const bWithId = addSyncId(b);
    assert.equal(aWithId.syncId, bWithId.syncId, 'Same content yields same syncId');
  });

  it('R4: merged mean matches invertSPD path (Cholesky solve correctness)', () => {
    const a = makeSummary(4, 10);
    const b = makeSummary(4, 20);
    const merged = mergeBanditSummaries(a, b);
    const expectedMean = math.matVec(
      math.invertSPD(merged.precision),
      math.addVec(
        math.matVec(a.precision, a.mean),
        math.matVec(b.precision, b.mean)
      )
    );
    for (let i = 0; i < merged.mean.length; i++) {
      assert.ok(Math.abs(merged.mean[i] - expectedMean[i]) < EPSILON,
        'Cholesky mean[' + i + ']=' + merged.mean[i] + ' vs invertSPD=' + expectedMean[i]);
    }
  });

  it('AUDIT-C2: mergeBanditSummaries is idempotent — same (local, remote) yields identical merged summary', () => {
    const a = makeSummary(4, 10);
    const b = makeSummary(4, 20);
    const m1 = mergeBanditSummaries(a, b);
    const m2 = mergeBanditSummaries(a, b);
    assert.equal(m1.sampleSize, m2.sampleSize);
    assert.equal(m1.mean.length, m2.mean.length);
    for (let i = 0; i < m1.mean.length; i++) {
      assert.ok(Math.abs(m1.mean[i] - m2.mean[i]) < EPSILON, 'mean[' + i + '] must match');
    }
    for (let i = 0; i < m1.precision.length; i++) {
      for (let j = 0; j < m1.precision[i].length; j++) {
        assert.ok(Math.abs(m1.precision[i][j] - m2.precision[i][j]) < EPSILON,
          'precision[' + i + '][' + j + '] must match');
      }
    }
  });
});
