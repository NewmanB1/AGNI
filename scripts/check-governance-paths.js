#!/usr/bin/env node
'use strict';

/**
 * CI gate: governance must use configurable paths (env-config), not repo-root hardcoding.
 * See docs/GOVERNANCE-IMPROVEMENT-PLAN.md Phase 5.
 *
 * Exit 0 if pass, 1 if violation.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const GOV_DIR = path.join(ROOT, 'packages', 'agni-governance');
let failed = false;

function fail(msg) {
  console.error('FAIL  ' + msg);
  failed = true;
}

function pass(msg) {
  console.log('OK    ' + msg);
}

// Fail if any governance file uses hardcoded repo-root paths
const BAD_PATTERNS = [
  { re: /path\.join\s*\(\s*__dirname\s*,\s*['"]\.\.\/\.\.\/schemas/, msg: 'hardcoded path to ../../schemas' },
  { re: /path\.join\s*\(\s*__dirname\s*,\s*['"]\.\.\/\.\.\/data/, msg: 'hardcoded path to ../../data' }
];

const govFiles = ['policy.js', 'catalog.js', 'evaluateLessonCompliance.js', 'schema-store.js'];
govFiles.forEach(function (f) {
  const fp = path.join(GOV_DIR, f);
  if (!fs.existsSync(fp)) return;
  const content = fs.readFileSync(fp, 'utf8');
  for (var i = 0; i < BAD_PATTERNS.length; i++) {
    if (BAD_PATTERNS[i].re.test(content)) {
      fail(f + ': must use env-config, not ' + BAD_PATTERNS[i].msg);
    }
  }
});

if (!failed) pass('no hardcoded repo-root paths in governance');

// policy.js must use envConfig.governancePolicySchema
const policyPath = path.join(GOV_DIR, 'policy.js');
const policyContent = fs.readFileSync(policyPath, 'utf8');
if (!/envConfig\.governancePolicySchema/.test(policyContent)) {
  fail('policy.js must use envConfig.governancePolicySchema for schema path');
} else {
  pass('policy.js uses envConfig.governancePolicySchema');
}

// catalog.js must use envConfig.approvedCatalogSchema
const catalogPath = path.join(GOV_DIR, 'catalog.js');
const catalogContent = fs.readFileSync(catalogPath, 'utf8');
if (!/envConfig\.approvedCatalogSchema/.test(catalogContent)) {
  fail('catalog.js must use envConfig.approvedCatalogSchema for schema path');
} else {
  pass('catalog.js uses envConfig.approvedCatalogSchema');
}

// evaluateLessonCompliance.js must use envConfig.utuConstantsPath and support opts.utuConstants
const evalPath = path.join(GOV_DIR, 'evaluateLessonCompliance.js');
const evalContent = fs.readFileSync(evalPath, 'utf8');
if (!/envConfig\.utuConstantsPath/.test(evalContent)) {
  fail('evaluateLessonCompliance.js must use envConfig.utuConstantsPath');
} else if (!/opts\.utuConstants/.test(evalContent)) {
  fail('evaluateLessonCompliance.js must support opts.utuConstants for pure testing');
} else {
  pass('evaluateLessonCompliance.js uses envConfig.utuConstantsPath and opts.utuConstants');
}

if (failed) process.exit(1);
console.log('check-governance-paths: OK');
process.exit(0);
