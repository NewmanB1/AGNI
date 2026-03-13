'use strict';

/**
 * Shared hub config loader.
 * Reads data/hub-config.json and applies values to process.env
 * so all modules share a single config bootstrap path.
 */

const fs = require('fs');
const path = require('path');

const CONFIG_KEYS = [
  ['embeddingDim', 'AGNI_EMBEDDING_DIM'],
  ['forgetting', 'AGNI_FORGETTING'],
  ['maxStudents', 'AGNI_MAX_STUDENTS'],
  ['maxLessons', 'AGNI_MAX_LESSONS'],
  ['topKCandidates', 'AGNI_TOP_K_CANDIDATES'],
  ['dataDir', 'AGNI_DATA_DIR'],
  ['serveDir', 'AGNI_SERVE_DIR'],
  ['thetaPort', 'AGNI_THETA_PORT'],
  ['approvedCatalog', 'AGNI_APPROVED_CATALOG'],
  ['minLocalSample', 'AGNI_MIN_LOCAL_SAMPLE'],
  ['minLocalEdges', 'AGNI_MIN_LOCAL_EDGES'],
  ['yamlDir', 'AGNI_YAML_DIR'],
  ['factoryDir', 'AGNI_FACTORY_DIR'],
  ['katexDir', 'AGNI_KATEX_DIR'],
  ['servePort', 'AGNI_SERVE_PORT'],
  ['cacheMax', 'AGNI_CACHE_MAX'],
  ['cacheMaxBytes', 'AGNI_CACHE_MAX_BYTES'],
  ['compileConcurrency', 'AGNI_COMPILE_CONCURRENCY'],
  ['compileRetryAfter', 'AGNI_COMPILE_RETRY_AFTER'],
  ['hubId', 'AGNI_HUB_ID'],
  ['hubApiKey', 'AGNI_HUB_API_KEY'],
  ['homeUrl', 'AGNI_HOME_URL'],
  ['usbPath', 'AGNI_USB_PATH'],
  ['sentryPort', 'AGNI_SENTRY_PORT'],
  ['syncTransport', 'AGNI_SYNC_TRANSPORT'],
  ['syncSetClock', 'AGNI_SYNC_SET_CLOCK'],
  ['meshTransport', 'AGNI_MESH_TRANSPORT'],
  ['meshPort', 'AGNI_MESH_PORT'],
  ['strictSkillGraph', 'AGNI_STRICT_SKILL_GRAPH'],
  ['precacheHintCount', 'AGNI_PRECACHE_HINT_COUNT'],
  ['verifyYamlHash', 'AGNI_VERIFY_YAML_HASH'],
  ['logMaxBytes', 'AGNI_LOG_MAX_BYTES'],
  ['privateKeyPath', 'AGNI_PRIVATE_KEY_PATH']
];

let _loaded = false;
let _config = null;

function loadHubConfig(baseDir) {
  if (_loaded) return _config;
  const cfgPath = path.join(baseDir || path.join(__dirname, '../../data'), 'hub-config.json');
  if (!fs.existsSync(cfgPath)) { _loaded = true; return null; }
  try {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    for (const [jsonKey, envKey] of CONFIG_KEYS) {
      if (cfg[jsonKey] != null && process.env[envKey] === undefined) {
        process.env[envKey] = String(cfg[jsonKey]);
      }
    }
    _loaded = true;
    _config = cfg;
    return cfg;
  } catch (e) {
    _loaded = true;
    return null;
  }
}

module.exports = { loadHubConfig };
