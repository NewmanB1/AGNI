// src/engine/markov.js
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
//   bigrams:     { "<from1>|<from2>": { "<to>": { count, totalGain, avgGain } } }
//   studentHistory: { "<studentId>": [ lessonId, ... ] }
//   dropouts:    { "<lessonId>": { count, totalStudents } }
//   cooldowns:   { "<studentId>": { "<lessonId>": { timestamp, gain } } }
// }

var MAX_HISTORY = 10;
var FORGETTING = 0.995;
var BIGRAM_SEPARATOR = '|';
var COOLDOWN_WINDOW = 5;
var DROPOUT_THRESHOLD_RATIO = 0.3;

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
}

/**
 * Update a single edge with exponential forgetting.
 * @param {object} edges   container object
 * @param {string} toId    destination lesson
 * @param {number} gain    observed ability delta
 */
function updateEdge(edges, toId, gain) {
  var edge = edges[toId];
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
  ensureMarkovState(state);

  var history = state.markov.studentHistory[studentId];
  if (!history) {
    history = [];
    state.markov.studentHistory[studentId] = history;
  }

  // ── First-order transition ────────────────────────────────────────────
  if (history.length > 0) {
    var prev = history[history.length - 1];
    if (!state.markov.transitions[prev]) {
      state.markov.transitions[prev] = {};
    }
    updateEdge(state.markov.transitions[prev], lessonId, gain);

    // Record that prev was NOT a dropout (student continued)
    if (!state.markov.dropouts[prev]) {
      state.markov.dropouts[prev] = { count: 0, totalStudents: 0 };
    }
    state.markov.dropouts[prev].totalStudents += 1;
  }

  // ── Second-order (bigram) transition ──────────────────────────────────
  if (history.length >= 2) {
    var prev2 = history[history.length - 2];
    var prev1 = history[history.length - 1];
    var bigramKey = prev2 + BIGRAM_SEPARATOR + prev1;
    if (!state.markov.bigrams[bigramKey]) {
      state.markov.bigrams[bigramKey] = {};
    }
    updateEdge(state.markov.bigrams[bigramKey], lessonId, gain);
  }

  // ── Cooldown tracking ────────────────────────────────────────────────
  if (!state.markov.cooldowns[studentId]) {
    state.markov.cooldowns[studentId] = {};
  }
  state.markov.cooldowns[studentId][lessonId] = {
    timestamp: Date.now(),
    gain: gain
  };

  // Evict old cooldowns (keep only the last COOLDOWN_WINDOW * 2 entries)
  var cdKeys = Object.keys(state.markov.cooldowns[studentId]);
  if (cdKeys.length > COOLDOWN_WINDOW * 2) {
    var sorted = cdKeys.sort(function (a, b) {
      return (state.markov.cooldowns[studentId][a].timestamp || 0) -
             (state.markov.cooldowns[studentId][b].timestamp || 0);
    });
    for (var ci = 0; ci < sorted.length - COOLDOWN_WINDOW * 2; ci++) {
      delete state.markov.cooldowns[studentId][sorted[ci]];
    }
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
  ensureMarkovState(state);
  var history = state.markov.studentHistory[studentId];
  if (!history || history.length === 0) return;

  var lastLesson = history[history.length - 1];
  if (!state.markov.dropouts[lastLesson]) {
    state.markov.dropouts[lastLesson] = { count: 0, totalStudents: 0 };
  }
  state.markov.dropouts[lastLesson].count += 1;
  state.markov.dropouts[lastLesson].totalStudents += 1;
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
  var edges = state.markov.transitions[fromLessonId];
  if (!edges) return {};

  var totalCount = 0;
  var keys = Object.keys(edges);
  for (var i = 0; i < keys.length; i++) {
    totalCount += edges[keys[i]].count;
  }
  if (totalCount === 0) return {};

  var probs = {};
  for (var j = 0; j < keys.length; j++) {
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

  var history = state.markov.studentHistory[studentId];
  if (!history || history.length === 0) {
    return { transitionProb: 0, transitionQuality: 0, bigramProb: 0, bigramQuality: 0, dropoutPenalty: 0, cooldownPenalty: 0 };
  }

  var RECENCY_DECAY = 0.7;

  // ── First-order scoring ───────────────────────────────────────────────
  var totalWeight = 0;
  var weightedProb = 0;
  var weightedGain = 0;

  for (var i = history.length - 1; i >= 0; i--) {
    var stepsBack = history.length - 1 - i;
    var recencyWeight = Math.pow(RECENCY_DECAY, stepsBack);
    var fromLesson = history[i];

    var edges = state.markov.transitions[fromLesson];
    if (!edges || !edges[candidateId]) continue;

    var edge = edges[candidateId];
    var totalFromCount = 0;
    var fromKeys = Object.keys(edges);
    for (var k = 0; k < fromKeys.length; k++) {
      totalFromCount += edges[fromKeys[k]].count;
    }

    if (totalFromCount > 0) {
      var prob = edge.count / totalFromCount;
      weightedProb += recencyWeight * prob;
      weightedGain += recencyWeight * edge.avgGain;
      totalWeight += recencyWeight;
    }
  }

  var firstOrderProb = totalWeight > 0 ? weightedProb / totalWeight : 0;
  var firstOrderQuality = totalWeight > 0 ? weightedGain / totalWeight : 0;

  // ── Second-order (bigram) scoring ─────────────────────────────────────
  var bigramProb = 0;
  var bigramQuality = 0;

  if (history.length >= 2) {
    var prev2 = history[history.length - 2];
    var prev1 = history[history.length - 1];
    var bigramKey = prev2 + BIGRAM_SEPARATOR + prev1;
    var bigramEdges = state.markov.bigrams[bigramKey];

    if (bigramEdges && bigramEdges[candidateId]) {
      var bEdge = bigramEdges[candidateId];
      var bigramTotal = 0;
      var bKeys = Object.keys(bigramEdges);
      for (var bi = 0; bi < bKeys.length; bi++) {
        bigramTotal += bigramEdges[bKeys[bi]].count;
      }
      if (bigramTotal > 0) {
        bigramProb = bEdge.count / bigramTotal;
        bigramQuality = bEdge.avgGain;
      }
    }
  }

  // ── Dropout penalty ───────────────────────────────────────────────────
  var dropoutPenalty = 0;
  var dropoutData = state.markov.dropouts[candidateId];
  if (dropoutData && dropoutData.totalStudents > 5) {
    var dropoutRate = dropoutData.count / dropoutData.totalStudents;
    if (dropoutRate > DROPOUT_THRESHOLD_RATIO) {
      dropoutPenalty = (dropoutRate - DROPOUT_THRESHOLD_RATIO) * 2;
    }
  }

  // ── Cooldown penalty ──────────────────────────────────────────────────
  var cooldownPenalty = 0;
  var studentCooldowns = state.markov.cooldowns[studentId];
  if (studentCooldowns && studentCooldowns[candidateId]) {
    var cd = studentCooldowns[candidateId];
    var recentHistory = history.slice(-COOLDOWN_WINDOW);
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
  var d = state.markov.dropouts[lessonId];
  if (!d || d.totalStudents === 0) return null;
  return {
    rate: d.count / d.totalStudents,
    count: d.count,
    total: d.totalStudents
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

  var bottlenecks = [];
  var dropoutKeys = Object.keys(state.markov.dropouts);
  for (var i = 0; i < dropoutKeys.length; i++) {
    var lid = dropoutKeys[i];
    var d = state.markov.dropouts[lid];
    if (d.totalStudents < minSample) continue;
    var rate = d.count / d.totalStudents;
    if (rate > DROPOUT_THRESHOLD_RATIO) {
      bottlenecks.push({
        lessonId: lid,
        dropoutRate: rate,
        count: d.count,
        total: d.totalStudents
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
  var table = {};
  var fromIds = Object.keys(state.markov.transitions);

  for (var i = 0; i < fromIds.length; i++) {
    var from = fromIds[i];
    var edges = state.markov.transitions[from];
    var toIds = Object.keys(edges);

    var totalCount = 0;
    for (var j = 0; j < toIds.length; j++) {
      totalCount += edges[toIds[j]].count;
    }
    if (totalCount === 0) continue;

    table[from] = {};
    for (var k = 0; k < toIds.length; k++) {
      var to = toIds[k];
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
  var history = state.markov.studentHistory[studentId] || [];
  var recent = history.slice(-COOLDOWN_WINDOW);

  if (recent.indexOf(candidateId) === -1) {
    return { onCooldown: false, wasFailed: false };
  }

  var cd = (state.markov.cooldowns[studentId] || {})[candidateId];
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
  MAX_HISTORY:       MAX_HISTORY,
  COOLDOWN_WINDOW:   COOLDOWN_WINDOW,
  BIGRAM_SEPARATOR:  BIGRAM_SEPARATOR
};
