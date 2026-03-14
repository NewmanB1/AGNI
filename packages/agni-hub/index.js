'use strict';

// @agni/hub - Village Hub server
// The top of the dependency tree: depends on all other packages.

const pathfinder = require('./pathfinder');
module.exports = {
  pathfinder,
  theta: pathfinder, // alias for backward compat
  telemetryEngine: require('./telemetry-engine'),
  sync:           require('./sync'),
  mesh:           require('./mesh'),
  shared:         require('./shared'),
  lessonServer:   require('./lesson-server'),
  accounts:       require('@agni/services/accounts'),
  author:         require('@agni/services/author'),
  lessonChain:    require('@agni/services/lesson-chain'),
  lessonAssembly: require('@agni/services/lesson-assembly'),
};
