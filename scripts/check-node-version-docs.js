#!/usr/bin/env node
'use strict';

/**
 * Ensures hub/engine Node version docs are consistent.
 * - ARCHITECTURE.md must explicitly state Node 14+ for the Village Hub.
 * - No non-archive docs may state Node < 14 as a hub/engine target
 *   (would conflict with package.json engines ">=14" and cause silent breakage on Pi).
 *
 * Exit 0 pass, 1 fail.
 */

const fs = require('fs');
const path = require('path');
const { walkDir } = require('@agni/utils/io');

const ROOT = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(ROOT, 'docs');
const ARCHITECTURE = path.join(ROOT, 'docs', 'ARCHITECTURE.md');

// Patterns that indicate conflicting Node < 14 hub target
const BAD_PATTERNS = [
  /Node\s*1[0-2]\b/,      // "Node 10", "Node 11", "Node 12"
  /node\s*1[0-2]\b/,      // lowercase
];

// ARCHITECTURE must contain explicit Node 14+ for hub
const REQUIRED_IN_ARCHITECTURE = [
  /Node\s*14\+/,
  /node\s*14\+/,
];

const errors = [];

// 1. ARCHITECTURE must state Node 18+ for hub
if (fs.existsSync(ARCHITECTURE)) {
  const content = fs.readFileSync(ARCHITECTURE, 'utf8');
  const hasRequired = REQUIRED_IN_ARCHITECTURE.some((p) => p.test(content));
  if (!hasRequired) {
    errors.push(
      'docs/ARCHITECTURE.md must explicitly state Node 14+ for the Village Hub (per package.json engines).'
    );
  }
} else {
  errors.push('docs/ARCHITECTURE.md not found.');
}

// 2. No non-archive docs may state Node 14 or Node 14–16 as hub/engine target
const files = walkDir(DOCS_DIR, { extensions: ['.md'], skipArchive: true });
for (const f of files) {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/');
  const content = fs.readFileSync(f, 'utf8');
  for (const pat of BAD_PATTERNS) {
    if (pat.test(content)) {
      errors.push(
        `${rel}: must not reference Node < 14 as hub target (use Node 14+ per docs/ARCHITECTURE.md)`
      );
      break;
    }
  }
}

if (errors.length > 0) {
  console.error('check-node-version-docs: Node version docs inconsistent\n');
  errors.forEach((e) => console.error('  ', e));
  process.exit(1);
}
console.log('check-node-version-docs: OK');
process.exit(0);
