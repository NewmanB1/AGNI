#!/usr/bin/env node
'use strict';

/**
 * Ensures each "Test location" in the Regression Test Coverage table in
 * docs/VERIFICATION-GUARDS.md refers to a file that still exists.
 * Exit 0 on pass, 1 if a listed file is missing.
 */

var path = require('path');
var fs = require('fs');

var ROOT = path.resolve(__dirname, '..');
var GUARDS_DOC = path.join(ROOT, 'docs/VERIFICATION-GUARDS.md');

var content = fs.readFileSync(GUARDS_DOC, 'utf8');
var inTable = false;
var seen = {};
var missing = [];

content.split('\n').forEach(function (line) {
  if (line.indexOf('| Fix | Test location |') !== -1) {
    inTable = true;
    return;
  }
  if (inTable && line.indexOf('|') !== 0) {
    inTable = false;
    return;
  }
  if (!inTable || line.indexOf('|') !== 0) return;
  var cells = line.split('|').map(function (c) { return c.trim(); });
  if (cells.length < 3) return;
  var location = cells[2];
  if (!location || location === 'Test location' || location === '---') return;
  // First token is usually the file: "regressions.test.js MATH-3", "wiring-smoke.test.js (...)", "check-lms-integrations.js"
  var first = location.split(/\s+|\(/)[0];
  if (!first || !/\.(test\.js|spec\.ts|js)$/.test(first)) return;
  if (seen[first]) return;
  seen[first] = true;
  var candidates = [
    path.join(ROOT, 'tests/unit', first),
    path.join(ROOT, 'tests/integration', first),
    path.join(ROOT, 'scripts', first)
  ];
  var found = candidates.some(function (p) { return fs.existsSync(p); });
  if (!found) missing.push(first + ' (from: ' + location + ')');
});

if (missing.length > 0) {
  console.error('verify:regression-table: Test location(s) in VERIFICATION-GUARDS.md refer to missing files:\n');
  missing.forEach(function (m) { console.error('  ' + m); });
  console.error('\nAdd the file or update the Regression Test Coverage table.');
  process.exit(1);
}
console.log('check-regression-table: all listed test locations exist.');
