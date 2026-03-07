'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getStudentVector, getLessonVector, ensureStudentVector, ensureLessonVector, updateEmbedding } = require('../../src/engine/embeddings');
const { createState } = require('../helpers/engine-state');

describe('ensureStudentVector', () => {
  it('creates a vector of the correct dimension', () => {
    const state = createState({ dim: 8 });
    const vec = ensureStudentVector(state, 'stu1');
    assert.equal(vec.length, 8);
    vec.forEach(v => assert.equal(typeof v, 'number'));
  });

  it('returns the same vector on subsequent calls', () => {
    const state = createState({ dim: 4 });
    const v1 = ensureStudentVector(state, 'stu1');
    const v2 = ensureStudentVector(state, 'stu1');
    assert.equal(v1, v2); // same reference
  });

  it('creates different vectors for different students', () => {
    const state = createState({ dim: 4 });
    const v1 = ensureStudentVector(state, 'stu1');
    const v2 = ensureStudentVector(state, 'stu2');
    assert.notEqual(v1, v2);
  });

  it('Bug 6: rejects existing vector with length mismatch', () => {
    const state = createState({ dim: 4 });
    state.embedding.students['s1'] = { vector: [1, 2, 3] }; // 3 elements, dim=4
    assert.throws(
      () => ensureStudentVector(state, 's1'),
      /\[EMBEDDING\].*student.*length 3.*embedding\.dim 4/
    );
    assert.throws(
      () => getStudentVector(state, 's1'),
      /\[EMBEDDING\].*student.*length 3.*embedding\.dim 4/
    );
  });

  it('Bug 5: rejects invalid embedding.dim (undefined, 0, NaN, negative, non-integer)', () => {
    for (const bad of [undefined, 0, NaN, -1, 8.5]) {
      const state = createState({ dim: 4 });
      state.embedding.dim = bad;
      assert.throws(
        () => ensureStudentVector(state, 'new'),
        /\[EMBEDDING\] embedding\.dim invalid/
      );
    }
  });

  it('Bug 4: returns live reference — mutation corrupts state; use .slice() for safe copy', () => {
    const state = createState({ dim: 4 });
    const vec = ensureStudentVector(state, 'stu1');
    const stored = state.embedding.students.stu1.vector;
    assert.strictEqual(vec, stored);
    const orig = vec[0];
    vec[0] = 999;
    assert.equal(state.embedding.students.stu1.vector[0], 999);
    const copy = ensureStudentVector(state, 'stu1').slice();
    copy[0] = 0;
    assert.equal(state.embedding.students.stu1.vector[0], 999);
  });
});

describe('ensureLessonVector', () => {
  it('creates a vector of the correct dimension', () => {
    const state = createState({ dim: 8 });
    const vec = ensureLessonVector(state, 'lesson1');
    assert.equal(vec.length, 8);
  });

  it('returns the same vector on subsequent calls', () => {
    const state = createState({ dim: 4 });
    const v1 = ensureLessonVector(state, 'L1');
    const v2 = ensureLessonVector(state, 'L1');
    assert.equal(v1, v2);
  });

  it('Bug 6: rejects existing vector with length mismatch to embedding.dim', () => {
    const state = createState({ dim: 4 });
    state.embedding.lessons['L1'] = { vector: [1, 2, 3, 4, 5, 6, 7, 8] }; // 8 elements, dim=4
    assert.throws(
      () => ensureLessonVector(state, 'L1'),
      /\[EMBEDDING\].*length 8.*embedding\.dim 4/
    );
    assert.throws(
      () => getLessonVector(state, 'L1'),
      /\[EMBEDDING\].*length 8.*embedding\.dim 4/
    );
  });

  it('Bug 5: rejects invalid embedding.dim', () => {
    const state = createState({ dim: 4 });
    state.embedding.dim = undefined;
    assert.throws(() => ensureLessonVector(state, 'new'), /\[EMBEDDING\] embedding\.dim invalid/);
  });

  it('preserves pre-existing vectors', () => {
    const state = createState({ dim: 4 });
    state.embedding.lessons['L1'] = { vector: [1, 2, 3, 4] };
    const vec = ensureLessonVector(state, 'L1');
    assert.deepEqual(vec, [1, 2, 3, 4]);
  });
});

describe('updateEmbedding', () => {
  it('modifies student and lesson vectors', () => {
    const state = createState({ dim: 4 });
    const z0 = ensureStudentVector(state, 's1').slice();
    const w0 = ensureLessonVector(state, 'L1').slice();
    updateEmbedding(state, 's1', 'L1', 1.0);
    const z1 = ensureStudentVector(state, 's1');
    const w1 = ensureLessonVector(state, 'L1');
    const changed = z0.some((v, i) => v !== z1[i]) || w0.some((v, i) => v !== w1[i]);
    assert.ok(changed, 'Expected vectors to change after update');
  });

  it('moves dot product toward the observed gain', () => {
    const state = createState({ dim: 4 });
    const math = require('../../src/engine/math');
    ensureStudentVector(state, 's1');
    ensureLessonVector(state, 'L1');
    const gain = 5.0;
    for (let i = 0; i < 50; i++) updateEmbedding(state, 's1', 'L1', gain);
    const z1 = ensureStudentVector(state, 's1');
    const w1 = ensureLessonVector(state, 'L1');
    const dot1 = math.dot(z1, w1);
    assert.ok(dot1 > 0, 'Dot product should be positive after many positive gain updates, got: ' + dot1);
  });

  it('handles negative gain (reducing similarity)', () => {
    const state = createState({ dim: 4 });
    const math = require('../../src/engine/math');
    ensureStudentVector(state, 's1');
    ensureLessonVector(state, 'L1');
    const z0 = ensureStudentVector(state, 's1');
    const w0 = ensureLessonVector(state, 'L1');
    const dotBefore = math.dot(z0, w0);
    for (let i = 0; i < 100; i++) updateEmbedding(state, 's1', 'L1', -2.0);
    const z = ensureStudentVector(state, 's1');
    const w = ensureLessonVector(state, 'L1');
    const dotAfter = math.dot(z, w);
    assert.ok(dotAfter < dotBefore, 'Dot product should decrease with negative gain');
  });
});
