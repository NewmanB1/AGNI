'use strict';

/**
 * Validate and parse AGNI environment variables at startup.
 *
 * Callers: Hub bootstrap (pathfinder, telemetry-engine, sync, mesh) and any
 * process that loads hub config. This module mutates process.env: invalid
 * numeric values are removed; out-of-range values are clamped and written back.
 * Directory keys with empty or non-string values are removed (cleared).
 *
 * Uses env-ranges.js for bounds; aligned with env-config. Full list of
 * validated keys:
 *
 * Numeric (clamped to range, or cleared if invalid):
 *   AGNI_PATHFINDER_PORT, AGNI_SERVE_PORT, AGNI_TELEMETRY_ENGINE_PORT,
 *   AGNI_MIN_LOCAL_SAMPLE, AGNI_MIN_LOCAL_EDGES, AGNI_EMBEDDING_DIM,
 *   AGNI_FORGETTING, AGNI_EMBEDDING_LR, AGNI_EMBEDDING_REG
 *
 * Directory (cleared if empty or not a non-empty string):
 *   AGNI_DATA_DIR, AGNI_YAML_DIR, AGNI_SERVE_DIR, AGNI_FACTORY_DIR
 */

var R = require('./env-ranges');
var createLogger = require('./logger').createLogger;
var log = createLogger('env');

function parseInt10(r) {
  return parseInt(r, 10);
}

// --- Warning message formatting (single place to change wording/structure) ---

function formatInvalidValue(key, raw, typeLabel, fallback) {
  return key + '="' + raw + '" is not a valid ' + typeLabel + ' — using default ' + fallback;
}

function formatOutOfRange(key, val, min, max) {
  return key + '=' + val + ' is outside valid range [' + min + ', ' + max + '] — clamping';
}

function formatEmptyDir(key) {
  return key + ' is empty or invalid — cleared';
}

// --- Data-driven env specs (single place to add new variables) ---

var NUMERIC_ENV_SPEC = [
  { key: 'AGNI_PATHFINDER_PORT', fallback: 8082, min: R.PORT_MIN, max: R.PORT_MAX, parseFn: parseInt10, typeLabel: 'integer' },
  { key: 'AGNI_SERVE_PORT', fallback: 8080, min: R.PORT_MIN, max: R.PORT_MAX, parseFn: parseInt10, typeLabel: 'integer' },
  { key: 'AGNI_TELEMETRY_ENGINE_PORT', fallback: 8081, min: R.PORT_MIN, max: R.PORT_MAX, parseFn: parseInt10, typeLabel: 'integer' },
  { key: 'AGNI_MIN_LOCAL_SAMPLE', fallback: 40, min: R.MIN_LOCAL_SAMPLE_MIN, max: R.MIN_LOCAL_SAMPLE_MAX, parseFn: parseInt10, typeLabel: 'integer' },
  { key: 'AGNI_MIN_LOCAL_EDGES', fallback: 5, min: R.MIN_LOCAL_EDGES_MIN, max: R.MIN_LOCAL_EDGES_MAX, parseFn: parseInt10, typeLabel: 'integer' },
  { key: 'AGNI_EMBEDDING_DIM', fallback: 16, min: R.EMBEDDING_DIM_MIN, max: R.EMBEDDING_DIM_MAX, parseFn: parseInt10, typeLabel: 'integer' },
  { key: 'AGNI_FORGETTING', fallback: 0.98, min: R.FORGETTING_MIN, max: R.FORGETTING_MAX, parseFn: parseFloat, typeLabel: 'number' },
  { key: 'AGNI_EMBEDDING_LR', fallback: 0.01, min: R.EMBEDDING_LR_MIN, max: R.EMBEDDING_LR_MAX, parseFn: parseFloat, typeLabel: 'number' },
  { key: 'AGNI_EMBEDDING_REG', fallback: 0.001, min: R.EMBEDDING_REG_MIN, max: R.EMBEDDING_REG_MAX, parseFn: parseFloat, typeLabel: 'number' }
];

var DIR_ENV_KEYS = ['AGNI_DATA_DIR', 'AGNI_YAML_DIR', 'AGNI_SERVE_DIR', 'AGNI_FACTORY_DIR'];

// --- Testable helpers (operate on a given env object; no globals) ---

/**
 * Validate and optionally clamp a single numeric env var. Mutates env and pushes to warnings.
 * @param {object} env - Environment object to read/write (e.g. process.env or a copy).
 * @param {string[]} warnings - Array to append warning messages to.
 * @param {{ key: string, fallback: number, min: number, max: number, parseFn: function, typeLabel: string }} spec - One row from NUMERIC_ENV_SPEC.
 */
function applyNumericEnv(env, warnings, spec) {
  var raw = env[spec.key];
  if (raw === undefined) return;
  var val = spec.parseFn(raw);
  if (isNaN(val)) {
    warnings.push(formatInvalidValue(spec.key, raw, spec.typeLabel, spec.fallback));
    delete env[spec.key];
    return;
  }
  if (val < spec.min || val > spec.max) {
    warnings.push(formatOutOfRange(spec.key, val, spec.min, spec.max));
    env[spec.key] = String(Math.max(spec.min, Math.min(spec.max, val)));
  }
}

/**
 * Validate a single directory env var; clear if empty or not a non-empty string. Mutates env and pushes to warnings.
 * @param {object} env - Environment object to read/write.
 * @param {string[]} warnings - Array to append warning messages to.
 * @param {string} key - Env key (e.g. AGNI_DATA_DIR).
 */
function applyDirEnv(env, warnings, key) {
  var raw = env[key];
  if (raw === undefined) return;
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    warnings.push(formatEmptyDir(key));
    delete env[key];
  }
}

/**
 * Validate and parse AGNI environment variables at startup. Logs warnings for invalid
 * values and applies safe defaults (numeric: clamp or clear; dir: clear if empty).
 *
 * @param {{ dryRun?: boolean }} [opts] - Optional. If opts.dryRun is true, does not
 *   mutate process.env; returns { warnings, suggestedEnv } instead of just warnings.
 * @returns {string[] | { warnings: string[], suggestedEnv: object }} - Array of warning
 *   messages, or (when dryRun) { warnings, suggestedEnv } with suggestedEnv a copy of
 *   process.env with the same transformations that would be applied.
 */
function validateEnv(opts) {
  var env = (opts && opts.dryRun) ? Object.assign({}, process.env) : process.env;
  var warnings = [];

  var i;
  for (i = 0; i < NUMERIC_ENV_SPEC.length; i++) {
    applyNumericEnv(env, warnings, NUMERIC_ENV_SPEC[i]);
  }
  for (i = 0; i < DIR_ENV_KEYS.length; i++) {
    applyDirEnv(env, warnings, DIR_ENV_KEYS[i]);
  }

  if (warnings.length > 0) {
    log.warn('Environment validation warnings', { warnings: warnings });
  }

  if (opts && opts.dryRun) {
    return { warnings: warnings, suggestedEnv: env };
  }
  return warnings;
}

module.exports = {
  validateEnv: validateEnv,
  applyNumericEnv: applyNumericEnv,
  applyDirEnv: applyDirEnv,
  formatInvalidValue: formatInvalidValue,
  formatOutOfRange: formatOutOfRange,
  formatEmptyDir: formatEmptyDir,
  NUMERIC_ENV_SPEC: NUMERIC_ENV_SPEC,
  DIR_ENV_KEYS: DIR_ENV_KEYS
};
