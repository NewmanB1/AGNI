'use strict';

// Governance module — policy-driven lesson compliance and cohort coverage.
// Used by hub APIs and portal for governance reporting.

var policy                  = require('./policy');
var evaluateLessonCompliance = require('./evaluateLessonCompliance').evaluateLessonCompliance;
var aggregateCohortCoverage  = require('./aggregateCohortCoverage');

module.exports = {
  loadPolicy:                policy.loadPolicy,
  evaluateLessonCompliance:  evaluateLessonCompliance,
  aggregateCohortCoverage:   aggregateCohortCoverage.aggregateCohortCoverage,
  MASTERY_THRESHOLD:         aggregateCohortCoverage.MASTERY_THRESHOLD
};
