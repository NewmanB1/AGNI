#!/usr/bin/env node
'use strict';

/**
 * Phase 3: Verify docs do not reference deleted paths hub-tools/context or hub-tools/routes.
 * Those paths were moved to packages/agni-hub/. Fails if any match in docs/ (excluding archive).
 *
 * Exit 0 pass, 1 fail.
 */

const fs = require('fs');
const path = require('path');
const { walkDir } = require('@agni/utils/io');

const ROOT = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(ROOT, 'docs');

const BAD_PATTERNS = [
  /hub-tools\/context\//,
  /hub-tools\/routes\//
];

// Meta-docs that describe the migration (mention old paths by design); PHASE-3 is in archive (not scanned)
const SKIP_FILES = [];

const files = walkDir(DOCS_DIR, { extensions: ['.md'], skipArchive: true });
const violations = [];
for (const f of files) {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/');
  if (SKIP_FILES.some((s) => rel === s || rel.endsWith(s))) continue;
  const content = fs.readFileSync(f, 'utf8');
  for (const pat of BAD_PATTERNS) {
    if (pat.test(content)) {
      violations.push({ file: rel, pattern: pat.toString() });
      break;
    }
  }
}
// Also scan packages/agni-hub for stale path references in comments
const HUB_DIR = path.join(ROOT, 'packages', 'agni-hub');
const HUB_BAD_PATTERNS = [/hub-tools\//, /server\/hub-transform/, /server\/theta/];
const hubFiles = walkDir(HUB_DIR);
for (const f of hubFiles) {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/');
  const content = fs.readFileSync(f, 'utf8');
  for (const pat of HUB_BAD_PATTERNS) {
    if (pat.test(content)) {
      violations.push({ file: rel, pattern: 'stale hub-tools/ or server/ path' });
      break;
    }
  }
}

if (violations.length > 0) {
  console.error('Docs and hub package must not reference hub-tools/ or server/. Use packages/agni-hub/.\n');
  violations.forEach((v) => console.error('  ', v.file));
  process.exit(1);
}
console.log('check-hub-docs: OK');
process.exit(0);
