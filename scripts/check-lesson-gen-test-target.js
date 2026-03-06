#!/usr/bin/env node
'use strict';

/**
 * CI gate: generate-lesson.test.js must require @agni/lesson-gen, not scripts/generate-lesson.
 * Ensures tests exercise the canonical package.
 * Exit 0 if pass, 1 if violation.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TEST_FILE = path.join(ROOT, 'tests', 'unit', 'generate-lesson.test.js');

const BAD_PATTERN = /require\s*\(\s*['"][^'"]*scripts\/generate-lesson['"]\s*\)/;

if (!fs.existsSync(TEST_FILE)) {
  console.log('check-lesson-gen-test-target: OK (test file not present)');
  process.exit(0);
}

const content = fs.readFileSync(TEST_FILE, 'utf8');
if (BAD_PATTERN.test(content)) {
  console.error('check-lesson-gen-test-target: FAIL');
  console.error('generate-lesson.test.js must require @agni/lesson-gen, not scripts/generate-lesson.\n');
  process.exit(1);
}

console.log('check-lesson-gen-test-target: OK');
process.exit(0);
