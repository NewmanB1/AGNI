'use strict';

/**
 * Mocha-compatible test API for Node 14+.
 * Mocha injects describe, it, before, after, beforeEach as globals.
 * This module re-exports them so tests can use a consistent require() pattern.
 * Used when running with: npx mocha tests/unit/*.test.js
 */
module.exports = {
  describe: global.describe,
  it: global.it,
  before: global.before,
  after: global.after,
  beforeEach: global.beforeEach,
};
