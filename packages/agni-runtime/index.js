'use strict';

// @agni/runtime — browser runtime
// These are ES5 IIFE files that run in the browser (Chrome 51, Android 7.0 Nougat).
// They attach to window.AGNI_SHARED and window.AGNI_SVG globals.
//
// This barrel is for Node.js tooling (build scripts, tests, manifest).
// The browser loads these files individually via <script> tags.

const path = require('path');

const RUNTIME_ROOT = __dirname;

module.exports = {
  RUNTIME_ROOT,
  resolve: (relativePath) => path.resolve(RUNTIME_ROOT, relativePath),
};
