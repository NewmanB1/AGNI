// src/engine/federation.js
// AGNI LMS Engine — federated bandit summary export and merging
//
// Handles precision-weighted combination of bandit posteriors from two hubs.
// Used when a village hub syncs with a regional hub over the 2G link.
//
// Target: Node.js 14+. CommonJS.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

var math = require('./math');
var thompson = require('./thompson');

/** Deep-copy a matrix (avoid returning live reference). */
function copyMat(A) {
  return A.map(function(row) { return row.slice(); });
}

/**
 * Export current bandit posterior summary for federation sync.
 *
 * The `precision` field is A from recursive least squares (A ≈ Σ⁻¹).
 * It is a *raw* precision matrix — not scaled by sampleSize. A copy is
 * returned so callers cannot mutate live bandit state.
 *
 * @param {import('../types').LMSState} state
 * @returns {import('../types').BanditSummary}
 */
function getBanditSummary(state) {
  thompson.assertFeatureDimInvariant(state);
  var n = state.bandit.observationCount;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    throw new Error('[FEDERATION] observationCount must be non-negative integer, got: ' + n);
  }
  var Ainv = math.invertSPD(state.bandit.A);
  var mean = math.matVec(Ainv, state.bandit.b);
  return {
    embeddingDim: state.embedding.dim,  // Contract: federating hubs must use same value
    mean:         mean,
    precision:    copyMat(state.bandit.A),  // A ≈ Σ⁻¹ (raw); copy to avoid aliasing
    sampleSize:   n
  };
}

/**
 * Merge two bandit summaries using precision-weighted Bayesian combination.
 *
 * Standard formula for independent Gaussian posteriors:
 *   P_merged = P_local + P_remote
 *   μ_merged = P_merged⁻¹ (P_local·μ_local + P_remote·μ_remote)
 *
 * RLS A matrices scale with observation count, so adding them directly
 * gives the combined precision. The hub with more observations (larger A)
 * dominates the merged posterior.
 *
 * @param {import('../types').BanditSummary} local   Summary from the local hub
 * @param {import('../types').BanditSummary} remote  Summary from a remote hub
 * @returns {import('../types').BanditSummary}        Merged summary. precision is in raw (total) units.
 */
function mergeBanditSummaries(local, remote) {
  // Contract: embeddingDim must be present — federating hubs declare their config explicitly.
  if (typeof local.embeddingDim !== 'number' || !Number.isInteger(local.embeddingDim) || local.embeddingDim < 1) {
    throw new Error(
      '[FEDERATION] BanditSummary must include embeddingDim (integer >= 1). ' +
      'Federating hubs must use identical AGNI_EMBEDDING_DIM; re-export from hub to get current format.'
    );
  }
  if (typeof remote.embeddingDim !== 'number' || !Number.isInteger(remote.embeddingDim) || remote.embeddingDim < 1) {
    throw new Error(
      '[FEDERATION] Remote BanditSummary must include embeddingDim (integer >= 1). ' +
      'Cannot merge with hub using different export format or config.'
    );
  }
  if (local.embeddingDim !== remote.embeddingDim) {
    throw new Error(
      '[FEDERATION] Federation contract violated: local.embeddingDim=' + local.embeddingDim +
      ', remote.embeddingDim=' + remote.embeddingDim + '. ' +
      'All federating hubs must deploy with the same AGNI_EMBEDDING_DIM.'
    );
  }
  // Sanity: mean length must match embeddingDim*2
  var expectedFeatureDim = local.embeddingDim * 2;
  if (local.mean.length !== expectedFeatureDim || remote.mean.length !== expectedFeatureDim) {
    throw new Error(
      '[FEDERATION] Mean length mismatch: local=' + local.mean.length + ', remote=' + remote.mean.length +
      ', expected embeddingDim*2=' + expectedFeatureDim + '. Summary may be corrupt.'
    );
  }
  if (!Array.isArray(local.precision) || local.precision.length !== expectedFeatureDim ||
      !Array.isArray(remote.precision) || remote.precision.length !== expectedFeatureDim) {
    throw new Error(
      '[FEDERATION] Precision dimensions must match mean (embeddingDim*2=' + expectedFeatureDim + ')'
    );
  }

  function validSampleSize(n, label) {
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      throw new Error('[FEDERATION] ' + label + '.sampleSize must be non-negative integer, got: ' + n);
    }
  }
  validSampleSize(local.sampleSize, 'local');
  validSampleSize(remote.sampleSize, 'remote');

  var totalN = local.sampleSize + remote.sampleSize;

  // Guard: both zero — return neutral summary
  if (totalN === 0) {
    var featDim = local.embeddingDim * 2;
    return {
      embeddingDim: local.embeddingDim,
      mean:         Array(featDim).fill(0),
      precision:    math.identity(featDim),
      sampleSize:   0
    };
  }

  // Bug 3: one side has zero — return copy of the non-zero side
  if (local.sampleSize === 0) {
    return {
      embeddingDim: remote.embeddingDim,
      mean:         remote.mean.slice(),
      precision:    copyMat(remote.precision),
      sampleSize:   remote.sampleSize
    };
  }
  if (remote.sampleSize === 0) {
    return {
      embeddingDim: local.embeddingDim,
      mean:         local.mean.slice(),
      precision:    copyMat(local.precision),
      sampleSize:   local.sampleSize
    };
  }

  // Standard Bayesian merge: P_merged = P_local + P_remote (independent posteriors)
  var mergedPrec = math.addMat(local.precision, remote.precision);

  // Precision-weighted mean: μ = P_merged⁻¹ (P_local·μ_local + P_remote·μ_remote)
  var mergedCov    = math.invertSPD(mergedPrec);
  var weightedSum  = math.addVec(
    math.matVec(local.precision,  local.mean),
    math.matVec(remote.precision, remote.mean)
  );
  var mergedMean = math.matVec(mergedCov, weightedSum);

  return {
    embeddingDim: local.embeddingDim,
    mean:         mergedMean,
    precision:    mergedPrec,  // total-unit scaled precision (consistent with raw A)
    sampleSize:   totalN
  };
}

module.exports = {
  getBanditSummary:      getBanditSummary,
  mergeBanditSummaries:  mergeBanditSummaries
};

