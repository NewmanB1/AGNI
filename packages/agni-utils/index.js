'use strict';

// @agni/utils — shared utilities barrel export
// Files live in src/utils/ during the migration period.
// Use require('@agni/utils/logger'), require('@agni/utils/env-config'), etc.
// for individual modules, or require('@agni/utils') for the barrel.

module.exports = {
  logger:           require('../../src/utils/logger'),
  envConfig:        require('../../src/utils/env-config'),
  envValidate:      require('../../src/utils/env-validate'),
  hubConfig:        require('../../src/utils/hub-config'),
  jsonStore:        require('../../src/utils/json-store'),
  fileLock:         require('../../src/utils/file-lock'),
  featureFlags:     require('../../src/utils/feature-flags'),
  crypto:           require('../../src/utils/crypto'),
  csp:              require('../../src/utils/csp'),
  io:               require('../../src/utils/io'),
  binary:           require('../../src/utils/binary'),
  httpHelpers:      require('../../src/utils/http-helpers'),
  rateLimiter:      require('../../src/utils/rate-limiter'),
  router:           require('../../src/utils/router'),
  streak:           require('../../src/utils/streak'),
  archetypeMatch:   require('../../src/utils/archetype-match'),
  runtimeManifest:  require('../../src/utils/runtimeManifest'),
  katexCssBuilder:  require('../../src/utils/katex-css-builder'),
};
