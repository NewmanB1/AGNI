#!/usr/bin/env node
'use strict';

/**
 * CI gate: verify packages/agni-engine and packages/agni-utils .js files do not
 * reference stale src/ paths in header comments.
 *
 * Stale: // src/engine/..., // src/utils/..., See src/engine/..., See src/utils/...
 * Expected: packages/agni-engine/..., packages/agni-utils/...
 *
 * Exit 0 on pass, exit 1 on any violation.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIRS = [
  path.join(ROOT, 'packages', 'agni-engine'),
  path.join(ROOT, 'packages', 'agni-utils')
];

/** Matches comment lines that reference obsolete src/ paths. */
const STALE_PATTERN = /\/\/.*src\/(engine|utils)\//;

const violations = [];

function walk(dir, out) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir);
  for (const name of entries) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (name !== 'node_modules') walk(full, out);
    } else if (name.endsWith('.js')) {
      out.push(full);
    }
  }
}

const files = [];
for (const dir of DIRS) {
  walk(dir, files);
}

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  // Check first 20 lines (typical header block)
  const headerLines = lines.slice(0, 20);
  for (let i = 0; i < headerLines.length; i++) {
    if (STALE_PATTERN.test(headerLines[i])) {
      const rel = path.relative(ROOT, file).replace(/\\/g, '/');
      violations.push({ file: rel, line: i + 1, content: headerLines[i].trim() });
      break; // One violation per file
    }
  }
}

if (violations.length > 0) {
  console.error('FAIL  Engine and utils files must not reference src/engine or src/utils in headers.\n');
  console.error('Stale src/ headers found:\n');
  violations.forEach(function (v) {
    console.error('  ' + v.file + ':' + v.line + '  ' + v.content);
  });
  process.exit(1);
}

console.log('check-package-headers: OK');
process.exit(0);
