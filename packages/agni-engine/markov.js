// packages/agni-engine/markov.js
// AGNI LMS Engine — Markov chain transition model
//
// Learns which lesson sequences produce good outcomes by tracking
// (prevLesson → nextLesson) transitions and their observed gain.
//
// Features:
//   1. First-order transitions: (prev → next) with gain tracking.
//   2. Second-order (bigram) transitions: (prev2,prev1 → next) capturing
//      richer sequential patterns ("students who did A then B excel at C").
//   3. Dropout detection: tracks when students stop engaging after a lesson,
//      identifying dead-end or discouraging content.
//   4. Cooldown tracking: records which lessons a student recently failed
//      or completed, so the selector can avoid immediate repetition.
//
// Integration: scores are added as bonus signals in selectBestLesson,
// not used to override Thompson Sampling.
//
// Target: Node.js 14+. CommonJS. No external dependencies.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

// ── Data structure ───────────────────────────────────────────────────────────
//
// state.markov = {
//   transitions: { "<from>": { "<to>": { count, totalGain, avgGain } } }
//   bigrams:     { "<json>[from1,from2]": { "<to>": { count, totalGain, avgGain } } }  (JSON key = unambiguous)
//   studentHistory: { "<studentId>": [ lessonId, ... ] }
//   dropouts:    { "<lessonId>": { count, totalContinuations } }  (totalReached = totalContinuations + count)
//   cooldowns:   { "<studentId>": { "<lessonId>": { observationIndex, gain } } }
// }

const MAX_HISTORY = 10;
const MAX_TRANSITION_SOURCES = 300;
const MAX_BIGRAM_SOURCES = 200;
const FORGETTING = 0.995;
const COOLDOWN_WINDOW = 5;
const DROPOUT_THRESHOLD_RATIO = 0.3;

/** Unambiguous bigram key; avoids collisions when lesson IDs contain separator chars. */
function bigramKey(prev2, prev1) {
  return JSON.stringify([prev2, prev1]);
}

/**
 * Ensure the markov sub-state exists on the LMS state object.
 * @param {object} state  LMSState
 */
function ensureMarkovState(state) {
  if (!state.markov) {
    state.markov = { transitions: {}, studentHistory: {} };
  }
  if (!state.markov.transitions) state.markov.transitions = {};
  if (!state.markov.studentHistory) state.markov.studentHistory = {};
  if (!state.markov.bigrams) state.markov.bigrams = {};
  if (!state.markov.dropouts) state.markov.dropouts = {};
  if (!state.markov.cooldowns) state.markov.cooldowns = {};
  if (!state.markov._obsIndex) state.markov._obsIndex = {};
}

/**
 * Compute total count across all edges in a from-node.
 * @param {object} edges
 * @returns {number}
 */
function totalEdgeCount(edges) {
  const keys = Object.keys(edges);
  let sum = 0;
  for (let i = 0; i < keys.length; i++) {
    sum += (edges[keys[i]].count || 0);
  }
  return sum;
}

/**
 * Evict the source with smallest total count when over limit. FIFO tie-break.
 * @param {object} container  transitions or bigrams
 * @param {number} maxSources
 */
function evictLeastSource(container, maxSources) {
  const keys = Object.keys(container);
  if (keys.length <= maxSources) return;

  const candidates = [];
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    candidates.push({ key: k, total: totalEdgeCount(container[k]) });
  }
  candidates.sort(function (a, b) {
    if (a.total !== b.total) return a.total - b.total;
    return keys.indexOf(a.key) - keys.indexOf(b.key);
  });

  const toRemove = keys.length - maxSources;
  for (let j = 0; j < toRemove; j++) {
    delete container[candidates[j].key];
  }
}

/**
 * Update a single edge with exponential forgetting.
 * @param {object} edges   container object
 * @param {string} toId    destination lesson
 * @param {number} gain    observed ability delta
 */
function updateEdge(edges, toId, gain) {
  let edge = edges[toId];
  if (!edge) {
    edge = { count: 0, totalGain: 0, avgGain: 0 };
    edges[toId] = edge;
  }
  edge.count = edge.count * FORGETTING + 1;
  edge.totalGain = edge.totalGain * FORGETTING + gain;
  edge.avgGain = edge.totalGain / edge.count;
}

/**
 * Record a lesson completion and update transition weights.
 *
 * Updates first-order transitions, second-order bigrams, dropout
 * counters, and cooldown state.
 *
 * @param {object} state      LMSState
 * @param {string} studentId
 * @param {string} lessonId   lesson just completed
 * @param {number} gain       ability delta from Rasch update
 */
function recordTransition(state, studentId, lessonId, gain) {
  if (typeof studentId !== 'string' || studentId === '') {
    throw new Error('[MARKOV] studentId must be a non-empty string, got: ' + (studentId === undefined ? 'undefined' : studentId === null ? 'null' : typeof studentId));
  }
  if (typeof lessonId !== 'string' || lessonId === '') {
    throw new Error('[MARKOV] lessonId must be a non-empty string, got: ' + (lessonId === undefined ? 'undefined' : lessonId === null ? 'null' : typeof lessonId));
  }
  ensureMarkovState(state);

  let history = state.markov.studentHistory[studentId];
  if (!history) {
    history = [];
    state.markov.studentHistory[studentId] = history;
  }

  // ── First-order transition ────────────────────────────────────────────
  if (history.length > 0) {
    const prev = history[history.length - 1];
    if (!state.markov.transitions[prev]) {
      state.markov.transitions[prev] = {};
    }
    updateEdge(state.markov.transitions[prev], lessonId, gain);
    evictLeastSource(state.markov.transitions, MAX_TRANSITION_SOURCES);

    // Record that prev was NOT a dropout (student continued past prev)
    if (!state.markov.dropouts[prev]) {
      state.markov.dropouts[prev] = { count: 0, totalContinuations: 0 };
    }
    state.markov.dropouts[prev].totalContinuations += 1;
  }

  // ── Second-order (bigram) transition ──────────────────────────────────
  if (history.length >= 2) {
    const prev2 = history[history.length - 2];
    const prev1 = history[history.length - 1];
    const bk = bigramKey(prev2, prev1);
    if (!state.markov.bigrams[bk]) {
      state.markov.bigrams[bk] = {};
    }
    updateEdge(state.markov.bigrams[bk], lessonId, gain);
    evictLeastSource(state.markov.bigrams, MAX_BIGRAM_SOURCES);
  }

  // ── Cooldown tracking (sequence-based for time-skew resilience) ───────
  const obsIndex = (state.markov._obsIndex[studentId] || 0) + 1;
  state.markov._obsIndex[studentId] = obsIndex;

  if (!state.markov.cooldowns[studentId]) {
    state.markov.cooldowns[studentId] = {};
  }
  state.markov.cooldowns[studentId][lessonId] = {
    observationIndex: obsIndex,
    gain: gain
  };

  // Evict old cooldowns by sequence (keep entries within COOLDOWN_WINDOW * 2 observations)
  const cd = state.markov.cooldowns[studentId];
  const cdKeys = Object.keys(cd);
  const cutoff = obsIndex - COOLDOWN_WINDOW * 2;
  for (let ci = 0; ci < cdKeys.length; ci++) {
    const ent = cd[cdKeys[ci]];
    const idx = ent && typeof ent.observationIndex === 'number' ? ent.observationIndex : 0;
    if (idx < cutoff) delete cd[cdKeys[ci]];
  }

  history.push(lessonId);
  if (history.length > MAX_HISTORY) {
    history.shift();
  }
}

/**
 * Record a dropout event: a student stopped engaging after a lesson.
 * Called externally when a session ends without the student completing
 * another lesson (e.g. timeout, logout, or session expiry).
 *
 * @param {object} state
 * @param {string} studentId
 */
function recordDropout(state, studentId) {
  if (typeof studentId !== 'string' || studentId === '') {
    throw new Error('[MARKOV] studentId must be a non-empty string, got: ' + (studentId === undefined ? 'undefined' : studentId === null ? 'null' : typeof studentId));
  }
  ensureMarkovState(state);
  const history = state.markov.studentHistory[studentId];
  if (!history || history.length === 0) return;

  const lastLesson = history[history.length - 1];
  if (!state.markov.dropouts[lastLesson]) {
    state.markov.dropouts[lastLesson] = { count: 0, totalContinuations: 0 };
  }
  state.markov.dropouts[lastLesson].count += 1;
  // totalContinuations NOT incremented — student was already counted when they reached lastLesson
  // (via recordTransition when they completed the prior lesson). totalReached = totalContinuations + count.
}

/**
 * Get the transition probability distribution from a source lesson.
 * Returns an object { lessonId: probability } where probabilities sum to ~1.
 *
 * @param {object} state
 * @param {string} fromLessonId
 * @returns {Object.<string, number>}
 */
function getTransitionProbabilities(state, fromLessonId) {
  ensureMarkovState(state);
  const edges = state.markov.transitions[fromLessonId];
  if (!edges) return {};

  let totalCount = 0;
  const keys = Object.keys(edges);
  for (let i = 0; i < keys.length; i++) {
    totalCount += edges[keys[i]].count;
  }
  if (totalCount === 0) return /** @type {Record<string, number>} */ ({});

  /** @type {Record<string, number>} */
  const probs = {};
  for (let j = 0; j < keys.length; j++) {
    probs[keys[j]] = edges[keys[j]].count / totalCount;
  }
  return probs;
}

/**
 * Score a candidate lesson for a student based on Markov transition history.
 *
 * Combines:
 *   - First-order transition probability and quality
 *   - Second-order (bigram) transition probability and quality
 *   - Dropout penalty (lessons many students abandon after)
 *   - Cooldown penalty (lessons recently completed or failed)
 *
 * More recent lessons in the student's history receive higher weight
 * (recency weighting with decay factor 0.7 per step back).
 *
 * @param {object} state
 * @param {string} studentId
 * @param {string} candidateId
 * @returns {{ transitionProb: number, transitionQuality: number, bigramProb: number, bigramQuality: number, dropoutPenalty: number, cooldownPenalty: number }}
 */
function scoreCandidate(state, studentId, candidateId) {
  ensureMarkovState(state);

  const history = state.markov.studentHistory[studentId];
  if (!history || history.length === 0) {
    return { transitionProb: 0, transitionQuality: 0, bigramProb: 0, bigramQuality: 0, dropoutPenalty: 0, cooldownPenalty: 0 };
  }

  const RECENCY_DECAY = 0.7;

  // ── First-order scoring ───────────────────────────────────────────────
  let totalWeight = 0;
  let weightedProb = 0;
  let weightedGain = 0;

  for (let i = history.length - 1; i >= 0; i--) {
    const stepsBack = history.length - 1 - i;
    const recencyWeight = Math.pow(RECENCY_DECAY, stepsBack);
    const fromLesson = history[i];

    const edges = state.markov.transitions[fromLesson];
    if (!edges || !edges[candidateId]) continue;

    const edge = edges[candidateId];
    let totalFromCount = 0;
    const fromKeys = Object.keys(edges);
    for (let k = 0; k < fromKeys.length; k++) {
      totalFromCount += edges[fromKeys[k]].count;
    }

    if (totalFromCount > 0) {
      const prob = edge.count / totalFromCount;
      weightedProb += recencyWeight * prob;
      weightedGain += recencyWeight * edge.avgGain;
      totalWeight += recencyWeight;
    }
  }

  const firstOrderProb = totalWeight > 0 ? weightedProb / totalWeight : 0;
  const firstOrderQuality = totalWeight > 0 ? weightedGain / totalWeight : 0;

  // ── Second-order (bigram) scoring ─────────────────────────────────────
  let bigramProb = 0;
  let bigramQuality = 0;

  if (history.length >= 2) {
    const prev2 = history[history.length - 2];
    const prev1 = history[history.length - 1];
    const bigramEdges = state.markov.bigrams[bigramKey(prev2, prev1)];

    if (bigramEdges && bigramEdges[candidateId]) {
      const bEdge = bigramEdges[candidateId];
      let bigramTotal = 0;
      const bKeys = Object.keys(bigramEdges);
      for (let bi = 0; bi < bKeys.length; bi++) {
        bigramTotal += bigramEdges[bKeys[bi]].count;
      }
      if (bigramTotal > 0) {
        bigramProb = bEdge.count / bigramTotal;
        bigramQuality = bEdge.avgGain;
      }
    }
  }

  // ── Dropout penalty ───────────────────────────────────────────────────
  let dropoutPenalty = 0;
  const dropoutData = state.markov.dropouts[candidateId];
  const totalReached = dropoutData
    ? (dropoutData.totalContinuations != null ? dropoutData.totalContinuations + dropoutData.count : dropoutData.totalStudents)
    : 0;
  if (dropoutData && totalReached > 5) {
    const dropoutRate = dropoutData.count / totalReached;
    if (dropoutRate > DROPOUT_THRESHOLD_RATIO) {
      dropoutPenalty = (dropoutRate - DROPOUT_THRESHOLD_RATIO) * 2;
    }
  }

  // ── Cooldown penalty ──────────────────────────────────────────────────
  let cooldownPenalty = 0;
  const studentCooldowns = state.markov.cooldowns[studentId];
  if (studentCooldowns && studentCooldowns[candidateId]) {
    const cd = studentCooldowns[candidateId];
    const recentHistory = history.slice(-COOLDOWN_WINDOW);
    if (recentHistory.indexOf(candidateId) !== -1) {
      cooldownPenalty = 0.5;
      if (cd.gain < 0) {
        cooldownPenalty = 1.0;
      }
    }
  }

  return {
    transitionProb: firstOrderProb,
    transitionQuality: firstOrderQuality,
    bigramProb: bigramProb,
    bigramQuality: bigramQuality,
    dropoutPenalty: dropoutPenalty,
    cooldownPenalty: cooldownPenalty
  };
}

/**
 * Get the student's recent lesson history.
 * @param {object} state
 * @param {string} studentId
 * @returns {string[]}
 */
function getStudentHistory(state, studentId) {
  ensureMarkovState(state);
  return state.markov.studentHistory[studentId] || [];
}

/**
 * Get raw transition edges from a lesson (for debugging/inspection).
 * @param {object} state
 * @param {string} lessonId
 * @returns {Object.<string, { count: number, totalGain: number, avgGain: number }>}
 */
function getTransitions(state, lessonId) {
  ensureMarkovState(state);
  return state.markov.transitions[lessonId] || {};
}

/**
 * Get the dropout rate for a lesson.
 * @param {object} state
 * @param {string} lessonId
 * @returns {{ rate: number, count: number, total: number } | null}
 */
function getDropoutRate(state, lessonId) {
  ensureMarkovState(state);
  const d = state.markov.dropouts[lessonId];
  if (!d) return null;
  const totalReached = d.totalContinuations != null ? d.totalContinuations + d.count : d.totalStudents;
  if (totalReached === 0) return null;
  return {
    rate: d.count / totalReached,
    count: d.count,
    total: totalReached
  };
}

/**
 * Find curriculum bottlenecks: lessons with high dropout rates.
 * Useful for curriculum designers to identify problematic content.
 *
 * @param {object} state
 * @param {number} [minSample=5]  minimum total students to consider
 * @returns {Array<{ lessonId: string, dropoutRate: number, count: number, total: number }>}
 */
function findBottlenecks(state, minSample) {
  ensureMarkovState(state);
  minSample = minSample || 5;

  const bottlenecks = [];
  const dropoutKeys = Object.keys(state.markov.dropouts);
  for (let i = 0; i < dropoutKeys.length; i++) {
    const lid = dropoutKeys[i];
    const d = state.markov.dropouts[lid];
    const totalReached = d.totalContinuations != null ? d.totalContinuations + d.count : d.totalStudents;
    if (totalReached < minSample) continue;
    const rate = d.count / totalReached;
    if (rate > DROPOUT_THRESHOLD_RATIO) {
      bottlenecks.push({
        lessonId: lid,
        dropoutRate: rate,
        count: d.count,
        total: totalReached
      });
    }
  }

  bottlenecks.sort(function (a, b) { return b.dropoutRate - a.dropoutRate; });
  return bottlenecks;
}

/**
 * Export a compact transition table suitable for shipping to the client.
 * Each edge includes probability and average gain.
 *
 * @param {object} state
 * @returns {Object.<string, Object.<string, { prob: number, avgGain: number }>>}
 */
function exportTransitionTable(state) {
  ensureMarkovState(state);
  /** @type {Record<string, Record<string, { prob: number; avgGain: number }>>} */
  const table = {};
  const fromIds = Object.keys(state.markov.transitions);

  for (let i = 0; i < fromIds.length; i++) {
    const from = fromIds[i];
    const edges = state.markov.transitions[from];
    const toIds = Object.keys(edges);

    let totalCount = 0;
    for (let j = 0; j < toIds.length; j++) {
      totalCount += edges[toIds[j]].count;
    }
    if (totalCount === 0) continue;

    table[from] = {};
    for (let k = 0; k < toIds.length; k++) {
      const to = toIds[k];
      table[from][to] = {
        prob: parseFloat((edges[to].count / totalCount).toFixed(4)),
        avgGain: parseFloat(edges[to].avgGain.toFixed(4))
      };
    }
  }

  return table;
}

/**
 * Check if a candidate is in the student's cooldown window.
 * @param {object} state
 * @param {string} studentId
 * @param {string} candidateId
 * @returns {{ onCooldown: boolean, wasFailed: boolean }}
 */
function checkCooldown(state, studentId, candidateId) {
  ensureMarkovState(state);
  const history = state.markov.studentHistory[studentId] || [];
  const recent = history.slice(-COOLDOWN_WINDOW);

  if (recent.indexOf(candidateId) === -1) {
    return { onCooldown: false, wasFailed: false };
  }

  const cd = (state.markov.cooldowns[studentId] || {})[candidateId];
  return {
    onCooldown: true,
    wasFailed: cd ? cd.gain < 0 : false
  };
}

module.exports = {
  ensureMarkovState: ensureMarkovState,
  recordTransition:  recordTransition,
  recordDropout:     recordDropout,
  getTransitionProbabilities: getTransitionProbabilities,
  scoreCandidate:    scoreCandidate,
  getStudentHistory: getStudentHistory,
  getTransitions:    getTransitions,
  getDropoutRate:    getDropoutRate,
  findBottlenecks:   findBottlenecks,
  exportTransitionTable: exportTransitionTable,
  checkCooldown:     checkCooldown,
  MAX_HISTORY:            MAX_HISTORY,
  MAX_TRANSITION_SOURCES: MAX_TRANSITION_SOURCES,
  MAX_BIGRAM_SOURCES:     MAX_BIGRAM_SOURCES,
  COOLDOWN_WINDOW:        COOLDOWN_WINDOW
};
