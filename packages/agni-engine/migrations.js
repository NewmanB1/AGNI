// packages/agni-engine/migrations.js
// AGNI LMS state migration/repair (Backlog task 7, ARCH §5.6).
//
// Detects older or inconsistent LMSState shapes and reshapes them so the
// engine can continue without requiring "delete the file". Safe defaults
// are applied where dimensions or nested objects are missing.
//
// Target: Node.js 14+. Consumed by engine/index.js loadState().

'use strict';

var envConfig = require('@agni/utils/env-config');

/**
 * Ensure a plain object; return {} if missing or not an object.
 * @param {unknown} o
 * @returns {Record<string, unknown>}
 */
function ensureObject(o) {
  if (o != null && typeof o === 'object' && !Array.isArray(o)) return o;
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
  var n = typeof v === 'number' && !Number.isNaN(v) ? v : def;
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
  var dim = opts.embeddingDim != null ? opts.embeddingDim : envConfig.embeddingDim;
  var migrated = false;

  var root = ensureObject(raw);
  var rasch = ensureObject(root.rasch);
  var embedding = ensureObject(root.embedding);
  var bandit = ensureObject(root.bandit);

  // ── Rasch ─────────────────────────────────────────────────────────────────
  var students = ensureObject(rasch.students);
  var probes = ensureObject(rasch.probes);
  var globalAnchor = ensureObject(rasch.globalAnchor);
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
    var s = ensureObject(students[id]);
    if (typeof s.ability !== 'number') { s.ability = 0; migrated = true; }
    if (typeof s.variance !== 'number') { s.variance = 1; migrated = true; }
    students[id] = s;
  });

  // Normalize probes: { difficulty, skill }
  Object.keys(probes).forEach(function (id) {
    var p = ensureObject(probes[id]);
    if (typeof p.difficulty !== 'number') { p.difficulty = 0; migrated = true; }
    if (typeof p.skill !== 'string') { p.skill = ''; migrated = true; }
    probes[id] = p;
  });

  var raschState = {
    students: students,
    probes: probes,
    globalAnchor: { meanAbility: globalAnchor.meanAbility, stdAbility: globalAnchor.stdAbility }
  };

  // ── Embedding ─────────────────────────────────────────────────────────────
  var embDim = ensureNumber(embedding.dim, dim, { min: 4, max: 256 });
  if (embedding.dim !== embDim) migrated = true;
  var embLr = ensureNumber(embedding.lr, envConfig.embeddingLr, { min: 1e-6, max: 1 });
  if (embedding.lr !== embLr) migrated = true;
  var embReg = ensureNumber(embedding.reg, envConfig.embeddingReg, { min: 0, max: 1 });
  if (embedding.reg !== embReg) migrated = true;
  var embForgetting = ensureNumber(embedding.forgetting, envConfig.forgetting, { min: 0.5, max: 1 });
  if (embedding.forgetting !== embForgetting) migrated = true;

  var embStudents = ensureObject(embedding.students);
  var embLessons = ensureObject(embedding.lessons);

  // Ensure embedding entity vectors are arrays of numbers or null
  function normalizeEmbeddingEntities(entities) {
    Object.keys(entities).forEach(function (id) {
      var e = entities[id];
      if (e == null || typeof e !== 'object') {
        entities[id] = { vector: null };
        migrated = true;
        return;
      }
      var vec = Array.isArray(e.vector) ? e.vector : null;
      if (vec && !vec.every(function (x) { return typeof x === 'number'; })) vec = null;
      if (vec && vec.length !== embDim) vec = null;
      if (e.vector !== vec) {
        entities[id] = { vector: vec };
        migrated = true;
      } else {
        entities[id] = e;
      }
    });
  }
  normalizeEmbeddingEntities(embStudents);
  normalizeEmbeddingEntities(embLessons);

  var embeddingState = {
    dim: embDim,
    lr: embLr,
    reg: embReg,
    forgetting: embForgetting,
    students: embStudents,
    lessons: embLessons
  };

  // ── Bandit ─────────────────────────────────────────────────────────────────
  var featureDim = embDim * 2;
  var banditFeatureDim = ensureNumber(bandit.featureDim, featureDim, { min: 1, max: 512 });
  if (banditFeatureDim !== featureDim) {
    banditFeatureDim = featureDim;
    migrated = true;
  }
  var observationCount = ensureNumber(bandit.observationCount, 0, { min: 0 });
  var banditForgetting = ensureNumber(bandit.forgetting, envConfig.forgetting, { min: 0.5, max: 1 });
  if (bandit.forgetting !== banditForgetting) migrated = true;

  var A = Array.isArray(bandit.A) ? bandit.A : [];
  var b = Array.isArray(bandit.b) ? bandit.b : [];
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
      for (var ci = 0; ci < A[ri].length; ci++) {
        if (typeof A[ri][ci] !== 'number' || !isFinite(A[ri][ci])) {
          A = [];
          migrated = true;
          break;
        }
      }
      if (A.length === 0) break;
    }
  }
  if (b.length !== featureDim) {
    b = new Array(featureDim).fill(0);
    migrated = true;
  } else {
    for (var bi = 0; bi < b.length; bi++) {
      if (typeof b[bi] !== 'number' || !isFinite(b[bi])) {
        b[bi] = 0;
        migrated = true;
      }
    }
  }

  var banditState = {
    A: A,
    b: b,
    featureDim: featureDim,
    forgetting: banditForgetting,
    observationCount: observationCount
  };

  // ── Markov ────────────────────────────────────────────────────────────────
  var markov = ensureObject(root.markov);
  var markovTransitions = ensureObject(markov.transitions);
  var markovHistory = ensureObject(markov.studentHistory);

  Object.keys(markovHistory).forEach(function (sid) {
    if (!Array.isArray(markovHistory[sid])) {
      markovHistory[sid] = [];
      migrated = true;
    }
  });

  var markovState = {
    transitions: markovTransitions,
    studentHistory: markovHistory
  };

  var state = {
    rasch: raschState,
    embedding: embeddingState,
    bandit: banditState,
    markov: markovState
  };

  return { state: state, migrated: migrated };
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
  var o = raw;
  return 'rasch' in o && 'embedding' in o && 'bandit' in o;
}

module.exports = {
  migrateLMSState: migrateLMSState,
  looksLikeLMSState: looksLikeLMSState
};
