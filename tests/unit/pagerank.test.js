'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const pagerank = require('../../src/engine/pagerank');
const markov = require('../../src/engine/markov');
const { createState, seedProbes } = require('../helpers/engine-state');

beforeEach(function () {
  pagerank.invalidateCache();
});

describe('pagerank — computePageRank', function () {
  it('returns empty for empty graph', function () {
    const ranks = pagerank.computePageRank([], {});
    assert.deepStrictEqual(ranks, {});
  });

  it('assigns equal rank to isolated nodes', function () {
    const nodes = ['A', 'B', 'C'];
    const edges = { A: [], B: [], C: [] };
    const ranks = pagerank.computePageRank(nodes, edges);

    const expected = 1.0 / 3;
    for (const n of nodes) {
      assert.ok(Math.abs(ranks[n] - expected) < 0.01,
        `${n} should have ~${expected.toFixed(3)}, got ${ranks[n].toFixed(3)}`);
    }
  });

  it('gives higher rank to nodes with more incoming edges', function () {
    const nodes = ['A', 'B', 'C'];
    const edges = { A: ['C'], B: ['C'], C: [] };
    const ranks = pagerank.computePageRank(nodes, edges);

    assert.ok(ranks.C > ranks.A, 'C should outrank A');
    assert.ok(ranks.C > ranks.B, 'C should outrank B');
  });

  it('converges for a chain graph', function () {
    const nodes = ['A', 'B', 'C', 'D'];
    const edges = { A: ['B'], B: ['C'], C: ['D'], D: [] };
    const ranks = pagerank.computePageRank(nodes, edges);

    for (const n of nodes) {
      assert.ok(ranks[n] > 0, `${n} should have positive rank`);
    }
  });

  it('handles cyclic graphs', function () {
    const nodes = ['A', 'B', 'C'];
    const edges = { A: ['B'], B: ['C'], C: ['A'] };
    const ranks = pagerank.computePageRank(nodes, edges);

    const expected = 1.0 / 3;
    for (const n of nodes) {
      assert.ok(Math.abs(ranks[n] - expected) < 0.01);
    }
  });

  it('ranks sum to approximately 1', function () {
    const nodes = ['A', 'B', 'C', 'D', 'E'];
    const edges = { A: ['B', 'C'], B: ['D'], C: ['D', 'E'], D: ['A'], E: [] };
    const ranks = pagerank.computePageRank(nodes, edges);

    const total = Object.values(ranks).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - 1.0) < 0.01, `ranks should sum to ~1, got ${total}`);
  });

  it('respects edge weights', function () {
    const nodes = ['A', 'B', 'C'];
    const edges = { A: ['B', 'C'], B: [], C: [] };
    const weights = { A: { B: 10, C: 1 } };
    const ranks = pagerank.computePageRank(nodes, edges, weights);

    assert.ok(ranks.B > ranks.C, 'B should outrank C due to higher edge weight');
  });
});

describe('pagerank — personalizedPageRank', function () {
  it('biases toward target nodes', function () {
    const nodes = ['A', 'B', 'C', 'D'];
    const edges = { A: ['B'], B: ['C'], C: ['D'], D: ['A'] };

    const standard = pagerank.computePageRank(nodes, edges);
    const personalized = pagerank.personalizedPageRank(nodes, edges, ['A']);

    assert.ok(personalized.A > standard.A, 'personalized should boost the target node');
  });

  it('falls back to uniform when no targets given', function () {
    const nodes = ['A', 'B'];
    const edges = { A: ['B'], B: ['A'] };
    const ranks = pagerank.personalizedPageRank(nodes, edges, []);

    assert.ok(ranks.A > 0);
    assert.ok(ranks.B > 0);
  });

  it('handles targets not in graph gracefully', function () {
    const nodes = ['A', 'B'];
    const edges = { A: ['B'], B: [] };
    const ranks = pagerank.personalizedPageRank(nodes, edges, ['Z']);

    assert.ok(ranks.A >= 0);
    assert.ok(ranks.B >= 0);
  });
});

describe('pagerank — buildCurriculumGraph', function () {
  it('builds edges from ontology provides/requires', function () {
    const probes = {
      L1: { difficulty: 0, skill: 'algebra' },
      L2: { difficulty: 0, skill: 'trig' },
      L3: { difficulty: 0, skill: 'calculus' }
    };
    const ontologyMap = {
      L1: { provides: ['algebra'], requires: [] },
      L2: { provides: ['trig'], requires: ['algebra'] },
      L3: { provides: ['calculus'], requires: ['algebra', 'trig'] }
    };

    const graph = pagerank.buildCurriculumGraph(probes, ontologyMap);
    assert.ok(graph.edges.L1.includes('L2'));
    assert.ok(graph.edges.L1.includes('L3'));
  });

  it('falls back to skill grouping without ontology map', function () {
    const probes = {
      L1: { difficulty: 0, skill: 'algebra' },
      L2: { difficulty: 0, skill: 'algebra' },
      L3: { difficulty: 0, skill: 'trig' }
    };

    const graph = pagerank.buildCurriculumGraph(probes);
    assert.ok(graph.edges.L1.includes('L2'));
    assert.ok(graph.edges.L2.includes('L1'));
    assert.strictEqual(graph.edges.L3.length, 0);
  });
});

describe('pagerank — buildTransitionGraph', function () {
  it('builds graph from Markov transitions', function () {
    const transitions = {
      L1: { L2: { count: 5, totalGain: 2.5, avgGain: 0.5 } },
      L2: { L3: { count: 3, totalGain: 0.9, avgGain: 0.3 } }
    };

    const graph = pagerank.buildTransitionGraph(transitions);
    assert.ok(graph.edges.L1.includes('L2'));
    assert.strictEqual(graph.weights.L1.L2, 5);
  });

  it('applies quality weighting when requested', function () {
    const transitions = {
      L1: {
        L2: { count: 10, totalGain: 5, avgGain: 0.5 },
        L3: { count: 10, totalGain: 0.1, avgGain: 0.01 }
      }
    };

    const graph = pagerank.buildTransitionGraph(transitions, { qualityWeighted: true });
    assert.ok(graph.weights.L1.L2 > graph.weights.L1.L3,
      'L2 should have higher weight (better learning gain)');
  });

  it('returns empty graph for empty transitions', function () {
    const graph = pagerank.buildTransitionGraph({});
    assert.strictEqual(graph.nodes.length, 0);
  });
});

describe('pagerank — findSkillGapLessons', function () {
  it('returns lessons where difficulty >= ability - 0.5', function () {
    const state = createState();
    state.rasch.students.stu1 = { ability: 1.0, variance: 0.5 };
    seedProbes(state, [
      ['L1', -2, 'easy'],
      ['L2', 0.8, 'medium'],
      ['L3', 1.5, 'hard']
    ]);

    const gaps = pagerank.findSkillGapLessons(state, 'stu1', ['L1', 'L2', 'L3']);
    assert.ok(gaps.includes('L2'));
    assert.ok(gaps.includes('L3'));
    assert.ok(!gaps.includes('L1'));
  });
});

describe('pagerank — normalize', function () {
  it('returns 0 for empty scores', function () {
    assert.strictEqual(pagerank.normalize(0.5, {}), 0);
  });

  it('returns 0 when all values are equal', function () {
    assert.strictEqual(pagerank.normalize(0.5, { A: 0.5, B: 0.5 }), 0);
  });

  it('normalizes min to 0 and max to 1', function () {
    const scores = { A: 1, B: 3, C: 5 };
    assert.ok(Math.abs(pagerank.normalize(1, scores) - 0) < 1e-9);
    assert.ok(Math.abs(pagerank.normalize(5, scores) - 1) < 1e-9);
    assert.ok(Math.abs(pagerank.normalize(3, scores) - 0.5) < 1e-9);
  });
});

describe('pagerank — cache', function () {
  it('invalidateCache resets cache', function () {
    pagerank.invalidateCache();
    // After invalidation, the next scoreCandidates should recompute
    const state = createState();
    seedProbes(state, [['L1', 0, 'math']]);
    const scores = pagerank.scoreCandidates(state, 'stu1', ['L1']);
    assert.ok(scores.L1);
  });

  it('uses cached results on repeated calls', function () {
    const state = createState();
    seedProbes(state, [['L1', 0, 'math'], ['L2', 0, 'math']]);
    state.bandit.observationCount = 100;

    pagerank.invalidateCache();
    const scores1 = pagerank.scoreCandidates(state, 'stu1', ['L1', 'L2']);
    const scores2 = pagerank.scoreCandidates(state, 'stu1', ['L1', 'L2']);

    assert.strictEqual(scores1.L1.curriculumRank, scores2.L1.curriculumRank);
  });
});

describe('pagerank — stationaryDistribution', function () {
  it('returns empty for state with no transitions', function () {
    const state = createState();
    const dist = pagerank.stationaryDistribution(state);
    assert.deepStrictEqual(dist, {});
  });

  it('returns distribution for state with transitions', function () {
    const state = createState();
    for (let i = 0; i < 10; i++) {
      markov.recordTransition(state, 'stu' + i, 'L1', 0);
      markov.recordTransition(state, 'stu' + i, 'L2', 0.5);
    }

    const dist = pagerank.stationaryDistribution(state);
    assert.ok(Object.keys(dist).length > 0);
    const total = Object.values(dist).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - 1.0) < 0.05, 'should sum to ~1');
  });
});

describe('pagerank — identifyFlowBottlenecks', function () {
  it('returns empty for state with no transitions', function () {
    const state = createState();
    const bottlenecks = pagerank.identifyFlowBottlenecks(state);
    assert.deepStrictEqual(bottlenecks, []);
  });

  it('identifies sink nodes as potential bottlenecks', function () {
    const state = createState();
    // Build a funnel: many paths lead to L3 but L3 goes nowhere
    for (let i = 0; i < 20; i++) {
      markov.recordTransition(state, 'a' + i, 'L1', 0);
      markov.recordTransition(state, 'a' + i, 'L3', 0.1);
    }
    for (let i = 0; i < 20; i++) {
      markov.recordTransition(state, 'b' + i, 'L2', 0);
      markov.recordTransition(state, 'b' + i, 'L3', 0.1);
    }

    const bottlenecks = pagerank.identifyFlowBottlenecks(state, 5);
    assert.ok(bottlenecks.length > 0);
    const l3Entry = bottlenecks.find(b => b.lessonId === 'L3');
    assert.ok(l3Entry, 'L3 (sink with no outgoing edges) should appear as bottleneck');
  });

  it('respects topK parameter', function () {
    const state = createState();
    for (let i = 0; i < 10; i++) {
      markov.recordTransition(state, 's' + i, 'L' + i, 0);
      markov.recordTransition(state, 's' + i, 'LX', 0.1);
    }

    const bottlenecks = pagerank.identifyFlowBottlenecks(state, 3);
    assert.ok(bottlenecks.length <= 3);
  });
});

describe('pagerank — scoreCandidates (integration)', function () {
  it('produces scores for all candidates', function () {
    const state = createState();
    seedProbes(state, [
      ['L1', -1, 'algebra'],
      ['L2', 0, 'algebra'],
      ['L3', 1, 'trig']
    ]);

    pagerank.invalidateCache();
    const scores = pagerank.scoreCandidates(state, 'stu1', ['L1', 'L2', 'L3']);
    for (const lid of ['L1', 'L2', 'L3']) {
      assert.ok(typeof scores[lid].curriculumRank === 'number');
      assert.ok(typeof scores[lid].transitionRank === 'number');
      assert.ok(typeof scores[lid].personalizedRank === 'number');
      assert.ok(typeof scores[lid].combinedScore === 'number');
    }
  });

  it('uses ontology map for richer curriculum graph', function () {
    const state = createState();
    seedProbes(state, [
      ['L1', 0, 'algebra'],
      ['L2', 0, 'trig'],
      ['L3', 0, 'calculus']
    ]);

    const ontologyMap = {
      L1: { provides: ['algebra'], requires: [] },
      L2: { provides: ['trig'], requires: ['algebra'] },
      L3: { provides: ['calculus'], requires: ['algebra', 'trig'] }
    };

    pagerank.invalidateCache();
    const withOntology = pagerank.scoreCandidates(state, 'stu1', ['L1', 'L2', 'L3'], ontologyMap);
    pagerank.invalidateCache();
    const withoutOntology = pagerank.scoreCandidates(state, 'stu1', ['L1', 'L2', 'L3']);

    const ranksWithO = [withOntology.L1.curriculumRank, withOntology.L2.curriculumRank, withOntology.L3.curriculumRank];
    const ranksWithout = [withoutOntology.L1.curriculumRank, withoutOntology.L2.curriculumRank, withoutOntology.L3.curriculumRank];
    const differs = ranksWithO.some((v, i) => Math.abs(v - ranksWithout[i]) > 1e-6);
    assert.ok(differs, 'ontology-based graph should produce different ranks');
  });
});
