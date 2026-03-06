#!/usr/bin/env node
'use strict';

/**
 * CI gate: governance README must document correct API (sidecar, policy) and result shape { status, issues }.
 * See docs/GOVERNANCE-IMPROVEMENT-PLAN.md Phase 2.
 *
 * Exit 0 if pass, 1 if violation.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const README = path.join(ROOT, 'packages', 'agni-governance', 'README.md');

const content = fs.readFileSync(README, 'utf8');

// Fail if Usage shows wrong argument order: (policy, sidecar)
if (/evaluateLessonCompliance\s*\(\s*policy\s*,\s*sidecar\s*\)/.test(content)) {
  console.error('FAIL  README: evaluateLessonCompliance must be (sidecar, policy), not (policy, sidecar)');
  process.exit(1);
}

// Fail if Usage shows wrong result shape
if (/result\.compliant/.test(content) || /result\.violations/.test(content) || /result\.warnings/.test(content)) {
  console.error('FAIL  README: result shape must be { status, issues }, not { compliant, violations, warnings }');
  process.exit(1);
}

// Must document correct signature and shape
if (!/evaluateLessonCompliance\s*\(\s*sidecar\s*,\s*policy\s*\)/.test(content)) {
  console.error('FAIL  README: must document evaluateLessonCompliance(sidecar, policy)');
  process.exit(1);
}

if (!/result\.status/.test(content) || !/result\.issues/.test(content)) {
  console.error('FAIL  README: must document result.status and result.issues');
  process.exit(1);
}

console.log('OK    governance README documents correct API');
process.exit(0);
