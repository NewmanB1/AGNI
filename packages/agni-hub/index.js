'use strict';

// @agni/hub - Village Hub server
// The top of the dependency tree: depends on all other packages.

module.exports = {
  theta:          require('./theta'),
  sentry:         require('./sentry'),
  sync:           require('./sync'),
  shared:         require('./shared'),
  hubTransform:   require('./hub-transform'),
  accounts:       require('@agni/services/accounts'),
  author:         require('@agni/services/author'),
  lessonChain:    require('@agni/services/lesson-chain'),
  lessonAssembly: require('@agni/services/lesson-assembly'),
};
