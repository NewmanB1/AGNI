'use strict';

// @ols/compiler — OLS lesson compiler (Phase 1: canonical ownership)
// Pipeline: rawYaml → parse → validate(schema) → buildIR → buildArtifact

module.exports = {
  compiler:         require('./services/compiler'),
  buildLessonIR:    require('./compiler/build-lesson-ir'),
  featureInference: require('@agni/utils/feature-inference'),
  builders: {
    html:        require('./builders/html'),
    native:      require('./builders/native'),
    yamlPacket:  require('./builders/yaml-packet'),
  },
};
