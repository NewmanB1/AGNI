'use strict';

const { describe, it } = require('../helpers/test-api');
const assert = require('node:assert/strict');
const { updateSchedule } = require('../../src/engine/sm2');

describe('SM-2 spaced repetition', () => {
  it('first correct answer (quality 5) → interval 1, rep 1', () => {
    const result = updateSchedule({ interval: 1, easeFactor: 2.5, repetition: 0 }, 5);
    assert.strictEqual(result.interval, 1);
    assert.strictEqual(result.repetition, 1);
    assert.ok(result.easeFactor >= 2.5, 'EF should not decrease for quality 5');
  });

  it('second correct answer (quality 5) → interval 6, rep 2', () => {
    const result = updateSchedule({ interval: 1, easeFactor: 2.6, repetition: 1 }, 5);
    assert.strictEqual(result.interval, 6);
    assert.strictEqual(result.repetition, 2);
  });

  it('third correct answer (quality 5, ef 2.6) → interval = round(6 * ef)', () => {
    const result = updateSchedule({ interval: 6, easeFactor: 2.6, repetition: 2 }, 5);
    const expected = Math.round(6 * (2.6 + (0.1 - 0 * (0.08 + 0 * 0.02))));
    assert.strictEqual(result.interval, expected);
    assert.strictEqual(result.repetition, 3);
  });

  it('quality < 3 resets repetition to 0 and interval to 1', () => {
    const result = updateSchedule({ interval: 25, easeFactor: 2.5, repetition: 5 }, 2);
    assert.strictEqual(result.repetition, 0);
    assert.strictEqual(result.interval, 1);
  });

  it('ease factor floor is 1.3', () => {
    const result = updateSchedule({ interval: 1, easeFactor: 1.3, repetition: 0 }, 0);
    assert.strictEqual(result.easeFactor, 1.3);
  });

  it('quality 0 produces minimum ease factor', () => {
    const result = updateSchedule({ interval: 1, easeFactor: 2.5, repetition: 0 }, 0);
    // ef = 2.5 + (0.1 - 5*(0.08 + 5*0.02)) = 2.5 + (0.1 - 5*0.18) = 2.5 - 0.8 = 1.7
    assert.strictEqual(result.easeFactor, 1.7);
    assert.strictEqual(result.repetition, 0);
    assert.strictEqual(result.interval, 1);
  });

  it('quality 4 yields expected ease factor adjustment', () => {
    const result = updateSchedule({ interval: 1, easeFactor: 2.5, repetition: 0 }, 4);
    // ef = 2.5 + (0.1 - 1*(0.08 + 1*0.02)) = 2.5 + (0.1 - 0.1) = 2.5
    assert.strictEqual(result.easeFactor, 2.5);
    assert.strictEqual(result.repetition, 1);
  });

  it('handles null existing state gracefully', () => {
    const result = updateSchedule(null, 3);
    assert.ok(result.interval >= 1);
    assert.ok(result.easeFactor >= 1.3);
    assert.strictEqual(result.repetition, 1);
  });

  it('clamps quality to 0-5 range', () => {
    const high = updateSchedule(null, 10);
    const low = updateSchedule(null, -2);
    assert.ok(high.easeFactor >= 1.3);
    assert.ok(low.easeFactor >= 1.3);
    assert.strictEqual(low.repetition, 0);
  });

  it('quality 3 (borderline pass) increases repetition', () => {
    const result = updateSchedule({ interval: 1, easeFactor: 2.5, repetition: 0 }, 3);
    assert.strictEqual(result.repetition, 1);
    // ef = 2.5 + (0.1 - 2*(0.08 + 2*0.02)) = 2.5 + (0.1 - 0.24) = 2.36
    assert.strictEqual(result.easeFactor, 2.36);
  });
});
