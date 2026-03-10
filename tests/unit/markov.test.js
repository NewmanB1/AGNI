'use strict';

const { describe, it } = require('../helpers/test-api');
const assert = require('node:assert/strict');

const markov = require('@agni/engine/markov');
const { createState, seedProbes } = require('../helpers/engine-state');

describe('markov — ensureMarkovState', function () {
  it('initializes markov sub-state if missing', function () {
    const state = createState();
    delete state.markov;
    markov.ensureMarkovState(state);
    assert.ok(state.markov);
    assert.deepStrictEqual(state.markov.transitions, {});
    assert.deepStrictEqual(state.markov.studentHistory, {});
    assert.deepStrictEqual(state.markov.bigrams, {});
    assert.deepStrictEqual(state.markov.dropouts, {});
    assert.deepStrictEqual(state.markov.cooldowns, {});
  });

  it('preserves existing markov state', function () {
    const state = createState();
    state.markov.transitions = { L1: { L2: { count: 3, totalGain: 0.9, avgGain: 0.3 } } };
    markov.ensureMarkovState(state);
    assert.strictEqual(state.markov.transitions.L1.L2.count, 3);
  });
});

describe('markov — recordTransition (type guards)', function () {
  it('throws on invalid studentId', function () {
    const state = createState();
    assert.throws(() => markov.recordTransition(state, null, 'L1', 0.5), /studentId must be a non-empty string/);
    assert.throws(() => markov.recordTransition(state, '', 'L1', 0.5), /studentId must be a non-empty string/);
    assert.throws(() => markov.recordTransition(state, undefined, 'L1', 0.5), /studentId must be a non-empty string/);
  });

  it('throws on invalid lessonId', function () {
    const state = createState();
    assert.throws(() => markov.recordTransition(state, 'stu1', null, 0.5), /lessonId must be a non-empty string/);
    assert.throws(() => markov.recordTransition(state, 'stu1', '', 0.5), /lessonId must be a non-empty string/);
    assert.throws(() => markov.recordTransition(state, 'stu1', undefined, 0.5), /lessonId must be a non-empty string/);
  });
});

describe('markov — recordDropout (type guards)', function () {
  it('throws on invalid studentId', function () {
    const state = createState();
    assert.throws(() => markov.recordDropout(state, null), /studentId must be a non-empty string/);
    assert.throws(() => markov.recordDropout(state, ''), /studentId must be a non-empty string/);
    assert.throws(() => markov.recordDropout(state, undefined), /studentId must be a non-empty string/);
  });
});

describe('markov — recordTransition (first-order)', function () {
  it('does nothing on first lesson (no previous)', function () {
    const state = createState();
    markov.recordTransition(state, 'stu1', 'L1', 0.5);
    assert.deepStrictEqual(state.markov.transitions, {});
    assert.deepStrictEqual(markov.getStudentHistory(state, 'stu1'), ['L1']);
  });

  it('records A→B transition on second lesson', function () {
    const state = createState();
    markov.recordTransition(state, 'stu1', 'L1', 0.5);
    markov.recordTransition(state, 'stu1', 'L2', 0.8);

    const edges = markov.getTransitions(state, 'L1');
    assert.ok(edges.L2);
    assert.ok(edges.L2.count > 0);
    assert.ok(edges.L2.avgGain > 0);
    assert.deepStrictEqual(markov.getStudentHistory(state, 'stu1'), ['L1', 'L2']);
  });

  it('accumulates multiple observations on same transition', function () {
    const state = createState();
    markov.recordTransition(state, 'stu1', 'L1', 0.5);
    markov.recordTransition(state, 'stu1', 'L2', 1.0);

    markov.recordTransition(state, 'stu2', 'L1', 0.3);
    markov.recordTransition(state, 'stu2', 'L2', 0.6);

    const edge = state.markov.transitions.L1.L2;
    assert.ok(edge.count > 1, 'count should accumulate');
  });

  it('applies exponential forgetting to counts', function () {
    const state = createState();
    markov.recordTransition(state, 'stu1', 'L1', 0);
    markov.recordTransition(state, 'stu1', 'L2', 1.0);

    const countAfterFirst = state.markov.transitions.L1.L2.count;

    markov.recordTransition(state, 'stu2', 'L1', 0);
    markov.recordTransition(state, 'stu2', 'L2', 0.5);

    const countAfterSecond = state.markov.transitions.L1.L2.count;
    assert.ok(countAfterSecond < countAfterFirst + 1, 'forgetting should decay older counts');
    assert.ok(countAfterSecond > countAfterFirst, 'new observation should increase total');
  });

  it('caps student history at MAX_HISTORY', function () {
    const state = createState();
    for (let i = 0; i < markov.MAX_HISTORY + 5; i++) {
      markov.recordTransition(state, 'stu1', 'L' + i, 0.1);
    }
    const history = markov.getStudentHistory(state, 'stu1');
    assert.strictEqual(history.length, markov.MAX_HISTORY);
  });

  it('tracks separate histories per student', function () {
    const state = createState();
    markov.recordTransition(state, 'stu1', 'L1', 0.5);
    markov.recordTransition(state, 'stu2', 'L9', 0.3);

    assert.deepStrictEqual(markov.getStudentHistory(state, 'stu1'), ['L1']);
    assert.deepStrictEqual(markov.getStudentHistory(state, 'stu2'), ['L9']);
  });
});

describe('markov — bigram (second-order) transitions', function () {
  it('does not record bigram with fewer than 2 history entries', function () {
    const state = createState();
    markov.recordTransition(state, 'stu1', 'L1', 0.5);
    markov.recordTransition(state, 'stu1', 'L2', 0.8);
    assert.deepStrictEqual(state.markov.bigrams, {});
  });

  it('records bigram on third lesson', function () {
    const state = createState();
    markov.recordTransition(state, 'stu1', 'L1', 0.5);
    markov.recordTransition(state, 'stu1', 'L2', 0.8);
    markov.recordTransition(state, 'stu1', 'L3', 1.0);

    const key = JSON.stringify(['L1', 'L2']);
    assert.ok(state.markov.bigrams[key]);
    assert.ok(state.markov.bigrams[key].L3);
    assert.ok(state.markov.bigrams[key].L3.count > 0);
    assert.ok(state.markov.bigrams[key].L3.avgGain > 0);
  });

  it('accumulates bigram observations across students', function () {
    const state = createState();
    // Student 1: L1→L2→L3
    markov.recordTransition(state, 's1', 'L1', 0);
    markov.recordTransition(state, 's1', 'L2', 0);
    markov.recordTransition(state, 's1', 'L3', 0.5);

    // Student 2: L1→L2→L3
    markov.recordTransition(state, 's2', 'L1', 0);
    markov.recordTransition(state, 's2', 'L2', 0);
    markov.recordTransition(state, 's2', 'L3', 0.8);

    const key = JSON.stringify(['L1', 'L2']);
    assert.ok(state.markov.bigrams[key].L3.count > 1);
  });

  it('scoreCandidate returns bigram scores', function () {
    const state = createState();
    // Build pattern: L1→L2→L3 frequently
    for (let i = 0; i < 5; i++) {
      markov.recordTransition(state, 'stu' + i, 'L1', 0);
      markov.recordTransition(state, 'stu' + i, 'L2', 0);
      markov.recordTransition(state, 'stu' + i, 'L3', 1.0);
    }

    // Target student at position: L1, L2 completed
    markov.recordTransition(state, 'target', 'L1', 0);
    markov.recordTransition(state, 'target', 'L2', 0);

    const score = markov.scoreCandidate(state, 'target', 'L3');
    assert.ok(score.bigramProb > 0, 'bigram probability should be positive');
    assert.ok(score.bigramQuality > 0, 'bigram quality should be positive');
  });
});

describe('markov — dropout tracking', function () {
  it('records dropout on the student\'s last lesson', function () {
    const state = createState();
    markov.recordTransition(state, 'stu1', 'L1', 0.5);
    markov.recordDropout(state, 'stu1');

    const d = state.markov.dropouts.L1;
    assert.ok(d);
    assert.strictEqual(d.count, 1);
    assert.strictEqual(d.totalContinuations, 0, 'no prior continuation past L1');
    const rate = markov.getDropoutRate(state, 'L1');
    assert.strictEqual(rate.rate, 1);
    assert.strictEqual(rate.total, 1);
  });

  it('does nothing for student with no history', function () {
    const state = createState();
    markov.recordDropout(state, 'unknown');
    assert.deepStrictEqual(state.markov.dropouts, {});
  });

  it('getDropoutRate returns rate when data exists', function () {
    const state = createState();
    state.markov.dropouts = { L1: { count: 3, totalStudents: 10 } };
    const rate = markov.getDropoutRate(state, 'L1');
    assert.ok(rate);
    assert.ok(Math.abs(rate.rate - 0.3) < 0.001);
  });

  it('getDropoutRate returns null for unknown lesson', function () {
    const state = createState();
    assert.strictEqual(markov.getDropoutRate(state, 'unknown'), null);
  });

  it('scoreCandidate applies dropout penalty for high-dropout lessons', function () {
    const state = createState();
    // Lesson with very high dropout
    state.markov.dropouts = { L2: { count: 8, totalStudents: 10 } };
    markov.recordTransition(state, 'stu1', 'L1', 0);

    const score = markov.scoreCandidate(state, 'stu1', 'L2');
    assert.ok(score.dropoutPenalty > 0, 'should penalize high-dropout lesson');
  });

  it('scoreCandidate does not penalize low-dropout lessons', function () {
    const state = createState();
    state.markov.dropouts = { L2: { count: 1, totalStudents: 10 } };
    markov.recordTransition(state, 'stu1', 'L1', 0);

    const score = markov.scoreCandidate(state, 'stu1', 'L2');
    assert.strictEqual(score.dropoutPenalty, 0, 'should not penalize low-dropout');
  });
});

describe('markov — cooldown tracking', function () {
  it('records cooldown entry after lesson completion', function () {
    const state = createState();
    markov.recordTransition(state, 'stu1', 'L1', 0.5);

    assert.ok(state.markov.cooldowns.stu1);
    assert.ok(state.markov.cooldowns.stu1.L1);
    assert.strictEqual(state.markov.cooldowns.stu1.L1.gain, 0.5);
  });

  it('scoreCandidate applies cooldown penalty for recent lessons', function () {
    const state = createState();
    markov.recordTransition(state, 'stu1', 'L1', 0.5);
    markov.recordTransition(state, 'stu1', 'L2', 0.3);

    // Score L1 for stu1 — L1 is in recent history
    const score = markov.scoreCandidate(state, 'stu1', 'L1');
    assert.ok(score.cooldownPenalty > 0, 'should penalize recently completed lesson');
  });

  it('applies stronger cooldown penalty for failed lessons', function () {
    const state = createState();
    markov.recordTransition(state, 'stu1', 'L1', -0.5); // negative gain = failed
    markov.recordTransition(state, 'stu1', 'L2', 0.3);

    const score = markov.scoreCandidate(state, 'stu1', 'L1');
    assert.ok(score.cooldownPenalty >= 1.0, 'failed lesson should get maximum cooldown');
  });

  it('checkCooldown returns correct status', function () {
    const state = createState();
    markov.recordTransition(state, 'stu1', 'L1', -0.5);
    markov.recordTransition(state, 'stu1', 'L2', 0.3);

    const cd = markov.checkCooldown(state, 'stu1', 'L1');
    assert.ok(cd.onCooldown);
    assert.ok(cd.wasFailed);

    const cd2 = markov.checkCooldown(state, 'stu1', 'L99');
    assert.ok(!cd2.onCooldown);
  });
});

describe('markov — findBottlenecks', function () {
  it('returns lessons with high dropout rates', function () {
    const state = createState();
    state.markov.dropouts = {
      L1: { count: 8, totalStudents: 10 },
      L2: { count: 1, totalStudents: 10 },
      L3: { count: 5, totalStudents: 10 }
    };

    const bottlenecks = markov.findBottlenecks(state, 5);
    assert.ok(bottlenecks.length >= 1);
    assert.strictEqual(bottlenecks[0].lessonId, 'L1');
    assert.ok(bottlenecks[0].dropoutRate > 0.3);
  });

  it('respects minSample threshold', function () {
    const state = createState();
    state.markov.dropouts = { L1: { count: 3, totalStudents: 4 } };

    const bottlenecks = markov.findBottlenecks(state, 5);
    assert.strictEqual(bottlenecks.length, 0, 'should exclude small sample');
  });
});

describe('markov — exportTransitionTable', function () {
  it('exports compact table with probabilities', function () {
    const state = createState();
    markov.recordTransition(state, 's1', 'L1', 0);
    markov.recordTransition(state, 's1', 'L2', 0.8);
    markov.recordTransition(state, 's2', 'L1', 0);
    markov.recordTransition(state, 's2', 'L3', 0.4);

    const table = markov.exportTransitionTable(state);
    assert.ok(table.L1);
    assert.ok(table.L1.L2);
    assert.ok(table.L1.L3);
    assert.ok(table.L1.L2.prob > 0);
    assert.ok(table.L1.L2.avgGain > 0);

    // Probabilities should sum to ~1
    const total = Object.values(table.L1).reduce((s, e) => s + e.prob, 0);
    assert.ok(Math.abs(total - 1.0) < 0.01);
  });

  it('returns empty object with no transitions', function () {
    const state = createState();
    const table = markov.exportTransitionTable(state);
    assert.deepStrictEqual(table, {});
  });
});

describe('markov — getTransitionProbabilities', function () {
  it('returns empty for unknown source', function () {
    const state = createState();
    const probs = markov.getTransitionProbabilities(state, 'unknown');
    assert.deepStrictEqual(probs, {});
  });

  it('returns normalized probabilities', function () {
    const state = createState();
    markov.recordTransition(state, 'stu1', 'L1', 0);
    markov.recordTransition(state, 'stu1', 'L2', 0.5);
    markov.recordTransition(state, 'stu2', 'L1', 0);
    markov.recordTransition(state, 'stu2', 'L3', 0.3);

    const probs = markov.getTransitionProbabilities(state, 'L1');
    assert.ok(probs.L2 > 0);
    assert.ok(probs.L3 > 0);

    const total = Object.values(probs).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - 1.0) < 0.01);
  });
});

describe('markov — scoreCandidate', function () {
  it('returns zeros for student with no history', function () {
    const state = createState();
    const score = markov.scoreCandidate(state, 'stu1', 'L1');
    assert.strictEqual(score.transitionProb, 0);
    assert.strictEqual(score.transitionQuality, 0);
    assert.strictEqual(score.bigramProb, 0);
    assert.strictEqual(score.bigramQuality, 0);
    assert.strictEqual(score.dropoutPenalty, 0);
    assert.strictEqual(score.cooldownPenalty, 0);
  });

  it('scores higher for frequently-taken transitions', function () {
    const state = createState();
    for (let i = 0; i < 5; i++) {
      markov.recordTransition(state, 'stu' + i, 'L1', 0);
      markov.recordTransition(state, 'stu' + i, 'L2', 0.8);
    }
    markov.recordTransition(state, 'stuX', 'L1', 0);
    markov.recordTransition(state, 'stuX', 'L3', 0.2);

    markov.recordTransition(state, 'target', 'L1', 0);
    const scoreL2 = markov.scoreCandidate(state, 'target', 'L2');
    const scoreL3 = markov.scoreCandidate(state, 'target', 'L3');

    assert.ok(scoreL2.transitionProb > scoreL3.transitionProb);
  });
});

describe('markov — getStudentHistory', function () {
  it('returns empty array for unknown student', function () {
    const state = createState();
    assert.deepStrictEqual(markov.getStudentHistory(state, 'unknown'), []);
  });
});
