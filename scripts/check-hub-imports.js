#!/usr/bin/env node
'use strict';

/**
 * Phase 3: Verify tests do not require hub-tools/context or hub-tools/routes
 * (those paths were moved to packages/agni-hub). Tests should use @agni/hub
 * or packages/agni-hub/ paths.
 *
 * Exit 0 pass, 1 fail.
 */

const fs = require('fs');
const path = require('path');
const { walkDir } = require('@agni/utils/io');

const ROOT = path.resolve(__dirname, '..');
const TESTS_DIR = path.join(ROOT, 'tests');

const BAD_PATTERNS = [
  /require\s*\(\s*['"].*hub-tools\/context/,
  /require\s*\(\s*['"].*hub-tools\/routes/
];

const files = walkDir(TESTS_DIR);
const violations = [];
for (const f of files) {
  const content = fs.readFileSync(f, 'utf8');
  for (const pat of BAD_PATTERNS) {
    if (pat.test(content)) {
      violations.push({ file: path.relative(ROOT, f).replace(/\\/g, '/'), pattern: pat.toString() });
      break;
    }
  }
}
if (violations.length > 0) {
  console.error('Tests must not require hub-tools/context or hub-tools/routes. Use @agni/hub or packages/agni-hub/.\n');
  violations.forEach((v) => console.error('  ', v.file));
  process.exit(1);
}
console.log('check-hub-imports: OK');
process.exit(0);
