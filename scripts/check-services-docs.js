#!/usr/bin/env node
'use strict';

/**
 * CI gate: documentation must reference @agni/services as canonical.
 * Fail if key docs reference src/services/ as the canonical API.
 * Exit 0 if pass, 1 if any violation.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Must contain @agni/services
const REQUIRED = [
  { file: 'docs/playbooks/hub.md', pattern: /@agni\/services/ },
  { file: 'docs/CONVENTIONS.md', pattern: /@agni\/services/ }
];

// Must not reference src/services/ as canonical (package READMEs, AGENTS.md)
const BAD_SRC_SERVICES = [
  'AGENTS.md',
  'packages/agni-services/README.md',
  'packages/agni-engine/README.md'
];

const SRC_SERVICES_RE = /src\/services\//;

const missing = [];
const badRefs = [];

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

for (const file of BAD_SRC_SERVICES) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) continue;
  const content = fs.readFileSync(p, 'utf8');
  if (SRC_SERVICES_RE.test(content)) {
    badRefs.push(file);
  }
}

if (missing.length > 0) {
  console.error('check-services-docs: FAIL\n');
  missing.forEach(({ file, reason }) => {
    console.error('  ' + file + ': ' + reason);
  });
  process.exit(1);
}

if (badRefs.length > 0) {
  console.error('check-services-docs: FAIL\n');
  console.error('Docs must not reference src/services/ as canonical. Use @agni/services.\n');
  badRefs.forEach((f) => console.error('  ' + f));
  process.exit(1);
}

console.log('check-services-docs: OK');
process.exit(0);
