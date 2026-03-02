'use strict';

// @ols/schema — The Open Lesson Standard
// This package IS the standard: the JSON schema that defines valid OLS lessons,
// the threshold grammar for sensor expressions, and the validators.

module.exports = {
  lessonSchema:     require('./lesson-schema'),
  lessonValidator:  require('./lesson-validator'),
  thresholdSyntax:  require('./threshold-syntax'),
  SCHEMA_PATH:      require('path').resolve(__dirname, '../../schemas/ols.schema.json'),
};
