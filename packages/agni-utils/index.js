'use strict';

// @agni/utils — shared utilities barrel export (Phase 1: canonical ownership)
// All modules live in packages/agni-utils/.
// Use require('@agni/utils/logger'), require('@agni/utils/env-config'), etc.
// for individual modules, or require('@agni/utils') for the barrel.

module.exports = {
  logger:           require('./logger'),
  envConfig:        require('./env-config'),
  envRanges:        require('./env-ranges'),
  envValidate:      require('./env-validate'),
  hubConfig:        require('./hub-config'),
  jsonStore:        require('./json-store'),
  fileLock:         require('./file-lock'),
  featureFlags:     require('./feature-flags'),
  crypto:           require('./crypto'),
  csp:              require('./csp'),
  io:               require('./io'),
  binary:           require('./binary'),
  httpHelpers:      require('./http-helpers'),
  rateLimiter:      require('./rate-limiter'),
  router:           require('./router'),
  streak:           require('./streak'),
  archetypeMatch:   require('./archetype-match'),
  runtimeManifest:  require('./runtimeManifest'),
  katexCssBuilder:  require('./katex-css-builder'),
  skillDagValidate: require('./skill-dag-validate'),
};
