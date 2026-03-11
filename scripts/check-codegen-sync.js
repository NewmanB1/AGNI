#!/usr/bin/env node
/**
 * Verify that schema-generated types are in sync with schemas.
 * Runs codegen:types, then fails if packages/types/generated/ changed.
 * Ensures schema changes are accompanied by `npm run codegen:types` and commit.
 *
 * Run: node scripts/check-codegen-sync.js
 * Exit 0 = in sync, 1 = out of sync (run npm run codegen:types and commit).
 */

'use strict';

const { execSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const generatedDir = path.join(root, 'packages', 'types', 'generated');

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: root, encoding: 'utf8', ...opts });
}

function main() {
  // Regenerate
  run('node scripts/codegen-types.js');

  // Check for uncommitted changes in generated/
  try {
    run('git diff --exit-code packages/types/generated/', { stdio: 'pipe' });
  } catch (e) {
    console.error('FAIL: Schema-generated types are out of sync.');
    console.error('Run: npm run codegen:types');
    console.error('Then commit the updated packages/types/generated/*.d.ts');
    process.exit(1);
  }

  console.log('OK: Schema-generated types in sync.');
  process.exit(0);
}

main();
