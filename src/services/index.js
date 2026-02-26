'use strict';

// Services layer — top-down entry points for compiler, LMS, governance, authoring, and lesson assembly.
// Use these instead of requiring compiler/engine/governance internals directly.

var compiler       = require('./compiler');
var lms            = require('./lms');
var governance     = require('./governance');
var author         = require('./author');
var lessonAssembly = require('./lessonAssembly');
var lessonSchema    = require('./lessonSchema');

module.exports = {
  compiler:       compiler,
  lms:            lms,
  governance:     governance,
  author:         author,
  lessonAssembly: lessonAssembly,
  lessonSchema:   lessonSchema
};
