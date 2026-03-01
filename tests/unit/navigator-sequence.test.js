'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const nav = require('../../src/runtime/engine/navigator');

describe('navigator — scoreMarkovTransitions', function () {
  it('returns empty when no transition table', function () {
    const scores = nav.scoreMarkovTransitions([{ identifier: 'L1' }], ['L0'], null);
    assert.deepStrictEqual(scores, {});
  });

  it('returns empty when no recent lessons', function () {
    const table = { L0: { L1: { prob: 0.8, avgGain: 0.5 } } };
    const scores = nav.scoreMarkovTransitions([{ identifier: 'L1' }], [], table);
    assert.deepStrictEqual(scores, {});
  });

  it('scores candidates based on transition data', function () {
    const table = {
      L0: {
        L1: { prob: 0.8, avgGain: 0.6 },
        L2: { prob: 0.2, avgGain: 0.1 }
      }
    };
    const candidates = [
      { identifier: 'L1' },
      { identifier: 'L2' },
      { identifier: 'L3' }
    ];

    const scores = nav.scoreMarkovTransitions(candidates, ['L0'], table);
    assert.ok(scores.L1);
    assert.ok(scores.L2);
    assert.ok(!scores.L3, 'L3 has no transition data');
    assert.ok(scores.L1.prob > scores.L2.prob, 'L1 should have higher probability');
    assert.ok(scores.L1.quality > scores.L2.quality, 'L1 should have higher quality');
  });

  it('applies recency decay over multiple history entries', function () {
    const table = {
      A: { C: { prob: 1.0, avgGain: 0.5 } },
      B: { C: { prob: 1.0, avgGain: 1.0 } }
    };
    const candidates = [{ identifier: 'C' }];

    // B is more recent than A → B's contribution should be weighted higher
    const scores = nav.scoreMarkovTransitions(candidates, ['A', 'B'], table);
    assert.ok(scores.C);
    // Quality should lean toward B's avgGain (1.0) since B is more recent
    assert.ok(scores.C.quality > 0.5, 'quality should lean toward more recent entry');
  });

  it('reads identifier from meta if top-level is missing', function () {
    const table = { L0: { L1: { prob: 0.9, avgGain: 0.7 } } };
    const candidates = [{ meta: { identifier: 'L1' } }];
    const scores = nav.scoreMarkovTransitions(candidates, ['L0'], table);
    assert.ok(scores.L1, 'should find candidate via meta.identifier');
  });
});

describe('navigator — computeClientPageRank', function () {
  it('returns empty for empty graph', function () {
    const ranks = nav.computeClientPageRank([], {});
    assert.deepStrictEqual(ranks, {});
  });

  it('assigns equal rank to isolated nodes', function () {
    const ranks = nav.computeClientPageRank(['A', 'B', 'C'], { A: [], B: [], C: [] });
    const expected = 1.0 / 3;
    for (const n of ['A', 'B', 'C']) {
      assert.ok(Math.abs(ranks[n] - expected) < 0.01);
    }
  });

  it('gives higher rank to nodes with many incoming edges', function () {
    const nodes = ['A', 'B', 'C'];
    const edges = { A: ['C'], B: ['C'], C: [] };
    const ranks = nav.computeClientPageRank(nodes, edges);
    assert.ok(ranks.C > ranks.A, 'C (popular target) should outrank A');
    assert.ok(ranks.C > ranks.B, 'C should outrank B');
  });

  it('handles cyclic graphs with equal distribution', function () {
    const nodes = ['A', 'B', 'C'];
    const edges = { A: ['B'], B: ['C'], C: ['A'] };
    const ranks = nav.computeClientPageRank(nodes, edges);
    const expected = 1.0 / 3;
    for (const n of nodes) {
      assert.ok(Math.abs(ranks[n] - expected) < 0.01);
    }
  });

  it('ranks sum to approximately 1', function () {
    const nodes = ['A', 'B', 'C', 'D'];
    const edges = { A: ['B', 'C'], B: ['D'], C: ['D'], D: [] };
    const ranks = nav.computeClientPageRank(nodes, edges);
    const total = Object.values(ranks).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - 1.0) < 0.01, `sum should be ~1, got ${total}`);
  });
});

describe('navigator — sortLessonsEnhanced', function () {
  function makeLessons() {
    return [
      {
        identifier: 'L1',
        difficulty: 3,
        ontology: { provides: [{ skill: 'algebra' }], requires: [] },
        inferredFeatures: { sensors_used: [], vark: null, bloomsCeiling: 2 }
      },
      {
        identifier: 'L2',
        difficulty: 3,
        ontology: { provides: [{ skill: 'trig' }], requires: [{ skill: 'algebra' }] },
        inferredFeatures: { sensors_used: [], vark: null, bloomsCeiling: 2 }
      },
      {
        identifier: 'L3',
        difficulty: 3,
        ontology: { provides: [{ skill: 'calc' }], requires: [{ skill: 'trig' }] },
        inferredFeatures: { sensors_used: [], vark: null, bloomsCeiling: 2 }
      }
    ];
  }

  it('falls back to base sortLessons when no sequenceData', function () {
    const lessons = makeLessons();
    const base = nav.sortLessons(lessons, [], { edges: [] });
    const enhanced = nav.sortLessonsEnhanced(lessons, [], { edges: [] });

    assert.strictEqual(base.length, enhanced.length);
    for (let i = 0; i < base.length; i++) {
      assert.strictEqual(base[i]._score.theta, enhanced[i]._score.theta);
    }
  });

  it('applies Markov bonus to reduce theta for well-connected lessons', function () {
    const lessons = makeLessons();
    const base = nav.sortLessons(lessons, [], { edges: [] });

    const enhanced = nav.sortLessonsEnhanced(lessons, [], { edges: [] }, {
      recentLessons: ['L1'],
      transitionTable: {
        L1: {
          L2: { prob: 0.9, avgGain: 0.8 },
          L3: { prob: 0.1, avgGain: 0.1 }
        }
      }
    });

    const baseL2 = base.find(l => l.identifier === 'L2');
    const enhL2 = enhanced.find(l => l.identifier === 'L2');
    assert.ok(enhL2._score.theta <= baseL2._score.theta,
      'Markov bonus should reduce theta for L2');
    assert.ok(enhL2._score.components.markovBonus > 0);
  });

  it('applies PageRank bonus for gateway lessons', function () {
    const lessons = makeLessons();
    const enhanced = nav.sortLessonsEnhanced(lessons, [], { edges: [] }, {
      pageRankGraph: {
        nodes: ['L1', 'L2', 'L3'],
        edges: { L1: ['L2', 'L3'], L2: ['L3'], L3: [] }
      }
    });

    const l3 = enhanced.find(l => l.identifier === 'L3');
    assert.ok(l3._score.components.pageRankBonus >= 0,
      'PageRank bonus should be non-negative');
  });
});
