'use strict';

/**
 * STK: Sensor toolkit regression tests.
 * Validates orientation, shake, and threshold evaluator behavior.
 */

const { describe, it, before, after } = require('../helpers/test-api');
const assert = require('node:assert/strict');
const { setupGlobals, teardownGlobals } = require('../helpers/browser-globals');

// ── Orientation threshold evaluator (STK-1.2) ─────────────────────────────────

describe('STK-1.2: orientation threshold evaluator supports orientation == flat', () => {
  let S;
  let compile;

  before(function () {
    setupGlobals();
    globalThis.LESSON_DATA = {};
    globalThis.performance = globalThis.performance || { now: function () { return Date.now(); } };
    globalThis.DeviceMotionEvent = function () {};
    globalThis.DeviceOrientationEvent = function () {};
    require('@agni/runtime/shared-runtime');
    require('@agni/runtime/sensors/threshold-evaluator');
    S = globalThis.AGNI_SHARED;
    compile = S.thresholdEvaluator.compile;
  });

  after(function () {
    delete globalThis.LESSON_DATA;
    teardownGlobals();
  });

  it('evaluates orientation == flat when orientation is flat', () => {
    const evaluate = compile('orientation == flat');
    const m = new Map();
    m.set('orientation', 'flat');
    assert.equal(evaluate(m), true);
  });

  it('evaluates orientation == flat as false when orientation is portrait', () => {
    const evaluate = compile('orientation == flat');
    const m = new Map();
    m.set('orientation', 'portrait');
    assert.equal(evaluate(m), false);
  });

  it('evaluates orientation == portrait when orientation is portrait', () => {
    const evaluate = compile('orientation == portrait');
    const m = new Map();
    m.set('orientation', 'portrait');
    assert.equal(evaluate(m), true);
  });

  it('evaluates orientation != flat when orientation is landscape', () => {
    const evaluate = compile('orientation != flat');
    const m = new Map();
    m.set('orientation', 'landscape');
    assert.equal(evaluate(m), true);
  });
});
