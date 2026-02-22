// src/embeddings.js
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

/**
 * Lazy-initialize student embedding vector if missing.
 * Initializes with small random noise to break symmetry.
 * @param {import('./types').LMSState} state
 * @param {string} studentId
 * @returns {number[]}
 */
function ensureStudentVector(state, studentId) {
  if (!state.embedding.students[studentId]) {
    state.embedding.students[studentId] = {
      vector: Array(state.embedding.dim).fill(0).map(function() {
        return 0.05 * math.randn();
      })
    };
  }
  return state.embedding.students[studentId].vector;
}

/**
 * Lazy-initialize lesson embedding vector if missing.
 * Initializes with small random noise to break symmetry.
 * @param {import('./types').LMSState} state
 * @param {string} lessonId
 * @returns {number[]}
 */
function ensureLessonVector(state, lessonId) {
  if (!state.embedding.lessons[lessonId]) {
    state.embedding.lessons[lessonId] = {
      vector: Array(state.embedding.dim).fill(0).map(function() {
        return 0.05 * math.randn();
      })
    };
  }
  return state.embedding.lessons[lessonId].vector;
}

/**
 * Online matrix factorization update with forgetting and L2 regularization.
 *
 * Updates student vector z and lesson vector w so that z·w better predicts
 * the observed gain. Forgetting (γ < 1) gradually discounts older updates,
 * allowing the model to adapt as students progress.
 *
 * Update rule:
 *   err = gain − z·w
 *   z_k ← γ·z_k + lr·(err·w_k − reg·z_k)
 *   w_k ← γ·w_k + lr·(err·z_k − reg·w_k)
 *
 * @param {import('./types').LMSState} state
 * @param {string} studentId
 * @param {string} lessonId
 * @param {number} gain  normalized learning gain (from Rasch Δability)
 */
function updateEmbedding(state, studentId, lessonId, gain) {
  var z = ensureStudentVector(state, studentId);
  var w = ensureLessonVector(state, lessonId);

  var lr      = state.embedding.lr;
  var reg     = state.embedding.reg;
  var gamma   = state.embedding.forgetting;
  var dim     = state.embedding.dim;

  var pred = 0;
  for (var k = 0; k < dim; k++) pred += z[k] * w[k];
  var err = gain - pred;

  for (var k = 0; k < dim; k++) {
    var zi = z[k];
    var wj = w[k];
    z[k] = gamma * zi + lr * (err * wj - reg * zi);
    w[k] = gamma * wj + lr * (err * zi - reg * wj);
  }
}

module.exports = {
  ensureStudentVector,
  ensureLessonVector,
  updateEmbedding
};
