// src/thompson.js
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
 * @param {import('./types').LMSState} state
 */
function ensureBanditInitialized(state) {
  var embeddingDim      = state.embedding.dim;
  var expectedFeatureDim = embeddingDim * 2;

  if (state.bandit.featureDim !== expectedFeatureDim) {
    throw new Error(
      '[BANDIT] featureDim mismatch: state.bandit.featureDim is ' + state.bandit.featureDim +
      ' but embedding.dim * 2 = ' + expectedFeatureDim + '. ' +
      'The bandit feature vector is [...studentVec, ...lessonVec], so featureDim must ' +
      'always equal embeddingDim * 2. Fix LMSState initialization.'
    );
  }

  var dim = state.bandit.featureDim;

  // Shape guard: catch A matrices that are the right row count but wrong
  // column count (e.g. deserialized from a state file with a different dim).
  // Checked before the re-init branch so a corrupt-but-wrong-size A is
  // caught explicitly rather than silently overwritten.
  if (state.bandit.A.length > 0 &&
      state.bandit.A.length === dim &&
      state.bandit.A[0].length !== dim) {
    throw new Error(
      '[BANDIT] A matrix shape is ' + state.bandit.A.length + '×' + state.bandit.A[0].length +
      ' but featureDim=' + dim + ' requires a square ' + dim + '×' + dim + ' matrix. ' +
      'State file may be from a different embedding.dim — delete lms_state.json to reset.'
    );
  }

  if (state.bandit.A.length === 0 || state.bandit.A.length !== dim) {
    state.bandit.A = math.identity(dim);
    // Small prior regularization (shrinks toward zero, prevents degenerate Ainv)
    for (var i = 0; i < dim; i++) state.bandit.A[i][i] *= PRIOR_REGULARIZATION;
    state.bandit.b = Array(dim).fill(0);
    state.bandit.observationCount = 0;
  }
}


// ── Selection ─────────────────────────────────────────────────────────────────

/**
 * Select the best lesson using Thompson Sampling.
 *
 * Samples a weight vector θ ~ N(A⁻¹b, A⁻¹) then picks the lesson with
 * the highest predicted gain under that sample. The stochastic selection
 * naturally balances exploration and exploitation without an explicit
 * epsilon parameter.
 *
 * @param {import('./types').LMSState} state
 * @param {string} studentId
 * @returns {string|null}  lessonId, or null if no lessons are registered
 */
function selectLesson(state, studentId) {
  embeddings.ensureStudentVector(state, studentId);
  ensureBanditInitialized(state);

  var studentVec = state.embedding.students[studentId].vector;
  var Ainv;

  try {
    Ainv = math.invertSPD(state.bandit.A);
  } catch (_e) {
    // A is not positive definite — add small diagonal jitter and retry once.
    // A single retry is intentional: if A is still non-SPD after JITTER the
    // state is corrupt and the second invertSPD call should throw rather than
    // loop, so the bug surfaces visibly.
    var jitterA = state.bandit.A.map(function(row, i) {
      var r = row.slice();
      r[i] += JITTER;
      return r;
    });
    Ainv = math.invertSPD(jitterA);
  }

  var mean        = math.matVec(Ainv, state.bandit.b);
  var thetaSample = math.sampleMVN(mean, Ainv);

  var bestLesson = null;
  var bestScore  = -Infinity;
  var lessonIds  = Object.keys(state.embedding.lessons);

  for (var i = 0; i < lessonIds.length; i++) {
    var lessonId  = lessonIds[i];
    var lessonVec = state.embedding.lessons[lessonId].vector;
    var x         = banditFeature(studentVec, lessonVec);
    var score     = math.dot(thetaSample, x);

    if (score > bestScore) {
      bestScore  = score;
      bestLesson = lessonId;
    }
  }

  return bestLesson;
}


// ── Update ────────────────────────────────────────────────────────────────────

/**
 * Update bandit posterior with a new (student, lesson, gain) observation.
 *
 * Uses recursive least squares with exponential forgetting:
 *   A ← γA + x xᵀ
 *   b ← γb + gain·x
 * where x = [...studentVec, ...lessonVec] and γ = state.bandit.forgetting.
 *
 * Forgetting (γ < 1) down-weights old observations so the bandit adapts
 * to distribution shift (e.g. new lessons added, student cohort changes).
 * Set γ = 1 for a stationary environment.
 *
 * @param {import('./types').LMSState} state
 * @param {string} studentId
 * @param {string} lessonId
 * @param {number} gain
 */
function updateBandit(state, studentId, lessonId, gain) {
  embeddings.ensureStudentVector(state, studentId);
  embeddings.ensureLessonVector(state, lessonId);
  ensureBanditInitialized(state);

  var gamma = state.bandit.forgetting;
  var z     = state.embedding.students[studentId].vector;
  var w     = state.embedding.lessons[lessonId].vector;
  var x     = banditFeature(z, w);

  state.bandit.A = math.addMat(math.scaleMat(state.bandit.A, gamma), math.outer(x, x));
  state.bandit.b = math.addVec(math.scaleVec(state.bandit.b, gamma), math.scaleVec(x, gain));
  state.bandit.observationCount++;
}

module.exports = {
  ensureBanditInitialized,
  selectLesson,
  updateBandit
};
