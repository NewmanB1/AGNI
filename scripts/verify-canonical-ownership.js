#!/usr/bin/env node
'use strict';

/**
 * Phase 1: Verify canonical ownership.
 * Packages must own their implementation — no require('../../src/') from within
 * packages/agni-utils or packages/ols-compiler.
 *
 * Exit 0 if pass, 1 if any violation.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PACKAGES_TO_CHECK = [
  { name: '@agni/utils', dir: 'packages/agni-utils' },
  { name: '@ols/compiler', dir: 'packages/ols-compiler' },
  { name: '@agni/hub', dir: 'packages/agni-hub' },
  { name: '@agni/services', dir: 'packages/agni-services' },
  { name: '@agni/runtime', dir: 'packages/agni-runtime' },
  { name: '@agni/engine', dir: 'packages/agni-engine' },
  { name: '@agni/governance', dir: 'packages/agni-governance' },
  { name: '@ols/schema', dir: 'packages/ols-schema' },
  { name: '@agni/plugins', dir: 'packages/agni-plugins' },
  { name: '@agni/lesson-gen', dir: 'packages/agni-lesson-gen' }
];

// Match require('...src/...') and capture the full path for allowlist check
const SRC_REQUIRE_PATTERN = /require\s*\(\s*['"]([^'"]*\/src\/[^'"]+)['"]\s*\)/g;

const violations = [];

function walkDir(dir, extensions, out) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir);
  for (const e of entries) {
    const full = path.join(dir, e);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (e !== 'node_modules') walkDir(full, extensions, out);
    } else if (extensions.some(ext => e.endsWith(ext))) {
      out.push(full);
    }
  }
}

function checkFile(filePath, relPath, pkg) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (_e) {
    return;
  }
  let m;
  SRC_REQUIRE_PATTERN.lastIndex = 0;
  while ((m = SRC_REQUIRE_PATTERN.exec(content)) !== null) {
    violations.push({ file: relPath, match: m[0] });
  }
}

for (const pkg of PACKAGES_TO_CHECK) {
  const absDir = path.join(ROOT, pkg.dir);
  const files = [];
  walkDir(absDir, ['.js'], files);
  for (const f of files) {
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    checkFile(f, rel, pkg);
  }
}

if (violations.length > 0) {
  console.error('verify-canonical-ownership: FAIL\n');
  console.error('Packages must not require from src/. Violations:\n');
  violations.forEach(({ file, match }) => {
    console.error('  ' + file);
    console.error('    ' + match);
  });
  process.exit(1);
}

console.log('verify-canonical-ownership: OK');
process.exit(0);
