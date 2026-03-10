// packages/agni-engine/embeddings.js
// AGNI LMS Engine — student and lesson embedding vectors
//
// Online matrix factorization with forgetting and L2 regularization.
// Student and lesson vectors are updated on each observation so that
// their dot product approximates the expected learning gain.
//
// Target: Node.js 14+. CommonJS.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

var math = require('./math');

/** @param {import('../types').LMSState} state */
function assertEmbeddingDimValid(state) {
  if (!state.embedding) {
    throw new Error('[EMBEDDING] state.embedding missing — cannot size vectors.');
  }
  math.assertEmbeddingDim(state.embedding.dim, '[EMBEDDING]');
}

/** @param {import('../types').LMSState} state @param {number[]} vector @param {string} label */
function assertVectorLengthMatchesDim(state, vector, label) {
  assertEmbeddingDimValid(state);
  if (vector.length !== state.embedding.dim) {
    throw new Error('[EMBEDDING] ' + label + ' vector length ' + vector.length +
      ' does not match embedding.dim ' + state.embedding.dim + ' — state may be corrupt');
  }
}

/**
 * Get student embedding vector without creating. Returns undefined if missing.
 * Returns the stored reference; do not mutate. Use .slice() if you need a copy.
 * @param {import('../types').LMSState} state
 * @param {string} studentId
 * @returns {number[]|undefined}
 */
function getStudentVector(state, studentId) {
  var rec = state.embedding.students[studentId];
  var vec = rec && Array.isArray(rec.vector) ? rec.vector : undefined;
  if (vec) assertVectorLengthMatchesDim(state, vec, 'student');
  return vec;
}

/**
 * Get lesson embedding vector without creating. Returns undefined if missing.
 * Returns the stored reference; do not mutate. Use .slice() if you need a copy.
 * @param {import('../types').LMSState} state
 * @param {string} lessonId
 * @returns {number[]|undefined}
 */
function getLessonVector(state, lessonId) {
  var rec = state.embedding.lessons[lessonId];
  var vec = rec && Array.isArray(rec.vector) ? rec.vector : undefined;
  if (vec) assertVectorLengthMatchesDim(state, vec, 'lesson');
  return vec;
}

/**
 * Lazy-initialize student embedding vector if missing.
 * Initializes with small random noise to break symmetry.
 * Returns the stored reference. Only updateEmbedding may mutate it. For read-only
 * use (e.g. feature construction, scoring), treat as read-only or call .slice().
 * @param {import('../types').LMSState} state
 * @param {string} studentId
 * @returns {number[]}
 */
function ensureStudentVector(state, studentId) {
  if (typeof studentId !== 'string' || studentId === '') {
    throw new Error('[EMBEDDING] studentId must be a non-empty string, got: ' + (studentId === undefined ? 'undefined' : studentId === null ? 'null' : typeof studentId));
  }
  if (!state.embedding.students[studentId]) {
    assertEmbeddingDimValid(state);
    state.embedding.students[studentId] = {
      vector: math.zeros(state.embedding.dim).map(function() {
        return 0.05 * math.randn();
      })
    };
  }
  var vec = state.embedding.students[studentId].vector;
  assertVectorLengthMatchesDim(state, vec, 'student');
  return vec;
}

/**
 * Lazy-initialize lesson embedding vector if missing.
 * Initializes with small random noise to break symmetry.
 * Returns the stored reference. Only updateEmbedding may mutate it. For read-only
 * use (e.g. feature construction, scoring), treat as read-only or call .slice().
 * @param {import('../types').LMSState} state
 * @param {string} lessonId
 * @returns {number[]}
 */
function ensureLessonVector(state, lessonId) {
  if (typeof lessonId !== 'string' || lessonId === '') {
    throw new Error('[EMBEDDING] lessonId must be a non-empty string, got: ' + (lessonId === undefined ? 'undefined' : lessonId === null ? 'null' : typeof lessonId));
  }
  if (!state.embedding.lessons[lessonId]) {
    assertEmbeddingDimValid(state);
    state.embedding.lessons[lessonId] = {
      vector: math.zeros(state.embedding.dim).map(function() {
        return 0.05 * math.randn();
      })
    };
  }
  var vec = state.embedding.lessons[lessonId].vector;
  assertVectorLengthMatchesDim(state, vec, 'lesson');
  return vec;
}

/**
 * Online matrix factorization update with forgetting and L2 regularization.
 *
 * Updates student vector z and lesson vector w so that z·w better predicts
 * the observed gain. Forgetting (γ < 1) gradually discounts older updates,
 * allowing the model to adapt as students progress.
 *
 * IMPORTANT: Call only from recordObservation (same flow as updateBandit).
 * Embedding and bandit share the feature space; if a lesson is updated here
 * but never seen by updateBandit (or vice versa), the models diverge.
 *
 * Update rule (err and z_k, w_k captured pre-update; both vectors use same snapshot):
 *   err = gain − z·w
 *   raw_z_k = γ·z_k + lr·(err·w_k − reg·z_k)
 *   raw_w_k = γ·w_k + lr·(err·z_k − reg·w_k)
 *   δ_z = clamp(raw_z_k − z_k, −MAX_DELTA, MAX_DELTA)
 *   δ_w = clamp(raw_w_k − w_k, −MAX_DELTA, MAX_DELTA)
 *   z_k ← clamp(z_k + δ_z, −MAG_CAP, MAG_CAP)
 *   w_k ← clamp(w_k + δ_w, −MAG_CAP, MAG_CAP)
 *
 * Forgetting semantic: Each update multiplies current components by γ before
 * adding the gradient term. Recent observations therefore dominate; after many
 * updates to the same (student,lesson) pair, the embedding is largely determined
 * by recent gradients (e.g. γ=0.96, 100 updates → prior base contribution ~1.7%).
 * Pairs with no recent observations retain their last embedding (no time-based
 * decay). Field operators should expect embeddings to reflect recent activity.
 *
 * @param {import('../types').LMSState} state
 * @param {string} studentId
 * @param {string} lessonId
 * @param {number} gain
 */
function updateEmbedding(state, studentId, lessonId, gain) {
  if (typeof studentId !== 'string' || studentId === '') {
    throw new Error('[EMBEDDING] studentId must be a non-empty string, got: ' + (studentId === undefined ? 'undefined' : studentId === null ? 'null' : typeof studentId));
  }
  if (typeof lessonId !== 'string' || lessonId === '') {
    throw new Error('[EMBEDDING] lessonId must be a non-empty string, got: ' + (lessonId === undefined ? 'undefined' : lessonId === null ? 'null' : typeof lessonId));
  }
  if (typeof gain !== 'number' || !isFinite(gain)) {
    throw new Error('[EMBEDDING] gain must be a finite number, got: ' + gain);
  }
  var z = ensureStudentVector(state, studentId);
  var w = ensureLessonVector(state, lessonId);

  // Bug 3: reject corrupted vectors from state file; no silent propagation of NaN
  for (var i = 0; i < z.length; i++) {
    if (!isFinite(z[i])) {
      throw new Error('[EMBEDDING] student vector has non-finite component at index ' + i + ' — reject update');
    }
  }
  for (i = 0; i < w.length; i++) {
    if (!isFinite(w[i])) {
      throw new Error('[EMBEDDING] lesson vector has non-finite component at index ' + i + ' — reject update');
    }
  }

  // Note: state.bandit.forgetting is separate; hub config uses single "forgetting" key.
  // Migrations must populate both state.embedding.forgetting and state.bandit.forgetting.
  var gamma = state.embedding.forgetting;
  var lr    = state.embedding.lr;
  var reg   = state.embedding.reg;

  if (typeof gamma !== 'number' || !isFinite(gamma) || gamma < 0.9 || gamma > 1) {
    throw new Error('[EMBEDDING] forgetting must be a finite number in [0.9,1], got: ' + gamma);
  }
  if (typeof lr !== 'number' || !isFinite(lr) || lr <= 0 || lr > 0.1) {
    throw new Error('[EMBEDDING] lr must be in (0, 0.1], got: ' + lr);
  }
  if (typeof reg !== 'number' || !isFinite(reg) || reg < 0) {
    throw new Error('[EMBEDDING] reg must be a non-negative finite number, got: ' + reg);
  }

  var dotZW = math.dot(z, w);
  var err   = gain - dotZW;

  // Bug 2: value cap scaled to gain range; gradient clipping avoids saturation oscillation.
  // Rasch gain (ability delta) is typically in [-2, 2]. Cap components at 2 so max
  // dot(z,w) ≈ dim*4; prevents err = gain - 800 when both vectors hit ±10.
  var MAG_CAP = 2;
  // Per-step delta clamp prevents single-update explosion; avoids oscillation at cap.
  var MAX_DELTA = 0.5;

  // Bug 3: compute into temps; reject atomically if any overflow (no partial revert)
  var zNew = [];
  var wNew = [];
  for (var k = 0; k < z.length; k++) {
    var zk = z[k];
    var wk = w[k];
    var newZk = gamma * zk + lr * (err * wk - reg * zk);
    var newWk = gamma * wk + lr * (err * zk - reg * wk);
    if (!isFinite(newZk) || !isFinite(newWk)) {
      throw new Error('[EMBEDDING] update produced non-finite value at k=' + k + ' — reject observation');
    }

    var deltaZk = newZk - zk;
    var deltaWk = newWk - wk;
    deltaZk = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, deltaZk));
    deltaWk = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, deltaWk));

    zNew[k] = Math.max(-MAG_CAP, Math.min(MAG_CAP, zk + deltaZk));
    wNew[k] = Math.max(-MAG_CAP, Math.min(MAG_CAP, wk + deltaWk));
  }
  for (k = 0; k < z.length; k++) {
    z[k] = zNew[k];
    w[k] = wNew[k];
  }
}

module.exports = {
  getStudentVector:    getStudentVector,
  getLessonVector:     getLessonVector,
  ensureStudentVector: ensureStudentVector,
  ensureLessonVector:  ensureLessonVector,
  updateEmbedding:     updateEmbedding
};

