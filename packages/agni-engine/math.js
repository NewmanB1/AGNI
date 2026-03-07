// src/engine/math.js
// AGNI LMS Engine — pure math utilities
//
// No external dependencies. Used across Rasch, embeddings, and bandit layers.
// All functions are pure (no side effects, no state).
//
// CONTRACT: Do not add in-place variants. Callers may pass aliased arrays
// (e.g. addVec(a, a)); implementations must never mutate inputs. An in-place
// variant would silently corrupt shared state when a === b.
//
// Target: Node.js 14+. CommonJS.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

/** Minimum diagonal for Cholesky. Below this, sqrt(diag) and divisions blow up (NaN-poison Thompson).
 *  JITTER in thompson.js must be >= CHOLESKY_EPSILON for jitter retry to succeed. */
var CHOLESKY_EPSILON = 1e-10;

/**
 * Dot product of two vectors.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
function dot(a, b) {
  if (a == null) throw new Error('[MATH] dot: first argument is null or undefined');
  if (b == null) throw new Error('[MATH] dot: second argument is null or undefined');
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
  if (a == null) throw new Error('[MATH] addVec: first argument is null or undefined');
  if (b == null) throw new Error('[MATH] addVec: second argument is null or undefined');
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
  if (v == null) throw new Error('[MATH] scaleVec: vector is null or undefined');
  if (typeof s !== 'number' || !isFinite(s)) {
    throw new Error('[MATH] scaleVec: scalar must be finite number');
  }
  return v.map(function(x) { return x * s; });
}

/**
 * Outer product: a bᵀ → matrix.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number[][]}
 */
function outer(a, b) {
  if (a == null) throw new Error('[MATH] outer: first argument is null or undefined');
  if (b == null) throw new Error('[MATH] outer: second argument is null or undefined');
  for (var i = 0; i < a.length; i++) {
    if (!(i in a)) throw new Error('[MATH] outer: sparse first vector (hole at ' + i + ')');
  }
  for (i = 0; i < b.length; i++) {
    if (!(i in b)) throw new Error('[MATH] outer: sparse second vector (hole at ' + i + ')');
  }
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
  if (A == null) throw new Error('[MATH] addMat: first argument is null or undefined');
  if (B == null) throw new Error('[MATH] addMat: second argument is null or undefined');
  var rows = A.length;
  if (rows !== B.length) {
    throw new Error('[MATH] addMat: dimension mismatch (' + rows + 'x? vs ' + B.length + 'x?)');
  }
  if (rows === 0) return [];
  var cols = A[0].length;
  if (cols !== B[0].length) {
    throw new Error('[MATH] addMat: dimension mismatch (' + rows + 'x' + cols + ' vs ' + rows + 'x' + B[0].length + ')');
  }
  for (var i = 0; i < rows; i++) {
    if (A[i].length !== cols || B[i].length !== cols) {
      throw new Error('[MATH] addMat: jagged matrix at row ' + i);
    }
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
  if (A == null) throw new Error('[MATH] scaleMat: matrix is null or undefined');
  if (typeof s !== 'number' || !isFinite(s)) {
    throw new Error('[MATH] scaleMat: scalar must be finite number');
  }
  if (A.length > 0) {
    var cols = A[0].length;
    for (var i = 0; i < A.length; i++) {
      if (A[i].length !== cols) throw new Error('[MATH] scaleMat: jagged matrix at row ' + i);
      for (var j = 0; j < cols; j++) {
        if (!(j in A[i])) throw new Error('[MATH] scaleMat: sparse row at ' + i + ',' + j);
      }
    }
  }
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
  if (A == null) throw new Error('[MATH] matVec: matrix is null or undefined');
  if (x == null) throw new Error('[MATH] matVec: vector is null or undefined');
  if (A.length === 0) return [];
  var cols = A[0].length;
  if (cols !== x.length) {
    throw new Error('[MATH] matVec: dimension mismatch (cols=' + cols + ' vs vec=' + x.length + ')');
  }
  for (var i = 0; i < A.length; i++) {
    if (A[i].length !== cols) {
      throw new Error('[MATH] matVec: jagged matrix at row ' + i);
    }
  }
  return A.map(function(row) { return dot(row, x); });
}

/**
 * Generate an identity matrix of size n.
 * @param {number} n
 * @returns {number[][]}
 */
function identity(n) {
  if (n == null) throw new Error('[MATH] identity: n is null or undefined');
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) {
    throw new Error('[MATH] identity: n must be non-negative integer, got ' + n);
  }
  var I = new Array(n);
  for (var i = 0; i < n; i++) {
    I[i] = new Array(n).fill(0);
    I[i][i] = 1;
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
  if (A == null) throw new Error('[MATH] cholesky: matrix is null or undefined');
  var n = A.length;
  var i, j, k, sum, diag;
  for (i = 0; i < n; i++) {
    if (!A[i] || A[i].length !== n) {
      throw new Error('[MATH] cholesky: matrix must be square (got ' + n + 'x' + (A[i] ? A[i].length : '?') + ')');
    }
  }
  for (i = 0; i < n; i++) {
    for (j = i + 1; j < n; j++) {
      if (Math.abs((A[i][j] || 0) - (A[j][i] || 0)) > 1e-12) {
        throw new Error('[MATH] cholesky: matrix is not symmetric (A[' + i + '][' + j + '] !== A[' + j + '][' + i + '])');
      }
    }
  }
  var L = new Array(n);
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
  if (b == null) throw new Error('[MATH] forwardSub: RHS vector is null or undefined');
  var n = L.length;
  if (b.length !== n) {
    throw new Error('[MATH] forwardSub: dimension mismatch (L is ' + n + 'x' + n + ', b.length=' + b.length + ')');
  }
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
  if (y == null) throw new Error('[MATH] backSub: RHS vector is null or undefined');
  var n = L.length;
  if (y.length !== n) {
    throw new Error('[MATH] backSub: dimension mismatch (L is ' + n + 'x' + n + ', y.length=' + y.length + ')');
  }
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
  if (A == null) throw new Error('[MATH] invertSPD: matrix is null or undefined');
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

  for (i = 0; i < n; i++) {
    for (j = 0; j < i; j++) {
      inv[i][j] = inv[j][i] = (inv[i][j] + inv[j][i]) * 0.5;
    }
  }
  return inv;
}

/**
 * Gaussian random variable (Box–Muller). Pure — no module-level state.
 * @returns {number}
 */
function randn() {
  var u, v, lim = 1000;
  do {
    u = Math.random();
    v = Math.random();
    if (--lim <= 0) {
      throw new Error('[MATH] randn: PRNG returned zero 1000 times');
    }
  } while (u === 0 || v === 0);
  var r = Math.sqrt(-2 * Math.log(u));
  return r * Math.cos(2 * Math.PI * v);
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

