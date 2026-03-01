'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setupGlobals, teardownGlobals, makeElement, dom } = require('../helpers/browser-globals');

before(() => {
  setupGlobals();
  const app = makeElement('div');
  dom.setById('app', app);
});
require('../../src/runtime/rendering/gate-renderer');
const gates = globalThis.AGNI_GATES;
after(() => teardownGlobals());

// ── parseDurationMs ──────────────────────────────────────────────────────────

describe('parseDurationMs', () => {
  it('parses PT30S to 30000', () => {
    assert.equal(gates.parseDurationMs('PT30S'), 30000);
  });

  it('parses PT2M to 120000', () => {
    assert.equal(gates.parseDurationMs('PT2M'), 120000);
  });

  it('parses PT1H30M to 5400000', () => {
    assert.equal(gates.parseDurationMs('PT1H30M'), 5400000);
  });

  it('returns 0 for empty string', () => {
    assert.equal(gates.parseDurationMs(''), 0);
  });

  it('returns 0 for null', () => {
    assert.equal(gates.parseDurationMs(null), 0);
  });

  it('returns 0 for invalid string', () => {
    assert.equal(gates.parseDurationMs('invalid'), 0);
  });
});

// ── resolveDirective ─────────────────────────────────────────────────────────

describe('resolveDirective', () => {
  it('strips redirect: prefix', () => {
    assert.equal(gates.resolveDirective('redirect:lesson-2'), 'lesson-2');
  });

  it('strips ols: prefix', () => {
    assert.equal(gates.resolveDirective('ols:lesson-3'), 'lesson-3');
  });

  it('strips skip_to: prefix', () => {
    assert.equal(gates.resolveDirective('skip_to:lesson-4'), 'lesson-4');
  });

  it('returns value as-is when no prefix', () => {
    assert.equal(gates.resolveDirective('lesson-5'), 'lesson-5');
  });

  it('returns empty string for null', () => {
    assert.equal(gates.resolveDirective(null), '');
  });

  it('returns empty string for empty input', () => {
    assert.equal(gates.resolveDirective(''), '');
  });
});

// ── renderQuiz ───────────────────────────────────────────────────────────────

describe('renderQuiz', () => {
  it('renders a quiz container with children into #app', () => {
    const app = makeElement('div');
    dom.setById('app', app);

    gates.renderQuiz({ expected_answer: 'hello', max_attempts: 2 }, () => {});

    assert.ok(app._children.length > 0, 'expected #app to have children');
    assert.equal(app._children[0].className, 'gate-quiz');
  });

  it('quiz container contains an input element', () => {
    const app = makeElement('div');
    dom.setById('app', app);

    gates.renderQuiz({ expected_answer: 'hello', max_attempts: 2 }, () => {});

    const quiz = app._children[0];
    const input = quiz._children.find(c => c._tag === 'input');
    assert.ok(input, 'expected an <input> inside the quiz container');
  });
});
