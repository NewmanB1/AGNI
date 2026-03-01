'use strict';

// Services layer — top-down entry points for compiler, LMS, governance, authoring, and lesson assembly.
// Use these instead of requiring compiler/engine/governance internals directly.

const compiler       = require('./compiler');
const lms            = require('./lms');
const governance     = require('./governance');
const author         = require('./author');
const lessonAssembly = require('./lessonAssembly');
const lessonSchema    = require('./lessonSchema');
const accounts       = require('./accounts');
const lessonChain    = require('./lessonChain');

module.exports = {
  compiler:       compiler,
  lms:            lms,
  governance:     governance,
  author:         author,
  lessonAssembly: lessonAssembly,
  lessonSchema:   lessonSchema,
  accounts:       accounts,
  lessonChain:    lessonChain
};
