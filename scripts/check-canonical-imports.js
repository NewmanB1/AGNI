#!/usr/bin/env node
'use strict';

/**
 * Enforces canonical package imports — tests and scripts must not require from src/.
 * Use @agni/* and @ols/* instead.
 *
 * Exit 0 pass, 1 fail.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Directories to scan for src/ imports (exclude tools/ — curriculum-gen has its own src/)
const SCAN_DIRS = ['tests', 'scripts'];
// Pattern: require('../../src/...') or require('../src/...') from repo root — not comments
const BAD_PATTERN = /^\s*[^/]*require\s*\(\s*['"](?:\.\.\/)+src\//;

const violations = [];
const files = [];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'dist') continue;
      walk(full);
    } else if (e.name.endsWith('.js') || e.name.endsWith('.ts')) {
      files.push(full);
    }
  }
}

SCAN_DIRS.forEach(function (d) {
  const abs = path.join(ROOT, d);
  if (fs.existsSync(abs)) walk(abs);
});

files.forEach(function (file) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  lines.forEach(function (line, i) {
    // Skip comment-only lines
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
    if (line.indexOf('require') === -1) return;
    if (/require\s*\(\s*['"](?:\.\.\/)+src\//.test(line)) {
      violations.push({
        file: path.relative(ROOT, file).replace(/\\/g, '/'),
        line: i + 1,
        content: trimmed
      });
    }
  });
});

if (violations.length > 0) {
  console.error('check-canonical-imports: FAIL — tests/scripts must use @agni/* or @ols/*, not src/\n');
  violations.forEach(function (v) {
    console.error('  ' + v.file + ':' + v.line + ' — ' + v.content);
  });
  console.error('\nUse package imports: require(\'@agni/engine/math\'), require(\'@agni/utils/logger\'), etc.');
  process.exit(1);
}

console.log('check-canonical-imports: OK — no src/ imports in tests or scripts');
