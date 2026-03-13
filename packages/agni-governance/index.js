'use strict';

// Governance module — policy-driven lesson compliance and cohort coverage.
// Used by hub APIs and portal for governance reporting.

const policy                  = require('./policy');
const catalog                 = require('./catalog');
const evaluateLessonCompliance = require('./evaluateLessonCompliance').evaluateLessonCompliance;
const lessonPassesUtuTargets   = require('./evaluateLessonCompliance').lessonPassesUtuTargets;
const aggregateCohortCoverage  = require('./aggregateCohortCoverage');

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
  lessonPassesUtuTargets:    lessonPassesUtuTargets,
  aggregateCohortCoverage:   aggregateCohortCoverage.aggregateCohortCoverage,
  MASTERY_THRESHOLD:         aggregateCohortCoverage.MASTERY_THRESHOLD
};
