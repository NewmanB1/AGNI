// packages/agni-engine/migrations.js
// AGNI LMS state migration/repair (Backlog task 7, ARCH §5.6).
//
// Detects older or inconsistent LMSState shapes and reshapes them so the
// engine can continue without requiring "delete the file". Safe defaults
// are applied where dimensions or nested objects are missing.
//
// Target: Node.js 14+. Consumed by engine/index.js loadState().

'use strict';

const envConfig = require('@agni/utils/env-config');
const math = require('./math');

/**
 * Ensure a plain object; return {} if missing or not an object.
 * @param {unknown} o
 * @returns {Record<string, unknown>}
 */
function ensureObject(o) {
  if (o != null && typeof o === 'object' && !Array.isArray(o)) return /** @type {Record<string, unknown>} */ (o);
  return {};
}

/**
 * Ensure a number within bounds; return default if invalid.
 * @param {unknown} v
 * @param {number} def
 * @param {{ min?: number, max?: number }} [bounds]
 * @returns {number}
 */
function ensureNumber(v, def, bounds) {
  let n = (typeof v === 'number' && !isNaN(v) && isFinite(v)) ? v : def;
  if (bounds) {
    if (bounds.min != null && n < bounds.min) n = bounds.min;
    if (bounds.max != null && n > bounds.max) n = bounds.max;
  }
  return n;
}

/**
 * Migrate or repair LMSState from disk. Detects missing/wrong schema and
 * reshapes with safe defaults. Use after JSON.parse and before using state.
 *
 * @param {unknown} raw  Parsed JSON (may be old schema or partial).
 * @param {{ embeddingDim?: number }} [opts]  Optional overrides (e.g. DEFAULT_EMBEDDING_DIM).
 * @returns {{ state: import('../types').LMSState, migrated: boolean }}
 */
function migrateLMSState(raw, opts) {
  opts = opts || {};
  const dim = opts.embeddingDim != null ? opts.embeddingDim : envConfig.embeddingDim;
  let migrated = false;

  const root = ensureObject(raw);
  const rasch = ensureObject(root.rasch);
  const embedding = ensureObject(root.embedding);
  const bandit = ensureObject(root.bandit);

  // ── Rasch ─────────────────────────────────────────────────────────────────
  const students = ensureObject(rasch.students);
  const probes = ensureObject(rasch.probes);
  const globalAnchor = ensureObject(rasch.globalAnchor);
  if (globalAnchor.meanAbility === undefined || typeof globalAnchor.meanAbility !== 'number') {
    globalAnchor.meanAbility = 0;
    migrated = true;
  }
  if (globalAnchor.stdAbility === undefined || typeof globalAnchor.stdAbility !== 'number') {
    globalAnchor.stdAbility = 1;
    migrated = true;
  }

  // Normalize Rasch student entries: { ability, variance }
  Object.keys(students).forEach(function (id) {
    const s = ensureObject(students[id]);
    if (typeof s.ability !== 'number') { s.ability = 0; migrated = true; }
    if (typeof s.variance !== 'number') { s.variance = 1; migrated = true; }
    students[id] = s;
  });

  // Normalize probes: { difficulty, skill }
  Object.keys(probes).forEach(function (id) {
    const p = ensureObject(probes[id]);
    if (typeof p.difficulty !== 'number') { p.difficulty = 0; migrated = true; }
    if (typeof p.skill !== 'string') { p.skill = ''; migrated = true; }
    probes[id] = p;
  });

  const raschState = {
    students: students,
    probes: probes,
    globalAnchor: { meanAbility: globalAnchor.meanAbility, stdAbility: globalAnchor.stdAbility }
  };

  // ── Embedding ─────────────────────────────────────────────────────────────
  const embDim = ensureNumber(embedding.dim, dim, { min: 4, max: 1024 });
  if (embedding.dim !== embDim) migrated = true;
  const embLr = ensureNumber(embedding.lr, envConfig.embeddingLr, { min: 1e-6, max: 0.1 });
  if (embedding.lr !== embLr) migrated = true;
  const embReg = ensureNumber(embedding.reg, envConfig.embeddingReg, { min: 0, max: 1 });
  if (embedding.reg !== embReg) migrated = true;
  const embForgetting = ensureNumber(embedding.forgetting, envConfig.forgetting, { min: 0.9, max: 1 });
  if (embedding.forgetting !== embForgetting) migrated = true;

  const embStudents = ensureObject(embedding.students);
  const embLessons = ensureObject(embedding.lessons);

  // Ensure embedding entity vectors are arrays of numbers; delete invalid so
  // ensureStudentVector/ensureLessonVector will re-initialize on next access
  function normalizeEmbeddingEntities(entities) {
    Object.keys(entities).forEach(function (id) {
      const e = entities[id];
      if (e == null || typeof e !== 'object') {
        delete entities[id];
        migrated = true;
        return;
      }
      let vec = Array.isArray(e.vector) ? e.vector : null;
      if (vec && !vec.every(function (x) { return typeof x === 'number'; })) vec = null;
      if (vec && vec.length !== embDim) vec = null;
      if (vec == null) {
        delete entities[id];
        migrated = true;
      } else if (e.vector !== vec) {
        entities[id] = { vector: vec };
        migrated = true;
      } else {
        entities[id] = e;
      }
    });
  }
  normalizeEmbeddingEntities(embStudents);
  normalizeEmbeddingEntities(embLessons);

  const embeddingState = {
    dim: embDim,
    lr: embLr,
    reg: embReg,
    forgetting: embForgetting,
    students: embStudents,
    lessons: embLessons
  };

  // ── Bandit ─────────────────────────────────────────────────────────────────
  const featureDim = embDim * 2;
  let banditFeatureDim = ensureNumber(bandit.featureDim, featureDim, { min: 1, max: 512 });
  if (banditFeatureDim !== featureDim) {
    banditFeatureDim = featureDim;
    migrated = true;
  }
  let observationCount = ensureNumber(bandit.observationCount, 0, { min: 0 });
  if (!math.isNonNegativeInteger(observationCount)) {
    observationCount = Math.floor(observationCount);
    if (observationCount < 0) observationCount = 0;
    migrated = true;
  }
  const banditForgetting = ensureNumber(bandit.forgetting, envConfig.forgetting, { min: 0.9, max: 1 });
  if (bandit.forgetting !== banditForgetting) migrated = true;

  let A = Array.isArray(bandit.A) ? bandit.A : [];
  let b = Array.isArray(bandit.b) ? bandit.b : [];
  if (A.length !== featureDim) {
    A = [];
    migrated = true;
  } else {
    // Validate each row has the correct length
    for (var ri = 0; ri < A.length; ri++) {
      if (!Array.isArray(A[ri]) || A[ri].length !== featureDim) {
        A = [];
        migrated = true;
        break;
      }
      // Check for NaN/Infinity in matrix values
      for (let ci = 0; ci < A[ri].length; ci++) {
        if (typeof A[ri][ci] !== 'number' || !isFinite(A[ri][ci])) {
          A = [];
          migrated = true;
          break;
        }
      }
      if (A.length === 0) break;
    }
    // Repair JSON round-trip asymmetry (LEN-001 bug 13): symmetrize instead of discarding.
    if (A.length === featureDim) {
      var needsSymmetrize = false;
      for (ri = 0; ri < A.length; ri++) {
        for (let cj = ri + 1; cj < A[ri].length; cj++) {
          if (Math.abs(A[ri][cj] - A[cj][ri]) > math.CHOLESKY_SYMMETRY_TOL) {
            needsSymmetrize = true;
            break;
          }
        }
        if (needsSymmetrize) break;
      }
      if (needsSymmetrize) {
        A = math.symmetrize(A);
        migrated = true;
      }
    }
  }
  if (b.length !== featureDim) {
    b = math.zeros(featureDim);
    migrated = true;
  } else {
    for (var bi = 0; bi < b.length; bi++) {
      if (typeof b[bi] !== 'number' || !isFinite(b[bi])) {
        b[bi] = 0;
        migrated = true;
      }
    }
  }

  const rawSeenSyncIds = Array.isArray(bandit.seenSyncIds) ? bandit.seenSyncIds : [];
  let seenSyncIds = rawSeenSyncIds.filter(function (id) { return typeof id === 'string'; });
  if (seenSyncIds.length !== rawSeenSyncIds.length) migrated = true;
  if (seenSyncIds.length > 500) {
    seenSyncIds = seenSyncIds.slice(-500);  // FIFO: keep 500 most recent
    migrated = true;
  }

  const exportSequence = ensureNumber(bandit.exportSequence, 0, { min: 0 });
  const rawHubHighWater = ensureObject(bandit.hubHighWater);
  const hubHighWater = {};
  Object.keys(rawHubHighWater).forEach(function (k) {
    const v = rawHubHighWater[k];
    if (typeof v === 'number' && !isNaN(v) && v >= 0) hubHighWater[k] = v;
    else migrated = true;
  });
  const mergeVersion = ensureNumber(bandit.mergeVersion, 0, { min: 0 });

  const banditState = {
    A: A,
    b: b,
    featureDim: featureDim,
    forgetting: banditForgetting,
    observationCount: observationCount,
    seenSyncIds: seenSyncIds,
    exportSequence: exportSequence,
    hubHighWater: hubHighWater,
    mergeVersion: mergeVersion
  };

  // ── Markov ────────────────────────────────────────────────────────────────
  const markov = ensureObject(root.markov);
  const markovTransitions = ensureObject(markov.transitions);
  const markovHistory = ensureObject(markov.studentHistory);
  const markovBigrams = ensureObject(markov.bigrams);
  const markovDropouts = ensureObject(markov.dropouts);
  const markovCooldowns = ensureObject(markov.cooldowns);

  Object.keys(markovHistory).forEach(function (sid) {
    const arr = Array.isArray(markovHistory[sid]) ? /** @type {Array} */ (markovHistory[sid]) : [];
    if (!Array.isArray(markovHistory[sid])) {
      markovHistory[sid] = arr;
      migrated = true;
    }
    if (arr.length > 10) {
      markovHistory[sid] = arr.slice(-10);
      migrated = true;
    }
  });

  const MAX_TRANSITION_SOURCES = 300;
  const MAX_BIGRAM_SOURCES = 200;
  const transKeys = Object.keys(markovTransitions);
  if (transKeys.length > MAX_TRANSITION_SOURCES) {
    const transTotals = transKeys.map(function (k) {
      const es = /** @type {Record<string, { count?: number }>} */ (markovTransitions[k]);
      let t = 0;
      for (const tk in es) if (Object.prototype.hasOwnProperty.call(es, tk)) t += (es[tk].count || 0);
      return { key: k, total: t };
    });
    transTotals.sort(function (a, b) { return a.total - b.total; });
    for (let ti = 0; ti < transKeys.length - MAX_TRANSITION_SOURCES; ti++) {
      delete markovTransitions[transTotals[ti].key];
      migrated = true;
    }
  }
  const bigramKeys = Object.keys(markovBigrams);
  if (bigramKeys.length > MAX_BIGRAM_SOURCES) {
    const bigramTotals = bigramKeys.map(function (k) {
      const es = /** @type {Record<string, { count?: number }>} */ (markovBigrams[k]);
      let t = 0;
      for (const bk in es) if (Object.prototype.hasOwnProperty.call(es, bk)) t += (es[bk].count || 0);
      return { key: k, total: t };
    });
    bigramTotals.sort(function (a, b) { return a.total - b.total; });
    for (var bi = 0; bi < bigramKeys.length - MAX_BIGRAM_SOURCES; bi++) {
      delete markovBigrams[bigramTotals[bi].key];
      migrated = true;
    }
  }

  const markovState = {
    transitions: markovTransitions,
    studentHistory: markovHistory,
    bigrams: markovBigrams,
    dropouts: markovDropouts,
    cooldowns: markovCooldowns
  };

  const state = {
    rasch: raschState,
    embedding: embeddingState,
    bandit: banditState,
    markov: markovState
  };

  // embedding.dim drives vector sizing — must be present and positive
  if (!math.isPositiveInteger(state.embedding.dim) || state.embedding.dim > 1024) {
    throw new Error(
      '[MIGRATIONS] embedding.dim invalid: must be integer in [1,1024], got ' +
      (state.embedding.dim === undefined ? 'undefined' : state.embedding.dim)
    );
  }
  // Hard invariant: featureDim === embedding.dim * 2
  if (state.bandit.featureDim !== state.embedding.dim * 2) {
    throw new Error(
      '[MIGRATIONS] featureDim invariant violated: bandit.featureDim=' + state.bandit.featureDim +
      ' but embedding.dim*2=' + (state.embedding.dim * 2)
    );
  }
  return { state: /** @type {import('../types').LMSState} */ (state), migrated: migrated };
}

/**
 * Check if parsed state looks like a valid LMSState (has required top-level keys).
 * Use to decide whether to migrate or treat as corrupt.
 *
 * @param {unknown} raw
 * @returns {boolean}
 */
function looksLikeLMSState(raw) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const o = raw;
  return 'rasch' in o && 'embedding' in o && 'bandit' in o;
}

module.exports = {
  migrateLMSState: migrateLMSState,
  looksLikeLMSState: looksLikeLMSState
};
