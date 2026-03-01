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

// ── Tuneable constants ────────────────────────────────────────────────────────

/** Diagonal scale applied to the identity prior when A is freshly initialized.
 *  A small value (<<1) produces a weak prior that is quickly overwritten by
 *  observations. 0.01 works well for embedding dims in the 16–64 range. */
var PRIOR_REGULARIZATION = 0.01;

/** Diagonal jitter added to A before retrying a failed Cholesky inversion.
 *  Sized to be larger than floating-point rounding noise but smaller than
 *  any legitimate eigenvalue. A single retry is intentional: if A is still
 *  non-SPD after this jitter the state is corrupt and we should throw, not
 *  loop, so the bug surfaces visibly. */
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
  var embeddingDim      = state.embedding.dim;
  var expectedFeatureDim = embeddingDim * 2;

  if (state.bandit.featureDim !== expectedFeatureDim) {
    throw new Error(
      '[BANDIT] featureDim mismatch: state.bandit.featureDim is ' + state.bandit.featureDim +
      ' but embedding.dim * 2 = ' + expectedFeatureDim + '. ' +
      'State file may be corrupt or from a different configuration.'
    );
  }

  if (!state.bandit.A || state.bandit.A.length !== expectedFeatureDim) {
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
 * Sample a parameter vector θ from the current posterior using
 * A⁻¹ and mean b for a Gaussian approximation.
 *
 * @param {import('../types').LMSState} state
 * @returns {number[]}
 */
function sampleTheta(state) {
  ensureBanditInitialized(state);
  var Ainv = math.invertSPD(state.bandit.A);
  var mean = math.matVec(Ainv, state.bandit.b);

  // Draw from N(mean, A⁻¹) via Cholesky of A⁻¹
  var L = math.cholesky(Ainv);
  var z = [];
  for (var i = 0; i < mean.length; i++) z.push(math.randn());
  var noise = math.matVec(L, z);
  return mean.map(function (m, i) { return m + noise[i]; });
}

/**
 * Select the lesson with the highest sampled expected gain.
 *
 * @param {import('../types').LMSState} state
 * @param {string} studentId
 * @returns {string|null}
 */
function selectLesson(state, studentId) {
  ensureBanditInitialized(state);

  var theta = sampleTheta(state);
  var lessons = state.embedding.lessons;
  var bestId = null;
  var bestScore = -Infinity;

  var studentVec = embeddings.ensureStudentVector(state, studentId);

  Object.keys(lessons).forEach(function (lessonId) {
    var lessonVec = embeddings.ensureLessonVector(state, lessonId);
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

  // A ← γA + x xᵀ
  var outerXX = math.outer(x, x);
  for (var i = 0; i < A.length; i++) {
    for (var j = 0; j < A[i].length; j++) {
      A[i][j] = gamma * A[i][j] + outerXX[i][j];
    }
  }

  // b ← γb + x · gain
  for (var k = 0; k < b.length; k++) {
    b[k] = gamma * b[k] + x[k] * gain;
  }

  state.bandit.observationCount += 1;
}

module.exports = {
  ensureBanditInitialized: ensureBanditInitialized,
  selectLesson:            selectLesson,
  updateBandit:            updateBandit
};

