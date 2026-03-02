'use strict';

// @agni/hub — Village Hub server
// The top of the dependency tree: depends on all other packages.
// Files live in hub-tools/, server/, and select src/services/ files
// during the migration period.

module.exports = {
  theta:          require('../../hub-tools/theta'),
  sentry:         require('../../hub-tools/sentry'),
  sync:           require('../../hub-tools/sync'),
  hubTransform:   require('../../server/hub-transform'),
  accounts:       require('../../src/services/accounts'),
  author:         require('../../src/services/author'),
  lessonChain:    require('../../src/services/lesson-chain'),
  lessonAssembly: require('../../src/services/lesson-assembly'),
};
