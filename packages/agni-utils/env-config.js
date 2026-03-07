'use strict';

/**
 * Centralized AGNI_* environment variable parsing.
 * Single source of truth for all hub configuration defaults.
 *
 * Pi-friendly: parsed once at require() time, cached for the process lifetime.
 * All other modules import from here instead of parsing process.env inline.
 */

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
  if (value < 1 || value > 65535) throw new Error(name + ' must be 1-65535, got ' + value);
  return value;
}
function validRange(value, min, max, name) {
  if (value < min || value > max) throw new Error(name + ' must be ' + min + '-' + max + ', got ' + value);
  return value;
}

const DATA_DIR = strVal('AGNI_DATA_DIR', path.join(__dirname, '../../data'));

const config = {
  dataDir:            DATA_DIR,
  yamlDir:            strVal('AGNI_YAML_DIR', path.join(DATA_DIR, 'yaml')),
  factoryDir:         strVal('AGNI_FACTORY_DIR', path.join(__dirname, '../../factories')),
  katexDir:           strVal('AGNI_KATEX_DIR', path.join(__dirname, '../../katex')),
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

  minLocalSample:     intVal('AGNI_MIN_LOCAL_SAMPLE', 40),
  minLocalEdges:      intVal('AGNI_MIN_LOCAL_EDGES', 5),

  embeddingDim:       validRange(intVal('AGNI_EMBEDDING_DIM', 16), 1, 1024, 'AGNI_EMBEDDING_DIM'),
  forgetting:         validRange(floatVal('AGNI_FORGETTING', 0.98), 0.5, 1, 'AGNI_FORGETTING'),
  embeddingLr:        floatVal('AGNI_EMBEDDING_LR', 0.01),
  embeddingReg:       floatVal('AGNI_EMBEDDING_REG', 0.001),

  syncTransport:      strVal('AGNI_SYNC_TRANSPORT', ''),
  homeUrl:            strVal('AGNI_HOME_URL', ''),
  usbPath:            strVal('AGNI_USB_PATH', ''),

  analyseAfter:       intVal('AGNI_ANALYSE_AFTER', 50),
  analyseCron:        strVal('AGNI_ANALYSE_CRON', '02:00'),
  sentryRetentionDays: intVal('AGNI_SENTRY_RETENTION_DAYS', 90),

  sentryChi2Threshold:   floatVal('AGNI_SENTRY_CHI2_THRESHOLD', 3.841),
  sentryMinSample:       intVal('AGNI_SENTRY_MIN_SAMPLE', 20),
  sentryJaccardThreshold: validRange(floatVal('AGNI_SENTRY_JACCARD_THRESHOLD', 0.5), 0, 1, 'AGNI_SENTRY_JACCARD_THRESHOLD'),
  sentryMinClusterSize:  intVal('AGNI_SENTRY_MIN_CLUSTER_SIZE', 20),
  sentryForward:         process.env.AGNI_SENTRY_FORWARD !== 'false',

  markovWeight:       floatVal('AGNI_MARKOV_WEIGHT', 0.15),
  pagerankWeight:     floatVal('AGNI_PAGERANK_WEIGHT', 0.10),

  logLevel:           strVal('AGNI_LOG_LEVEL', 'info'),
};

module.exports = config;
