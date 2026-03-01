'use strict';

// Governance service — top-down API for lesson compliance and cohort coverage.
// Consumed by hub routes and portal; policy is JSON-driven.
// Adds caching and default-policy injection over the raw governance module.

const governance = require('../governance');
const envConfig = require('../utils/env-config');

const DEFAULT_POLICY_PATH = envConfig.governancePolicy;

let _policyCache = null;

function loadPolicy(filePath) {
  const p = filePath || DEFAULT_POLICY_PATH;
  if (_policyCache && !filePath) return _policyCache;
  const policy = governance.loadPolicy(p);
  if (!filePath) _policyCache = policy;
  return policy;
}

function savePolicy(policy, filePath) {
  const p = filePath || DEFAULT_POLICY_PATH;
  const result = governance.savePolicy(policy, p);
  if (result.ok) _policyCache = null;
  return result;
}

function evaluateLessonCompliance(sidecar, policy) {
  return governance.evaluateLessonCompliance(sidecar, policy || loadPolicy());
}

function aggregateCohortCoverage(lessonIndex, masterySummary, policy) {
  return governance.aggregateCohortCoverage(lessonIndex, masterySummary, policy || loadPolicy());
}

module.exports = {
  loadPolicy,
  savePolicy,
  evaluateLessonCompliance,
  aggregateCohortCoverage,
  validatePolicy:   governance.validatePolicy,
  loadCatalog:      governance.loadCatalog,
  updateCatalog:    governance.updateCatalog,
  importCatalog:    governance.importCatalog,
  saveCatalog:      governance.saveCatalog,
  validateCatalog:  governance.validateCatalog
};
