#!/usr/bin/env node
'use strict';

/**
 * Ensures engine docs do not reference TypeScript or a compile step.
 * The engine uses plain JavaScript (ES5); no index.ts, no build:engine.
 * Prevents silent stale-build bugs on hub deployment.
 *
 * Exit 0 pass, 1 fail.
 */

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var DOCS = path.join(ROOT, 'docs');

var BAD_PATTERNS = [
  { re: /src\/engine\/index\.ts/, msg: 'Must not reference src/engine/index.ts (engine is JS only)' },
  { re: /build:engine/, msg: 'Must not reference build:engine (no engine compile step)' },
  { re: /tsconfig\.engine/, msg: 'Must not reference tsconfig.engine (engine has no TS config)' },
];

function walk(dir, out) {
  var entries = fs.readdirSync(dir);
  for (var i = 0; i < entries.length; i++) {
    var full = path.join(dir, entries[i]);
    var stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (entries[i] === 'archive') continue;
      walk(full, out);
    } else if (entries[i].endsWith('.md')) {
      out.push(full);
    }
  }
}

var files = [];
walk(DOCS, files);
var errors = [];

for (var f = 0; f < files.length; f++) {
  var rel = path.relative(ROOT, files[f]).replace(/\\/g, '/');
  var content = fs.readFileSync(files[f], 'utf8');
  for (var p = 0; p < BAD_PATTERNS.length; p++) {
    if (BAD_PATTERNS[p].re.test(content)) {
      errors.push(rel + ': ' + BAD_PATTERNS[p].msg);
      break;
    }
  }
}

if (errors.length > 0) {
  console.error('check-engine-no-ts: Engine docs must not reference TypeScript or build step\n');
  errors.forEach(function (e) { console.error('  ', e); });
  process.exit(1);
}
console.log('check-engine-no-ts: OK');
process.exit(0);
