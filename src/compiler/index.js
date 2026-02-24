'use strict';

// Compiler module — public API only.
// Consumed by builders, hub-transform, and services/compiler.

var buildLessonIR = require('./buildLessonIR');

module.exports = {
  buildLessonIR:      buildLessonIR.buildLessonIR,
  buildLessonSidecar: buildLessonIR.buildLessonSidecar
};
