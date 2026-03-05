#!/usr/bin/env node
'use strict';

/**
 * CI gate: unit tests for services must require @agni/services, not src/services.
 * Ensures tests exercise the canonical package.
 * Exit 0 if pass, 1 if any violation.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TEST_FILES = [
  'tests/unit/accounts.test.js',
  'tests/unit/author.test.js',
  'tests/unit/lessonSchema.test.js',
  'tests/unit/compiler-service.test.js',
  'tests/unit/lessonChain.test.js'
];

const SRC_SERVICES_PATTERN = /require\s*\(\s*['"]\.\.\/\.\.\/src\/services\//;

const violations = [];

for (const rel of TEST_FILES) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) continue;
  const content = fs.readFileSync(file, 'utf8');
  if (SRC_SERVICES_PATTERN.test(content)) {
    violations.push({ file: rel, reason: 'requires src/services/ instead of @agni/services' });
  }
}

if (violations.length > 0) {
  console.error('check-services-test-targets: FAIL\n');
  console.error('Unit tests must require @agni/services, not src/services/.\n');
  violations.forEach(({ file, reason }) => {
    console.error('  ' + file + ': ' + reason);
  });
  process.exit(1);
}

console.log('check-services-test-targets: OK');
process.exit(0);
