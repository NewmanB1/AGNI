#!/usr/bin/env node
'use strict';

/**
 * CI gate: hub-related tests must require @agni/hub or packages/agni-hub, not hub-tools/ or server/.
 * Ensures tests exercise the canonical package.
 * Exit 0 if pass, 1 if any violation.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TEST_FILES = [
  'tests/unit/theta-api.test.js',
  'tests/unit/regressions.test.js',
  'tests/unit/hub-auth-regression.test.js',
  'tests/unit/sentry.test.js',
  'tests/unit/extended-coverage.test.js',
  'tests/integration/wiring-smoke.test.js',
  'tests/integration/frustration-theta.test.js',
  'tests/integration/feature-flags.test.js',
  'tests/integration/checkpoint-sync.test.js',
  'tests/integration/package-smoke.test.js',
  'tests/contract-hub-api.js',
  'tests/graph-verification-test.js'
];

const BAD_PATTERNS = [
  /require\s*\(\s*['"](?:\.\.\/)*hub-tools\//,
  /require\s*\(\s*['"](?:\.\.\/)*server\//
];

const violations = [];

for (const rel of TEST_FILES) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) continue;
  const content = fs.readFileSync(file, 'utf8');
  for (const pat of BAD_PATTERNS) {
    if (pat.test(content)) {
      violations.push({ file: rel, reason: 'requires hub-tools/ or server/ instead of packages/agni-hub' });
      break;
    }
  }
}

if (violations.length > 0) {
  console.error('check-hub-test-targets: FAIL\n');
  console.error('Hub tests must require @agni/hub or packages/agni-hub, not hub-tools/ or server/.\n');
  violations.forEach(({ file, reason }) => {
    console.error('  ' + file + ': ' + reason);
  });
  process.exit(1);
}

console.log('check-hub-test-targets: OK');
process.exit(0);
