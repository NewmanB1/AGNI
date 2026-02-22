// src/engine/index.ts
// AGNI LMS Engine  v1.0.0
//
// Entry point for the Phase 2.5 adaptive learning engine.
// Compiled to CommonJS at src/engine/dist/index.js by tsc.
// Consumed by theta.js via: const lmsEngine = require('./engine/dist');
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
//   which calls saveState() before returning. If the process crashes mid-write,
//   the previous state file is still intact (write to .tmp, then rename).
// ─────────────────────────────────────────────────────────────────────────────

import * as fs   from 'fs';
import * as path from 'path';

import { LMSState, BanditSummary } from '../types';
import { updateAbility }           from '../rasch';
import { updateEmbedding,
         ensureStudentVector,
         ensureLessonVector }      from '../embeddings';
import { selectLesson,
         updateBandit,
         ensureBanditInitialized } from '../thompson';
import { getBanditSummary,
         mergeBanditSummaries }    from '../federation';

// ── Paths ─────────────────────────────────────────────────────────────────────
const DATA_DIR       = process.env.AGNI_DATA_DIR  || path.join(__dirname, '../../data');
const STATE_PATH     = path.join(DATA_DIR, 'lms_state.json');
const STATE_TMP_PATH = STATE_PATH + '.tmp';

// ── Default engine configuration ──────────────────────────────────────────────
// These values produce stable learning for embedding dims in the 16–32 range.
// Operators can override via environment variables at hub startup.
const DEFAULT_EMBEDDING_DIM  = parseInt(process.env.AGNI_EMBEDDING_DIM  || '16', 10);
const DEFAULT_FORGETTING      = parseFloat(process.env.AGNI_FORGETTING   || '0.98');
const DEFAULT_EMBEDDING_LR    = parseFloat(process.env.AGNI_EMBEDDING_LR || '0.01');
const DEFAULT_EMBEDDING_REG   = parseFloat(process.env.AGNI_EMBEDDING_REG || '0.001');


// ═══════════════════════════════════════════════════════════════════════════
// State management
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build a fresh LMSState with sensible defaults.
 * Called when no state file exists (first run) or when the existing state
 * file cannot be parsed.
 */
function buildDefaultState(): LMSState {
  const dim = DEFAULT_EMBEDDING_DIM;
  return {
    rasch: {
      students:     {},
      probes:       {},
      globalAnchor: { meanAbility: 0, stdAbility: 1 }
    },
    embedding: {
      dim,
      lr:         DEFAULT_EMBEDDING_LR,
      reg:        DEFAULT_EMBEDDING_REG,
      forgetting: DEFAULT_FORGETTING,
      students:   {},
      lessons:    {}
    },
    bandit: {
      A:                [],   // initialized lazily by ensureBanditInitialized
      b:                [],
      featureDim:       dim * 2,   // featureDim === embeddingDim * 2 (enforced)
      forgetting:       DEFAULT_FORGETTING,
      observationCount: 0
    }
  };
}

/**
 * Load LMSState from disk, or build a fresh default state if none exists.
 * Logs a warning if the state file exists but cannot be parsed — this surfaces
 * corruption early rather than silently overwriting with a fresh state.
 */
function loadState(): LMSState {
  if (!fs.existsSync(STATE_PATH)) {
    console.log('[LMS] No state file found — starting fresh');
    return buildDefaultState();
  }

  try {
    const raw = fs.readFileSync(STATE_PATH, 'utf8');
    const state = JSON.parse(raw) as LMSState;
    console.log('[LMS] State loaded:', STATE_PATH,
      '— students:', Object.keys(state.rasch.students).length,
      'lessons:', Object.keys(state.embedding.lessons).length,
      'observations:', state.bandit.observationCount);
    return state;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[LMS] Failed to parse state file:', msg,
      '— starting fresh. Corrupted file preserved at:', STATE_PATH + '.bak');
    try {
      fs.copyFileSync(STATE_PATH, STATE_PATH + '.bak');
    } catch (_) { /* best-effort backup */ }
    return buildDefaultState();
  }
}

/**
 * Persist LMSState to disk atomically.
 * Writes to a .tmp file first, then renames over the real file.
 * This prevents a process crash mid-write from leaving a truncated state file.
 */
function saveState(state: LMSState): void {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STATE_TMP_PATH, JSON.stringify(state, null, 2));
    fs.renameSync(STATE_TMP_PATH, STATE_PATH);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[LMS] Failed to save state:', msg);
    // Do not re-throw — a save failure should not crash the hub API call
  }
}

// ── Module-level state (loaded once at require() time) ────────────────────────
let _state: LMSState = loadState();


// ═══════════════════════════════════════════════════════════════════════════
// Lesson seeding
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Seed a lesson into the engine from a lesson-ir.json sidecar entry.
 *
 * Called by theta.js during rebuildLessonIndex() so that every lesson
 * known to the scheduler is also known to the bandit. Idempotent —
 * calling it with an already-known lessonId is safe (ensureLessonVector
 * checks for existence before initializing).
 *
 * The sidecar fields used:
 *   difficulty     — from inferredFeatures; mapped to initial embedding scale
 *   skill          — from ontology.provides[0].skill; used as the Rasch probe id
 *
 * Rasch probe registration:
 *   Each lesson's primary skill is registered as a probe with difficulty
 *   normalised from the 1–5 scale to logit space (centred at 0).
 *   difficulty 1 → −2 logits (easy), difficulty 3 → 0, difficulty 5 → +2.
 *
 * @param lessonId    OLS lesson identifier (e.g. 'ols:physics:gravity_v1')
 * @param difficulty  1–5 numeric difficulty from inferredFeatures
 * @param skill       primary skill id from ontology.provides[0].skill
 */
function seedLesson(lessonId: string, difficulty: number, skill: string): void {
  // Register lesson embedding (idempotent)
  ensureLessonVector(_state, lessonId);

  // Register as a Rasch probe if not already present.
  // Map 1–5 difficulty to logit scale: difficulty 3 = 0 logits (average).
  if (!_state.rasch.probes[lessonId]) {
    const logitDifficulty = (difficulty - 3) * (2 / 2);   // maps [1,5] → [−2,+2]
    _state.rasch.probes[lessonId] = {
      difficulty: logitDifficulty,
      skill
    };
  }
}

/**
 * Seed multiple lessons in one call.
 * Saves state once after all lessons are processed — not once per lesson.
 *
 * Called by theta.js at startup after rebuildLessonIndex() completes.
 *
 * @param lessons  Array of { lessonId, difficulty, skill } entries
 */
function seedLessons(lessons: { lessonId: string; difficulty: number; skill: string }[]): void {
  let seeded = 0;
  for (const entry of lessons) {
    const wasNew = !_state.embedding.lessons[entry.lessonId];
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
 * If the bandit has no observations yet for this student (cold start),
 * the Thompson sample is drawn from the weak prior, which produces
 * near-uniform random selection across candidates — equivalent to a
 * random baseline until enough observations accumulate.
 *
 * @param studentId    pseudonymous student identifier
 * @param candidates   lessonIds from theta's eligible set (already filtered)
 * @returns            lessonId, or null if candidates is empty
 */
function selectBestLesson(studentId: string, candidates: string[]): string | null {
  if (candidates.length === 0) return null;

  // Temporarily restrict the embedding.lessons map to candidates so that
  // selectLesson() only scores lessons theta has deemed eligible.
  // We swap in a filtered view, call selectLesson, then restore.
  const fullLessons = _state.embedding.lessons;
  const filteredLessons: typeof fullLessons = {};
  for (const id of candidates) {
    if (fullLessons[id]) {
      filteredLessons[id] = fullLessons[id];
    } else {
      // Candidate not yet in embedding — initialize on the fly
      ensureLessonVector(_state, id);
      filteredLessons[id] = _state.embedding.lessons[id];
    }
  }

  _state.embedding.lessons = filteredLessons;
  const selected = selectLesson(_state, studentId);
  _state.embedding.lessons = fullLessons;

  return selected;
}

/**
 * Record a completed lesson observation and update all model parameters.
 *
 * Call this after a student completes a lesson and their pre/post probe
 * results are available. Updates Rasch ability, embeddings, and the bandit
 * posterior in one atomic operation, then persists state.
 *
 * @param studentId    pseudonymous student identifier
 * @param lessonId     lesson that was completed
 * @param probeResults array of { probeId, correct } from the post-lesson assessment
 */
function recordObservation(
  studentId: string,
  lessonId:  string,
  probeResults: { probeId: string; correct: boolean }[]
): void {
  // 1. Update Rasch ability — returns delta as gain proxy
  const gain = updateAbility(_state, studentId, probeResults);

  // 2. Update student/lesson embeddings
  updateEmbedding(_state, studentId, lessonId, gain);

  // 3. Update bandit posterior
  updateBandit(_state, studentId, lessonId, gain);

  // 4. Persist atomically
  saveState(_state);
}

/**
 * Get the current Rasch ability estimate for a student.
 * Returns null if the student has no recorded observations.
 */
function getStudentAbility(studentId: string): { ability: number; variance: number } | null {
  return _state.rasch.students[studentId] || null;
}

/**
 * Export bandit summary for federation sync with a regional hub.
 */
function exportBanditSummary(): BanditSummary {
  ensureBanditInitialized(_state);
  return getBanditSummary(_state);
}

/**
 * Merge a remote bandit summary into the local state.
 * Used when syncing with a regional hub over the village network link.
 * Saves state after merge.
 *
 * @param remote  BanditSummary received from the remote hub
 */
function mergeRemoteSummary(remote: BanditSummary): void {
  ensureBanditInitialized(_state);
  const local   = getBanditSummary(_state);
  const merged  = mergeBanditSummaries(local, remote);

  // Write merged posterior back into the live state.
  // We reconstruct A and b from the merged precision and mean:
  //   A = mergedPrec  (already in raw RLS units)
  //   b = A · mergedMean  (RLS invariant: b = A · θ_map)
  const { matVec } = require('../math');
  _state.bandit.A  = merged.precision;
  _state.bandit.b  = matVec(merged.precision, merged.mean);
  _state.bandit.observationCount = merged.sampleSize;

  saveState(_state);
  console.log('[LMS] Remote summary merged — total observations:', merged.sampleSize);
}

/**
 * Reload state from disk. Used when the state file has been modified
 * externally (e.g. by an operator restoring a backup).
 */
function reloadState(): void {
  _state = loadState();
}

/**
 * Return a diagnostic snapshot of the engine state.
 * Safe to expose on an internal status endpoint.
 */
function getStatus(): object {
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


// ═══════════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════════

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
