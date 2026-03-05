#!/usr/bin/env node
'use strict';

/**
 * CI gate: documentation must reference @agni/services as canonical.
 * Exit 0 if pass, 1 if any required reference is missing.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REQUIRED = [
  { file: 'docs/playbooks/hub.md', pattern: /@agni\/services/ },
  { file: 'docs/CONVENTIONS.md', pattern: /@agni\/services/ }
];

const missing = [];

for (const { file, pattern } of REQUIRED) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) {
    missing.push({ file, reason: 'file not found' });
    continue;
  }
  const content = fs.readFileSync(p, 'utf8');
  if (!pattern.test(content)) {
    missing.push({ file, reason: 'missing @agni/services reference' });
  }
}

if (missing.length > 0) {
  console.error('check-services-docs: FAIL\n');
  missing.forEach(({ file, reason }) => {
    console.error('  ' + file + ': ' + reason);
  });
  process.exit(1);
}

console.log('check-services-docs: OK');
process.exit(0);
