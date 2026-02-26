'use strict';

// Governance module — policy-driven lesson compliance and cohort coverage.
// Used by hub APIs and portal for governance reporting.

var policy                  = require('./policy');
var catalog                 = require('./catalog');
var evaluateLessonCompliance = require('./evaluateLessonCompliance').evaluateLessonCompliance;
var aggregateCohortCoverage  = require('./aggregateCohortCoverage');

module.exports = {
  loadPolicy:                policy.loadPolicy,
  savePolicy:                policy.savePolicy,
  validatePolicy:            policy.validatePolicy,
  loadCatalog:               catalog.loadCatalog,
  saveCatalog:               catalog.saveCatalog,
  updateCatalog:             catalog.updateCatalog,
  importCatalog:             catalog.importCatalog,
  validateCatalog:           catalog.validateCatalog,
  evaluateLessonCompliance:  evaluateLessonCompliance,
  aggregateCohortCoverage:   aggregateCohortCoverage.aggregateCohortCoverage,
  MASTERY_THRESHOLD:         aggregateCohortCoverage.MASTERY_THRESHOLD
};
