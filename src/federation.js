// src/federation.js
// AGNI LMS Engine — federated bandit summary export and merging
//
// Handles precision-weighted combination of bandit posteriors from two hubs.
// Used when a village hub syncs with a regional hub over the 2G link.
//
// Target: Node.js 14+. CommonJS.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

var math = require('./math');

/**
 * Export current bandit posterior summary for federation sync.
 *
 * The `precision` field is A from recursive least squares (A ≈ Σ⁻¹).
 * It is a *raw* precision matrix — not scaled by sampleSize. Downstream
 * consumers (e.g. mergeBanditSummaries) must be aware of this unit.
 *
 * @param {import('./types').LMSState} state
 * @returns {import('./types').BanditSummary}
 */
function getBanditSummary(state) {
  var Ainv = math.invertSPD(state.bandit.A);
  var mean = math.matVec(Ainv, state.bandit.b);
  return {
    mean:       mean,
    precision:  state.bandit.A,  // A ≈ Σ⁻¹ (raw, not scaled by sampleSize)
    sampleSize: state.bandit.observationCount
  };
}

/**
 * Merge two bandit summaries using precision-weighted Bayesian combination.
 *
 * ## Scaled-precision convention
 *
 * When combining posteriors from two hubs that have seen different numbers
 * of observations, weighting the raw precision matrices equally would
 * over-count the larger hub's contribution: its A matrix already encodes
 * more observations, so adding it to a smaller hub's A would bias the
 * merged result toward the larger hub twice over.
 *
 * We address this by normalising each hub's precision matrix to "per-
 * observation" units before combining, then restoring total scale by
 * multiplying by the combined sample count:
 *
 *   mergedPrec = (localPrec/n_local + remotePrec/n_remote) * (n_local + n_remote)
 *              = scaleMat(localPrec, n_remote/(n_local+n_remote))   [local share]
 *            + scaleMat(remotePrec, n_local/(n_local+n_remote))    [remote share]
 *
 * This is equivalent to a precision-weighted average scaled back up to the
 * combined sample count, keeping A in the same unit as a raw recursive-
 * least-squares A matrix with (n_local + n_remote) total observations.
 *
 * ## Mean combination
 *
 * Given normalised precision matrices P_l and P_r (in per-observation units),
 * the precision-weighted mean is:
 *
 *   mergedMean = (P_local + P_remote)⁻¹ (P_local · μ_local + P_remote · μ_remote)
 *
 * We compute this using the scaled matrices directly so the inversion operates
 * on well-conditioned numbers. The scale factor cancels in the mean computation,
 * so the result is numerically equivalent regardless of which unit convention
 * is used for the intermediate matrices.
 *
 * ## invertSPD contract
 *
 * The merged precision matrix output by this function is in the same units as
 * each hub's raw A (total accumulated, not per-observation). Any caller that
 * passes it to invertSPD to recover a covariance will get the covariance
 * corresponding to the merged posterior with (n_local + n_remote) observations,
 * which is the correct interpretation.
 *
 * @param {import('./types').BanditSummary} local   Summary from the local hub
 * @param {import('./types').BanditSummary} remote  Summary from a remote hub
 * @returns {import('./types').BanditSummary}        Merged summary. precision is in raw (total) units.
 */
function mergeBanditSummaries(local, remote) {
  // Dimension guard: merging summaries from different feature spaces is a
  // configuration error, not a recoverable runtime condition.
  if (local.mean.length !== remote.mean.length) {
    throw new Error(
      '[FEDERATION] Cannot merge bandit summaries with different feature dimensions: ' +
      'local.mean.length=' + local.mean.length + ', remote.mean.length=' + remote.mean.length + '. ' +
      'Both hubs must use the same embedding.dim.'
    );
  }

  var totalN = local.sampleSize + remote.sampleSize;

  // Guard: if both sides have zero observations there is no posterior to merge.
  // Return a neutral summary (identity precision, zero mean) rather than
  // stale local data, so downstream invertSPD calls get a valid SPD matrix.
  if (totalN === 0) {
    var dim = local.mean.length;
    return {
      mean:       Array(dim).fill(0),
      precision:  math.identity(dim),
      sampleSize: 0
    };
  }

  // Normalise each side to per-observation scale, then weight by sample share.
  // This makes the merged precision matrix consistent with a raw A that has
  // totalN observations behind it — safe to pass directly to invertSPD.
  var localWeight  = local.sampleSize  > 0 ? remote.sampleSize / totalN : 0;
  var remoteWeight = remote.sampleSize > 0 ? local.sampleSize  / totalN : 0;

  var scaledLocalPrec  = math.scaleMat(local.precision,  localWeight);
  var scaledRemotePrec = math.scaleMat(remote.precision, remoteWeight);
  var mergedPrec       = math.addMat(scaledLocalPrec, scaledRemotePrec);

  // Precision-weighted mean: P_merged⁻¹ (P_local·μ_local + P_remote·μ_remote)
  // Use scaled matrices so the inversion is on the same-unit mergedPrec.
  var mergedCov    = math.invertSPD(mergedPrec);
  var weightedSum  = math.addVec(
    math.matVec(scaledLocalPrec,  local.mean),
    math.matVec(scaledRemotePrec, remote.mean)
  );
  var mergedMean = math.matVec(mergedCov, weightedSum);

  return {
    mean:       mergedMean,
    precision:  mergedPrec,  // total-unit scaled precision (consistent with raw A)
    sampleSize: totalN
  };
}

module.exports = {
  getBanditSummary,
  mergeBanditSummaries
};
