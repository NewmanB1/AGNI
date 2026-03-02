'use strict';

// @ols/compiler — OLS lesson compiler
// Pipeline: rawYaml → parse → validate(schema) → buildIR → buildArtifact
// Files live in src/compiler/, src/services/compiler.js, and src/builders/
// during the migration period.

module.exports = {
  compiler:         require('../../src/services/compiler'),
  buildLessonIR:    require('../../src/compiler'),
  featureInference: require('../../src/utils/feature-inference'),
  builders: {
    html:        require('../../src/builders/html'),
    native:      require('../../src/builders/native'),
    yamlPacket:  require('../../src/builders/yaml-packet'),
  },
};
