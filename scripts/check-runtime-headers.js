#!/usr/bin/env node
'use strict';

/**
 * CI gate: verify packages/agni-runtime .js files use canonical path in first-line comment.
 * Stale: // src/runtime/...
 * Expected: // packages/agni-runtime/...
 *
 * Exit 0 on pass, exit 1 on any violation.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RUNTIME_DIR = path.join(ROOT, 'packages', 'agni-runtime');
const STALE_PATTERN = /^\/\/\s*src\/runtime\//;

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
walk(RUNTIME_DIR, files);

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const firstLine = content.split('\n')[0];
  if (STALE_PATTERN.test(firstLine)) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    violations.push(rel);
  }
}

if (violations.length > 0) {
  console.error('FAIL  Runtime files must use canonical path in first-line comment (packages/agni-runtime/...).\n');
  console.error('Stale src/runtime/ headers found:\n');
  violations.forEach(function (r) { console.error('  ' + r); });
  process.exit(1);
}

console.log('check-runtime-headers: OK');
process.exit(0);
