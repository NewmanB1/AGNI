#!/usr/bin/env node
'use strict';

/**
 * Verifies that version strings in hub/server files match package.json.
 * Fails if hardcoded version strings (e.g. 1.9.0, agni-v1.9.0) are found.
 * sw.js must use __SW_VERSION__ placeholder; lesson-server stamps it at serve time.
 * CI gate: prevents version drift.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const PKG_VERSION = PKG.version || '0.0.0';

const FILES = [
  'packages/agni-hub/sw.js',
  'packages/agni-hub/lesson-server.js',
  'packages/agni-hub/lesson-server/constants.js',
  'packages/agni-hub/lesson-server/route-handlers.js'
];

// Patterns that indicate hardcoded version (fail)
const BAD_PATTERNS = [
  /agni-v\d+\.\d+\.\d+/,           // agni-v1.9.0
  /['"]\d+\.\d+\.\d+['"]/,         // '1.9.0' or "0.1.0" as standalone
  /SW_VERSION\s*=\s*['"]agni-v\d/  // old style without placeholder
];

function main() {
  let failed = false;

  for (const rel of FILES) {
    const fp = path.join(ROOT, rel);
    if (!fs.existsSync(fp)) continue;

    const content = fs.readFileSync(fp, 'utf8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      for (const pat of BAD_PATTERNS) {
        const m = line.match(pat);
        if (!m) continue;
        if (line.includes('package.json') || line.includes('__SW_VERSION__')) continue;

        console.error('%s:%d: Hardcoded version detected (use package.json or __SW_VERSION__)', rel, lineNum);
        failed = true;
      }
    }
  }

  const swPath = path.join(ROOT, 'packages/agni-hub/sw.js');
  if (!fs.existsSync(swPath)) {
    console.error('packages/agni-hub/sw.js: file not found');
    failed = true;
  } else {
    const swContent = fs.readFileSync(swPath, 'utf8');
    if (!swContent.includes('__SW_VERSION__')) {
      console.error('packages/agni-hub/sw.js: Must use __SW_VERSION__ placeholder');
      failed = true;
    }
  }

  if (failed) process.exit(1);

  console.log('Version strings OK (package.json: %s)', PKG_VERSION);
}

main();
