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
  return process.env[key] || fallback;
}

const DATA_DIR = strVal('AGNI_DATA_DIR', path.join(__dirname, '../../data'));

const config = {
  dataDir:            DATA_DIR,
  yamlDir:            strVal('AGNI_YAML_DIR', path.join(DATA_DIR, 'yaml')),
  factoryDir:         strVal('AGNI_FACTORY_DIR', path.join(__dirname, '../../factories')),
  katexDir:           strVal('AGNI_KATEX_DIR', path.join(__dirname, '../../katex')),
  serveDir:           strVal('AGNI_SERVE_DIR', path.join(__dirname, '../../serve')),

  thetaPort:          intVal('AGNI_THETA_PORT', 8082),
  servePort:          intVal('AGNI_SERVE_PORT', 8080),
  sentryPort:         intVal('AGNI_SENTRY_PORT', 8081),

  corsOrigin:         strVal('AGNI_CORS_ORIGIN', 'null'),
  hubId:              strVal('AGNI_HUB_ID', 'hub-local'),

  approvedCatalog:    strVal('AGNI_APPROVED_CATALOG', path.join(DATA_DIR, 'approved_catalog.json')),
  governancePolicy:   strVal('AGNI_GOVERNANCE_POLICY', path.join(DATA_DIR, 'governance_policy.json')),

  minLocalSample:     intVal('AGNI_MIN_LOCAL_SAMPLE', 40),
  minLocalEdges:      intVal('AGNI_MIN_LOCAL_EDGES', 5),

  embeddingDim:       intVal('AGNI_EMBEDDING_DIM', 16),
  forgetting:         floatVal('AGNI_FORGETTING', 0.98),
  embeddingLr:        floatVal('AGNI_EMBEDDING_LR', 0.01),
  embeddingReg:       floatVal('AGNI_EMBEDDING_REG', 0.001),

  syncTransport:      strVal('AGNI_SYNC_TRANSPORT', ''),
  homeUrl:            strVal('AGNI_HOME_URL', ''),
  usbPath:            strVal('AGNI_USB_PATH', ''),

  analyseAfter:       intVal('AGNI_ANALYSE_AFTER', 50),
  analyseCron:        strVal('AGNI_ANALYSE_CRON', '02:00'),

  markovWeight:       floatVal('AGNI_MARKOV_WEIGHT', 0.15),
  pagerankWeight:     floatVal('AGNI_PAGERANK_WEIGHT', 0.10),

  logLevel:           strVal('AGNI_LOG_LEVEL', 'info'),
};

module.exports = config;
