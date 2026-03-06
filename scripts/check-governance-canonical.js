#!/usr/bin/env node
'use strict';

/**
 * CI gate: governance tests must require @agni/governance, not src/governance.
 * See docs/GOVERNANCE-IMPROVEMENT-PLAN.md Phase 1.
 *
 * Exit 0 if pass, 1 if violation.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TEST_FILE = path.join(ROOT, 'tests', 'unit', 'governance.test.js');

const content = fs.readFileSync(TEST_FILE, 'utf8');

// Fail if tests require src/governance
if (/require\s*\(\s*['"](?:\.\.\/)*src\/governance\//.test(content) ||
    /require\s*\(\s*['"]\.\.\/\.\.\/src\/governance\//.test(content)) {
  console.error('FAIL  governance.test.js must require @agni/governance, not src/governance');
  process.exit(1);
}

// Fail if tests do not require @agni/governance
if (!/require\s*\(\s*['"]@agni\/governance['"]\s*\)/.test(content)) {
  console.error('FAIL  governance.test.js must require @agni/governance');
  process.exit(1);
}

console.log('OK    governance.test.js uses canonical @agni/governance');
process.exit(0);
