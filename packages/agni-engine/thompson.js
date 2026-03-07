// src/engine/thompson.js
// AGNI LMS Engine — linear Thompson Sampling bandit
//
// Maintains a Bayesian linear regression posterior over lesson reward
// predictions. Uses recursive least squares with exponential forgetting
// to track a non-stationary reward distribution.
//
// Target: Node.js 14+. CommonJS.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

var math       = require('./math');
var embeddings = require('./embeddings');
var log        = require('@agni/utils/logger').createLogger('bandit');

// ── Tuneable constants ────────────────────────────────────────────────────────

/** Diagonal scale applied to the identity prior when A is freshly initialized.
 *  A small value (<<1) produces a weak prior that is quickly overwritten by
 *  observations. 0.01 works well for embedding dims in the 16–64 range. */
var PRIOR_REGULARIZATION = 0.01;

/** Diagonal jitter added to A before retrying a failed Cholesky inversion.
 *  JITTER_LIGHT tried first to minimize mean bias (A+εI)⁻¹b vs A⁻¹b.
 *  JITTER used if light jitter still fails. If both fail, fall back to b.
 *  Both must be >= math.CHOLESKY_EPSILON for jitter retry to succeed. */
var JITTER_LIGHT = 1e-10;
var JITTER = 1e-5;


// ── Feature vector ────────────────────────────────────────────────────────────

/**
 * Concatenate student and lesson embedding vectors into a single bandit
 * feature vector: x = [...studentVec, ...lessonVec].
 *
 * This is the only place the feature vector layout is defined. Both
 * selectLesson and updateBandit call this function so the layout cannot
 * silently diverge between selection and update — a discrepancy would mean
 * the bandit is updating on features different from the ones it used to
 * select, which breaks the RLS posterior entirely.
 *
 * featureDim constraint: x.length === embeddingDim * 2, enforced by
 * ensureBanditInitialized. Do not add extra features here without also
 * updating state.bandit.featureDim and the assertion.
 *
 * @param {number[]} studentVec
 * @param {number[]} lessonVec
 * @returns {number[]}
 */
function banditFeature(studentVec, lessonVec) {
  return studentVec.concat(lessonVec);
}


// ── Invariant (hard constraint) ───────────────────────────────────────────────

/**
 * Assert embedding.dim exists and is a positive integer. Drives all vector sizing;
 * if missing or zero, every vector operation is suspect.
 *
 * @param {import('../types').LMSState} state
 * @throws {Error}
 */
function assertEmbeddingDimValid(state) {
  if (!state.embedding) {
    throw new Error('[BANDIT] state.embedding missing — cannot size vectors.');
  }
  var dim = state.embedding.dim;
  if (typeof dim !== 'number' || !Number.isInteger(dim) || dim < 1 || dim > 1024) {
    throw new Error(
      '[BANDIT] embedding.dim invalid: must be integer in [1,1024], got ' +
      (dim === undefined ? 'undefined' : dim) + '. State may be corrupt.'
    );
  }
}

/**
 * Assert featureDim === embeddingDim * 2. Throws if violated.
 * Call defensively at any engine entry point that touches bandit or feature vectors.
 *
 * @param {import('../types').LMSState} state
 * @throws {Error}
 */
function assertFeatureDimInvariant(state) {
  assertEmbeddingDimValid(state);
  var embeddingDim = state.embedding.dim;
  var expectedFeatureDim = embeddingDim * 2;
  if (state.bandit.featureDim !== expectedFeatureDim) {
    throw new Error(
      '[BANDIT] featureDim invariant violated: state.bandit.featureDim=' + state.bandit.featureDim +
      ' but embedding.dim*2=' + expectedFeatureDim + '. State may be corrupt.'
    );
  }
}

// ── Initialization ────────────────────────────────────────────────────────────

/**
 * Lazy-initialize bandit sufficient statistics if missing or mismatched.
 *
 * Constraint: featureDim MUST equal embeddingDim * 2.
 * The bandit feature vector is constructed as [...studentVec, ...lessonVec],
 * so it is always twice the embedding dimension. Violating this constraint
 * means A/b have the wrong shape and all subsequent matVec/dot calls will
 * either throw or silently produce wrong results.
 *
 * This function asserts the constraint at runtime so misconfigured LMSState
 * objects are caught at initialization rather than producing silent errors
 * during selectLesson / updateBandit.
 *
 * @param {import('../types').LMSState} state
 */
function ensureBanditInitialized(state) {
  assertFeatureDimInvariant(state);
  var expectedFeatureDim = state.bandit.featureDim;

  if (!state.bandit.A || state.bandit.A.length !== expectedFeatureDim ||
      !state.bandit.A[0] || state.bandit.A[0].length !== expectedFeatureDim) {
    state.bandit.A = math.identity(expectedFeatureDim).map(function (row) {
      return row.map(function (v) { return v * PRIOR_REGULARIZATION; });
    });
  }
  if (!state.bandit.b || state.bandit.b.length !== expectedFeatureDim) {
    state.bandit.b = new Array(expectedFeatureDim).fill(0);
  }
}


// ── Core operations ───────────────────────────────────────────────────────────

/**
 * Sample a parameter vector θ from the current posterior N(mean, A⁻¹).
 * Uses Cholesky of A only — no explicit inversion or cholesky(A⁻¹).
 *
 * @param {import('../types').LMSState} state
 * @returns {number[]}
 */
function sampleTheta(state) {
  ensureBanditInitialized(state);

  var A = state.bandit.A;
  var b = state.bandit.b;
  var n = A.length;
  var L, mean;

  function solveAndSample(mat) {
    L = math.cholesky(mat);
    mean = math.backSub(L, math.forwardSub(L, b));
    var z = [];
    for (var j = 0; j < n; j++) z.push(math.randn());
    var noise = math.backSub(L, z);
    return math.addVec(mean, noise);
  }

  function jitteredMatrix(eps) {
    var Ac = new Array(n);
    for (var i = 0; i < n; i++) {
      Ac[i] = A[i].slice();
      Ac[i][i] += eps;
    }
    return Ac;
  }

  try {
    return solveAndSample(A);
  } catch (_e) {
    try {
      return solveAndSample(jitteredMatrix(JITTER_LIGHT));
    } catch (_e2) {
      try {
        return solveAndSample(jitteredMatrix(JITTER));
      } catch (_e3) {
        return math.scaleVec(b, 0);
      }
    }
  }
}

/**
 * Select the lesson with the highest sampled expected gain.
 *
 * SIDE EFFECT: By default, lazily initializes student and lesson embedding vectors
 * if missing (mutates state.embedding). For read-only selection (e.g. dry-run,
 * governance report), pass opts.readOnly: true — then skips lessons without
 * vectors and throws if student vector is missing.
 *
 * ELIGIBLE SET: Pass opts.eligibleLessonIds to restrict selection to theta-filtered
 * lessons. If omitted, iterates all lessons in state (legacy behavior).
 *
 * @param {import('../types').LMSState} state
 * @param {string} studentId
 * @param {{ readOnly?: boolean, eligibleLessonIds?: string[] }} [opts]
 * @returns {string|null}
 */
function selectLesson(state, studentId, opts) {
  ensureBanditInitialized(state);

  var readOnly = opts && opts.readOnly;
  var eligibleLessonIds = opts && opts.eligibleLessonIds;

  // Cold-start safety (Bug 11): when b=0, theta is pure noise. Without eligibleLessonIds,
  // we would score all lessons and pick arbitrarily. Warn and return null.
  if (state.bandit.observationCount === 0 && !Array.isArray(eligibleLessonIds)) {
    log.warn('selectLesson: cold-start with no eligibleLessonIds — returning null (pass theta-filtered candidates)');
    return null;
  }
  var studentVec = readOnly
    ? embeddings.getStudentVector(state, studentId)
    : embeddings.ensureStudentVector(state, studentId);
  if (readOnly && !studentVec) {
    throw new Error('[BANDIT] selectLesson(readOnly): student ' + studentId + ' has no embedding');
  }

  var theta = sampleTheta(state);
  var lessons = state.embedding.lessons;
  var candidateIds = Array.isArray(eligibleLessonIds)
    ? eligibleLessonIds
    : Object.keys(lessons);
  var bestId = null;
  var bestScore = -Infinity;

  candidateIds.forEach(function (lessonId) {
    var lessonVec = readOnly
      ? embeddings.getLessonVector(state, lessonId)
      : embeddings.ensureLessonVector(state, lessonId);
    if (!lessonVec) {
      if (readOnly) return;
      lessonVec = embeddings.ensureLessonVector(state, lessonId);
    }
    var x = banditFeature(studentVec, lessonVec);
    if (x.length !== state.bandit.featureDim) {
      throw new Error('[BANDIT] Feature vector length mismatch in selectLesson for ' + lessonId);
    }
    var score = math.dot(theta, x);
    if (score > bestScore) {
      bestScore = score;
      bestId = lessonId;
    }
  });

  return bestId;
}

/**
 * Update bandit sufficient statistics given an observation.
 *
 * @param {import('../types').LMSState} state
 * @param {string} studentId
 * @param {string} lessonId
 * @param {number} gain
 */
function updateBandit(state, studentId, lessonId, gain) {
  if (typeof gain !== 'number' || !isFinite(gain)) {
    throw new Error('[BANDIT] gain must be a finite number, got: ' + gain);
  }
  ensureBanditInitialized(state);

  var studentVec = embeddings.ensureStudentVector(state, studentId);
  var lessonVec  = embeddings.ensureLessonVector(state, lessonId);
  var x = banditFeature(studentVec, lessonVec);

  if (x.length !== state.bandit.featureDim) {
    throw new Error('[BANDIT] Feature vector length mismatch in updateBandit for ' + lessonId);
  }

  var A = state.bandit.A;
  var b = state.bandit.b;
  var gamma = state.bandit.forgetting;

  if (typeof gamma !== 'number' || !isFinite(gamma) || gamma < 0.9 || gamma > 1) {
    throw new Error('[BANDIT] forgetting must be a finite number in [0.9,1], got: ' + gamma);
  }

  // A ← γA + x xᵀ  (atomic: apply full update or reject entirely)
  var outerXX = math.outer(x, x);
  var Anew = [];
  for (var i = 0; i < A.length; i++) {
    Anew[i] = [];
    for (var j = 0; j < A[i].length; j++) {
      var aVal = gamma * A[i][j] + outerXX[i][j];
      if (!isFinite(aVal)) {
        throw new Error('[BANDIT] updateBandit: overflow in A[' + i + '][' + j + '] (gamma*A + outer) — reject observation');
      }
      Anew[i][j] = aVal;
    }
  }

  // b ← γb + x · gain
  var bnew = [];
  for (var k = 0; k < b.length; k++) {
    var bVal = gamma * b[k] + x[k] * gain;
    if (!isFinite(bVal)) {
      throw new Error('[BANDIT] updateBandit: overflow in b[' + k + '] — reject observation');
    }
    bnew[k] = bVal;
  }

  for (var i = 0; i < A.length; i++) {
    for (var j = 0; j < A[i].length; j++) {
      A[i][j] = Anew[i][j];
    }
  }
  for (var k = 0; k < b.length; k++) {
    b[k] = bnew[k];
  }

  state.bandit.observationCount += 1;
}

module.exports = {
  assertEmbeddingDimValid:   assertEmbeddingDimValid,
  assertFeatureDimInvariant: assertFeatureDimInvariant,
  banditFeature:            banditFeature,
  ensureBanditInitialized:   ensureBanditInitialized,
  sampleTheta:              sampleTheta,
  selectLesson:             selectLesson,
  updateBandit:             updateBandit
};

