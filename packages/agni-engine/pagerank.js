// packages/agni-engine/pagerank.js
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

const DAMPING = 0.85;
const MAX_ITERATIONS = 100;
const CONVERGENCE_THRESHOLD = 1e-6;

// ── PageRank cache ───────────────────────────────────────────────────────────
// Recomputing PageRank on every selectBestLesson call is wasteful when the
// graph hasn't changed. We cache results and invalidate when the observation
// count crosses a threshold delta.
const _cache = {
  curriculumRanks: null,
  transitionRanks: null,
  _currGraph: null,
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
  _cache._currGraph = null;
  _cache.lastObservationCount = -1;
  _cache.lastProbeCount = -1;
}

/**
 * Check if the cache should be refreshed.
 * @param {object} state LMSState
 * @returns {boolean}
 */
function isCacheStale(state) {
  const obsCount = state.bandit ? state.bandit.observationCount : 0;
  const probeCount = state.rasch ? Object.keys(state.rasch.probes).length : 0;

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
  const nodes = Object.keys(probes);
  const edges = /** @type {Record<string, string[]>} */ ({});
  for (let i = 0; i < nodes.length; i++) edges[nodes[i]] = [];

  if (ontologyMap) {
    const providersBySkill = /** @type {Record<string, string[]>} */ ({});
    const requirersBySkill = /** @type {Record<string, string[]>} */ ({});

    for (let n = 0; n < nodes.length; n++) {
      const nid = nodes[n];
      const ont = ontologyMap[nid];
      if (!ont) continue;

      const provides = ont.provides || [];
      for (let p = 0; p < provides.length; p++) {
        const prov = provides[p];
        const sk = typeof prov === 'string' ? prov : (/** @type {{ skill?: string }} */ (prov).skill || String(prov));
        if (!providersBySkill[sk]) providersBySkill[sk] = [];
        providersBySkill[sk].push(nid);
      }

      const requires = ont.requires || [];
      for (let r = 0; r < requires.length; r++) {
        const req = requires[r];
        const rsk = typeof req === 'string' ? req : (/** @type {{ skill?: string }} */ (req).skill || String(req));
        if (!requirersBySkill[rsk]) requirersBySkill[rsk] = [];
        requirersBySkill[rsk].push(nid);
      }
    }

    const skills = Object.keys(providersBySkill);
    for (let si = 0; si < skills.length; si++) {
      const skill = skills[si];
      const providers = providersBySkill[skill] || [];
      const requirers = requirersBySkill[skill] || [];
      for (let pi = 0; pi < providers.length; pi++) {
        for (let ri = 0; ri < requirers.length; ri++) {
          if (providers[pi] !== requirers[ri]) {
            if (!edges[providers[pi]]) edges[providers[pi]] = [];
            edges[providers[pi]].push(requirers[ri]);
          }
        }
      }
    }
  } else {
    const lessonsBySkill = {};
    for (let j = 0; j < nodes.length; j++) {
      const lid = nodes[j];
      const sk2 = probes[lid].skill;
      if (!sk2) continue;
      if (!lessonsBySkill[sk2]) lessonsBySkill[sk2] = [];
      lessonsBySkill[sk2].push(lid);
    }

    const skillGroups = Object.keys(lessonsBySkill);
    for (let g = 0; g < skillGroups.length; g++) {
      const group = lessonsBySkill[skillGroups[g]];
      for (let a = 0; a < group.length; a++) {
        for (let b = a + 1; b < group.length; b++) {
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
  const qualityWeighted = opts.qualityWeighted || false;

  const nodeSet = /** @type {Record<string, boolean>} */ ({});
  const edges = /** @type {Record<string, string[]>} */ ({});
  const weights = /** @type {Record<string, Record<string, number>>} */ ({});

  const fromIds = Object.keys(transitions);
  for (let i = 0; i < fromIds.length; i++) {
    const from = fromIds[i];
    nodeSet[from] = true;
    if (!edges[from]) edges[from] = [];
    if (!weights[from]) weights[from] = {};

    const toIds = Object.keys(transitions[from]);
    for (let j = 0; j < toIds.length; j++) {
      const to = toIds[j];
      const t = transitions[from][to];
      nodeSet[to] = true;
      edges[from].push(to);

      if (qualityWeighted) {
        const gainFactor = Math.max(t.avgGain || 0, 0.01);
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
  const d = opts.damping !== undefined ? opts.damping : DAMPING;
  const maxIter = opts.maxIter || MAX_ITERATIONS;
  const tol = opts.tolerance || CONVERGENCE_THRESHOLD;

  const N = nodes.length;
  if (N === 0) return /** @type {Record<string, number>} */ ({});

  const nodeIndex = /** @type {Record<string, number>} */ ({});
  for (let i = 0; i < N; i++) nodeIndex[nodes[i]] = i;

  let rank = new Array(N);
  const init = 1.0 / N;
  for (let r = 0; r < N; r++) rank[r] = init;

  for (let iter = 0; iter < maxIter; iter++) {
    const newRank = new Array(N);
    for (let nr = 0; nr < N; nr++) newRank[nr] = (1 - d) / N;

    for (let s = 0; s < N; s++) {
      const src = nodes[s];
      const outs = edges[src] || [];
      if (outs.length === 0) {
        const share = d * rank[s] / N;
        for (let dn = 0; dn < N; dn++) newRank[dn] += share;
        continue;
      }

      if (weights && weights[src]) {
        let totalW = 0;
        for (let wi = 0; wi < outs.length; wi++) {
          totalW += (weights[src][outs[wi]] || 1);
        }
        for (let we = 0; we < outs.length; we++) {
          const dst = outs[we];
          const dstIdx = nodeIndex[dst];
          if (dstIdx === undefined) continue;
          const w = (weights[src][dst] || 1) / totalW;
          newRank[dstIdx] += d * rank[s] * w;
        }
      } else {
        const outW = d * rank[s] / outs.length;
        for (let e = 0; e < outs.length; e++) {
          const dIdx = nodeIndex[outs[e]];
          if (dIdx === undefined) continue;
          newRank[dIdx] += outW;
        }
      }
    }

    let diff = 0;
    for (let c = 0; c < N; c++) diff += Math.abs(newRank[c] - rank[c]);
    rank = newRank;
    if (diff < tol) break;
  }

  const result = /** @type {Record<string, number>} */ ({});
  for (let f = 0; f < N; f++) result[nodes[f]] = rank[f];
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
  const d = opts.damping !== undefined ? opts.damping : DAMPING;
  const maxIter = opts.maxIter || MAX_ITERATIONS;
  const tol = opts.tolerance || CONVERGENCE_THRESHOLD;

  const N = nodes.length;
  if (N === 0) return /** @type {Record<string, number>} */ ({});

  const nodeIndex = /** @type {Record<string, number>} */ ({});
  for (let i = 0; i < N; i++) nodeIndex[nodes[i]] = i;

  const teleport = new Array(N);
  for (let t = 0; t < N; t++) teleport[t] = 0;

  if (targetNodes.length > 0) {
    const tw = 1.0 / targetNodes.length;
    for (let ti = 0; ti < targetNodes.length; ti++) {
      const tidx = nodeIndex[targetNodes[ti]];
      if (tidx !== undefined) teleport[tidx] = tw;
    }
  } else {
    for (let u = 0; u < N; u++) teleport[u] = 1.0 / N;
  }

  let rank = new Array(N);
  for (let r = 0; r < N; r++) rank[r] = teleport[r] || 1.0 / N;

  for (let iter = 0; iter < maxIter; iter++) {
    const newRank = new Array(N);
    for (let nr = 0; nr < N; nr++) newRank[nr] = (1 - d) * teleport[nr];

    for (let s = 0; s < N; s++) {
      const src = nodes[s];
      const outs = edges[src] || [];
      if (outs.length === 0) {
        for (let dn = 0; dn < N; dn++) newRank[dn] += d * rank[s] * teleport[dn];
        continue;
      }

      if (weights && weights[src]) {
        let totalW = 0;
        for (let wi = 0; wi < outs.length; wi++) {
          totalW += (weights[src][outs[wi]] || 1);
        }
        for (let we = 0; we < outs.length; we++) {
          const dst = outs[we];
          const dstIdx = nodeIndex[dst];
          if (dstIdx === undefined) continue;
          const w = (weights[src][dst] || 1) / totalW;
          newRank[dstIdx] += d * rank[s] * w;
        }
      } else {
        const outW = d * rank[s] / outs.length;
        for (let e = 0; e < outs.length; e++) {
          const dIdx = nodeIndex[outs[e]];
          if (dIdx === undefined) continue;
          newRank[dIdx] += outW;
        }
      }
    }

    let diff = 0;
    for (let c = 0; c < N; c++) diff += Math.abs(newRank[c] - rank[c]);
    rank = newRank;
    if (diff < tol) break;
  }

  const result = /** @type {Record<string, number>} */ ({});
  for (let f = 0; f < N; f++) result[nodes[f]] = rank[f];
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
  let currRanks;
  let transRanks;

  if (isCacheStale(state)) {
    const currGraph = buildCurriculumGraph(state.rasch.probes, ontologyMap);
    currRanks = computePageRank(currGraph.nodes, currGraph.edges);
    _cache.curriculumRanks = currRanks;
    _cache._currGraph = currGraph;

    transRanks = /** @type {Record<string, number>} */ ({});
    if (state.markov && state.markov.transitions) {
      const transGraph = buildTransitionGraph(state.markov.transitions, { qualityWeighted: true });
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
  const gapLessons = findSkillGapLessons(state, studentId, candidates);
  let persRanks = /** @type {Record<string, number>} */ ({});
  const currGraph2 = _cache._currGraph;
  if (gapLessons.length > 0 && currGraph2 && currGraph2.nodes.length > 0) {
    persRanks = personalizedPageRank(currGraph2.nodes, currGraph2.edges, gapLessons);
  }

  const scores = /** @type {Record<string, { curriculumRank: number, transitionRank: number, personalizedRank: number, combinedScore: number }>} */ ({});
  for (let i = 0; i < candidates.length; i++) {
    const cid = candidates[i];
    const cr = currRanks[cid] || 0;
    const tr = transRanks[cid] || 0;
    const pr = persRanks[cid] || 0;

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
  const student = state.rasch.students[studentId];
  const ability = student ? student.ability : 0;

  const gapLessons = [];
  for (let i = 0; i < candidates.length; i++) {
    const cid = candidates[i];
    const probe = state.rasch.probes[cid];
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
  const keys = Object.keys(scores);
  if (keys.length === 0) return 0;

  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < keys.length; i++) {
    const v = scores[keys[i]];
    if (v < min) min = v;
    if (v > max) max = v;
  }

  const range = max - min;
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
  const graph = buildTransitionGraph(state.markov.transitions);
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
  const dist = stationaryDistribution(state);
  if (Object.keys(dist).length === 0) return [];

  const transitions = (state.markov && state.markov.transitions) ? state.markov.transitions : {};
  const results = /** @type {Array<{ lessonId: string, stationaryProb: number, outDegree: number, avgOutGain: number }>} */ ([]);

  const lessonIds = Object.keys(dist);
  for (let i = 0; i < lessonIds.length; i++) {
    const lid = lessonIds[i];
    const edges = transitions[lid] || {};
    const outKeys = Object.keys(edges);
    const outDegree = outKeys.length;

    let totalGain = 0;
    for (let j = 0; j < outKeys.length; j++) {
      totalGain += edges[outKeys[j]].avgGain || 0;
    }
    const avgOutGain = outDegree > 0 ? totalGain / outDegree : 0;

    results.push({
      lessonId: lid,
      stationaryProb: dist[lid],
      outDegree: outDegree,
      avgOutGain: avgOutGain
    });
  }

  // High stationary probability + low out-degree + low gain = bottleneck
  results.sort(function (a, b) {
    const scoreA = a.stationaryProb / (a.outDegree + 1) / (Math.abs(a.avgOutGain) + 0.1);
    const scoreB = b.stationaryProb / (b.outDegree + 1) / (Math.abs(b.avgOutGain) + 0.1);
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
