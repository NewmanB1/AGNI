'use strict';

/**
 * lesson-server/factory-manifest.js
 * Hub-signed factory manifest for supply-chain verification (Phase 2 P0 #5).
 * Lists all authorized factory resources with SRI; device verifies signature
 * before loading any factory.
 */

const fs = require('fs');

const { canonicalJSON, computeSRI, signManifestPayload } = require('@agni/utils/crypto');
const envConfig = require('@agni/utils/env-config');
const { resolveFactoryPath } = require('@agni/utils/runtimeManifest');
const constants = require('./constants');

const FACTORY_DIR = envConfig.factoryDir;
const ALLOWED_FACTORY_FILES = constants.ALLOWED_FACTORY_FILES;
const RUNTIME_VERSION = constants.RUNTIME_VERSION;

let _cached = null;
let _cacheMtime = 0;

/**
 * Build and optionally sign the factory manifest.
 * @param {{ privateKeyPath?: string }} [opts]
 * @returns {{ version: string, factories: Array<{file:string,version:string,integrity:string}>, timestamp: string, signature?: string }}
 */
function buildFactoryManifest(opts) {
  opts = opts || {};
  const factories = [];

  for (const file of ALLOWED_FACTORY_FILES) {
    try {
      const srcPath = resolveFactoryPath(FACTORY_DIR, file);
      if (!fs.existsSync(srcPath)) continue;
      const content = fs.readFileSync(srcPath, 'utf8');
      const integrity = computeSRI(content);
      factories.push({
        file:      file,
        version:   RUNTIME_VERSION,
        integrity: integrity
      });
    } catch {
      // Skip files we can't read
    }
  }

  const manifest = {
    version:   RUNTIME_VERSION,
    factories: factories,
    timestamp: new Date().toISOString()
  };

  const privateKeyPath = opts.privateKeyPath || envConfig.privateKeyPath;
  if (privateKeyPath && fs.existsSync(privateKeyPath)) {
    const payload = canonicalJSON(manifest);
    const signature = signManifestPayload(payload, privateKeyPath);
    if (signature) manifest.signature = signature;
  }

  return manifest;
}

/**
 * Get cached manifest, rebuilding if factory dir changed.
 * @param {{ privateKeyPath?: string }} [opts]
 * @returns {object}
 */
function getFactoryManifest(opts) {
  const dirStat = fs.statSync(FACTORY_DIR);
  const mtime = dirStat.mtimeMs;
  if (_cached && _cacheMtime === mtime) return _cached;
  _cached = buildFactoryManifest(opts);
  _cacheMtime = mtime;
  return _cached;
}

module.exports = {
  buildFactoryManifest: buildFactoryManifest,
  getFactoryManifest:   getFactoryManifest
};
