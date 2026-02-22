// src/engine/index.js
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
//   set using Thompson Sampling. Neither system needs to be complete before
//   the other ships — theta.js passes an array of eligible lesson ids and
//   the engine returns the best one.
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

var fs         = require('fs');
var path       = require('path');
var rasch      = require('../rasch');
var embeddings = require('../embeddings');
var thompson   = require('../thompson');
var federation = require('../federation');
var math       = require('../math');

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
function buildDefaultState() {
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
    }
  };
}

/**
 * Load LMSState from disk, or build a fresh default state if none exists.
 * Logs a warning if the state file exists but cannot be parsed so that
 * corruption is surfaced early rather than silently overwritten.
 * @returns {import('../types').LMSState}
 */
function loadState() {
  if (!fs.existsSync(STATE_PATH)) {
    console.log('[LMS] No state file found — starting fresh');
    return buildDefaultState();
  }

  try {
    var raw   = fs.readFileSync(STATE_PATH, 'utf8');
    var state = JSON.parse(raw);
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
function saveState(state) {
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
var _state = loadState();


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
function seedLesson(lessonId, difficulty, skill) {
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
function seedLessons(lessons) {
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

/**
 * Select the best lesson for a student from a theta-eligible candidate set.
 *
 * theta.js calls this after computing its BFS-eligible candidate list.
 * The engine picks among those candidates using Thompson Sampling —
 * it never sees ineligible lessons and never overrides prerequisite rules.
 *
 * Cold start: if the student has no observations, the Thompson sample is
 * drawn from the weak prior, producing near-uniform random selection —
 * equivalent to a random baseline until enough observations accumulate.
 *
 * @param {string}   studentId
 * @param {string[]} candidates  lessonIds already filtered by theta BFS
 * @returns {string|null}
 */
function selectBestLesson(studentId, candidates) {
  if (!candidates || candidates.length === 0) return null;

  // Temporarily restrict embedding.lessons to the candidate set so that
  // selectLesson() only scores lessons theta has deemed eligible.
  var fullLessons     = _state.embedding.lessons;
  var filteredLessons = {};

  for (var i = 0; i < candidates.length; i++) {
    var id = candidates[i];
    if (fullLessons[id]) {
      filteredLessons[id] = fullLessons[id];
    } else {
      // Candidate not yet in embedding — initialize on the fly
      embeddings.ensureLessonVector(_state, id);
      filteredLessons[id] = _state.embedding.lessons[id];
    }
  }

  _state.embedding.lessons = filteredLessons;
  var selected = thompson.selectLesson(_state, studentId);
  _state.embedding.lessons = fullLessons;

  return selected;
}

/**
 * Record a completed lesson observation and update all model parameters.
 *
 * Updates Rasch ability, embeddings, and the bandit posterior in one
 * atomic operation, then persists state.
 *
 * @param {string}   studentId
 * @param {string}   lessonId
 * @param {{ probeId: string, correct: boolean }[]} probeResults
 */
function recordObservation(studentId, lessonId, probeResults) {
  // 1. Update Rasch ability — returns delta as gain proxy
  var gain = rasch.updateAbility(_state, studentId, probeResults);

  // 2. Update student/lesson embeddings
  embeddings.updateEmbedding(_state, studentId, lessonId, gain);

  // 3. Update bandit posterior
  thompson.updateBandit(_state, studentId, lessonId, gain);

  // 4. Persist atomically
  saveState(_state);
}

/**
 * Get the current Rasch ability estimate for a student.
 * Returns null if the student has no recorded observations.
 * @param {string} studentId
 * @returns {{ ability: number, variance: number }|null}
 */
function getStudentAbility(studentId) {
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
function mergeRemoteSummary(remote) {
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
  return {
    students:     Object.keys(_state.rasch.students).length,
    lessons:      Object.keys(_state.embedding.lessons).length,
    probes:       Object.keys(_state.rasch.probes).length,
    observations: _state.bandit.observationCount,
    embeddingDim: _state.embedding.dim,
    featureDim:   _state.bandit.featureDim,
    statePath:    STATE_PATH
  };
}


module.exports = {
  seedLessons,
  selectBestLesson,
  recordObservation,
  getStudentAbility,
  exportBanditSummary,
  mergeRemoteSummary,
  reloadState,
  getStatus
};
