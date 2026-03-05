'use strict';

/**
 * @agni/services — top-down API for hub routes.
 * Accounts, authoring, governance, LMS, lesson-chain, lesson-assembly.
 */

module.exports = {
  accounts:       require('./accounts'),
  author:         require('./author'),
  governance:     require('./governance'),
  lms:            require('./lms'),
  lessonChain:    require('./lesson-chain'),
  lessonAssembly: require('./lesson-assembly'),
  compiler:       require('./compiler'),
  lessonSchema:   require('./lesson-schema')
};
