'use strict';

/**
 * Centralized AGNI_* environment variable parsing.
 * Single source of truth for all hub configuration defaults.
 *
 * Pi-friendly: parsed once at require() time, cached for the process lifetime.
 * All other modules import from here instead of parsing process.env inline.
 * Numeric bounds from env-ranges.js.
 */

var R = require('./env-ranges');
const fs  = require('fs');
const path = require('path');

function intVal(key, fallback) {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  const v = parseInt(raw, 10);
  return isNaN(v) ? fallback : v;
}

function floatVal(key, fallback) {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  const v = parseFloat(raw);
  return isNaN(v) ? fallback : v;
}

function strVal(key, fallback) {
  const val = process.env[key];
  return val !== undefined ? val : fallback;
}

// Fail fast on invalid values [R10 P5.4]
function validPort(value, name) {
  if (value < R.PORT_MIN || value > R.PORT_MAX) throw new Error(name + ' must be ' + R.PORT_MIN + '-' + R.PORT_MAX + ', got ' + value);
  return value;
}
function validRange(value, min, max, name) {
  if (value < min || value > max) throw new Error(name + ' must be ' + min + '-' + max + ', got ' + value);
  return value;
}

/** Safe root for USB sync paths. Any usbPath must resolve under this to prevent arbitrary write. */
const USB_SAFE_ROOT = path.resolve('/mnt/usb');

/**
 * Validate that a path is under the USB safe root (/mnt/usb).
 * Resolves symlinks via fs.realpathSync to prevent escape (e.g. /mnt/usb/link -> /).
 * Throws if path is non-empty and resolves outside the safe root.
 * @param {string} p - Path to validate (e.g. usbPath or effective USB_PATH)
 * @param {string} name - Label for error message
 * @returns {string} The path if valid
 * @throws {Error} If path is outside safe root
 */
function validUsbPath(p, name) {
  if (!p || typeof p !== 'string' || p.trim() === '') return p;
  let resolved = path.resolve(p);
  if (fs.existsSync(resolved)) {
    try {
      resolved = fs.realpathSync(resolved);
    } catch (e) {
      throw new Error(
        (name || 'AGNI_USB_PATH') + ' path exists but cannot be resolved: ' + e.message
      );
    }
  }
  let root = path.resolve(USB_SAFE_ROOT);
  if (fs.existsSync(root)) {
    try {
      root = fs.realpathSync(root);
    } catch (e) { /* keep path.resolve result */ }
  }
  if (resolved !== root && resolved.indexOf(root + path.sep) !== 0) {
    throw new Error(
      (name || 'AGNI_USB_PATH') + ' must be under ' + root + ', got: ' + resolved
    );
  }
  return p;
}

const DATA_DIR = strVal('AGNI_DATA_DIR', path.join(__dirname, '../../data'));

function getDefaultFactoryDir() {
  try { return require('@agni/runtime').RUNTIME_ROOT; } catch (_) { return path.join(__dirname, '../agni-runtime'); }
}

const config = {
  dataDir:            DATA_DIR,
  yamlDir:            strVal('AGNI_YAML_DIR', path.join(DATA_DIR, 'yaml')),
  factoryDir:         strVal('AGNI_FACTORY_DIR', getDefaultFactoryDir()),
  katexDir:           strVal('AGNI_KATEX_DIR', path.join(DATA_DIR, 'katex-css')),
  serveDir:           strVal('AGNI_SERVE_DIR', path.join(__dirname, '../../serve')),

  thetaPort:          validPort(intVal('AGNI_THETA_PORT', 8082), 'AGNI_THETA_PORT'),
  servePort:          validPort(intVal('AGNI_SERVE_PORT', 8080), 'AGNI_SERVE_PORT'),
  sentryPort:         validPort(intVal('AGNI_SENTRY_PORT', 8081), 'AGNI_SENTRY_PORT'),

  corsOrigin:         strVal('AGNI_CORS_ORIGIN', '*'),
  hubId:              strVal('AGNI_HUB_ID', 'hub-local'),

  approvedCatalog:    strVal('AGNI_APPROVED_CATALOG', path.join(DATA_DIR, 'approved-catalog.json')),
  governancePolicy:   strVal('AGNI_GOVERNANCE_POLICY', path.join(DATA_DIR, 'governance-policy.json')),
  governancePolicySchema:  strVal('AGNI_GOVERNANCE_POLICY_SCHEMA', path.join(DATA_DIR, '..', 'schemas', 'governance-policy.schema.json')),
  approvedCatalogSchema:   strVal('AGNI_APPROVED_CATALOG_SCHEMA', path.join(DATA_DIR, '..', 'schemas', 'approved-catalog.schema.json')),
  utuConstantsPath:   strVal('AGNI_UTU_CONSTANTS', path.join(DATA_DIR, 'utu-constants.json')),

  masteryThreshold:   validRange(floatVal('AGNI_MASTERY_THRESHOLD', 0.6), 0, 1, 'AGNI_MASTERY_THRESHOLD'),

  minLocalSample:     validRange(intVal('AGNI_MIN_LOCAL_SAMPLE', 40), R.MIN_LOCAL_SAMPLE_MIN, R.MIN_LOCAL_SAMPLE_MAX, 'AGNI_MIN_LOCAL_SAMPLE'),
  minLocalEdges:      validRange(intVal('AGNI_MIN_LOCAL_EDGES', 5), R.MIN_LOCAL_EDGES_MIN, R.MIN_LOCAL_EDGES_MAX, 'AGNI_MIN_LOCAL_EDGES'),

  embeddingDim:       validRange(intVal('AGNI_EMBEDDING_DIM', 16), R.EMBEDDING_DIM_MIN, R.EMBEDDING_DIM_MAX, 'AGNI_EMBEDDING_DIM'),
  forgetting:         validRange(floatVal('AGNI_FORGETTING', 0.98), R.FORGETTING_MIN, R.FORGETTING_MAX, 'AGNI_FORGETTING'),
  embeddingLr:        validRange(floatVal('AGNI_EMBEDDING_LR', 0.01), R.EMBEDDING_LR_MIN, R.EMBEDDING_LR_MAX, 'AGNI_EMBEDDING_LR'),
  embeddingReg:       validRange(floatVal('AGNI_EMBEDDING_REG', 0.001), R.EMBEDDING_REG_MIN, R.EMBEDDING_REG_MAX, 'AGNI_EMBEDDING_REG'),

  syncTransport:      strVal('AGNI_SYNC_TRANSPORT', ''),
  homeUrl:            strVal('AGNI_HOME_URL', ''),
  usbPath:            validUsbPath(strVal('AGNI_USB_PATH', ''), 'AGNI_USB_PATH'),

  analyseAfter:       intVal('AGNI_ANALYSE_AFTER', 50),
  analyseCron:        strVal('AGNI_ANALYSE_CRON', '02:00'),
  sentryRetentionDays: intVal('AGNI_SENTRY_RETENTION_DAYS', 90),

  sentryChi2Threshold:   floatVal('AGNI_SENTRY_CHI2_THRESHOLD', 3.841),
  sentryMinSample:       intVal('AGNI_SENTRY_MIN_SAMPLE', 20),
  sentryJaccardThreshold: validRange(floatVal('AGNI_SENTRY_JACCARD_THRESHOLD', 0.5), 0, 1, 'AGNI_SENTRY_JACCARD_THRESHOLD'),
  sentryMinClusterSize:  intVal('AGNI_SENTRY_MIN_CLUSTER_SIZE', 20),
  sentryForward:         process.env.AGNI_SENTRY_FORWARD !== 'false',
  sentryWeightMaxDelta:  validRange(floatVal('AGNI_SENTRY_WEIGHT_MAX_DELTA', 0.2), 0.01, 1, 'AGNI_SENTRY_WEIGHT_MAX_DELTA'),
  sentryWeightReviewThreshold: validRange(floatVal('AGNI_SENTRY_WEIGHT_REVIEW_THRESHOLD', 0.3), 0.1, 1, 'AGNI_SENTRY_WEIGHT_REVIEW_THRESHOLD'),
  sentryMinValidYear:   intVal('AGNI_SENTRY_MIN_VALID_YEAR', 2020),

  markovWeight:       floatVal('AGNI_MARKOV_WEIGHT', 0.15),
  pagerankWeight:     floatVal('AGNI_PAGERANK_WEIGHT', 0.10),

  maxStudents:        intVal('AGNI_MAX_STUDENTS', 0),
  maxLessons:         intVal('AGNI_MAX_LESSONS', 0),
  topKCandidates:     validRange(intVal('AGNI_TOP_K_CANDIDATES', 500), 1, 2000, 'AGNI_TOP_K_CANDIDATES'),

  yamlMaxBytes:       Math.max(65536, intVal('AGNI_YAML_MAX_BYTES', 2 * 1024 * 1024)),

  /** Path to Ed25519 private key for signing lessons. Empty = no signing. */
  privateKeyPath:     strVal('AGNI_PRIVATE_KEY_PATH', ''),

  logLevel:           strVal('AGNI_LOG_LEVEL', 'info'),
  logMaxBytes:        Math.max(65536, intVal('AGNI_LOG_MAX_BYTES', 5242880)),

  /** Hub API key for device auth. Empty = 503 on protected endpoints. */
  hubApiKey:          strVal('AGNI_HUB_API_KEY', ''),
  /** Set 1 or true to allow sync to set system clock from syncTimestamp (Linux only). */
  syncSetClock:       (function () { var v = strVal('AGNI_SYNC_SET_CLOCK', '0'); return v === '1' || String(v).toLowerCase() === 'true'; })(),
  /** Mesh transport: stub, udp, or lora. */
  meshTransport:      strVal('AGNI_MESH_TRANSPORT', 'udp'),
  meshPort:           validPort(intVal('AGNI_MESH_PORT', 18471), 'AGNI_MESH_PORT'),
  loraSpiBus:         intVal('AGNI_LORA_SPI_BUS', 0),
  loraSpiDevice:      intVal('AGNI_LORA_SPI_DEVICE', 0),
  loraResetPin:       intVal('AGNI_LORA_RESET_PIN', 24),
  loraDio0Pin:        intVal('AGNI_LORA_DIO0_PIN', 25),
  loraFrequency:      intVal('AGNI_LORA_FREQUENCY', 868000000),
  /** Set 1 or true to throw on skill graph cycles (default: graceful degrade). */
  strictSkillGraph:   (function () { var v = strVal('AGNI_STRICT_SKILL_GRAPH', ''); return v === '1' || String(v).toLowerCase() === 'true'; })(),
  /** Hint for opportunistic precache (max slugs in theta response). */
  precacheHintCount:  Math.max(0, intVal('AGNI_PRECACHE_HINT_COUNT', 5)),
  /** Set 1 or true to verify YAML content_hash on compile. */
  verifyYamlHash:     (function () { var v = strVal('AGNI_VERIFY_YAML_HASH', ''); return v === '1' || String(v).toLowerCase() === 'true'; })(),
  /** Compile cache: max entries when cacheMaxBytes is 0. */
  cacheMax:           Math.max(1, intVal('AGNI_CACHE_MAX', 100)),
  /** Compile cache: max bytes (0 = use cacheMax count). */
  cacheMaxBytes:      Math.max(0, intVal('AGNI_CACHE_MAX_BYTES', 0)),
  /** Max concurrent compile slots. */
  compileConcurrency: (function () {
    var p = intVal('AGNI_COMPILE_CONCURRENCY', -1);
    if (p >= 1) return p;
    var cpus = (require('os').cpus && require('os').cpus()) ? require('os').cpus().length : 2;
    return Math.min(Math.max(1, cpus - 2), 2);
  })(),
  compileRetryAfter:  Math.max(1, intVal('AGNI_COMPILE_RETRY_AFTER', 3)),
  /** Set 1 or true for strict math validation in bandit/LMS. */
  mathStrict:         (function () { var v = strVal('AGNI_MATH_STRICT', ''); return v === '1' || String(v).toLowerCase() === 'true'; })(),
  /** LTI 1.1 shared secret for OAuth signature validation. Empty = skip validation (dev). */
  ltiSecret:          strVal('AGNI_LTI_SECRET', '')
};

config.USB_SAFE_ROOT = USB_SAFE_ROOT;
config.validUsbPath = validUsbPath;
module.exports = config;
