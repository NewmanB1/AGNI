// src/math.js
// AGNI LMS Engine — pure math utilities
//
// No external dependencies. Used across Rasch, embeddings, and bandit layers.
// All functions are pure (no side effects, no state).
//
// Target: Node.js 14+. CommonJS.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

/**
 * Dot product of two vectors.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
function dot(a, b) {
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
 * Identity matrix of size n × n.
 * @param {number} n
 * @returns {number[][]}
 */
function identity(n) {
  return Array.from({ length: n }, function(_, i) {
    return Array(n).fill(0).map(function(_, j) { return i === j ? 1 : 0; });
  });
}

/**
 * Matrix-vector multiplication.
 * @param {number[][]} A
 * @param {number[]}   x
 * @returns {number[]}
 */
function matVec(A, x) {
  return A.map(function(row) { return dot(row, x); });
}

/**
 * Box-Muller transform — sample from standard normal N(0,1).
 * @returns {number}
 */
function randn() {
  var u = Math.random();
  var v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Cholesky decomposition for symmetric positive definite matrix A = L Lᵀ.
 * @param {number[][]} A
 * @returns {number[][]} L (lower triangular)
 * @throws if matrix is not numerically positive definite
 */
function cholesky(A) {
  var n = A.length;
  var L = Array(n).fill(0).map(function() { return Array(n).fill(0); });

  for (var i = 0; i < n; i++) {
    var sum = 0;
    for (var k = 0; k < i; k++) sum += L[i][k] * L[i][k];
    var diag = A[i][i] - sum;
    if (diag <= 1e-10) {
      throw new Error(
        'Cholesky decomposition failed: matrix is not positive definite ' +
        '(diag=' + diag + ' at i=' + i + ')'
      );
    }
    L[i][i] = Math.sqrt(diag);

    for (var j = i + 1; j < n; j++) {
      var s = 0;
      for (var kk = 0; kk < i; kk++) s += L[j][kk] * L[i][kk];
      L[j][i] = (A[j][i] - s) / L[i][i];
    }
  }
  return L;
}

/**
 * Invert symmetric positive definite matrix using Cholesky decomposition.
 * A⁻¹ = (L⁻¹)ᵀ L⁻¹
 * @param {number[][]} A
 * @returns {number[][]}
 */
function invertSPD(A) {
  var n = A.length;
  var L = cholesky(A);
  var Linv = Array(n).fill(0).map(function() { return Array(n).fill(0); });

  // Forward substitution: solve L X = I
  for (var j = 0; j < n; j++) {
    for (var i = 0; i < n; i++) {
      if (i === j) {
        Linv[i][j] = 1 / L[i][i];
      } else if (i > j) {
        var sum = 0;
        for (var k = j; k < i; k++) sum += L[i][k] * Linv[k][j];
        Linv[i][j] = -sum / L[i][i];
      }
    }
  }

  // A⁻¹ = Linvᵀ Linv
  var inv = Array(n).fill(0).map(function() { return Array(n).fill(0); });
  for (var ii = 0; ii < n; ii++) {
    for (var jj = 0; jj < n; jj++) {
      var s = 0;
      for (var kk = Math.max(ii, jj); kk < n; kk++) {
        s += Linv[kk][ii] * Linv[kk][jj];
      }
      inv[ii][jj] = s;
    }
  }
  return inv;
}

/**
 * Sample from multivariate normal N(mean, cov) using Cholesky.
 * @param {number[]}   mean
 * @param {number[][]} cov
 * @returns {number[]}
 */
function sampleMVN(mean, cov) {
  var L = cholesky(cov);
  var z = Array(mean.length).fill(0).map(randn);
  var correlated = matVec(L, z);
  return addVec(mean, correlated);
}

module.exports = {
  dot,
  addVec,
  scaleVec,
  outer,
  addMat,
  scaleMat,
  identity,
  matVec,
  randn,
  cholesky,
  invertSPD,
  sampleMVN
};
