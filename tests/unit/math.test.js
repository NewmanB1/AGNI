'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const math = require('../../src/engine/math');

const EPSILON = 1e-10;

function approxEqual(a, b, eps) {
  eps = eps || EPSILON;
  return Math.abs(a - b) < eps;
}

function matApproxEqual(A, B, eps) {
  eps = eps || EPSILON;
  for (let i = 0; i < A.length; i++) {
    for (let j = 0; j < A[i].length; j++) {
      if (!approxEqual(A[i][j], B[i][j], eps)) return false;
    }
  }
  return true;
}

// ── dot ──────────────────────────────────────────────────────────────────────

describe('dot', () => {
  it('computes dot product of simple vectors', () => {
    assert.equal(math.dot([1, 2, 3], [4, 5, 6]), 32);
  });

  it('returns 0 for orthogonal vectors', () => {
    assert.equal(math.dot([1, 0], [0, 1]), 0);
  });

  it('handles zero vector', () => {
    assert.equal(math.dot([0, 0, 0], [1, 2, 3]), 0);
  });

  it('handles single-element vectors', () => {
    assert.equal(math.dot([5], [3]), 15);
  });

  it('throws for null or undefined input', () => {
    assert.throws(() => math.dot(null, [1, 2]), /null or undefined/);
    assert.throws(() => math.dot([1, 2], null), /null or undefined/);
    assert.throws(() => math.dot(undefined, [1, 2]), /null or undefined/);
  });
});

// ── addVec / scaleVec ────────────────────────────────────────────────────────

describe('addVec', () => {
  it('adds vectors element-wise', () => {
    assert.deepEqual(math.addVec([1, 2], [3, 4]), [4, 6]);
  });

  it('handles negative values', () => {
    assert.deepEqual(math.addVec([1, -2], [-1, 2]), [0, 0]);
  });

  it('aliased inputs (a === b) do not mutate; returns 2*a', () => {
    const v = [1, 2, 3];
    const result = math.addVec(v, v);
    assert.deepEqual(result, [2, 4, 6]);
    assert.deepEqual(v, [1, 2, 3], 'addVec must not mutate input');
  });

  it('throws for null or undefined input', () => {
    assert.throws(() => math.addVec(null, [1, 2]), /null or undefined/);
    assert.throws(() => math.addVec([1, 2], undefined), /null or undefined/);
  });
});

describe('scaleVec', () => {
  it('scales vector by scalar', () => {
    assert.deepEqual(math.scaleVec([1, 2, 3], 2), [2, 4, 6]);
  });

  it('handles zero scalar', () => {
    assert.deepEqual(math.scaleVec([5, 10], 0), [0, 0]);
  });

  it('handles negative scalar', () => {
    assert.deepEqual(math.scaleVec([1, -1], -3), [-3, 3]);
  });

  it('throws for null or undefined vector', () => {
    assert.throws(() => math.scaleVec(null, 2), /null or undefined/);
  });

  it('throws for undefined or NaN scalar', () => {
    assert.throws(() => math.scaleVec([1, 2, 3], undefined), /scaleVec.*finite number/);
    assert.throws(() => math.scaleVec([1, 2, 3], NaN), /scaleVec.*finite number/);
  });
});

// ── outer ────────────────────────────────────────────────────────────────────

describe('outer', () => {
  it('computes outer product', () => {
    assert.deepEqual(math.outer([1, 2], [3, 4]), [[3, 4], [6, 8]]);
  });

  it('produces correct dimensions', () => {
    const result = math.outer([1, 2, 3], [4, 5]);
    assert.equal(result.length, 3);
    assert.equal(result[0].length, 2);
  });

  it('throws for null or undefined input', () => {
    assert.throws(() => math.outer(null, [1, 2]), /null or undefined/);
    assert.throws(() => math.outer([1, 2], undefined), /null or undefined/);
  });

  it('throws for sparse vector', () => {
    const sparse = [1, , 3];  // hole at index 1
    assert.throws(() => math.outer(sparse, [1, 2, 3]), /sparse/);
    assert.throws(() => math.outer([1, 2], sparse), /sparse/);
  });
});

// ── matrix operations ────────────────────────────────────────────────────────

describe('addMat', () => {
  it('adds matrices element-wise', () => {
    const A = [[1, 2], [3, 4]];
    const B = [[5, 6], [7, 8]];
    assert.deepEqual(math.addMat(A, B), [[6, 8], [10, 12]]);
  });

  it('throws for jagged matrix', () => {
    const A = [[1, 2], [3, 4, 5]];
    const B = [[1, 2], [3, 4]];
    assert.throws(() => math.addMat(A, B), /jagged/);
  });

  it('throws for null or undefined input', () => {
    assert.throws(() => math.addMat(null, [[1]]), /null or undefined/);
    assert.throws(() => math.addMat([[1]], undefined), /null or undefined/);
  });
});

describe('scaleMat', () => {
  it('scales matrix by scalar', () => {
    assert.deepEqual(math.scaleMat([[1, 2], [3, 4]], 3), [[3, 6], [9, 12]]);
  });

  it('throws for null or undefined matrix', () => {
    assert.throws(() => math.scaleMat(null, 2), /null or undefined/);
  });

  it('throws for sparse or jagged matrix', () => {
    const sparseRow = [1, , 3];
    assert.throws(() => math.scaleMat([sparseRow, [4, 5, 6]], 2), /sparse/);
    assert.throws(() => math.scaleMat([[1, 2], [3, 4, 5]], 2), /jagged/);
  });

  it('throws for undefined or NaN scalar', () => {
    assert.throws(() => math.scaleMat([[1, 2], [3, 4]], undefined), /scaleMat.*finite number/);
  });
});

describe('matVec', () => {
  it('computes matrix-vector product', () => {
    const A = [[1, 2], [3, 4]];
    const x = [5, 6];
    assert.deepEqual(math.matVec(A, x), [17, 39]);
  });

  it('identity matrix preserves vector', () => {
    const I = math.identity(3);
    assert.deepEqual(math.matVec(I, [1, 2, 3]), [1, 2, 3]);
  });

  it('throws for jagged matrix', () => {
    const A = [[1, 2], [3, 4, 5]];
    assert.throws(() => math.matVec(A, [1, 2]), /jagged/);
  });

  it('throws for null or undefined input', () => {
    assert.throws(() => math.matVec(null, [1, 2]), /null or undefined/);
    assert.throws(() => math.matVec([[1]], undefined), /null or undefined/);
  });
});

// ── identity ─────────────────────────────────────────────────────────────────

describe('identity', () => {
  it('creates 1x1 identity', () => {
    assert.deepEqual(math.identity(1), [[1]]);
  });

  it('creates 3x3 identity', () => {
    const I = math.identity(3);
    assert.deepEqual(I, [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
  });

  it('has correct dimensions', () => {
    const I = math.identity(5);
    assert.equal(I.length, 5);
    assert.equal(I[0].length, 5);
  });

  it('throws for null or undefined n', () => {
    assert.throws(() => math.identity(null), /identity.*null or undefined/);
    assert.throws(() => math.identity(undefined), /identity.*null or undefined/);
  });

  it('throws for negative n', () => {
    assert.throws(() => math.identity(-1), /identity.*non-negative integer/);
  });

  it('throws for non-integer n', () => {
    assert.throws(() => math.identity(2.5), /identity.*non-negative integer/);
  });
});

// ── cholesky ─────────────────────────────────────────────────────────────────

describe('cholesky', () => {
  it('decomposes a 2x2 SPD matrix', () => {
    const A = [[4, 2], [2, 3]];
    const L = math.cholesky(A);
    assert.ok(approxEqual(L[0][0], 2));
    assert.ok(approxEqual(L[1][0], 1));
    assert.ok(approxEqual(L[0][1], 0));
    assert.ok(approxEqual(L[1][1], Math.sqrt(2)));
  });

  it('satisfies A = L * L^T', () => {
    const A = [[4, 2], [2, 3]];
    const L = math.cholesky(A);
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        let sum = 0;
        for (let k = 0; k < 2; k++) sum += L[i][k] * L[j][k];
        assert.ok(approxEqual(sum, A[i][j]), `A[${i}][${j}] mismatch`);
      }
    }
  });

  it('decomposes identity matrix', () => {
    const L = math.cholesky(math.identity(3));
    assert.ok(matApproxEqual(L, math.identity(3)));
  });

  it('throws for non-SPD matrix', () => {
    assert.throws(() => math.cholesky([[0, 1], [1, 0]]), /not SPD/);
  });

  it('throws for near-singular matrix (diag below CHOLESKY_EPSILON)', () => {
    // Second pivot = c - b²/a = (1 + 1e-11) - 1 = 1e-11 < 1e-10
    const nearSingular = [[1, 1], [1, 1 + 1e-11]];
    assert.throws(() => math.cholesky(nearSingular), /not SPD/);
  });

  it('throws for null input', () => {
    assert.throws(() => math.cholesky(null), /cholesky.*null or undefined/);
  });

  it('throws for non-square matrix', () => {
    assert.throws(() => math.cholesky([[1, 0, 0], [0, 1, 0]]), /square/);
  });

  it('throws for non-symmetric matrix', () => {
    assert.throws(() => math.cholesky([[4, 1], [2, 3]]), /not symmetric/);
  });
});

// ── forwardSub / backSub ─────────────────────────────────────────────────────

describe('forwardSub and backSub', () => {
  it('solves L*y = b correctly', () => {
    const L = [[2, 0], [1, Math.sqrt(2)]];
    const b = [4, 3];
    const y = math.forwardSub(L, b);
    assert.ok(approxEqual(y[0], 2));
    assert.ok(approxEqual(y[1], (3 - 1 * 2) / Math.sqrt(2)));
  });

  it('round-trips through forward and back substitution', () => {
    const A = [[4, 2], [2, 3]];
    const L = math.cholesky(A);
    const b = [1, 0];
    const y = math.forwardSub(L, b);
    const x = math.backSub(L, y);
    const Ax = math.matVec(A, x);
    assert.ok(approxEqual(Ax[0], b[0], 1e-8));
    assert.ok(approxEqual(Ax[1], b[1], 1e-8));
  });

  it('forwardSub throws on zero diagonal', () => {
    const L = [[0, 0], [1, 1]];
    assert.throws(() => math.forwardSub(L, [1, 1]), /forwardSub.*zero.*diagonal/);
  });

  it('backSub throws on zero diagonal', () => {
    const L = [[1, 0], [1, 0]];
    assert.throws(() => math.backSub(L, [1, 1]), /backSub.*zero.*diagonal/);
  });

  it('forwardSub throws when b.length !== L.length', () => {
    const L = [[1, 0], [1, 1]];
    assert.throws(() => math.forwardSub(L, [1]), /forwardSub.*dimension mismatch/);
    assert.throws(() => math.forwardSub(L, [1, 2, 3]), /forwardSub.*dimension mismatch/);
  });

  it('backSub throws when y.length !== L.length', () => {
    const L = [[1, 0], [1, 1]];
    assert.throws(() => math.backSub(L, [1]), /backSub.*dimension mismatch/);
    assert.throws(() => math.backSub(L, [1, 2, 3]), /backSub.*dimension mismatch/);
  });
});

// ── invertSPD ────────────────────────────────────────────────────────────────

describe('invertSPD', () => {
  it('inverts a 2x2 SPD matrix', () => {
    const A = [[4, 2], [2, 3]];
    const Ainv = math.invertSPD(A);
    const product = A.map((row, i) =>
      row.map((_, j) => math.dot(row, Ainv.map(r => r[j])))
    );
    assert.ok(matApproxEqual(product, math.identity(2), 1e-8));
  });

  it('inverts identity matrix to itself', () => {
    const I = math.identity(3);
    const Iinv = math.invertSPD(I);
    assert.ok(matApproxEqual(Iinv, I));
  });

  it('inverts a 3x3 SPD matrix (A * A^-1 = I)', () => {
    const A = [[2, -1, 0], [-1, 2, -1], [0, -1, 2]];
    const Ainv = math.invertSPD(A);
    const I = math.identity(3);
    const product = A.map((row, i) =>
      row.map((_, j) => math.dot(row, Ainv.map(r => r[j])))
    );
    assert.ok(matApproxEqual(product, I, 1e-8), 'A * A^-1 should equal I');
  });

  it('throws for non-SPD matrix', () => {
    assert.throws(() => math.invertSPD([[0, 1], [1, 0]]));
  });

  it('throws for near-singular matrix (diag below CHOLESKY_EPSILON)', () => {
    const nearSingular = [[1, 1], [1, 1 + 1e-11]];
    assert.throws(() => math.invertSPD(nearSingular), /not SPD/);
  });

  it('returns exactly symmetric inverse (floating-point symmetrization)', () => {
    const A = [[4, 2, 1], [2, 3, 0.5], [1, 0.5, 2]];
    const Ainv = math.invertSPD(A);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < i; j++) {
        assert.strictEqual(Ainv[i][j], Ainv[j][i], `inv[${i}][${j}] must equal inv[${j}][${i}]`);
      }
    }
  });

  it('throws for null or undefined input', () => {
    assert.throws(() => math.invertSPD(null), /invertSPD.*null or undefined/);
    assert.throws(() => math.invertSPD(undefined), /invertSPD.*null or undefined/);
  });
});

// ── randn ────────────────────────────────────────────────────────────────────

describe('randn', () => {
  it('returns a finite number', () => {
    const val = math.randn();
    assert.equal(typeof val, 'number');
    assert.ok(isFinite(val));
  });

  it('produces roughly zero mean over many samples', () => {
    let sum = 0;
    const N = 10000;
    for (let i = 0; i < N; i++) sum += math.randn();
    const mean = sum / N;
    assert.ok(Math.abs(mean) < 0.1, 'Mean ' + mean + ' should be near 0');
  });

  it('produces roughly unit variance over many samples', () => {
    const N = 10000;
    let sum = 0, sumSq = 0;
    for (let i = 0; i < N; i++) {
      const v = math.randn();
      sum += v;
      sumSq += v * v;
    }
    const mean = sum / N;
    const variance = sumSq / N - mean * mean;
    assert.ok(Math.abs(variance - 1) < 0.15, 'Variance ' + variance + ' should be near 1');
  });

  it('throws when Math.random returns zero repeatedly', () => {
    const origRandom = Math.random;
    Math.random = function () { return 0; };
    try {
      assert.throws(() => math.randn(), /randn.*PRNG returned zero/);
    } finally {
      Math.random = origRandom;
    }
  });
});
