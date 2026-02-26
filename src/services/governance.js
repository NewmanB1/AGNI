'use strict';

// Governance service — top-down API for lesson compliance and cohort coverage.
// Consumed by hub routes and portal; policy is JSON-driven.

var path = require('path');
var governance = require('../governance');

var DEFAULT_POLICY_PATH = process.env.AGNI_GOVERNANCE_POLICY || path.join(__dirname, '../../data', 'governance_policy.json');

var _policyCache = null;

/**
 * Load policy (cached). Uses AGNI_GOVERNANCE_POLICY path or default data/governance_policy.json.
 *
 * @param  {string} [filePath]
 * @returns {object}
 */
function loadPolicy(filePath) {
  var p = filePath || DEFAULT_POLICY_PATH;
  if (_policyCache && !filePath) return _policyCache;
  var policy = governance.loadPolicy(p);
  if (!filePath) _policyCache = policy;
  return policy;
}

/**
 * Save policy. Clears cache so next loadPolicy() reads fresh.
 *
 * @param  {object} policy
 * @param  {string} [filePath]
 * @returns {{ ok: boolean, error?: string }}
 */
function savePolicy(policy, filePath) {
  var p = filePath || DEFAULT_POLICY_PATH;
  var result = governance.savePolicy(policy, p);
  if (result.ok) _policyCache = null;
  return result;
}

/**
 * Evaluate a lesson sidecar against the current policy.
 *
 * @param  {object} sidecar
 * @param  {object} [policy]  Override; otherwise uses loadPolicy().
 * @returns {{ status: string, issues: string[] }}
 */
function evaluateLessonCompliance(sidecar, policy) {
  return governance.evaluateLessonCompliance(sidecar, policy || loadPolicy());
}

/**
 * Aggregate cohort coverage by UTU and skill.
 *
 * @param  {Array<object>} lessonIndex
 * @param  {object}        masterySummary  { students: { [pseudoId]: { [skillId]: number } } }
 * @param  {object}        [policy]
 * @returns {object}
 */
function aggregateCohortCoverage(lessonIndex, masterySummary, policy) {
  return governance.aggregateCohortCoverage(lessonIndex, masterySummary, policy || loadPolicy());
}

module.exports = {
  loadPolicy:               loadPolicy,
  savePolicy:               savePolicy,
  evaluateLessonCompliance: evaluateLessonCompliance,
  aggregateCohortCoverage:  aggregateCohortCoverage,
  loadCatalog:              governance.loadCatalog,
  updateCatalog:            governance.updateCatalog,
  importCatalog:            governance.importCatalog,
  saveCatalog:              governance.saveCatalog
};
