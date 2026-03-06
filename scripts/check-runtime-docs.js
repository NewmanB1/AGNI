#!/usr/bin/env node
'use strict';

/**
 * CI gate: packages/agni-runtime README must not reference src/runtime or src/utils
 * as canonical paths. Use packages/agni-runtime, @agni/plugins, @agni/utils.
 * Exit 0 on pass, 1 on violation.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const README = path.join(ROOT, 'packages', 'agni-runtime', 'README.md');

const BAD_PATTERNS = [
  { re: /src\/runtime\//, msg: 'src/runtime/' },
  { re: /src\/utils\//, msg: 'src/utils/' }
];

if (!fs.existsSync(README)) {
  console.log('check-runtime-docs: OK (README not found)');
  process.exit(0);
}

const content = fs.readFileSync(README, 'utf8');
const violations = [];

for (const { re, msg } of BAD_PATTERNS) {
  if (re.test(content)) {
    violations.push(msg);
  }
}

if (violations.length > 0) {
  console.error('check-runtime-docs: FAIL');
  console.error('packages/agni-runtime/README.md must not reference ' + violations.join(', ') + ' as canonical paths.');
  console.error('Use packages/agni-runtime/, @agni/plugins, @agni/utils.\n');
  process.exit(1);
}

console.log('check-runtime-docs: OK');
process.exit(0);
