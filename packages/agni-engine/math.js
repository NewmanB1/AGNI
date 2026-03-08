// packages/agni-engine/math.js
// AGNI LMS Engine — pure math utilities
//
// Runs on: Village Hub (Raspberry Pi, Node 14+). CommonJS.
// BOUNDARY: Must NOT be imported by packages/agni-runtime (Chrome 44 / ES5). Use zeros(),
// isNonNegativeInteger, etc. instead of Array.fill/Number.isInteger for future-proofing.
//
// No external dependencies. Used across Rasch, embeddings, and bandit layers.
// All functions are pure except randn (two-sample cache for entropy efficiency on Pi).
//
// CONTRACT: Do not add in-place variants. Callers may pass aliased arrays
// (e.g. addVec(a, a)); implementations must never mutate inputs. An in-place
// variant would silently corrupt shared state when a === b.
//
// DESIGN NOTES (contributors):
// - Internal vs public: dot() is the public API; dotInner() is internal and
//   skips validation. Use dotInner only after inputs are validated (e.g. matVec).
// - Matrix row validation: use !A[i] || !Array.isArray(A[i]) before .length;
//   then A[i].length !== cols for jagged. Separate errors: "row X must be array"
//   vs "jagged matrix at row X".
// - Purity: all functions are pure except randn (module-level _randnCache).
//   No other shared mutable state.
// - See docs/playbooks/math.md for testing (randn, _randnClearCache).
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

/** Minimum diagonal for Cholesky. Below this, sqrt(diag) and divisions blow up (NaN-poison Thompson).
 *  JITTER in thompson.js must be >= CHOLESKY_EPSILON for jitter retry to succeed. */
var CHOLESKY_EPSILON = 1e-10;

/** Symmetry tolerance for Cholesky. Relaxed from 1e-12 to accommodate JSON round-trip error in post-federation merged precision matrices. */
var CHOLESKY_SYMMETRY_TOL = 1e-8;

/**
 * ES5-safe zero-filled array of length n. Always allocates fresh — never cached or shared.
 * Callers (identity, cholesky, forwardSub, backSub, invertSPD) depend on this for correctness.
 * Use instead of new Array(n).fill(0) for boundary-creep safety if math.js ever reaches edge runtime.
 * @param {number} n
 * @returns {number[]}
 */
function zeros(n) {
  var arr = new Array(n);
  for (var k = 0; k < n; k++) arr[k] = 0;
  return arr;
}

/** ES5-safe integer check. Use instead of Number.isInteger for IE/edge compatibility. */
function isNonNegativeInteger(x) {
  return typeof x === 'number' && isFinite(x) && x === Math.floor(x) && x >= 0;
}

/** Inner dot product (no validation). Call only after inputs are validated. */
function dotInner(a, b) {
  var sum = 0;
  for (var i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
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
  for (var i = 0; i < a.length; i++) {
    if (typeof a[i] !== 'number' || !isFinite(a[i])) {
      throw new Error('[MATH] dot: non-finite element at first vector index ' + i);
    }
    if (typeof b[i] !== 'number' || !isFinite(b[i])) {
      throw new Error('[MATH] dot: non-finite element at second vector index ' + i);
    }
  }
  return dotInner(a, b);
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
  var cols;
  for (var i = 0; i < rows; i++) {
    if (!Array.isArray(A[i])) {
      throw new Error('[MATH] addMat: row ' + i + ' of A must be array');
    }
    if (!Array.isArray(B[i])) {
      throw new Error('[MATH] addMat: row ' + i + ' of B must be array');
    }
    if (i === 0) {
      cols = A[0].length;
      if (cols !== B[0].length) {
        throw new Error('[MATH] addMat: dimension mismatch (' + rows + 'x' + cols + ' vs ' + rows + 'x' + B[0].length + ')');
      }
    } else if (A[i].length !== cols || B[i].length !== cols) {
      throw new Error('[MATH] addMat: jagged matrix at row ' + i);
    }
    for (var c = 0; c < cols; c++) {
      if (typeof A[i][c] !== 'number' || !isFinite(A[i][c])) {
        throw new Error('[MATH] addMat: non-finite element at A[' + i + '][' + c + ']');
      }
      if (typeof B[i][c] !== 'number' || !isFinite(B[i][c])) {
        throw new Error('[MATH] addMat: non-finite element at B[' + i + '][' + c + ']');
      }
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
    if (!A[0] || !Array.isArray(A[0])) {
      throw new Error('[MATH] scaleMat: first row must be array');
    }
    var cols = A[0].length;
    for (var i = 0; i < A.length; i++) {
      if (!A[i] || !Array.isArray(A[i])) {
        throw new Error('[MATH] scaleMat: row ' + i + ' must be array');
      }
      if (A[i].length !== cols) {
        throw new Error('[MATH] scaleMat: jagged matrix at row ' + i);
      }
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
  if (!A[0] || !Array.isArray(A[0])) {
    throw new Error('[MATH] matVec: first row must be array');
  }
  var cols = A[0].length;
  if (cols !== x.length) {
    throw new Error('[MATH] matVec: dimension mismatch (cols=' + cols + ' vs vec=' + x.length + ')');
  }
  for (var i = 0; i < A.length; i++) {
    if (!A[i] || !Array.isArray(A[i])) {
      throw new Error('[MATH] matVec: row ' + i + ' must be array');
    }
    if (A[i].length !== cols) {
      throw new Error('[MATH] matVec: jagged matrix at row ' + i);
    }
    for (var c = 0; c < cols; c++) {
      if (typeof A[i][c] !== 'number' || !isFinite(A[i][c])) {
        throw new Error('[MATH] matVec: non-finite element at row ' + i + ', col ' + c);
      }
    }
  }
  for (var xi = 0; xi < x.length; xi++) {
    if (typeof x[xi] !== 'number' || !isFinite(x[xi])) {
      throw new Error('[MATH] matVec: non-finite element in vector at index ' + xi);
    }
  }
  return A.map(function(row) { return dotInner(row, x); });
}

/**
 * Generate an identity matrix of size n.
 * @param {number} n
 * @returns {number[][]}
 */
function identity(n) {
  if (n == null) throw new Error('[MATH] identity: n is null or undefined');
  if (!isNonNegativeInteger(n) || n < 1) {
    throw new Error('[MATH] identity: n must be positive integer, got ' + n);
  }
  var I = new Array(n);
  for (var i = 0; i < n; i++) {
    I[i] = zeros(n);
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
  if (n === 0) {
    throw new Error('[MATH] cholesky: empty matrix not supported (zero-dim invalid)');
  }
  var i, j, k, sum, diag, aij, aji;
  for (i = 0; i < n; i++) {
    if (!A[i] || !Array.isArray(A[i])) {
      throw new Error('[MATH] cholesky: row ' + i + ' must be array');
    }
    if (A[i].length !== n) {
      throw new Error('[MATH] cholesky: matrix must be square (got row ' + i + ' with length ' + A[i].length + ')');
    }
    if (typeof A[i][i] !== 'number' || !isFinite(A[i][i])) {
      throw new Error('[MATH] cholesky: non-numeric diagonal at [' + i + ']');
    }
    /* Off-diagonal: j>i covers each pair once; aij and aji together validate upper and lower triangle */
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
    L[i] = zeros(n);
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
    if (!L[ri] || !Array.isArray(L[ri])) {
      throw new Error('[MATH] forwardSub: row ' + ri + ' of L must be array');
    }
    if (L[ri].length !== n) {
      throw new Error('[MATH] forwardSub: L must be square matrix (got row ' + ri + ' with length ' + L[ri].length + ')');
    }
  }
  if (b.length !== n) {
    throw new Error('[MATH] forwardSub: dimension mismatch (L is ' + n + 'x' + n + ', b.length=' + b.length + ')');
  }
  for (var bi = 0; bi < n; bi++) {
    if (typeof b[bi] !== 'number' || !isFinite(b[bi])) {
      throw new Error('[MATH] forwardSub: non-finite RHS element at index ' + bi);
    }
  }
  var y = zeros(n);
  var i, j, sum;
  for (i = 0; i < n; i++) {
    sum = 0;
    for (j = 0; j < i; j++) sum += L[i][j] * y[j];
    if (L[i][i] < CHOLESKY_EPSILON || !isFinite(L[i][i])) {
      throw new Error('[MATH] forwardSub: diagonal too small or invalid at i=' + i);
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
    if (!L[ri] || !Array.isArray(L[ri])) {
      throw new Error('[MATH] backSub: row ' + ri + ' of L must be array');
    }
    if (L[ri].length !== n) {
      throw new Error('[MATH] backSub: L must be square matrix (got row ' + ri + ' with length ' + L[ri].length + ')');
    }
  }
  if (y.length !== n) {
    throw new Error('[MATH] backSub: dimension mismatch (L is ' + n + 'x' + n + ', y.length=' + y.length + ')');
  }
  for (var yi = 0; yi < n; yi++) {
    if (typeof y[yi] !== 'number' || !isFinite(y[yi])) {
      throw new Error('[MATH] backSub: non-finite RHS element at index ' + yi);
    }
  }
  var x = zeros(n);
  var i, j, sum;
  for (i = n - 1; i >= 0; i--) {
    sum = 0;
    /* Lᵀ x = y: read column j of L (L[j][i]) for the transpose, not row */
    for (j = i + 1; j < n; j++) sum += L[j][i] * x[j];
    if (L[i][i] < CHOLESKY_EPSILON || !isFinite(L[i][i])) {
      throw new Error('[MATH] backSub: diagonal too small or invalid at i=' + i);
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
    if (!A[i] || !Array.isArray(A[i])) {
      throw new Error('[MATH] symmetrize: row ' + i + ' must be array');
    }
    if (A[i].length !== n) {
      throw new Error('[MATH] symmetrize: matrix must be square (got row ' + i + ' with length ' + A[i].length + ')');
    }
    for (var j = 0; j < n; j++) {
      if (typeof A[i][j] !== 'number' || !isFinite(A[i][j])) {
        throw new Error('[MATH] symmetrize: non-finite element at [' + i + '][' + j + ']');
      }
    }
  }
  for (i = 0; i < n; i++) {
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
  if (n === 0) {
    throw new Error('[MATH] invertSPD: empty matrix not supported (zero-dim invalid)');
  }
  var L = cholesky(A);
  var inv = new Array(n);
  var i, j, e, y, x;
  for (i = 0; i < n; i++) {
    inv[i] = zeros(n);
  }

  for (j = 0; j < n; j++) {
    e = zeros(n);
    e[j] = 1;
    y = forwardSub(L, e);
    x = backSub(L, y);
    for (i = 0; i < n; i++) {
      inv[i][j] = x[i];
    }
  }

  return symmetrize(inv);
}

/** Cached sin sample from previous Box–Muller; halves entropy use on headless Pi. */
var _randnCache = null;

/** Reset randn cache. Call before mocking Math.random or between tests. See randn() JSDoc for test-pollution details. Not part of public API. */
function _randnClearCache() {
  _randnCache = null;
}

/**
 * Gaussian random variable (Box–Muller). Caches second sample to avoid discarding entropy.
 * Assumes Math.random() ∈ [0,1) per spec. If PRNG returns 0 (pathological),
 * retries with new draws; returning 0 would corrupt Thompson sampling (deterministic draw).
 *
 * WARNING — Test pollution: randn uses module-level _randnCache. If one test calls randn()
 * and consumes the cos sample, the sin sample remains in the cache and will be returned as
 * the first randn() value in the next test, even if Math.random is mocked to a fresh sequence.
 * Call math._randnClearCache() before mocking Math.random or between tests that require
 * deterministic randn behavior.
 *
 * If randn throws (e.g. broken PRNG, retry exhaustion), call _randnClearCache() before
 * retrying. The cache is cleared on the throw path, but if the caller catches exceptions
 * from elsewhere in the engine, a prior randn() may have left a cached value; clearing
 * ensures deterministic behavior after recovery.
 *
 * @returns {number}
 */
function randn() {
  var u, v, r, theta;
  if (_randnCache !== null) {
    var out = _randnCache;
    _randnCache = null;
    return out;
  }
  for (var retries = 0; retries < 8; retries++) {
    u = Math.random();
    v = Math.random();
    if (u === 0 || v === 0) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('[MATH] randn: PRNG returned zero (broken runtime), retry ' + (retries + 1) + '/8');
      }
      continue;
    }
    r = Math.sqrt(-2 * Math.log(u));
    theta = 2 * Math.PI * v;
    _randnCache = r * Math.sin(theta);
    return r * Math.cos(theta);
  }
  _randnCache = null; /* clear on throw path for consistent post-call state */
  throw new Error('[MATH] randn: PRNG returned zero repeatedly — broken runtime');
}

module.exports = {
  CHOLESKY_EPSILON: CHOLESKY_EPSILON,
  CHOLESKY_SYMMETRY_TOL: CHOLESKY_SYMMETRY_TOL,
  _randnClearCache: _randnClearCache,
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

