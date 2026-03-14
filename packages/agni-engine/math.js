// packages/agni-engine/math.js
// AGNI LMS Engine — pure math utilities
//
// Runs on: Village Hub (Raspberry Pi, Node 14+). CommonJS.
// BOUNDARY: Must NOT be imported by packages/agni-runtime (Chrome 51 / ES5). Use zeros(),
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
// - Sparse vectors: dot, addVec, scaleVec, outer all validate elements; holes
//   (undefined) fail typeof/number checks and throw [MATH]. Consistent with
//   scaleMat (AGNI_MATH_STRICT). Vectors must be dense (LEN-001 #15).
// - Matrix row validation: use !A[i] || !Array.isArray(A[i]) before .length;
//   then A[i].length !== cols for jagged. Separate errors: "row X must be array"
//   vs "jagged matrix at row X".
// - Purity: all functions are pure except randn (module-level _randnCache).
//   No other shared mutable state.
// - See docs/playbooks/math.md for testing (randn, _randnClearCache).
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

var _mathStrict;
function getMathStrict() {
  if (process.env.AGNI_MATH_STRICT !== undefined) {
    return process.env.AGNI_MATH_STRICT === '1' || process.env.AGNI_MATH_STRICT === 'true';
  }
  if (_mathStrict === undefined) {
    try {
      _mathStrict = require('@agni/utils/env-config').mathStrict;
    } catch (_) {
      _mathStrict = false;
    }
  }
  return _mathStrict;
}

/** Minimum diagonal for Cholesky. Below this, sqrt(diag) and divisions blow up (NaN-poison Thompson).
 *  JITTER in thompson.js must be > CHOLESKY_EPSILON for jitter retry to succeed. */
const CHOLESKY_EPSILON = 1e-10;

/** Symmetry tolerance for Cholesky. Relaxed to 1e-8 to tolerate JSON round-trip and federation merge float asymmetry (LEN-001 bug 13). */
const CHOLESKY_SYMMETRY_TOL = 1e-8;

/**
 * ES5-safe zero-filled array of length n. Always allocates fresh — never cached or shared.
 * Callers (identity, cholesky, forwardSub, backSub, invertSPD) depend on this for correctness.
 * Use instead of new Array(n).fill(0) for boundary-creep safety if math.js ever reaches edge runtime.
 * @param {number} n
 * @returns {number[]}
 */
function zeros(n) {
  const arr = new Array(n);
  for (let k = 0; k < n; k++) arr[k] = 0;
  return arr;
}

/** ES5-safe non-negative integer check (0, 1, 2, ...). Use isPositiveInteger when 0 is invalid. */
function isNonNegativeInteger(x) {
  return typeof x === 'number' && isFinite(x) && x === Math.floor(x) && x >= 0;
}

/** ES5-safe positive integer check (n >= 1). Use for matrix dimensions where 0 is invalid. */
function isPositiveInteger(x) {
  return typeof x === 'number' && isFinite(x) && x === Math.floor(x) && x >= 1;
}

/**
 * Assert x is a valid embedding dimension: positive integer in [1,1024].
 * Single source of truth for embedding.dim validation; use from embeddings.js and thompson.js
 * to avoid divergence (e.g. Number.isInteger vs math.isPositiveInteger).
 * @param {number} x
 * @param {string} [prefix] - Error prefix, e.g. '[EMBEDDING]' or '[BANDIT]'
 * @throws {Error}
 */
function assertEmbeddingDim(x, prefix) {
  const p = (typeof prefix === 'string' && prefix) ? prefix + ' ' : '';
  if (!isPositiveInteger(x) || x > 1024) {
    throw new Error(
      p + 'embedding.dim invalid: must be integer in [1,1024], got ' +
      (x === undefined ? 'undefined' : String(x))
    );
  }
}

/** Inner dot product (no validation). Call only after inputs are validated. */
function dotInner(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

/**
 * Dot product of two vectors.
 * Vectors must be dense (no holes); sparse arrays throw [MATH] (LEN-001 #15).
 * @param {number[]} a  Dense vector.
 * @param {number[]} b  Dense vector.
 * @returns {number}
 */
function dot(a, b) {
  if (a == null) throw new Error('[MATH] dot: first argument is null or undefined');
  if (b == null) throw new Error('[MATH] dot: second argument is null or undefined');
  if (a.length !== b.length) {
    throw new Error('[MATH] dot: vector length mismatch (' + a.length + ' vs ' + b.length + ')');
  }
  for (let i = 0; i < a.length; i++) {
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
 * Vectors must be dense (no holes); sparse arrays throw [MATH] (LEN-001 #15).
 * @param {number[]} a  Dense vector.
 * @param {number[]} b  Dense vector.
 * @returns {number[]}
 */
function addVec(a, b) {
  if (a == null) throw new Error('[MATH] addVec: first argument is null or undefined');
  if (b == null) throw new Error('[MATH] addVec: second argument is null or undefined');
  if (a.length !== b.length) {
    throw new Error('[MATH] addVec: vector length mismatch (' + a.length + ' vs ' + b.length + ')');
  }
  var i, ai, bi, sum;
  for (i = 0; i < a.length; i++) {
    ai = Number(a[i]);
    bi = Number(b[i]);
    if (!isFinite(ai) || !isFinite(bi)) {
      throw new Error('[MATH] addVec: element at index ' + i + ' cannot be coerced to finite number');
    }
    sum = ai + bi;
    if (!isFinite(sum)) {
      throw new Error('[MATH] addVec: overflow at index ' + i);
    }
  }
  return a.map(function(v, idx) { return Number(v) + Number(b[idx]); });
}

/**
 * Scale vector by scalar.
 * Vector must be dense (no holes); sparse arrays throw [MATH] (LEN-001 #15).
 * @param {number[]} v  Dense vector.
 * @param {number}   s  Scalar.
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
  for (let i = 0; i < v.length; i++) {
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
  var i, j;
  for (i = 0; i < a.length; i++) {
    if (typeof a[i] !== 'number' || !isFinite(a[i])) {
      throw new Error('[MATH] outer: non-finite element at first vector index ' + i);
    }
  }
  for (j = 0; j < b.length; j++) {
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
  const rows = A.length;
  if (rows !== B.length) {
    throw new Error('[MATH] addMat: dimension mismatch (' + rows + 'x? vs ' + B.length + 'x?)');
  }
  if (rows === 0) return [];
  if (!A[0] || !Array.isArray(A[0])) {
    throw new Error('[MATH] addMat: row 0 of A must be array');
  }
  if (!B[0] || !Array.isArray(B[0])) {
    throw new Error('[MATH] addMat: row 0 of B must be array');
  }
  var cols = A[0].length;
  if (cols !== B[0].length) {
    throw new Error('[MATH] addMat: dimension mismatch (' + rows + 'x' + cols + ' vs ' + rows + 'x' + B[0].length + ')');
  }
  var i, c, ac, bc;
  for (i = 1; i < rows; i++) {
    if (!A[i] || !Array.isArray(A[i])) {
      throw new Error('[MATH] addMat: row ' + i + ' of A must be array');
    }
    if (!B[i] || !Array.isArray(B[i])) {
      throw new Error('[MATH] addMat: row ' + i + ' of B must be array');
    }
    if (A[i].length !== cols || B[i].length !== cols) {
      var which = (A[i].length !== cols) ? 'A' : 'B';
      throw new Error('[MATH] addMat: jagged matrix ' + which + ' at row ' + i);
    }
  }
  for (i = 0; i < rows; i++) {
    for (c = 0; c < cols; c++) {
      ac = Number(A[i][c]);
      bc = Number(B[i][c]);
      if (!isFinite(ac) || !isFinite(bc)) {
        throw new Error('[MATH] addMat: element at [' + i + '][' + c + '] cannot be coerced to finite number');
      }
      if (!isFinite(ac + bc)) {
        throw new Error('[MATH] addMat: overflow at [' + i + '][' + c + ']');
      }
    }
  }
  return A.map(function(row, i) {
    return row.map(function(v, j) { return Number(v) + Number(B[i][j]); });
  });
}

/**
 * Scale entire matrix by scalar.
 * Bandit matrices from identity/outer/addMat are dense by construction; loaded state
 * should be validated at load time. Element validation is gated by AGNI_MATH_STRICT
 * to avoid O(n²) overhead in updateBandit / federation hot path (LEN-001 bug 12).
 *
 * @param {number[][]} A
 * @param {number}     s
 * @returns {number[][]}
 */
function scaleMat(A, s) {
  if (A == null) throw new Error('[MATH] scaleMat: matrix is null or undefined');
  if (typeof s !== 'number' || !isFinite(s)) {
    throw new Error('[MATH] scaleMat: scalar must be finite number');
  }
  var strict = getMathStrict();
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
      if (strict) {
        for (var j = 0; j < cols; j++) {
          if (typeof A[i][j] !== 'number' || !isFinite(A[i][j])) {
            throw new Error('[MATH] scaleMat: non-finite element at row ' + i + ', col ' + j);
          }
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
  if (!Array.isArray(A)) {
    throw new Error('[MATH] matVec: matrix must be array');
  }
  if (!Array.isArray(x)) {
    throw new Error('[MATH] matVec: vector must be array');
  }
  if (A.length === 0) return [];
  if (!A[0] || !Array.isArray(A[0])) {
    throw new Error('[MATH] matVec: first row must be array');
  }
  const cols = A[0].length;
  if (cols !== x.length) {
    throw new Error('[MATH] matVec: dimension mismatch (cols=' + cols + ' vs vec=' + x.length + ')');
  }
  var i, c, xi, ac, xv;
  for (i = 0; i < A.length; i++) {
    if (!A[i] || !Array.isArray(A[i])) {
      throw new Error('[MATH] matVec: row ' + i + ' must be array');
    }
    if (A[i].length !== cols) {
      throw new Error('[MATH] matVec: jagged matrix at row ' + i);
    }
    for (var c = 0; c < cols; c++) {
      var ac = Number(A[i][c]);
      if (!isFinite(ac)) {
        throw new Error('[MATH] matVec: non-finite element at row ' + i + ', col ' + c);
      }
    }
  }
  for (var xi = 0; xi < x.length; xi++) {
    var xv = Number(x[xi]);
    if (!isFinite(xv)) {
      throw new Error('[MATH] matVec: non-finite element in vector at index ' + xi);
    }
  }
  return A.map(function(row) { return dotInner(row, x); });
}

/**
 * Generate an identity matrix of size n.
 * LEN-001 #10: n=0 is invalid — zero-dim matrix breaks cholesky/invertSPD and federation.
 * If you hit this from bandit or federation code, check embeddingDim/featureDim (must be >= 1).
 *
 * @param {number} n
 * @returns {number[][]}
 */
function identity(n) {
  if (n == null) throw new Error('[MATH] identity: n is null or undefined');
  if (n === 0) {
    throw new Error('[MATH] identity: n=0 invalid (zero-dim). Check embeddingDim/featureDim in bandit or federation state.');
  }
  if (!isPositiveInteger(n)) {
    throw new Error('[MATH] identity: n must be positive integer, got ' + n);
  }
  const I = new Array(n);
  for (let i = 0; i < n; i++) {
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
  const n = A.length;
  if (n === 0) {
    throw new Error('[MATH] cholesky: empty matrix not supported (zero-dim invalid)');
  }
  var i, j, k, sum, diag, aij;
  /* LEN-001 #5: Separate square-check pass for clarity and auditability. */
  for (i = 0; i < n; i++) {
    if (!A[i] || !Array.isArray(A[i])) {
      throw new Error('[MATH] cholesky: row ' + i + ' must be array');
    }
    if (A[i].length !== n) {
      throw new Error('[MATH] cholesky: matrix must be square (got row ' + i + ' with length ' + A[i].length + ')');
    }
  }
  /* Diagonal validation; symmetry check folded into decomposition loop (LEN-001 #4). */
  for (i = 0; i < n; i++) {
    if (typeof A[i][i] !== 'number' || !isFinite(A[i][i])) {
      throw new Error('[MATH] cholesky: non-numeric diagonal at [' + i + ']');
    }
    if (A[i][i] < CHOLESKY_EPSILON) {
      throw new Error('[MATH] cholesky: diagonal at [' + i + '][' + i + '] = ' + A[i][i] + ' (matrix is not SPD)');
    }
  }
  const L = new Array(n);
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
        if (typeof diag !== 'number' || !isFinite(diag)) {
          throw new Error('[MATH] cholesky: non-numeric diagonal at [' + i + '][' + i + '] (Cholesky produced NaN/Inf)');
        }
        if (diag < CHOLESKY_EPSILON) {
          throw new Error('[MATH] cholesky: diagonal at [' + i + '][' + i + '] = ' + diag + ' (matrix is not SPD)');
        }
        L[i][j] = Math.sqrt(diag);
      } else {
        aij = A[i][j];
        if (typeof aij !== 'number' || !isFinite(aij)) {
          throw new Error('[MATH] cholesky: non-numeric entry at [' + i + '][' + j + ']');
        }
        if (Math.abs(aij - A[j][i]) > CHOLESKY_SYMMETRY_TOL) {
          throw new Error('[MATH] cholesky: matrix is not symmetric (A[' + i + '][' + j + '] !== A[' + j + '][' + i + '])');
        }
        sum = (aij - sum) / L[j][j];
        if (typeof sum !== 'number' || !isFinite(sum)) {
          throw new Error('[MATH] cholesky: non-numeric entry at [' + i + '][' + j + '] (Cholesky produced NaN/Inf)');
        }
        L[i][j] = sum;
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
  if (!Array.isArray(L)) throw new Error('[MATH] forwardSub: L must be array');
  const n = L.length;
  if (n === 0) throw new Error('[MATH] forwardSub: L must be non-empty square matrix');
  for (let ri = 0; ri < n; ri++) {
    if (!L[ri] || !Array.isArray(L[ri])) {
      throw new Error('[MATH] forwardSub: row ' + ri + ' of L must be array');
    }
    if (L[ri].length !== n) {
      throw new Error('[MATH] forwardSub: L must be square matrix (got row ' + ri + ' with length ' + L[ri].length + ')');
    }
    for (let ci = 0; ci < n; ci++) {
      if (typeof L[ri][ci] !== 'number' || !isFinite(L[ri][ci])) {
        throw new Error('[MATH] forwardSub: non-finite element at L[' + ri + '][' + ci + ']');
      }
    }
  }
  if (b.length !== n) {
    throw new Error('[MATH] forwardSub: dimension mismatch (L is ' + n + 'x' + n + ', b.length=' + b.length + ')');
  }
  for (let bi = 0; bi < n; bi++) {
    if (typeof b[bi] !== 'number' || !isFinite(b[bi])) {
      throw new Error('[MATH] forwardSub: non-finite RHS element at index ' + bi);
    }
  }
  const y = zeros(n);
  return forwardSubInner(L, b, n, y);
}

/** Inner forward substitution (no validation). Call only after L and b are validated. */
function forwardSubInner(L, b, n, y) {
  let i, j, sum;
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
  if (!Array.isArray(L)) throw new Error('[MATH] backSub: L must be array');
  const n = L.length;
  if (n === 0) throw new Error('[MATH] backSub: L must be non-empty square matrix');
  for (let ri = 0; ri < n; ri++) {
    if (!L[ri] || !Array.isArray(L[ri])) {
      throw new Error('[MATH] backSub: row ' + ri + ' of L must be array');
    }
    if (L[ri].length !== n) {
      throw new Error('[MATH] backSub: L must be square matrix (got row ' + ri + ' with length ' + L[ri].length + ')');
    }
    for (let ci = 0; ci < n; ci++) {
      if (typeof L[ri][ci] !== 'number' || !isFinite(L[ri][ci])) {
        throw new Error('[MATH] backSub: non-finite element at L[' + ri + '][' + ci + ']');
      }
    }
  }
  if (y.length !== n) {
    throw new Error('[MATH] backSub: dimension mismatch (L is ' + n + 'x' + n + ', y.length=' + y.length + ')');
  }
  for (let yi = 0; yi < n; yi++) {
    if (typeof y[yi] !== 'number' || !isFinite(y[yi])) {
      throw new Error('[MATH] backSub: non-finite RHS element at index ' + yi);
    }
  }
  const x = zeros(n);
  return backSubInner(L, y, n, x);
}

/** Inner back substitution (no validation). Call only after L and y are validated. */
function backSubInner(L, y, n, x) {
  let i, j, sum;
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
 * Internal: symmetrize in place. Mutates A. Call only on matrices you own.
 * @param {number[][]} A  Square matrix (mutated).
 * @returns {number[][]}  A (same reference).
 */
function symmetrizeInPlace(A) {
  if (A == null) throw new Error('[MATH] symmetrize: matrix is null or undefined');
  const n = A.length;
  for (var i = 0; i < n; i++) {
    if (!A[i] || !Array.isArray(A[i])) {
      throw new Error('[MATH] symmetrize: row ' + i + ' must be array');
    }
    if (A[i].length !== n) {
      throw new Error('[MATH] symmetrize: matrix must be square (got row ' + i + ' with length ' + A[i].length + ')');
    }
    for (let c = 0; c < n; c++) {
      if (typeof A[i][c] !== 'number' || !isFinite(A[i][c])) {
        throw new Error('[MATH] symmetrize: non-finite element at [' + i + '][' + c + ']');
      }
    }
  }
  /* Off-diagonal: average (i,j) and (j,i). LEN-001 #17: diagonal A[i][i] is a single
   * value per position (no pair to average); invertSPD computes each inv[i][i] once. */
  for (i = 0; i < n; i++) {
    for (let j = 0; j < i; j++) {
      const v = (A[i][j] + A[j][i]) * 0.5;
      A[i][j] = A[j][i] = v;
    }
  }
  return A;
}

/**
 * Return a symmetric copy of A. Does not mutate input — safe for shared/aliased matrices.
 * Use symmetrizeInPlace only when you own the matrix and want to mutate.
 * @param {number[][]} A  Square matrix.
 * @returns {number[][]}  New symmetric matrix (copy).
 */
function symmetrize(A) {
  if (A == null) throw new Error('[MATH] symmetrize: matrix is null or undefined');
  const copy = [];
  for (let r = 0; r < A.length; r++) {
    copy[r] = A[r].slice();
  }
  return symmetrizeInPlace(copy);
}

/**
 * Invert a symmetric positive-definite matrix using Cholesky decomposition.
 * inv is freshly allocated; symmetrizeInPlace(inv) mutates our own array, not the caller's.
 * Uses forwardSubInner/backSubInner to avoid O(n³) validation (L validated by cholesky).
 * @param {number[][]} A
 * @returns {number[][]}
 */
function invertSPD(A) {
  if (A == null) throw new Error('[MATH] invertSPD: matrix is null or undefined');
  const n = A.length;
  if (n === 0) {
    throw new Error('[MATH] invertSPD: empty matrix not supported (zero-dim invalid)');
  }
  if (!A[0] || !Array.isArray(A[0]) || A[0].length !== n) {
    throw new Error('[MATH] invertSPD: matrix must be square (got ' + n + 'x' + (A[0] ? A[0].length : '?') + ')');
  }
  const L = cholesky(A);
  const inv = new Array(n);
  let i, j, e, y, x;
  for (i = 0; i < n; i++) {
    inv[i] = zeros(n);
  }

  for (j = 0; j < n; j++) {
    e = zeros(n);
    e[j] = 1;
    y = forwardSubInner(L, e, n, zeros(n));
    x = backSubInner(L, y, n, zeros(n));
    for (i = 0; i < n; i++) {
      inv[i][j] = x[i];
    }
  }

  return symmetrizeInPlace(inv);
}

/** Cached sin sample from previous Box–Muller; halves entropy use on headless Pi. */
let _randnCache = null;

/** Reset randn cache. Call before mocking Math.random or between tests. See randn() JSDoc for test-pollution details. Not part of public API. */
function _randnClearCache() {
  _randnCache = null;
}

/** Minimum value for Box-Muller inputs. Rejects u/v below this so sqrt(-2*ln(u)) stays finite.
 *  Using 1e-15 (not 1e-300) guarantees r <= ~8.3, preventing Infinity for tiny u (LEN-18). */
const RANDN_MIN = 1e-15;

/**
 * Gaussian random variable (Box–Muller). Caches second sample to avoid discarding entropy.
 * Assumes Math.random() ∈ [0,1) per spec. Rejects u or v below RANDN_MIN (subnormals produce
 * log → Infinity → cached bad value). Retries if cos/sin sample is non-finite (LEN-001 #18).
 *
 * WARNING — Test pollution: randn uses module-level _randnCache. If one test calls randn()
 * and consumes the cos sample, the sin sample remains in the cache and will be returned as
 * the first randn() value in the next test, even if Math.random is mocked to a fresh sequence.
 * Call math._randnClearCache() before mocking Math.random or between tests that require
 * deterministic randn behavior.
 *
 * On PRNG failure (retry exhaustion), randn logs and returns 0 instead of throwing
 * (LEN-001 #1: avoid crash in selectBestLesson). Call _randnClearCache() before
 * retrying if you need deterministic behavior after recovery.
 *
 * @returns {number}
 */
function randn() {
  let u, v, r, theta;
  if (_randnCache !== null) {
    const out = _randnCache;
    _randnCache = null;
    return isFinite(out) ? out : 0; /* LEN-18: clamp non-finite (should not occur) */
  }
  for (let retries = 0; retries < 8; retries++) {
    u = Math.random();
    v = Math.random();
    if (u < RANDN_MIN || v < RANDN_MIN) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('[MATH] randn: PRNG returned near-zero (' + u + ', ' + v + '), retry ' + (retries + 1) + '/8');
      }
      continue;
    }
    r = Math.sqrt(-2 * Math.log(u));
    theta = 2 * Math.PI * v;
    var cosVal = r * Math.cos(theta);
    var sinVal = r * Math.sin(theta);
    if (!isFinite(cosVal) || !isFinite(sinVal)) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('[MATH] randn: non-finite sample (u=' + u + '), retry ' + (retries + 1) + '/8');
      }
      continue;
    }
    _randnCache = sinVal;
    return isFinite(cosVal) ? cosVal : 0; /* LEN-18: clamp (should not occur) */
  }
  /* LEN-001 #1: do NOT throw — would crash selectBestLesson. Log fatal, return 0. */
  _randnCache = null;
  if (typeof console !== 'undefined' && console.error) {
    console.error('[MATH] randn: PRNG returned near-zero repeatedly — broken runtime; returning 0 to avoid crash');
  }
  return 0;
}

module.exports = {
  CHOLESKY_EPSILON: CHOLESKY_EPSILON,
  CHOLESKY_SYMMETRY_TOL: CHOLESKY_SYMMETRY_TOL,
  RANDN_MIN: RANDN_MIN,
  _randnClearCache: _randnClearCache,
  zeros: zeros,
  isNonNegativeInteger: isNonNegativeInteger,
  isPositiveInteger: isPositiveInteger,
  assertEmbeddingDim: assertEmbeddingDim,
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

