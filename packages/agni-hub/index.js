'use strict';

// @agni/hub - Village Hub server
// The top of the dependency tree: depends on all other packages.

module.exports = {
  theta:          require('./theta'),
  sentry:         require('./sentry'),
  sync:           require('./sync'),
  shared:         require('./shared'),
  hubTransform:   require('../../server/hub-transform'),
  accounts:       require('../../src/services/accounts'),
  author:         require('../../src/services/author'),
  lessonChain:    require('../../src/services/lesson-chain'),
  lessonAssembly: require('../../src/services/lesson-assembly'),
};
