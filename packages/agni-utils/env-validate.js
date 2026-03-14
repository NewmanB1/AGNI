'use strict';

var R = require('./env-ranges');
const { createLogger } = require('./logger');
const log = createLogger('env');

/**
 * Validate and parse AGNI environment variables at startup.
 * Logs warnings for invalid values and applies safe defaults.
 * Uses env-ranges.js for bounds; aligned with env-config.
 */

function validateEnv() {
  const warnings = [];

  function intEnv(key, fallback, min, max) {
    const raw = process.env[key];
    if (raw === undefined) return;
    const val = parseInt(raw, 10);
    if (isNaN(val)) {
      warnings.push(`${key}="${raw}" is not a valid integer — using default ${fallback}`);
      delete process.env[key];
      return;
    }
    if (val < min || val > max) {
      warnings.push(`${key}=${val} is outside valid range [${min}, ${max}] — clamping`);
      process.env[key] = String(Math.max(min, Math.min(max, val)));
    }
  }

  function floatEnv(key, fallback, min, max) {
    const raw = process.env[key];
    if (raw === undefined) return;
    const val = parseFloat(raw);
    if (isNaN(val)) {
      warnings.push(`${key}="${raw}" is not a valid number — using default ${fallback}`);
      delete process.env[key];
      return;
    }
    if (val < min || val > max) {
      warnings.push(`${key}=${val} is outside valid range [${min}, ${max}] — clamping`);
      process.env[key] = String(Math.max(min, Math.min(max, val)));
    }
  }

  function dirEnv(key) {
    const raw = process.env[key];
    if (raw === undefined) return;
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      warnings.push(`${key} is empty — using default`);
      delete process.env[key];
    }
  }

  intEnv('AGNI_PATHFINDER_PORT', 8082, R.PORT_MIN, R.PORT_MAX);
  intEnv('AGNI_SERVE_PORT', 8080, R.PORT_MIN, R.PORT_MAX);
  intEnv('AGNI_TELEMETRY_ENGINE_PORT', 8081, R.PORT_MIN, R.PORT_MAX);
  intEnv('AGNI_MIN_LOCAL_SAMPLE', 40, R.MIN_LOCAL_SAMPLE_MIN, R.MIN_LOCAL_SAMPLE_MAX);
  intEnv('AGNI_MIN_LOCAL_EDGES', 5, R.MIN_LOCAL_EDGES_MIN, R.MIN_LOCAL_EDGES_MAX);
  intEnv('AGNI_EMBEDDING_DIM', 16, R.EMBEDDING_DIM_MIN, R.EMBEDDING_DIM_MAX);
  floatEnv('AGNI_FORGETTING', 0.98, R.FORGETTING_MIN, R.FORGETTING_MAX);
  floatEnv('AGNI_EMBEDDING_LR', 0.01, R.EMBEDDING_LR_MIN, R.EMBEDDING_LR_MAX);
  floatEnv('AGNI_EMBEDDING_REG', 0.001, R.EMBEDDING_REG_MIN, R.EMBEDDING_REG_MAX);
  dirEnv('AGNI_DATA_DIR');
  dirEnv('AGNI_YAML_DIR');
  dirEnv('AGNI_SERVE_DIR');
  dirEnv('AGNI_FACTORY_DIR');

  if (warnings.length > 0) {
    log.warn('Environment validation warnings', { warnings });
  }

  return warnings;
}

module.exports = { validateEnv };
