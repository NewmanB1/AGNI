#!/usr/bin/env node
'use strict';

/**
 * Detects unsafe innerHTML assignments in runtime and browser-facing files.
 *
 * Flags any line where innerHTML is set using template literals or
 * string concatenation with variables (potential XSS vectors).
 *
 * Safe patterns (e.g. `el.innerHTML = ''` for clearing) are excluded.
 *
 * Exits non-zero if unsafe patterns are found.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const SCAN_DIRS = [
  path.join(ROOT, 'src', 'runtime'),
  path.join(ROOT, 'server', 'pwa'),
];

const SAFE_PATTERNS = [
  /\.innerHTML\s*=\s*['"]['"];?\s*$/,
  /\.innerHTML\s*=\s*['"]\s*['"];?\s*$/,
];

const UNSAFE_PATTERNS = [
  { re: /\.innerHTML\s*=\s*`/, name: 'innerHTML with template literal' },
  { re: /\.innerHTML\s*=\s*[^'"\s].*\+/, name: 'innerHTML with string concatenation' },
  { re: /\.innerHTML\s*\+=/, name: 'innerHTML append (+=)' },
];

function collectJsFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir);
  for (let i = 0; i < entries.length; i++) {
    const full = path.join(dir, entries[i]);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      results = results.concat(collectJsFiles(full));
    } else if (entries[i].endsWith('.js') || entries[i].endsWith('.html')) {
      results.push(full);
    }
  }
  return results;
}

let files = [];
SCAN_DIRS.forEach(function (dir) {
  files = files.concat(collectJsFiles(dir));
});

const violations = [];

files.forEach(function (filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const rel = path.relative(ROOT, filePath).replace(/\\/g, '/');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^\s*\/\//.test(line) || /^\s*\*/.test(line)) continue;

    if (!/innerHTML/.test(line)) continue;

    const isSafe = SAFE_PATTERNS.some(function (p) { return p.test(line); });
    if (isSafe) continue;

    for (let p = 0; p < UNSAFE_PATTERNS.length; p++) {
      if (UNSAFE_PATTERNS[p].re.test(line)) {
        violations.push({
          file: rel,
          line: i + 1,
          pattern: UNSAFE_PATTERNS[p].name,
          code: line.trim().substring(0, 100)
        });
        break;
      }
    }
  }
});

if (violations.length > 0) {
  console.error('FAIL: ' + violations.length + ' unsafe innerHTML assignment(s) detected:\n');
  violations.forEach(function (v) {
    console.error('  ' + v.file + ':' + v.line + ' [' + v.pattern + ']');
    console.error('    ' + v.code);
  });
  console.error('\nUse textContent, createElement, or the escapeHtml() utility from src/utils/io.js instead.');
  console.error('If the assignment is genuinely safe, add the pattern to SAFE_PATTERNS in this script.');
  process.exit(1);
} else {
  console.log('OK: No unsafe innerHTML assignments found (' + files.length + ' files scanned).');
}
