// packages/agni-engine/federation.js
// AGNI LMS Engine — federated bandit summary export and merging
//
// Handles precision-weighted combination of bandit posteriors from two hubs.
// Used when a village hub syncs with a regional hub over the 2G link.
//
// Target: Node.js 14+. CommonJS.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const crypto = require('crypto');
const math = require('./math');
const thompson = require('./thompson');

/** Max embeddingDim (matches thompson/embeddings). Prevents OOM from corrupt summaries. */
const MAX_EMBEDDING_DIM = 1024;

/** Clamp remote mean components to mitigate federation poisoning. */
const MEAN_CLIP = 10;

/** Max seenSyncIds to retain (prevents unbounded growth). Eviction is FIFO — oldest dropped. */
const MAX_SEEN_SYNC_IDS = 500;

/**
 * Content hash for sync deduplication. Deterministic — same summary yields same syncId.
 * Uses only embeddingDim, mean, precision, sampleSize (syncId excluded).
 * CONSTRAINT: Federating hubs should run the same Node version — JSON.stringify of
 * floats can differ across engines (e.g. Node 14 vs 16), producing different hashes
 * for identical summaries on heterogeneous deployments.
 */
function contentHash(summary) {
  const payload = JSON.stringify({
    embeddingDim: summary.embeddingDim,
    mean: summary.mean,
    precision: summary.precision,
    sampleSize: summary.sampleSize
  });
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

/** Deep-copy a matrix (avoid returning live reference). */
function copyMat(A) {
  if (A == null || !Array.isArray(A)) {
    throw new Error('[FEDERATION] copyMat: matrix must be non-null array');
  }
  return A.map(function(row, i) {
    if (!Array.isArray(row)) {
      throw new Error('[FEDERATION] copyMat: row ' + i + ' is not an array');
    }
    return row.slice();
  });
}

/** Validate mean vector: non-null, correct length, all finite. */
function validateMean(vec, label, expectedLen) {
  if (vec == null || !Array.isArray(vec)) {
    throw new Error('[FEDERATION] ' + label + '.mean must be a non-null array');
  }
  if (vec.length !== expectedLen) {
    throw new Error('[FEDERATION] ' + label + '.mean length mismatch: got ' + vec.length + ', expected ' + expectedLen);
  }
  for (let k = 0; k < vec.length; k++) {
    if (typeof vec[k] !== 'number' || !Number.isFinite(vec[k])) {
      throw new Error('[FEDERATION] ' + label + '.mean has non-finite value at index ' + k);
    }
  }
}

/** Validate precision matrix: square, correct dimensions, no jagged rows, finite values. */
function validatePrecision(prec, label, expectedDim) {
  if (!Array.isArray(prec) || prec.length !== expectedDim) {
    throw new Error(
      '[FEDERATION] ' + label + '.precision must be array of length ' + expectedDim + ' (embeddingDim*2)'
    );
  }
  for (let i = 0; i < prec.length; i++) {
    if (!Array.isArray(prec[i]) || prec[i].length !== expectedDim) {
      throw new Error('[FEDERATION] ' + label + '.precision is jagged at row ' + i + ' (expected ' + expectedDim + ' cols)');
    }
    for (let j = 0; j < prec[i].length; j++) {
      if (typeof prec[i][j] !== 'number' || !Number.isFinite(prec[i][j])) {
        throw new Error('[FEDERATION] ' + label + '.precision has non-finite value at [' + i + '][' + j + ']');
      }
    }
  }
}

/** Validate sampleSize is non-negative integer. Module-level to avoid per-call allocation. */
function validSampleSize(n, label) {
  if (!math.isNonNegativeInteger(n)) {
    throw new Error('[FEDERATION] ' + label + '.sampleSize must be non-negative integer, got: ' + n);
  }
}

/**
 * Export current bandit posterior summary for federation sync.
 *
 * The `precision` field is A from recursive least squares (A ≈ Σ⁻¹).
 * It is a *raw* precision matrix — not scaled by sampleSize. A copy is
 * returned so callers cannot mutate live bandit state.
 *
 * Uses Cholesky solve (O(n²)) instead of full inversion (O(n³)) for mean.
 *
 * When observationCount > 0, validates A/b without repairing — avoid exporting
 * a prior masquerading as accumulated posterior if ensureBanditInitialized reset A.
 *
 * @param {import('../types').LMSState} state
 * @returns {import('../types').BanditSummary}
 */
function getBanditSummary(state) {
  if (state == null || state.bandit == null) {
    throw new Error('[FEDERATION] getBanditSummary: state and state.bandit must be non-null');
  }
  thompson.assertFeatureDimInvariant(state);
  const expectedFeatureDim = state.embedding.dim * 2;
  const n = state.bandit.observationCount;
  validSampleSize(n, 'observationCount');
  if (n > 0) {
    // Do not call ensureBanditInitialized — it may reset A and export prior as posterior
    const A = state.bandit.A;
    const b = state.bandit.b;
    if (!Array.isArray(A) || A.length !== expectedFeatureDim ||
        !Array.isArray(b) || b.length !== expectedFeatureDim) {
      throw new Error(
        '[FEDERATION] observationCount > 0 but bandit A/b missing or wrong size — state inconsistent'
      );
    }
    for (let ri = 0; ri < A.length; ri++) {
      if (!Array.isArray(A[ri]) || A[ri].length !== expectedFeatureDim) {
        throw new Error('[FEDERATION] bandit A is jagged at row ' + ri + ' — state inconsistent');
      }
      for (let cj = 0; cj < A[ri].length; cj++) {
        if (typeof A[ri][cj] !== 'number' || !Number.isFinite(A[ri][cj])) {
          throw new Error('[FEDERATION] bandit A has non-finite value at [' + ri + '][' + cj + '] — state inconsistent');
        }
      }
    }
    for (let bi = 0; bi < b.length; bi++) {
      if (typeof b[bi] !== 'number' || !Number.isFinite(b[bi])) {
        throw new Error('[FEDERATION] bandit b has non-finite value at [' + bi + '] — state inconsistent');
      }
    }
  } else {
    thompson.ensureBanditInitialized(state);
  }
  // Cholesky solve A*mean = b → mean = A⁻¹b (O(n²)), avoid O(n³) invertSPD
  let L;
  try {
    L = math.cholesky(state.bandit.A);
  } catch (e) {
    throw new Error(
      '[FEDERATION] getBanditSummary: Cholesky failed — bandit A may be non-SPD (corrupt state). ' +
      'Original: ' + (e && e.message ? e.message : String(e))
    );
  }
  const mean = math.backSub(L, math.forwardSub(L, state.bandit.b));
  return {
    embeddingDim:   state.embedding.dim,  // Contract: federating hubs must use same value
    mean:           mean,
    precision:      copyMat(state.bandit.A),  // A ≈ Σ⁻¹ (raw); copy to avoid aliasing
    sampleSize:     n,
    posteriorVersion: 1,  // Schema version for merge semantics; bump on format change
    trainingWindow:    n  // Observations in this posterior; aids audit and merge ordering
  };
}

/**
 * Add syncId (content hash), hubId, and exportSequence for vector-clock–style dedup.
 * Returns new object with deep-copied mean/precision; does not mutate input.
 * @param {object} summary
 * @param {{ hubId: string, exportSequence: number }} [opts]  for sneakernet loop prevention
 */
function addSyncId(summary, opts) {
  const syncId = contentHash(summary);
  const out = {
    embeddingDim:     summary.embeddingDim,
    mean:             summary.mean.slice(),
    precision:        copyMat(summary.precision),
    sampleSize:       summary.sampleSize,
    posteriorVersion: summary.posteriorVersion,
    trainingWindow:   summary.trainingWindow,
    syncId:           syncId
  };
  if (opts && typeof opts.hubId === 'string' && typeof opts.exportSequence === 'number') {
    out.hubId = opts.hubId;
    out.exportSequence = opts.exportSequence;
  }
  return out;
}

/**
 * Merge two bandit summaries using precision-weighted Bayesian combination.
 *
 * Idempotent: same (local, remote) yields same merged summary. Deduplication
 * (syncId, hubHighWater) is handled by mergeRemoteSummary in the engine.
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
  if (local == null || remote == null) {
    throw new Error('[FEDERATION] mergeBanditSummaries: local and remote must be non-null');
  }

  // Contract: embeddingDim must be present — federating hubs declare their config explicitly.
  if (!math.isPositiveInteger(local.embeddingDim)) {
    throw new Error(
      '[FEDERATION] BanditSummary must include embeddingDim (integer >= 1). ' +
      'Federating hubs must use identical AGNI_EMBEDDING_DIM; re-export from hub to get current format.'
    );
  }
  if (!math.isPositiveInteger(remote.embeddingDim)) {
    throw new Error(
      '[FEDERATION] Remote BanditSummary must include embeddingDim (integer >= 1). ' +
      'Cannot merge with hub using different export format or config.'
    );
  }
  if (local.embeddingDim > MAX_EMBEDDING_DIM || remote.embeddingDim > MAX_EMBEDDING_DIM) {
    throw new Error(
      '[FEDERATION] embeddingDim must be <= ' + MAX_EMBEDDING_DIM + ' (got local=' + local.embeddingDim +
      ', remote=' + remote.embeddingDim + '). Corrupt summary may cause OOM.'
    );
  }
  if (local.embeddingDim !== remote.embeddingDim) {
    throw new Error(
      '[FEDERATION] Federation contract violated: local.embeddingDim=' + local.embeddingDim +
      ', remote.embeddingDim=' + remote.embeddingDim + '. ' +
      'All federating hubs must deploy with the same AGNI_EMBEDDING_DIM.'
    );
  }

  const expectedFeatureDim = local.embeddingDim * 2;
  validateMean(local.mean, 'local', expectedFeatureDim);
  validateMean(remote.mean, 'remote', expectedFeatureDim);
  validatePrecision(local.precision, 'local', expectedFeatureDim);
  validatePrecision(remote.precision, 'remote', expectedFeatureDim);
  validSampleSize(local.sampleSize, 'local');
  validSampleSize(remote.sampleSize, 'remote');

  // Clip remote mean to mitigate federation poisoning (malicious hub submitting extreme posteriors)
  const remoteMeanClipped = remote.mean.map(function (v) {
    return Math.max(-MEAN_CLIP, Math.min(MEAN_CLIP, v));
  });

  const totalN = local.sampleSize + remote.sampleSize;

  const pv = Math.max(local.posteriorVersion || 1, remote.posteriorVersion || 1);

  // Guard: both zero — return neutral summary
  if (totalN === 0) {
    const featDim = local.embeddingDim * 2;
    return {
      embeddingDim:     local.embeddingDim,
      mean:             math.zeros(featDim),
      precision:        math.identity(featDim),
      sampleSize:       0,
      posteriorVersion: pv,
      trainingWindow:   0
    };
  }

  // Bug 3: one side has zero — return copy of the non-zero side
  if (local.sampleSize === 0) {
    return {
      embeddingDim:     remote.embeddingDim,
      mean:             remote.mean.slice(),
      precision:        copyMat(remote.precision),
      sampleSize:       remote.sampleSize,
      posteriorVersion: pv,
      trainingWindow:   remote.sampleSize
    };
  }
  if (remote.sampleSize === 0) {
    return {
      embeddingDim:     local.embeddingDim,
      mean:             local.mean.slice(),
      precision:        copyMat(local.precision),
      sampleSize:       local.sampleSize,
      posteriorVersion: pv,
      trainingWindow:   local.sampleSize
    };
  }

  // Standard Bayesian merge: P_merged = P_local + P_remote (independent posteriors)
  const mergedPrec = math.symmetrize(math.addMat(local.precision, remote.precision));  // Fix float asymmetry from JSON round-trip

  // Precision-weighted mean: μ = P_merged⁻¹ (P_local·μ_local + P_remote·μ_remote)
  // Use clipped remote mean to mitigate federation poisoning
  // Cholesky solve (O(n²)) instead of invertSPD (O(n³)) — same optimization as getBanditSummary
  const weightedSum = math.addVec(
    math.matVec(local.precision,  local.mean),
    math.matVec(remote.precision, remoteMeanClipped)
  );
  let L_merged;
  try {
    L_merged = math.cholesky(mergedPrec);
  } catch (e) {
    throw new Error(
      '[FEDERATION] mergeBanditSummaries: Cholesky failed — merged precision may be non-SPD (corrupt local or remote summary). ' +
      'Original: ' + (e && e.message ? e.message : String(e))
    );
  }
  let mergedMean = math.backSub(L_merged, math.forwardSub(L_merged, weightedSum));
  mergedMean = mergedMean.map(function (v) {
    return Math.max(-MEAN_CLIP, Math.min(MEAN_CLIP, v));
  });

  return {
    embeddingDim:     local.embeddingDim,
    mean:             mergedMean,
    precision:        copyMat(mergedPrec),  // total-unit scaled precision; copy to avoid aliasing
    sampleSize:       totalN,
    posteriorVersion: pv,
    trainingWindow:   totalN
  };
}

module.exports = {
  addSyncId:             addSyncId,
  contentHash:           contentHash,
  getBanditSummary:      getBanditSummary,
  mergeBanditSummaries:  mergeBanditSummaries,
  MAX_SEEN_SYNC_IDS:     MAX_SEEN_SYNC_IDS
};

