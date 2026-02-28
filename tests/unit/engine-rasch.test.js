'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { updateAbility } = require('../../src/engine/rasch');
const { createState, seedProbes } = require('../helpers/engine-state');

describe('updateAbility', () => {
  it('initializes a new student with ability 0', () => {
    const state = createState();
    seedProbes(state, [['probe1', 0, 'math']]);
    updateAbility(state, 'student1', [{ probeId: 'probe1', correct: true }]);
    assert.ok(state.rasch.students['student1']);
    assert.equal(typeof state.rasch.students['student1'].ability, 'number');
  });

  it('increases ability on correct answers', () => {
    const state = createState();
    seedProbes(state, [['p1', 0, 'math'], ['p2', 0, 'math']]);
    const delta = updateAbility(state, 's1', [
      { probeId: 'p1', correct: true },
      { probeId: 'p2', correct: true }
    ]);
    assert.ok(delta > 0, 'Expected positive ability delta for correct answers');
    assert.ok(state.rasch.students['s1'].ability > 0);
  });

  it('decreases ability on incorrect answers', () => {
    const state = createState();
    seedProbes(state, [['p1', 0, 'math']]);
    const delta = updateAbility(state, 's1', [{ probeId: 'p1', correct: false }]);
    assert.ok(delta < 0, 'Expected negative delta for wrong answer');
    assert.ok(state.rasch.students['s1'].ability < 0);
  });

  it('skips unknown probes gracefully', () => {
    const state = createState();
    const delta = updateAbility(state, 's1', [{ probeId: 'nonexistent', correct: true }]);
    assert.equal(typeof delta, 'number');
  });

  it('clips ability to [-10, 10] range', () => {
    const state = createState();
    seedProbes(state, [['easy', -5, 'math']]);
    for (let i = 0; i < 100; i++) {
      updateAbility(state, 's1', [{ probeId: 'easy', correct: true }]);
    }
    assert.ok(state.rasch.students['s1'].ability <= 10);
    assert.ok(state.rasch.students['s1'].ability >= -10);
  });

  it('tracks variance (posterior uncertainty)', () => {
    const state = createState();
    seedProbes(state, [['p1', 0, 'math']]);
    updateAbility(state, 's1', [{ probeId: 'p1', correct: true }]);
    const v1 = state.rasch.students['s1'].variance;
    updateAbility(state, 's1', [{ probeId: 'p1', correct: false }]);
    const v2 = state.rasch.students['s1'].variance;
    assert.ok(typeof v1 === 'number' && v1 > 0);
    assert.ok(typeof v2 === 'number' && v2 > 0);
  });

  it('handles empty probe results', () => {
    const state = createState();
    const delta = updateAbility(state, 's1', []);
    assert.equal(typeof delta, 'number');
  });

  it('handles high-difficulty probes', () => {
    const state = createState();
    seedProbes(state, [['hard', 5, 'physics']]);
    updateAbility(state, 's1', [{ probeId: 'hard', correct: false }]);
    assert.ok(state.rasch.students['s1'].ability < 0);
  });
});
