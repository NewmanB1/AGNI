#!/usr/bin/env node
'use strict';

/**
 * CI gate: @agni/services must not require scripts/.
 * Packages must be self-contained; scripts/ is for CLI usage only.
 * Exit 0 if pass, 1 if any violation.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SERVICES_DIR = path.join(ROOT, 'packages', 'agni-services');

// Match require('...scripts/...') or require("...scripts/...")
const REQUIRE_SCRIPTS_PATTERN = /require\s*\(\s*['"]([^'"]*\/scripts\/[^'"]*)['"]\s*\)/;
// Match require(path.join(__dirname, '...scripts...')) or require(scriptPath) after scriptPath = path.join(..., 'scripts/...')
const REQUIRE_PATH_SCRIPTS = /require\s*\(\s*(?:path\.join|path\.resolve)\s*\([^)]*['"][^'"]*scripts[/\\]/;
const PATH_JOIN_SCRIPTS = /path\.join\s*\(\s*__dirname\s*,\s*['"][^'"]*scripts[/\\]/;

const violations = [];

function walkDir(dir, out) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir);
  for (const e of entries) {
    const full = path.join(dir, e);
    const stat = fs.statSync(full);
    if (stat.isDirectory() && e !== 'node_modules') {
      walkDir(full, out);
    } else if (e.endsWith('.js')) {
      out.push(full);
    }
  }
}

const files = [];
walkDir(SERVICES_DIR, files);

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  if (REQUIRE_SCRIPTS_PATTERN.test(content)) {
    violations.push({ file: rel, reason: 'require() of path containing scripts/' });
  }
  if (REQUIRE_PATH_SCRIPTS.test(content) || PATH_JOIN_SCRIPTS.test(content)) {
    violations.push({ file: rel, reason: 'require(path.join(..., scripts/...))' });
  }
}

if (violations.length > 0) {
  console.error('check-services-no-scripts: FAIL\n');
  console.error('@agni/services must not require scripts/.\n');
  violations.forEach(({ file, reason }) => {
    console.error('  ' + file + ': ' + reason);
  });
  process.exit(1);
}

console.log('check-services-no-scripts: OK');
process.exit(0);
