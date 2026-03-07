#!/usr/bin/env node
'use strict';

/**
 * Ensures hub/engine Node version docs are consistent.
 * - ARCHITECTURE.md must explicitly state Node 18+ for the Village Hub.
 * - No non-archive docs may state Node 14 or Node 14–16 as a hub/engine target
 *   (would conflict with package.json engines ">=18" and cause silent breakage on Pi).
 *
 * Exit 0 pass, 1 fail.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(ROOT, 'docs');
const ARCHITECTURE = path.join(ROOT, 'docs', 'ARCHITECTURE.md');

// Patterns that indicate conflicting Node 14/16 hub target (mutually exclusive with Node 18+)
const BAD_PATTERNS = [
  /Node\s*14(?!\+)/,      // "Node 14" but not "Node 14+"
  /Node\s*14[-–]16/,      // "Node 14-16" or "Node 14–16"
  /node\s*14(?!\+)/,      // lowercase
  /node\s*14[-–]16/,
];

// ARCHITECTURE must contain explicit Node 18+ for hub
const REQUIRED_IN_ARCHITECTURE = [
  /Node\s*18\+/,
  /node\s*18\+/,
];

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

const errors = [];

// 1. ARCHITECTURE must state Node 18+ for hub
if (fs.existsSync(ARCHITECTURE)) {
  const content = fs.readFileSync(ARCHITECTURE, 'utf8');
  const hasRequired = REQUIRED_IN_ARCHITECTURE.some((p) => p.test(content));
  if (!hasRequired) {
    errors.push(
      'docs/ARCHITECTURE.md must explicitly state Node 18+ for the Village Hub (per package.json engines).'
    );
  }
} else {
  errors.push('docs/ARCHITECTURE.md not found.');
}

// 2. No non-archive docs may state Node 14 or Node 14–16 as hub/engine target
const files = [];
walkDir(DOCS_DIR, files, true);
for (const f of files) {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/');
  const content = fs.readFileSync(f, 'utf8');
  for (const pat of BAD_PATTERNS) {
    if (pat.test(content)) {
      errors.push(
        `${rel}: must not reference Node 14 or Node 14–16 as hub target (use Node 18+ per docs/ARCHITECTURE.md)`
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
