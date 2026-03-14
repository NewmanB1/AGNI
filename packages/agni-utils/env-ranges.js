'use strict';

/**
 * Shared numeric bounds for AGNI environment variables.
 * Single source of truth used by env-config (strict validation) and env-validate (clamp/warn).
 * No dependencies; safe to require from bootstrap code.
 */

module.exports = {
  PORT_MIN: 1,
  PORT_MAX: 65535,

  EMBEDDING_DIM_MIN: 1,
  EMBEDDING_DIM_MAX: 1024,

  MIN_LOCAL_SAMPLE_MIN: 1,
  MIN_LOCAL_SAMPLE_MAX: 100000,

  MIN_LOCAL_EDGES_MIN: 1,
  MIN_LOCAL_EDGES_MAX: 100000,

  FORGETTING_MIN: 0.9,
  FORGETTING_MAX: 1,

  EMBEDDING_LR_MIN: 0.0001,
  EMBEDDING_LR_MAX: 1,

  EMBEDDING_REG_MIN: 0,
  EMBEDDING_REG_MAX: 1,

  /** Student session TTL: min 1h, max 24h (ms). */
  STUDENT_SESSION_TTL_MS_MIN: 60 * 60 * 1000,
  STUDENT_SESSION_TTL_MS_MAX: 24 * 60 * 60 * 1000
};
