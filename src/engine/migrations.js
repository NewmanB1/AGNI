// src/engine/migrations.js
// AGNI LMS state migration/repair (Backlog task 7, ARCH §5.6).
//
// Detects older or inconsistent LMSState shapes and reshapes them so the
// engine can continue without requiring "delete the file". Safe defaults
// are applied where dimensions or nested objects are missing.
//
// Target: Node.js 14+. Consumed by engine/index.ts loadState().

'use strict';

var DEFAULT_EMBEDDING_DIM = parseInt(process.env.AGNI_EMBEDDING_DIM || '16', 10);
var DEFAULT_FORGETTING = parseFloat(process.env.AGNI_FORGETTING || '0.98');
var DEFAULT_EMBEDDING_LR = parseFloat(process.env.AGNI_EMBEDDING_LR || '0.01');
var DEFAULT_EMBEDDING_REG = parseFloat(process.env.AGNI_EMBEDDING_REG || '0.001');

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
  var dim = opts.embeddingDim != null ? opts.embeddingDim : DEFAULT_EMBEDDING_DIM;
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
  var embLr = ensureNumber(embedding.lr, DEFAULT_EMBEDDING_LR, { min: 1e-6, max: 1 });
  var embReg = ensureNumber(embedding.reg, DEFAULT_EMBEDDING_REG, { min: 0, max: 1 });
  var embForgetting = ensureNumber(embedding.forgetting, DEFAULT_FORGETTING, { min: 0, max: 1 });

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
  var banditForgetting = ensureNumber(bandit.forgetting, DEFAULT_FORGETTING, { min: 0, max: 1 });

  var A = Array.isArray(bandit.A) ? bandit.A : [];
  var b = Array.isArray(bandit.b) ? bandit.b : [];
  if (A.length !== featureDim || (A[0] && A[0].length !== featureDim)) {
    A = [];
    migrated = true;
  }
  if (b.length !== featureDim) {
    b = new Array(featureDim).fill(0);
    migrated = true;
  }

  // Bandit A/b are repaired by thompson.ensureBanditInitialized() when needed;
  // we only fix top-level shape here so loadState doesn't throw.
  var banditState = {
    A: A,
    b: b,
    featureDim: featureDim,
    forgetting: banditForgetting,
    observationCount: observationCount
  };

  var state = {
    rasch: raschState,
    embedding: embeddingState,
    bandit: banditState
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
