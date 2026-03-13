'use strict';

/**
 * Runs before integration tests. Sets AGNI_DATA_DIR and AGNI_HUB_API_KEY
 * so the hub uses an isolated temp dir and shared key before any module loads.
 * Prevents lock contention on data/creator-accounts.json and 401 from stale hub key.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

const dataDir = path.join(os.tmpdir(), 'agni-integration-' + Date.now());
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(path.join(dataDir, 'serve'), { recursive: true });
fs.mkdirSync(path.join(dataDir, 'yaml'), { recursive: true });

process.env.AGNI_DATA_DIR = dataDir;
process.env.AGNI_HUB_API_KEY = process.env.AGNI_HUB_API_KEY || 'integration-test-hub-key';
