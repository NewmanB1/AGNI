// src/engine/pagerank.js
// AGNI LMS Engine — PageRank for lesson authority scoring
//
// Computes lesson "importance" via the PageRank algorithm on two graphs:
//
//   1. Curriculum graph  — built from ontology (provides → requires edges).
//      Lessons that are prerequisites to many others get high PageRank,
//      making them natural gateway lessons.
//
//   2. Transition graph  — built from the Markov chain (actual student paths).
//      Lessons that students frequently transition through get high PageRank,
//      reflecting empirical bottleneck or hub status.
//
// Both standard and personalized PageRank are supported. Personalized
// PageRank biases the teleport vector toward lessons aligned with the
// student's current skill gaps, so the score answers "which gateway
// lessons matter most for THIS student right now?"
//
// Integration: scores are added as bonus signals in selectBestLesson,
// combined with Thompson Sampling and Markov transition scores.
//
// Target: Node.js 14+. CommonJS. No external dependencies.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

var DAMPING = 0.85;
var MAX_ITERATIONS = 100;
var CONVERGENCE_THRESHOLD = 1e-6;

// ── PageRank cache ───────────────────────────────────────────────────────────
// Recomputing PageRank on every selectBestLesson call is wasteful when the
// graph hasn't changed. We cache results and invalidate when the observation
// count crosses a threshold delta.
var _cache = {
  curriculumRanks: null,
  transitionRanks: null,
  lastObservationCount: -1,
  lastProbeCount: -1,
  INVALIDATION_DELTA: 10
};

/**
 * Invalidate the PageRank cache. Called when the graph may have changed.
 */
function invalidateCache() {
  _cache.curriculumRanks = null;
  _cache.transitionRanks = null;
  _cache.lastObservationCount = -1;
  _cache.lastProbeCount = -1;
}

/**
 * Check if the cache should be refreshed.
 * @param {object} state LMSState
 * @returns {boolean}
 */
function isCacheStale(state) {
  var obsCount = state.bandit ? state.bandit.observationCount : 0;
  var probeCount = state.rasch ? Object.keys(state.rasch.probes).length : 0;

  if (_cache.curriculumRanks === null) return true;
  if (probeCount !== _cache.lastProbeCount) return true;
  if (Math.abs(obsCount - _cache.lastObservationCount) >= _cache.INVALIDATION_DELTA) return true;
  return false;
}

/**
 * Build a curriculum adjacency list from lesson probe/skill data.
 *
 * Edge semantics: if lesson A provides skill X and lesson B requires
 * skill X, then A → B (A is a prerequisite to B, so importance flows
 * from A to B in the PageRank sense — being a prereq to many lessons
 * means you're important).
 *
 * @param {Object.<string, { skill: string }>} probes
 *   state.rasch.probes: maps lessonId → { difficulty, skill }
 * @param {Object.<string, { requires?: string[], provides?: string[] }>} [ontologyMap]
 *   Optional explicit per-lesson ontology (lessonId → { requires, provides }).
 *   If provided, uses rich multi-skill edges. Otherwise falls back to single
 *   skill from rasch probes.
 * @returns {{ nodes: string[], edges: Object.<string, string[]> }}
 */
function buildCurriculumGraph(probes, ontologyMap) {
  var nodes = Object.keys(probes);
  var edges = {};
  for (var i = 0; i < nodes.length; i++) edges[nodes[i]] = [];

  if (ontologyMap) {
    var providersBySkill = {};
    var requirersBySkill = {};

    for (var n = 0; n < nodes.length; n++) {
      var nid = nodes[n];
      var ont = ontologyMap[nid];
      if (!ont) continue;

      var provides = ont.provides || [];
      for (var p = 0; p < provides.length; p++) {
        var sk = typeof provides[p] === 'string' ? provides[p] : provides[p].skill || provides[p];
        if (!providersBySkill[sk]) providersBySkill[sk] = [];
        providersBySkill[sk].push(nid);
      }

      var requires = ont.requires || [];
      for (var r = 0; r < requires.length; r++) {
        var rsk = typeof requires[r] === 'string' ? requires[r] : requires[r].skill || requires[r];
        if (!requirersBySkill[rsk]) requirersBySkill[rsk] = [];
        requirersBySkill[rsk].push(nid);
      }
    }

    var skills = Object.keys(providersBySkill);
    for (var si = 0; si < skills.length; si++) {
      var skill = skills[si];
      var providers = providersBySkill[skill] || [];
      var requirers = requirersBySkill[skill] || [];
      for (var pi = 0; pi < providers.length; pi++) {
        for (var ri = 0; ri < requirers.length; ri++) {
          if (providers[pi] !== requirers[ri]) {
            if (!edges[providers[pi]]) edges[providers[pi]] = [];
            edges[providers[pi]].push(requirers[ri]);
          }
        }
      }
    }
  } else {
    var lessonsBySkill = {};
    for (var j = 0; j < nodes.length; j++) {
      var lid = nodes[j];
      var sk2 = probes[lid].skill;
      if (!sk2) continue;
      if (!lessonsBySkill[sk2]) lessonsBySkill[sk2] = [];
      lessonsBySkill[sk2].push(lid);
    }

    var skillGroups = Object.keys(lessonsBySkill);
    for (var g = 0; g < skillGroups.length; g++) {
      var group = lessonsBySkill[skillGroups[g]];
      for (var a = 0; a < group.length; a++) {
        for (var b = a + 1; b < group.length; b++) {
          if (!edges[group[a]]) edges[group[a]] = [];
          if (!edges[group[b]]) edges[group[b]] = [];
          edges[group[a]].push(group[b]);
          edges[group[b]].push(group[a]);
        }
      }
    }
  }

  return { nodes: nodes, edges: edges };
}

/**
 * Build an adjacency list from the Markov transition data.
 *
 * @param {Object.<string, Object.<string, { count: number, avgGain?: number }>>} transitions
 *   state.markov.transitions
 * @param {object} [opts]
 * @param {boolean} [opts.qualityWeighted=false]  weight edges by count * max(avgGain, 0.01)
 *   instead of count alone. Deprioritizes transitions where students learn nothing.
 * @returns {{ nodes: string[], edges: Object.<string, string[]>, weights: Object.<string, Object.<string, number>> }}
 */
function buildTransitionGraph(transitions, opts) {
  opts = opts || {};
  var qualityWeighted = opts.qualityWeighted || false;

  var nodeSet = {};
  var edges = {};
  var weights = {};

  var fromIds = Object.keys(transitions);
  for (var i = 0; i < fromIds.length; i++) {
    var from = fromIds[i];
    nodeSet[from] = true;
    if (!edges[from]) edges[from] = [];
    if (!weights[from]) weights[from] = {};

    var toIds = Object.keys(transitions[from]);
    for (var j = 0; j < toIds.length; j++) {
      var to = toIds[j];
      var t = transitions[from][to];
      nodeSet[to] = true;
      edges[from].push(to);

      if (qualityWeighted) {
        var gainFactor = Math.max(t.avgGain || 0, 0.01);
        weights[from][to] = t.count * gainFactor;
      } else {
        weights[from][to] = t.count;
      }

      if (!edges[to]) edges[to] = [];
    }
  }

  return { nodes: Object.keys(nodeSet), edges: edges, weights: weights };
}

/**
 * Standard PageRank with uniform teleport.
 *
 * @param {string[]} nodes
 * @param {Object.<string, string[]>} edges    adjacency list (outgoing)
 * @param {Object.<string, Object.<string, number>>} [weights]  optional edge weights
 * @param {object} [opts]
 * @param {number} [opts.damping]     damping factor (default 0.85)
 * @param {number} [opts.maxIter]     max iterations (default 100)
 * @param {number} [opts.tolerance]   convergence threshold (default 1e-6)
 * @returns {Object.<string, number>} lessonId → PageRank score
 */
function computePageRank(nodes, edges, weights, opts) {
  opts = opts || {};
  var d = opts.damping !== undefined ? opts.damping : DAMPING;
  var maxIter = opts.maxIter || MAX_ITERATIONS;
  var tol = opts.tolerance || CONVERGENCE_THRESHOLD;

  var N = nodes.length;
  if (N === 0) return {};

  var nodeIndex = {};
  for (var i = 0; i < N; i++) nodeIndex[nodes[i]] = i;

  var rank = new Array(N);
  var init = 1.0 / N;
  for (var r = 0; r < N; r++) rank[r] = init;

  for (var iter = 0; iter < maxIter; iter++) {
    var newRank = new Array(N);
    for (var nr = 0; nr < N; nr++) newRank[nr] = (1 - d) / N;

    for (var s = 0; s < N; s++) {
      var src = nodes[s];
      var outs = edges[src] || [];
      if (outs.length === 0) {
        var share = d * rank[s] / N;
        for (var dn = 0; dn < N; dn++) newRank[dn] += share;
        continue;
      }

      if (weights && weights[src]) {
        var totalW = 0;
        for (var wi = 0; wi < outs.length; wi++) {
          totalW += (weights[src][outs[wi]] || 1);
        }
        for (var we = 0; we < outs.length; we++) {
          var dst = outs[we];
          var dstIdx = nodeIndex[dst];
          if (dstIdx === undefined) continue;
          var w = (weights[src][dst] || 1) / totalW;
          newRank[dstIdx] += d * rank[s] * w;
        }
      } else {
        var outW = d * rank[s] / outs.length;
        for (var e = 0; e < outs.length; e++) {
          var dIdx = nodeIndex[outs[e]];
          if (dIdx === undefined) continue;
          newRank[dIdx] += outW;
        }
      }
    }

    var diff = 0;
    for (var c = 0; c < N; c++) diff += Math.abs(newRank[c] - rank[c]);
    rank = newRank;
    if (diff < tol) break;
  }

  var result = {};
  for (var f = 0; f < N; f++) result[nodes[f]] = rank[f];
  return result;
}

/**
 * Personalized PageRank — biases teleport toward a set of target nodes.
 *
 * Instead of teleporting uniformly to all nodes, the random surfer
 * teleports to one of the target nodes. This answers: "starting from
 * the student's skill gaps, which lessons are most reachable/important?"
 *
 * @param {string[]} nodes
 * @param {Object.<string, string[]>} edges
 * @param {string[]} targetNodes        nodes to bias teleport toward
 * @param {Object.<string, Object.<string, number>>} [weights]
 * @param {object} [opts]
 * @param {number} [opts.damping]
 * @param {number} [opts.maxIter]
 * @param {number} [opts.tolerance]
 * @returns {Object.<string, number>}
 */
function personalizedPageRank(nodes, edges, targetNodes, weights, opts) {
  opts = opts || {};
  var d = opts.damping !== undefined ? opts.damping : DAMPING;
  var maxIter = opts.maxIter || MAX_ITERATIONS;
  var tol = opts.tolerance || CONVERGENCE_THRESHOLD;

  var N = nodes.length;
  if (N === 0) return {};

  var nodeIndex = {};
  for (var i = 0; i < N; i++) nodeIndex[nodes[i]] = i;

  var teleport = new Array(N);
  for (var t = 0; t < N; t++) teleport[t] = 0;

  if (targetNodes.length > 0) {
    var tw = 1.0 / targetNodes.length;
    for (var ti = 0; ti < targetNodes.length; ti++) {
      var tidx = nodeIndex[targetNodes[ti]];
      if (tidx !== undefined) teleport[tidx] = tw;
    }
  } else {
    for (var u = 0; u < N; u++) teleport[u] = 1.0 / N;
  }

  var rank = new Array(N);
  for (var r = 0; r < N; r++) rank[r] = teleport[r] || 1.0 / N;

  for (var iter = 0; iter < maxIter; iter++) {
    var newRank = new Array(N);
    for (var nr = 0; nr < N; nr++) newRank[nr] = (1 - d) * teleport[nr];

    for (var s = 0; s < N; s++) {
      var src = nodes[s];
      var outs = edges[src] || [];
      if (outs.length === 0) {
        for (var dn = 0; dn < N; dn++) newRank[dn] += d * rank[s] * teleport[dn];
        continue;
      }

      if (weights && weights[src]) {
        var totalW = 0;
        for (var wi = 0; wi < outs.length; wi++) {
          totalW += (weights[src][outs[wi]] || 1);
        }
        for (var we = 0; we < outs.length; we++) {
          var dst = outs[we];
          var dstIdx = nodeIndex[dst];
          if (dstIdx === undefined) continue;
          var w = (weights[src][dst] || 1) / totalW;
          newRank[dstIdx] += d * rank[s] * w;
        }
      } else {
        var outW = d * rank[s] / outs.length;
        for (var e = 0; e < outs.length; e++) {
          var dIdx = nodeIndex[outs[e]];
          if (dIdx === undefined) continue;
          newRank[dIdx] += outW;
        }
      }
    }

    var diff = 0;
    for (var c = 0; c < N; c++) diff += Math.abs(newRank[c] - rank[c]);
    rank = newRank;
    if (diff < tol) break;
  }

  var result = {};
  for (var f = 0; f < N; f++) result[nodes[f]] = rank[f];
  return result;
}

/**
 * Score candidates for a student by combining curriculum PageRank,
 * quality-weighted transition PageRank, and personalized PageRank.
 *
 * Uses a cache to avoid recomputing PageRank on every call. The cache
 * is invalidated when the observation count changes by >= INVALIDATION_DELTA
 * or when new probes are added.
 *
 * @param {object} state            LMSState (with markov sub-state)
 * @param {string} studentId
 * @param {string[]} candidates     eligible lesson IDs
 * @param {Object.<string, { requires?: string[], provides?: string[] }>} [ontologyMap]
 * @returns {Object.<string, { curriculumRank: number, transitionRank: number, personalizedRank: number, combinedScore: number }>}
 */
function scoreCandidates(state, studentId, candidates, ontologyMap) {
  var currRanks;
  var transRanks;

  if (isCacheStale(state)) {
    var currGraph = buildCurriculumGraph(state.rasch.probes, ontologyMap);
    currRanks = computePageRank(currGraph.nodes, currGraph.edges);
    _cache.curriculumRanks = currRanks;
    _cache._currGraph = currGraph;

    transRanks = {};
    if (state.markov && state.markov.transitions) {
      var transGraph = buildTransitionGraph(state.markov.transitions, { qualityWeighted: true });
      if (transGraph.nodes.length > 0) {
        transRanks = computePageRank(transGraph.nodes, transGraph.edges, transGraph.weights);
      }
    }
    _cache.transitionRanks = transRanks;

    _cache.lastObservationCount = state.bandit ? state.bandit.observationCount : 0;
    _cache.lastProbeCount = state.rasch ? Object.keys(state.rasch.probes).length : 0;
  } else {
    currRanks = _cache.curriculumRanks || {};
    transRanks = _cache.transitionRanks || {};
  }

  // Personalized PageRank is always per-student so it can't be cached globally
  var gapLessons = findSkillGapLessons(state, studentId, candidates);
  var persRanks = {};
  var currGraph2 = _cache._currGraph;
  if (gapLessons.length > 0 && currGraph2 && currGraph2.nodes.length > 0) {
    persRanks = personalizedPageRank(currGraph2.nodes, currGraph2.edges, gapLessons);
  }

  var scores = {};
  for (var i = 0; i < candidates.length; i++) {
    var cid = candidates[i];
    var cr = currRanks[cid] || 0;
    var tr = transRanks[cid] || 0;
    var pr = persRanks[cid] || 0;

    scores[cid] = {
      curriculumRank: cr,
      transitionRank: tr,
      personalizedRank: pr,
      combinedScore: 0.3 * normalize(cr, currRanks) +
                     0.3 * normalize(tr, transRanks) +
                     0.4 * normalize(pr, persRanks)
    };
  }

  return scores;
}

/**
 * Find lessons aligned with the student's skill gaps.
 * A skill gap exists when the student's ability for probes in that skill
 * is below the probe difficulty (i.e. they haven't mastered it).
 *
 * @param {object} state
 * @param {string} studentId
 * @param {string[]} candidates
 * @returns {string[]}
 */
function findSkillGapLessons(state, studentId, candidates) {
  var student = state.rasch.students[studentId];
  var ability = student ? student.ability : 0;

  var gapLessons = [];
  for (var i = 0; i < candidates.length; i++) {
    var cid = candidates[i];
    var probe = state.rasch.probes[cid];
    if (!probe) continue;

    if (probe.difficulty >= ability - 0.5) {
      gapLessons.push(cid);
    }
  }

  return gapLessons;
}

/**
 * Normalize a value against a distribution (min-max within the scores map).
 * Returns 0 if all values are equal or the map is empty.
 */
function normalize(value, scores) {
  var keys = Object.keys(scores);
  if (keys.length === 0) return 0;

  var min = Infinity;
  var max = -Infinity;
  for (var i = 0; i < keys.length; i++) {
    var v = scores[keys[i]];
    if (v < min) min = v;
    if (v > max) max = v;
  }

  var range = max - min;
  if (range < 1e-12) return 0;
  return (value - min) / range;
}

/**
 * Compute the stationary distribution of the transition Markov chain.
 * This reveals where students "accumulate" — lessons with high stationary
 * probability are either very common starting points or bottlenecks
 * where students get stuck.
 *
 * @param {object} state  LMSState with markov sub-state
 * @returns {Object.<string, number>}  lessonId → stationary probability
 */
function stationaryDistribution(state) {
  if (!state.markov || !state.markov.transitions) return {};
  var graph = buildTransitionGraph(state.markov.transitions);
  if (graph.nodes.length === 0) return {};

  // Stationary distribution of a Markov chain is the PageRank with damping=1
  // (pure random walk, no teleportation). We use damping=0.999 for stability.
  return computePageRank(graph.nodes, graph.edges, graph.weights, { damping: 0.999 });
}

/**
 * Identify flow bottlenecks: lessons with high stationary probability
 * but low outgoing transition diversity. These are lessons where students
 * tend to converge but struggle to progress past.
 *
 * @param {object} state
 * @param {number} [topK=10]  number of bottlenecks to return
 * @returns {Array<{ lessonId: string, stationaryProb: number, outDegree: number, avgOutGain: number }>}
 */
function identifyFlowBottlenecks(state, topK) {
  topK = topK || 10;
  var dist = stationaryDistribution(state);
  if (Object.keys(dist).length === 0) return [];

  var transitions = (state.markov && state.markov.transitions) ? state.markov.transitions : {};
  var results = [];

  var lessonIds = Object.keys(dist);
  for (var i = 0; i < lessonIds.length; i++) {
    var lid = lessonIds[i];
    var edges = transitions[lid] || {};
    var outKeys = Object.keys(edges);
    var outDegree = outKeys.length;

    var totalGain = 0;
    for (var j = 0; j < outKeys.length; j++) {
      totalGain += edges[outKeys[j]].avgGain || 0;
    }
    var avgOutGain = outDegree > 0 ? totalGain / outDegree : 0;

    results.push({
      lessonId: lid,
      stationaryProb: dist[lid],
      outDegree: outDegree,
      avgOutGain: avgOutGain
    });
  }

  // High stationary probability + low out-degree + low gain = bottleneck
  results.sort(function (a, b) {
    var scoreA = a.stationaryProb / (a.outDegree + 1) / (Math.abs(a.avgOutGain) + 0.1);
    var scoreB = b.stationaryProb / (b.outDegree + 1) / (Math.abs(b.avgOutGain) + 0.1);
    return scoreB - scoreA;
  });

  return results.slice(0, topK);
}

module.exports = {
  buildCurriculumGraph:     buildCurriculumGraph,
  buildTransitionGraph:     buildTransitionGraph,
  computePageRank:          computePageRank,
  personalizedPageRank:     personalizedPageRank,
  scoreCandidates:          scoreCandidates,
  findSkillGapLessons:      findSkillGapLessons,
  normalize:                normalize,
  invalidateCache:          invalidateCache,
  stationaryDistribution:   stationaryDistribution,
  identifyFlowBottlenecks:  identifyFlowBottlenecks
};
