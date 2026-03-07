'use strict';

const fs = require('fs');

/**
 * Verifies that AGNI_DATA_DIR exists at startup.
 * Fails fast with a clear message if missing — avoids ENOENT deep in requests.
 *
 * @param {object} config - envConfig (or object with dataDir)
 * @throws {Error} when dataDir does not exist
 */
function ensureDataDirExists(config) {
  const dataDir = config && config.dataDir;
  if (!dataDir) return;
  if (fs.existsSync(dataDir)) return;
  throw new Error(
    'AGNI_DATA_DIR does not exist: ' + dataDir + '. ' +
    'Run before first start: AGNI_DATA_DIR=' + dataDir + ' node scripts/init-data.js'
  );
}

module.exports = { ensureDataDirExists };
