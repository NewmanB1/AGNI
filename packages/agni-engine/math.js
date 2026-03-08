// packages/agni-engine/math.js
// AGNI LMS Engine — pure math utilities
//
// Runs on: Village Hub (Raspberry Pi, Node 14+). CommonJS.
// BOUNDARY: Must NOT be imported by packages/agni-runtime (Chrome 44 / ES5). Use zeros(),
// isNonNegativeInteger, etc. instead of Array.fill/Number.isInteger for future-proofing.
//
// No external dependencies. Used across Rasch, embeddings, and bandit layers.
// All functions are pure (no side effects, no state).
//
// CONTRACT: Do not add in-place variants. Callers may pass aliased arrays
// (e.g. addVec(a, a)); implementations must never mutate inputs. An in-place
// variant would silently corrupt shared state when a === b.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

/** Minimum diagonal for Cholesky. Below this, sqrt(diag) and divisions blow up (NaN-poison Thompson).
 *  JITTER in thompson.js must be >= CHOLESKY_EPSILON for jitter retry to succeed. */
var CHOLESKY_EPSILON = 1e-10;

/** Symmetry tolerance for Cholesky. Relaxed from 1e-12 to accommodate JSON round-trip error in post-federation merged precision matrices. */
var CHOLESKY_SYMMETRY_TOL = 1e-8;

/** ES5-safe zero-filled array. Use instead of new Array(n).fill(0) for boundary-creep safety if math.js ever reaches edge runtime. */
function zeros(n) {
  var arr = new Array(n);
  for (var k = 0; k < n; k++) arr[k] = 0;
  return arr;
}

/** ES5-safe integer check. Use instead of Number.isInteger for IE/edge compatibility. */
function isNonNegativeInteger(x) {
  return typeof x === 'number' && isFinite(x) && x === Math.floor(x) && x >= 0;
}

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
  for (var i = 0; i < a.length; i++) {
    if (typeof a[i] !== 'number' || !isFinite(a[i])) {
      throw new Error('[MATH] dot: non-finite element at first vector index ' + i);
    }
    if (typeof b[i] !== 'number' || !isFinite(b[i])) {
      throw new Error('[MATH] dot: non-finite element at second vector index ' + i);
    }
    sum += a[i] * b[i];
  }
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
  for (var i = 0; i < a.length; i++) {
    if (typeof a[i] !== 'number' || !isFinite(a[i])) {
      throw new Error('[MATH] addVec: non-finite element at first vector index ' + i);
    }
    if (typeof b[i] !== 'number' || !isFinite(b[i])) {
      throw new Error('[MATH] addVec: non-finite element at second vector index ' + i);
    }
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
  if (!Array.isArray(v)) {
    throw new Error('[MATH] scaleVec: vector must be array');
  }
  if (typeof s !== 'number' || !isFinite(s)) {
    throw new Error('[MATH] scaleVec: scalar must be finite number');
  }
  for (var i = 0; i < v.length; i++) {
    if (typeof v[i] !== 'number' || !isFinite(v[i])) {
      throw new Error('[MATH] scaleVec: non-finite element at index ' + i);
    }
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
    if (typeof a[i] !== 'number' || !isFinite(a[i])) {
      throw new Error('[MATH] outer: non-finite element at first vector index ' + i);
    }
  }
  for (var j = 0; j < b.length; j++) {
    if (typeof b[j] !== 'number' || !isFinite(b[j])) {
      throw new Error('[MATH] outer: non-finite element at second vector index ' + j);
    }
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
  if (!Array.isArray(A[0]) || !Array.isArray(B[0])) {
    throw new Error('[MATH] addMat: first row must be array');
  }
  var cols = A[0].length;
  if (cols !== B[0].length) {
    throw new Error('[MATH] addMat: dimension mismatch (' + rows + 'x' + cols + ' vs ' + rows + 'x' + B[0].length + ')');
  }
  for (var i = 1; i < rows; i++) {
    if (A[i].length !== cols || B[i].length !== cols) {
      throw new Error('[MATH] addMat: jagged matrix at row ' + i);
    }
  }
  return A.map(function(row, i) {
    return row.map(function(v, j) { return Number(v) + Number(B[i][j]); });
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
        if (typeof A[i][j] !== 'number' || !isFinite(A[i][j])) {
          throw new Error('[MATH] scaleMat: non-finite element at row ' + i + ', col ' + j);
        }
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
  if (!Array.isArray(x)) {
    throw new Error('[MATH] matVec: vector must be array');
  }
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
  if (!isNonNegativeInteger(n)) {
    throw new Error('[MATH] identity: n must be non-negative integer, got ' + n);
  }
  if (n === 0) return [];
  var I = new Array(n);
  for (var i = 0; i < n; i++) {
    I[i] = zeros(n).slice();
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
  var i, j, k, sum, diag, aij, aji;
  for (i = 0; i < n; i++) {
    if (!A[i] || A[i].length !== n) {
      throw new Error('[MATH] cholesky: matrix must be square (got ' + n + 'x' + (A[i] ? A[i].length : '?') + ')');
    }
    if (typeof A[i][i] !== 'number' || !isFinite(A[i][i])) {
      throw new Error('[MATH] cholesky: non-numeric diagonal at [' + i + ']');
    }
    for (j = i + 1; j < n; j++) {
      aij = A[i][j];
      aji = A[j][i];
      if (typeof aij !== 'number' || typeof aji !== 'number' || !isFinite(aij) || !isFinite(aji)) {
        throw new Error('[MATH] cholesky: non-numeric entry at [' + i + '][' + j + ']');
      }
      if (Math.abs(aij - aji) > CHOLESKY_SYMMETRY_TOL) {
        throw new Error('[MATH] cholesky: matrix is not symmetric (A[' + i + '][' + j + '] !== A[' + j + '][' + i + '])');
      }
    }
  }
  var L = new Array(n);
  for (i = 0; i < n; i++) {
    L[i] = zeros(n).slice();
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
  if (L == null) throw new Error('[MATH] forwardSub: L is null or undefined');
  if (b == null) throw new Error('[MATH] forwardSub: RHS vector is null or undefined');
  var n = L.length;
  for (var ri = 0; ri < n; ri++) {
    if (!L[ri] || !Array.isArray(L[ri]) || L[ri].length !== n) {
      throw new Error('[MATH] forwardSub: L must be square matrix (got row ' + ri + ' with length ' + (L[ri] ? L[ri].length : '?') + ')');
    }
  }
  if (b.length !== n) {
    throw new Error('[MATH] forwardSub: dimension mismatch (L is ' + n + 'x' + n + ', b.length=' + b.length + ')');
  }
  var y = zeros(n).slice();
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
  if (L == null) throw new Error('[MATH] backSub: L is null or undefined');
  if (y == null) throw new Error('[MATH] backSub: RHS vector is null or undefined');
  var n = L.length;
  for (var ri = 0; ri < n; ri++) {
    if (!L[ri] || !Array.isArray(L[ri]) || L[ri].length !== n) {
      throw new Error('[MATH] backSub: L must be square matrix (got row ' + ri + ' with length ' + (L[ri] ? L[ri].length : '?') + ')');
    }
  }
  if (y.length !== n) {
    throw new Error('[MATH] backSub: dimension mismatch (L is ' + n + 'x' + n + ', y.length=' + y.length + ')');
  }
  var x = zeros(n).slice();
  var i, j, sum;
  for (i = n - 1; i >= 0; i--) {
    sum = 0;
    /* Lᵀ x = y: read column j of L (L[j][i]) for the transpose, not row */
    for (j = i + 1; j < n; j++) sum += L[j][i] * x[j];
    if (L[i][i] === 0 || !isFinite(L[i][i])) {
      throw new Error('[MATH] backSub: zero or invalid diagonal at i=' + i);
    }
    x[i] = (y[i] - sum) / L[i][i];
  }
  return x;
}

/**
 * Force matrix to be symmetric (mutates A): A[i][j] = A[j][i] = (A[i][j] + A[j][i]) * 0.5.
 * Use after addMat when inputs may have float asymmetry from JSON round-trip.
 * WARNING: Mutates A in place. Call only on matrices you own — never pass shared/aliased
 * state (e.g. bandit precision matrix). Use a copy if the original must be preserved.
 * @param {number[][]} A  Square matrix (mutated).
 * @returns {number[][]}  A (same reference).
 */
function symmetrize(A) {
  if (A == null) throw new Error('[MATH] symmetrize: matrix is null or undefined');
  var n = A.length;
  for (var i = 0; i < n; i++) {
    for (var j = 0; j < i; j++) {
      var v = (A[i][j] + A[j][i]) * 0.5;
      A[i][j] = A[j][i] = v;
    }
  }
  return A;
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
    e = zeros(n).slice();
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
 * Assumes Math.random() ∈ [0,1) per spec. If PRNG returns 0 (pathological),
 * retries with new draws; returning 0 would corrupt Thompson sampling (deterministic draw).
 * Box–Muller generates two samples; this returns one (cos sample; sin discarded).
 * @returns {number}
 */
function randn() {
  var u, v, r;
  for (var retries = 0; retries < 8; retries++) {
    u = Math.random();
    v = Math.random();
    if (u === 0 || v === 0) {
      if (typeof console !== 'undefined' && console.error && retries === 0) {
        console.error('[MATH] randn: PRNG returned zero (broken runtime), retrying');
      }
      continue;
    }
    r = Math.sqrt(-2 * Math.log(u));
    return r * Math.cos(2 * Math.PI * v);
  }
  throw new Error('[MATH] randn: PRNG returned zero repeatedly — broken runtime');
}

module.exports = {
  CHOLESKY_EPSILON: CHOLESKY_EPSILON,
  CHOLESKY_SYMMETRY_TOL: CHOLESKY_SYMMETRY_TOL,
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
  randn:     randn,
  symmetrize: symmetrize
};

