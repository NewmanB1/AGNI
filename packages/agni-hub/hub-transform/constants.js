'use strict';

/**
 * hub-transform/constants.js
 * Shared constants for lesson serving: factory whitelists, KaTeX files, MIME types.
 * Used by serve-assets, compile, and CI verification (check-factory-order.js).
 *
 * ALLOWED_FACTORY_FILES is derived from @agni/utils/runtimeManifest.FACTORY_LOAD_ORDER
 * plus bootstrap/extra files the hub serves. Add new on-demand factories to runtimeManifest
 * only; this whitelist updates automatically.
 */

const { FACTORY_LOAD_ORDER } = require('@agni/utils/runtimeManifest');

// Bootstrap and extra files the hub serves (not in FACTORY_LOAD_ORDER).
// polyfills, binary-utils, shared-runtime: loaded before on-demand factories.
// factory-loader, navigator, edge-theta: loaded by shell/player separately.
const HUB_EXTRA_FACTORY_FILES = [
  'polyfills.js',
  'binary-utils.js',
  'shared-runtime.js',
  'factory-loader.js',
  'navigator.js',
  'edge-theta.js'
];

// Whitelist prevents directory traversal. Only files in this set can be served from /factories/.
// Derived from canonical FACTORY_LOAD_ORDER + hub extras.
const ALLOWED_FACTORY_FILES = new Set([].concat(HUB_EXTRA_FACTORY_FILES, FACTORY_LOAD_ORDER));

const ALLOWED_KATEX_FILES = new Set([
  'katex-core.css',
  'katex-fonts.css',
  'katex-symbols-algebra.css',
  'katex-symbols-trig.css',
  'katex-symbols-calculus.css',
  'katex-symbols-physics.css',
  'katex-symbols-sets.css'
]);

const MIME = {
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.html': 'text/html; charset=utf-8'
};

/** Base factory deps order: polyfills before shared-runtime (required for load order). */
const BASE_FACTORY_DEPS = [
  { file: 'polyfills.js' },
  { file: 'binary-utils.js' },
  { file: 'shared-runtime.js' },
  { file: 'integrity.js' }
];

const RUNTIME_VERSION = require('../../../package.json').version || '0.0.0';

module.exports = {
  ALLOWED_FACTORY_FILES:  ALLOWED_FACTORY_FILES,
  ALLOWED_KATEX_FILES:    ALLOWED_KATEX_FILES,
  MIME:                   MIME,
  BASE_FACTORY_DEPS:      BASE_FACTORY_DEPS,
  RUNTIME_VERSION:        RUNTIME_VERSION
};
