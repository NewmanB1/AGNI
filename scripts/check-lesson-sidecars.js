#!/usr/bin/env node
'use strict';

/**
 * E2.1–E2.3: verify:lesson-sidecars CI gate.
 * For each lesson directory in serveDir/lessons that has index.html,
 * require index-ir.json. Theta refuses to index lessons without IR;
 * this gate catches the condition earlier.
 *
 * Usage: node scripts/check-lesson-sidecars.js [--serve-dir PATH] [--allow-legacy]
 * Env: AGNI_SERVE_DIR, AGNI_DATA_DIR. AGNI_ALLOW_LEGACY_LESSONS=1 skips check.
 * Exit: 0 pass, 1 fail.
 */

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');

function parseArgs() {
  var dataDir = process.env.AGNI_DATA_DIR || path.join(ROOT, 'data');
  var serveDir = process.env.AGNI_SERVE_DIR || path.join(dataDir, 'serve');
  var allowLegacy = process.env.AGNI_ALLOW_LEGACY_LESSONS === '1' || process.env.AGNI_ALLOW_LEGACY_LESSONS === 'true';
  for (var i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--serve-dir' && process.argv[i + 1]) {
      serveDir = path.resolve(process.argv[i + 1]);
      i += 1;
    } else if (process.argv[i] === '--allow-legacy') {
      allowLegacy = true;
    }
  }
  return { serveDir: serveDir, allowLegacy: allowLegacy };
}

function main() {
  var args = parseArgs();
  if (args.allowLegacy) {
    console.log('verify:lesson-sidecars: OK (--allow-legacy)');
    process.exit(0);
  }

  var lessonsRoot = path.join(args.serveDir, 'lessons');
  if (!fs.existsSync(lessonsRoot)) {
    console.log('verify:lesson-sidecars: OK (no lessons directory)');
    process.exit(0);
  }

  var dirs = fs.readdirSync(lessonsRoot);
  var missing = [];
  for (var d = 0; d < dirs.length; d++) {
    var slug = dirs[d];
    var lessonDir = path.join(lessonsRoot, slug);
    var stat = fs.statSync(lessonDir);
    if (!stat.isDirectory()) continue;
    var indexHtml = path.join(lessonDir, 'index.html');
    var indexIr = path.join(lessonDir, 'index-ir.json');
    if (fs.existsSync(indexHtml) && !fs.existsSync(indexIr)) {
      missing.push(slug);
    }
  }

  if (missing.length > 0) {
    console.error('verify:lesson-sidecars: FAIL — lessons with index.html but no index-ir.json:');
    missing.forEach(function (s) { console.error('  ', s); });
    console.error('Run compile for each lesson, or use --allow-legacy to skip.');
    process.exit(1);
  }

  console.log('verify:lesson-sidecars: OK');
  process.exit(0);
}

main();
