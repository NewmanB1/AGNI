'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const math = require('../../src/engine/math');
const { ensureBanditInitialized, updateBandit } = require('../../src/engine/thompson');
const { ensureLessonVector } = require('../../src/engine/embeddings');
const { getBanditSummary, mergeBanditSummaries } = require('../../src/engine/federation');
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
});

describe('mergeBanditSummaries', () => {
  function makeSummary(featureDim, sampleSize) {
    var embeddingDim = featureDim / 2;  // featureDim === embeddingDim * 2
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

  it('weighted toward the side with more observations (accumulated precision)', () => {
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
});
