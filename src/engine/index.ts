// src/engine/index.ts
// AGNI LMS Engine  v1.0.0
//
// Entry point for the Phase 2.5 adaptive learning engine.
// Consumed by theta.js via: const lmsEngine = require('./src/engine');
//
// Responsibilities:
//   - Load and persist LMSState to DATA_DIR/lms_state.json
//   - Seed lesson embeddings from lesson-ir.json sidecars on first run
//   - Expose a clean API surface for theta.js to call
//
// Architecture note:
//   theta.js owns prerequisite enforcement (BFS skill graph) and builds the
//   candidate set of eligible lessons. The engine selects among that candidate
//   set using Thompson Sampling — it never sees ineligible lessons and never
//   overrides prerequisite rules.
//
// Phase 2 / Sprint M + Reference Implementation: Persistence is at the edge.
// applyObservation(state, observation) → newState is pure (no I/O); recordObservation
// is load → applyObservation → save. Core logic runs on a clone so reference behaviour
// is testable without the filesystem.
//
// State persistence:
//   LMSState is a single JSON file. All mutations go through recordObservation()
//   which calls saveState() before returning. Write is atomic: file is written
//   to .tmp then renamed over the real path so a process crash mid-write cannot
//   corrupt the state file.
//
// Target: Node.js 14+. CommonJS.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

import type { LMSState, BanditSummary, EmbeddingEntityState, LMSObservation } from '../types';

var fs         = require('fs');
var path       = require('path');
var rasch       = require('./rasch');
var embeddings  = require('./embeddings');
var thompson    = require('./thompson');
var federation  = require('./federation');
var math        = require('./math');
var migrations  = require('./migrations');
var markov      = require('./markov');
var pagerank    = require('./pagerank');

// ── Paths ─────────────────────────────────────────────────────────────────────
var DATA_DIR       = process.env.AGNI_DATA_DIR || path.join(__dirname, '../../data');
var STATE_PATH     = path.join(DATA_DIR, 'lms_state.json');
var STATE_TMP_PATH = STATE_PATH + '.tmp';

// ── Default engine configuration ──────────────────────────────────────────────
// These values produce stable learning for embedding dims in the 16–32 range.
// Operators can override via environment variables at hub startup.
var DEFAULT_EMBEDDING_DIM = parseInt(process.env.AGNI_EMBEDDING_DIM  || '16', 10);
var DEFAULT_FORGETTING     = parseFloat(process.env.AGNI_FORGETTING   || '0.98');
var DEFAULT_EMBEDDING_LR   = parseFloat(process.env.AGNI_EMBEDDING_LR || '0.01');
var DEFAULT_EMBEDDING_REG  = parseFloat(process.env.AGNI_EMBEDDING_REG || '0.001');


// ═══════════════════════════════════════════════════════════════════════════
// State management
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build a fresh LMSState with sensible defaults.
 * Called when no state file exists (first run) or when the existing state
 * file cannot be parsed.
 * @returns {import('../types').LMSState}
 */
function buildDefaultState(): LMSState {
  var dim = DEFAULT_EMBEDDING_DIM;
  return {
    rasch: {
      students:     {},
      probes:       {},
      globalAnchor: { meanAbility: 0, stdAbility: 1 }
    },
    embedding: {
      dim:        dim,
      lr:         DEFAULT_EMBEDDING_LR,
      reg:        DEFAULT_EMBEDDING_REG,
      forgetting: DEFAULT_FORGETTING,
      students:   {},
      lessons:    {}
    },
    bandit: {
      A:                [],   // initialized lazily by ensureBanditInitialized
      b:                [],
      featureDim:       dim * 2,  // featureDim === embeddingDim * 2 (enforced)
      forgetting:       DEFAULT_FORGETTING,
      observationCount: 0
    },
    markov: {
      transitions:    {},
      studentHistory: {}
    }
  };
}

/**
 * Load LMSState from disk, or build a fresh default state if none exists.
 * Logs a warning if the state file exists but cannot be parsed so that
 * corruption is surfaced early rather than silently overwritten.
 * @returns {import('../types').LMSState}
 */
function loadState(): LMSState {
  if (!fs.existsSync(STATE_PATH)) {
    console.log('[LMS] No state file found — starting fresh');
    return buildDefaultState();
  }

  try {
    var raw   = fs.readFileSync(STATE_PATH, 'utf8');
    var parsed = JSON.parse(raw) as unknown;
    var migratedResult = migrations.migrateLMSState(parsed, { embeddingDim: DEFAULT_EMBEDDING_DIM });
    var state: LMSState = migratedResult.state;
    if (migratedResult.migrated) {
      console.log('[LMS] State repaired (schema migration applied) — saving');
      saveState(state);
    }
    console.log('[LMS] State loaded:', STATE_PATH,
      '— students:', Object.keys(state.rasch.students).length,
      'lessons:', Object.keys(state.embedding.lessons).length,
      'observations:', state.bandit.observationCount);
    return state;
  } catch (err) {
    var msg = err instanceof Error ? err.message : String(err);
    console.error('[LMS] Failed to parse state file:', msg,
      '— starting fresh. Corrupted file preserved at:', STATE_PATH + '.bak');
    try { fs.copyFileSync(STATE_PATH, STATE_PATH + '.bak'); } catch (_) {}
    return buildDefaultState();
  }
}

/**
 * Persist LMSState to disk atomically.
 * Writes to a .tmp file first, then renames over the real file.
 * A process crash mid-write cannot leave a truncated state file.
 * @param {import('../types').LMSState} state
 */
function saveState(state: LMSState): void {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STATE_TMP_PATH, JSON.stringify(state, null, 2));
    fs.renameSync(STATE_TMP_PATH, STATE_PATH);
  } catch (err) {
    var msg = err instanceof Error ? err.message : String(err);
    // Do not re-throw — a save failure should not crash the hub API call
    console.error('[LMS] Failed to save state:', msg);
  }
}

// ── Module-level state (loaded once at require() time) ────────────────────────
var _state: LMSState = loadState();


// ═══════════════════════════════════════════════════════════════════════════
// Lesson seeding
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Seed a single lesson into the engine.
 * Idempotent — calling it with an already-known lessonId is safe.
 *
 * Rasch probe registration:
 *   Each lesson's primary skill is registered as a probe with difficulty
 *   normalised from the 1–5 scale to logit space (centred at 0).
 *   difficulty 1 → −2 logits (easy), difficulty 3 → 0, difficulty 5 → +2.
 *
 * @param {string} lessonId
 * @param {number} difficulty  1–5 from inferredFeatures
 * @param {string} skill       primary skill from ontology.provides[0].skill
 */
function seedLesson(lessonId: string, difficulty: number, skill: string): void {
  embeddings.ensureLessonVector(_state, lessonId);

  if (!_state.rasch.probes[lessonId]) {
    // Map 1–5 difficulty to logit scale: difficulty 3 = 0 logits (average)
    var logitDifficulty = (difficulty - 3) * 1;  // [1,5] → [−2,+2]
    _state.rasch.probes[lessonId] = {
      difficulty: logitDifficulty,
      skill:      skill
    };
  }
}

/**
 * Seed multiple lessons in one call. Saves state once after all are processed.
 * Called by theta.js at startup after rebuildLessonIndex() completes.
 *
 * @param {{ lessonId: string, difficulty: number, skill: string }[]} lessons
 */
function seedLessons(lessons: Array<{ lessonId: string; difficulty: number; skill: string }>): void {
  var seeded = 0;
  for (var i = 0; i < lessons.length; i++) {
    var entry  = lessons[i];
    var wasNew = !_state.embedding.lessons[entry.lessonId];
    seedLesson(entry.lessonId, entry.difficulty, entry.skill);
    if (wasNew) seeded++;
  }
  if (seeded > 0) {
    saveState(_state);
    console.log('[LMS] Seeded', seeded, 'new lesson(s)');
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// Core API
// ═══════════════════════════════════════════════════════════════════════════

// ── Markov + PageRank signal weights ─────────────────────────────────────────
// These control how much influence the new signals have relative to the
// Thompson Sampling bandit. They are intentionally conservative so the
// bandit remains the primary selector and these act as tie-breakers.
var MARKOV_TRANSITION_WEIGHT  = parseFloat(process.env.AGNI_MARKOV_WEIGHT   || '0.15');
var PAGERANK_WEIGHT           = parseFloat(process.env.AGNI_PAGERANK_WEIGHT || '0.10');

/**
 * Select the best lesson for a student from a theta-eligible candidate set.
 *
 * theta.js calls this after computing its BFS-eligible candidate list.
 * The engine picks among those candidates using a composite score:
 *
 *   score = thompsonScore
 *           + MARKOV_WEIGHT  * (transitionProb + transitionQuality)
 *           + PAGERANK_WEIGHT * combinedPageRankScore
 *
 * Thompson Sampling remains the primary signal. Markov transition quality
 * answers "do students who take this lesson next tend to learn well?" and
 * PageRank answers "is this lesson a gateway that unlocks many future paths?"
 *
 * Cold start: when no transition history exists, Markov and PageRank
 * contribute zero, falling back to pure Thompson Sampling (which itself
 * falls back to near-uniform random with a weak prior).
 *
 * @param {string}   studentId
 * @param {string[]} candidates  lessonIds already filtered by theta BFS
 * @param {Object.<string, { requires?: string[], provides?: string[] }>} [ontologyMap]
 *   Optional per-lesson ontology for richer PageRank. Passed from theta.js catalog.
 * @returns {string|null}
 */
function selectBestLesson(
  studentId: string,
  candidates: string[],
  ontologyMap?: Record<string, { requires?: string[]; provides?: string[] }>
): string | null {
  if (!candidates || candidates.length === 0) return null;

  // Temporarily restrict embedding.lessons to the candidate set so that
  // selectLesson() only scores lessons theta has deemed eligible.
  var fullLessons     = _state.embedding.lessons;
  var filteredLessons: Record<string, EmbeddingEntityState> = {};

  for (var i = 0; i < candidates.length; i++) {
    var id = candidates[i];
    if (fullLessons[id]) {
      filteredLessons[id] = fullLessons[id];
    } else {
      embeddings.ensureLessonVector(_state, id);
      filteredLessons[id] = _state.embedding.lessons[id];
    }
  }

  // ── Thompson Sampling scores (primary signal) ──────────────────────────
  _state.embedding.lessons = filteredLessons;
  thompson.ensureBanditInitialized(_state);

  var thetaSample = sampleThetaForScoring(_state);
  var studentVec = embeddings.ensureStudentVector(_state, studentId);

  var thompsonScores: Record<string, number> = {};
  for (var ti = 0; ti < candidates.length; ti++) {
    var cid = candidates[ti];
    var lessonVec = embeddings.ensureLessonVector(_state, cid);
    var x = studentVec.concat(lessonVec);
    thompsonScores[cid] = math.dot(thetaSample, x);
  }
  _state.embedding.lessons = fullLessons;

  // ── Markov transition scores (with bigrams, dropout, cooldown) ──────
  var markovScores: Record<string, any> = {};
  for (var mi = 0; mi < candidates.length; mi++) {
    markovScores[candidates[mi]] = markov.scoreCandidate(_state, studentId, candidates[mi]);
  }

  // ── PageRank scores (cached, quality-weighted) ─────────────────────
  var pagerankScores: Record<string, { combinedScore: number }> = {};
  try {
    pagerankScores = pagerank.scoreCandidates(_state, studentId, candidates, ontologyMap);
  } catch (_) {
    // PageRank is an enhancement; if it fails, fall through gracefully
  }

  // ── Composite scoring ──────────────────────────────────────────────────
  var bestId: string | null = null;
  var bestScore = -Infinity;
  var BIGRAM_WEIGHT = 0.10;
  var DROPOUT_PENALTY_WEIGHT = 0.20;
  var COOLDOWN_PENALTY_WEIGHT = 0.30;

  for (var ci = 0; ci < candidates.length; ci++) {
    var lid = candidates[ci];

    var ts = thompsonScores[lid] || 0;
    var ms = markovScores[lid] || {
      transitionProb: 0, transitionQuality: 0,
      bigramProb: 0, bigramQuality: 0,
      dropoutPenalty: 0, cooldownPenalty: 0
    };
    var ps = pagerankScores[lid] || { combinedScore: 0 };

    var firstOrderSignal = ms.transitionProb + ms.transitionQuality;
    var bigramSignal = ms.bigramProb + ms.bigramQuality;

    var composite = ts
      + MARKOV_TRANSITION_WEIGHT * firstOrderSignal
      + BIGRAM_WEIGHT * bigramSignal
      + PAGERANK_WEIGHT * ps.combinedScore
      - DROPOUT_PENALTY_WEIGHT * ms.dropoutPenalty
      - COOLDOWN_PENALTY_WEIGHT * ms.cooldownPenalty;

    if (composite > bestScore) {
      bestScore = composite;
      bestId = lid;
    }
  }

  return bestId;
}

/**
 * Sample a θ vector from the Thompson posterior for composite scoring.
 * Extracted so selectBestLesson can score all candidates against one sample.
 */
function sampleThetaForScoring(state: LMSState): number[] {
  thompson.ensureBanditInitialized(state);
  var Ainv = math.invertSPD(state.bandit.A);
  var mean = math.matVec(Ainv, state.bandit.b);
  var L = math.cholesky(Ainv);
  var z: number[] = [];
  for (var i = 0; i < mean.length; i++) z.push(math.randn());
  var noise = math.matVec(L, z);
  return mean.map(function (m: number, idx: number) { return m + noise[idx]; });
}

/**
 * Pure core: (state, observation) → newState. No I/O.
 * Reference implementation: use this to test LMS behaviour without the filesystem.
 * Mutating helpers (rasch, embeddings, thompson, markov) run on a deep clone so input state is unchanged.
 *
 * @param {LMSState} state
 * @param {LMSObservation} observation
 * @returns {LMSState}
 */
function applyObservation(state: LMSState, observation: LMSObservation): LMSState {
  var next = JSON.parse(JSON.stringify(state)) as LMSState;
  var gain = rasch.updateAbility(next, observation.studentId, observation.probeResults);
  embeddings.updateEmbedding(next, observation.studentId, observation.lessonId, gain);
  thompson.updateBandit(next, observation.studentId, observation.lessonId, gain);
  markov.recordTransition(next, observation.studentId, observation.lessonId, gain);
  return next;
}

/**
 * Record a completed lesson observation and update all model parameters.
 * Persistence at the edge: load → applyObservation → save.
 *
 * @param {string}   studentId
 * @param {string}   lessonId
 * @param {{ probeId: string, correct: boolean }[]} probeResults
 */
function recordObservation(
  studentId: string,
  lessonId: string,
  probeResults: Array<{ probeId: string; correct: boolean }>
): void {
  _state = applyObservation(_state, { studentId, lessonId, probeResults });
  saveState(_state);
}

/**
 * Get the current Rasch ability estimate for a student.
 * Returns null if the student has no recorded observations.
 * @param {string} studentId
 * @returns {{ ability: number, variance: number }|null}
 */
function getStudentAbility(studentId: string): { ability: number; variance: number } | null {
  return _state.rasch.students[studentId] || null;
}

/**
 * Export bandit summary for federation sync with a regional hub.
 * @returns {import('../types').BanditSummary}
 */
function exportBanditSummary() {
  thompson.ensureBanditInitialized(_state);
  return federation.getBanditSummary(_state);
}

/**
 * Merge a remote bandit summary into the local state.
 * Used when syncing with a regional hub over the village network link.
 * Saves state after merge.
 *
 * Reconstructs A and b from the merged precision and mean using the RLS
 * invariant: b = A · θ_map (mean of the posterior).
 *
 * @param {import('../types').BanditSummary} remote
 */
function mergeRemoteSummary(remote: BanditSummary): void {
  thompson.ensureBanditInitialized(_state);
  var local  = federation.getBanditSummary(_state);
  var merged = federation.mergeBanditSummaries(local, remote);

  _state.bandit.A                = merged.precision;
  _state.bandit.b                = math.matVec(merged.precision, merged.mean);
  _state.bandit.observationCount = merged.sampleSize;

  saveState(_state);
  console.log('[LMS] Remote summary merged — total observations:', merged.sampleSize);
}

/**
 * Reload state from disk. Used when the state file has been modified
 * externally (e.g. operator restoring a backup).
 */
function reloadState() {
  _state = loadState();
}

/**
 * Return a diagnostic snapshot of the engine state.
 * Safe to expose on an internal status endpoint.
 * @returns {object}
 */
function getStatus() {
  var markovState = _state.markov || { transitions: {}, studentHistory: {} };
  return {
    students:       Object.keys(_state.rasch.students).length,
    lessons:        Object.keys(_state.embedding.lessons).length,
    probes:         Object.keys(_state.rasch.probes).length,
    observations:   _state.bandit.observationCount,
    embeddingDim:   _state.embedding.dim,
    featureDim:     _state.bandit.featureDim,
    statePath:      STATE_PATH,
    markovEdges:    Object.keys(markovState.transitions).length,
    trackedPaths:   Object.keys(markovState.studentHistory).length
  };
}


/**
 * Export the Markov transition table for shipping to the client-side navigator.
 * Contains probability and average gain per (from → to) edge.
 * @returns {Object}
 */
function exportTransitionTable() {
  return markov.exportTransitionTable(_state);
}

/**
 * Get the student's recent lesson history for client-side Markov scoring.
 * @param {string} studentId
 * @returns {string[]}
 */
function getStudentLessonHistory(studentId: string): string[] {
  return markov.getStudentHistory(_state, studentId);
}

/**
 * Identify curriculum flow bottlenecks using stationary distribution analysis.
 * Lessons where students "get stuck" — high stationary probability, low
 * outgoing transitions, low learning gain.
 * @param {number} [topK=10]
 * @returns {Array}
 */
function getFlowBottlenecks(topK?: number) {
  return pagerank.identifyFlowBottlenecks(_state, topK);
}

/**
 * Get dropout bottlenecks: lessons with the highest dropout rates.
 * @param {number} [minSample=5]
 * @returns {Array}
 */
function getDropoutBottlenecks(minSample?: number) {
  return markov.findBottlenecks(_state, minSample);
}

module.exports = {
  seedLessons,
  selectBestLesson,
  recordObservation,
  applyObservation,
  getStudentAbility,
  exportBanditSummary,
  mergeRemoteSummary,
  reloadState,
  getStatus,
  exportTransitionTable,
  getStudentLessonHistory,
  getFlowBottlenecks,
  getDropoutBottlenecks
};
