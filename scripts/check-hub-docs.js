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

const ROOT = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(ROOT, 'docs');

const BAD_PATTERNS = [
  /hub-tools\/context\//,
  /hub-tools\/routes\//
];

// Meta-docs that describe the migration (mention old paths by design)
const SKIP_FILES = ['docs/PHASE-3-REMEDIATION-PLAN.md'];

function walkDir(dir, out, skipArchive) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules') continue;
      if (skipArchive && e.name === 'archive') continue;
      walkDir(full, out, skipArchive);
    } else if (e.name.endsWith('.md')) {
      out.push(full);
    }
  }
}

const files = [];
walkDir(DOCS_DIR, files, true);
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
if (violations.length > 0) {
  console.error('Docs must not reference hub-tools/context/ or hub-tools/routes/. Use packages/agni-hub/.\n');
  violations.forEach((v) => console.error('  ', v.file));
  process.exit(1);
}
console.log('check-hub-docs: OK');
process.exit(0);
