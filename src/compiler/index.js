'use strict';

// Compiler module — public API only.
// Consumed by builders, hub-transform, and services/compiler.

const buildLessonIR = require('./build-lesson-ir');

module.exports = {
  buildLessonIR:      buildLessonIR.buildLessonIR,
  buildLessonSidecar: buildLessonIR.buildLessonSidecar
};
