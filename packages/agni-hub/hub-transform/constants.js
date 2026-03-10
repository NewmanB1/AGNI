'use strict';

/**
 * hub-transform/constants.js
 * Shared constants for lesson serving: factory whitelists, KaTeX files, MIME types.
 * Used by serve-assets, compile, and CI verification (check-factory-order.js).
 */

// Whitelist prevents directory traversal. Only files in this set can be served from /factories/.
var ALLOWED_FACTORY_FILES = new Set([
  'polyfills.js',
  'binary-utils.js',
  'shared-runtime.js',
  'a11y.js',
  'narration.js',
  'gate-renderer.js',
  'integrity.js',
  'checkpoint.js',
  'frustration.js',
  'completion.js',
  'sensor-bridge.js',
  'svg-stage.js',
  'svg-helpers.js',
  'svg-factories.js',
  'svg-factories-dynamic.js',
  'svg-factories-geometry.js',
  'svg-registry.js',
  'table-renderer.js',
  'factory-loader.js',
  'navigator.js',
  'edge-theta.js'
]);

var ALLOWED_KATEX_FILES = new Set([
  'katex-core.css',
  'katex-fonts.css',
  'katex-symbols-algebra.css',
  'katex-symbols-trig.css',
  'katex-symbols-calculus.css',
  'katex-symbols-physics.css',
  'katex-symbols-sets.css'
]);

var MIME = {
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.html': 'text/html; charset=utf-8'
};

/** Base factory deps order: polyfills before shared-runtime (required for load order). */
var BASE_FACTORY_DEPS = [
  { file: 'polyfills.js' },
  { file: 'binary-utils.js' },
  { file: 'shared-runtime.js' },
  { file: 'integrity.js' }
];

var RUNTIME_VERSION = require('../../../package.json').version || '0.0.0';

module.exports = {
  ALLOWED_FACTORY_FILES:  ALLOWED_FACTORY_FILES,
  ALLOWED_KATEX_FILES:    ALLOWED_KATEX_FILES,
  MIME:                   MIME,
  BASE_FACTORY_DEPS:      BASE_FACTORY_DEPS,
  RUNTIME_VERSION:        RUNTIME_VERSION
};
