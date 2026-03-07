// src/engine/math.js
// AGNI LMS Engine — pure math utilities
//
// No external dependencies. Used across Rasch, embeddings, and bandit layers.
// All functions are pure (no side effects, no state).
//
// Target: Node.js 14+. CommonJS.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

/** Minimum diagonal for Cholesky. Below this, sqrt(diag) and divisions blow up (NaN-poison Thompson). */
var CHOLESKY_EPSILON = 1e-10;

/**
 * Dot product of two vectors.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
function dot(a, b) {
  if (a.length !== b.length) {
    throw new Error('[MATH] dot: vector length mismatch (' + a.length + ' vs ' + b.length + ')');
  }
  var sum = 0;
  for (var i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

/**
 * Element-wise vector addition.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number[]}
 */
function addVec(a, b) {
  if (a.length !== b.length) {
    throw new Error('[MATH] addVec: vector length mismatch (' + a.length + ' vs ' + b.length + ')');
  }
  return a.map(function(v, i) { return v + b[i]; });
}

/**
 * Scale vector by scalar.
 * @param {number[]} v
 * @param {number}   s
 * @returns {number[]}
 */
function scaleVec(v, s) {
  return v.map(function(x) { return x * s; });
}

/**
 * Outer product: a bᵀ → matrix.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number[][]}
 */
function outer(a, b) {
  return a.map(function(ai) {
    return b.map(function(bj) { return ai * bj; });
  });
}

/**
 * Element-wise matrix addition.
 * @param {number[][]} A
 * @param {number[][]} B
 * @returns {number[][]}
 */
function addMat(A, B) {
  if (A.length !== B.length || (A.length > 0 && A[0].length !== B[0].length)) {
    throw new Error('[MATH] addMat: dimension mismatch (' + A.length + 'x' + (A[0] ? A[0].length : 0) + ' vs ' + B.length + 'x' + (B[0] ? B[0].length : 0) + ')');
  }
  return A.map(function(row, i) {
    return row.map(function(v, j) { return v + B[i][j]; });
  });
}

/**
 * Scale entire matrix by scalar.
 * @param {number[][]} A
 * @param {number}     s
 * @returns {number[][]}
 */
function scaleMat(A, s) {
  return A.map(function(row) {
    return row.map(function(v) { return v * s; });
  });
}

/**
 * Matrix-vector product.
 * @param {number[][]} A
 * @param {number[]}   x
 * @returns {number[]}
 */
function matVec(A, x) {
  if (A.length > 0 && A[0].length !== x.length) {
    throw new Error('[MATH] matVec: dimension mismatch (cols=' + A[0].length + ' vs vec=' + x.length + ')');
  }
  return A.map(function(row) { return dot(row, x); });
}

/**
 * Generate an identity matrix of size n.
 * @param {number} n
 * @returns {number[][]}
 */
function identity(n) {
  var I = new Array(n);
  for (var i = 0; i < n; i++) {
    I[i] = new Array(n);
    for (var j = 0; j < n; j++) {
      I[i][j] = i === j ? 1 : 0;
    }
  }
  return I;
}

/**
 * Cholesky decomposition of a symmetric positive-definite matrix.
 * Returns lower-triangular L such that A = L Lᵀ.
 * @param {number[][]} A
 * @returns {number[][]}
 */
function cholesky(A) {
  var n = A.length;
  var L = new Array(n);
  var i, j, k, sum, diag;
  for (i = 0; i < n; i++) {
    L[i] = new Array(n).fill(0);
  }

  for (i = 0; i < n; i++) {
    for (j = 0; j <= i; j++) {
      sum = 0;
      for (k = 0; k < j; k++) {
        sum += L[i][k] * L[j][k];
      }
      if (i === j) {
        diag = A[i][i] - sum;
        if (diag < CHOLESKY_EPSILON || !isFinite(diag)) {
          throw new Error('[MATH] Matrix is not SPD (Cholesky failed at i=' + i + ')');
        }
        L[i][j] = Math.sqrt(diag);
      } else {
        L[i][j] = (A[i][j] - sum) / L[j][j];
      }
    }
  }
  return L;
}

/**
 * Solve L y = b for y where L is lower-triangular.
 * @param {number[][]} L
 * @param {number[]}   b
 * @returns {number[]}
 */
function forwardSub(L, b) {
  var n = L.length;
  var y = new Array(n);
  var i, j, sum;
  for (i = 0; i < n; i++) {
    sum = 0;
    for (j = 0; j < i; j++) sum += L[i][j] * y[j];
    if (L[i][i] === 0 || !isFinite(L[i][i])) {
      throw new Error('[MATH] forwardSub: zero or invalid diagonal at i=' + i);
    }
    y[i] = (b[i] - sum) / L[i][i];
  }
  return y;
}

/**
 * Solve Lᵀ x = y for x where L is lower-triangular.
 * @param {number[][]} L
 * @param {number[]}   y
 * @returns {number[]}
 */
function backSub(L, y) {
  var n = L.length;
  var x = new Array(n);
  var i, j, sum;
  for (i = n - 1; i >= 0; i--) {
    sum = 0;
    for (j = i + 1; j < n; j++) sum += L[j][i] * x[j];
    if (L[i][i] === 0 || !isFinite(L[i][i])) {
      throw new Error('[MATH] backSub: zero or invalid diagonal at i=' + i);
    }
    x[i] = (y[i] - sum) / L[i][i];
  }
  return x;
}

/**
 * Invert a symmetric positive-definite matrix using Cholesky decomposition.
 * @param {number[][]} A
 * @returns {number[][]}
 */
function invertSPD(A) {
  var n = A.length;
  var L = cholesky(A);
  var inv = new Array(n);
  var i, j, e, y, x;
  for (i = 0; i < n; i++) {
    inv[i] = new Array(n);
  }

  for (j = 0; j < n; j++) {
    e = new Array(n).fill(0);
    e[j] = 1;
    y = forwardSub(L, e);
    x = backSub(L, y);
    for (i = 0; i < n; i++) {
      inv[i][j] = x[i];
    }
  }

  return inv;
}

/**
 * Gaussian random variable (Box–Muller).
 * @returns {number}
 */
function randn() {
  var u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

module.exports = {
  CHOLESKY_EPSILON: CHOLESKY_EPSILON,
  dot:       dot,
  addVec:    addVec,
  scaleVec:  scaleVec,
  outer:     outer,
  addMat:    addMat,
  scaleMat:  scaleMat,
  matVec:    matVec,
  identity:  identity,
  cholesky:  cholesky,
  forwardSub: forwardSub,
  backSub:   backSub,
  invertSPD: invertSPD,
  randn:     randn
};

