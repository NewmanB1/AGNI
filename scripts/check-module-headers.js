#!/usr/bin/env node
'use strict';

/**
 * CI gate: .js files in packages/ (excluding node_modules and allowlist) must have
 * a module header: a block comment (/** ... *\/ or /* ... *\/) within the first 20 lines.
 * Ensures maintainability: every module documents what it does and who uses it.
 *
 * Allowlist: files that are generated, config-only, or legacy and documented as exceptions.
 * Exit 0 on pass, 1 on violation.
 */

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var PACKAGES = path.join(ROOT, 'packages');

// Files that may lack a block/line header (exceptions until headers are added). Prefer adding a header over extending this list.
var ALLOWLIST = [
  'packages/agni-cli/cli.js',
  'packages/agni-hub/theta.js',
  'packages/agni-governance/catalog.js',
  'packages/agni-governance/evaluateLessonCompliance.js',
  'packages/agni-governance/index.js',
  'packages/agni-governance/policy.js',
  'packages/agni-hub/context/auth.js',
  'packages/agni-hub/context/config.js',
  'packages/agni-hub/context/data-access.js',
  'packages/agni-hub/context/data-paths.js',
  'packages/agni-hub/context/http.js',
  'packages/agni-hub/context/services.js',
  'packages/agni-hub/routes/accounts.js',
  'packages/agni-hub/routes/admin.js',
  'packages/agni-hub/routes/author.js',
  'packages/agni-hub/routes/chain.js',
  'packages/agni-hub/routes/collab.js',
  'packages/agni-hub/routes/governance.js',
  'packages/agni-hub/routes/groups.js',
  'packages/agni-hub/routes/lms.js',
  'packages/agni-hub/routes/parent.js',
  'packages/agni-hub/routes/pathfinder.js',
  'packages/agni-hub/routes/student.js',
  'packages/agni-hub/routes/telemetry.js',
  'packages/agni-hub/shared.js',
  'packages/agni-hub/sw.js',
  'packages/agni-plugins/builtins/factories.js',
  'packages/agni-plugins/builtins/sensors.js',
  'packages/agni-plugins/builtins/step-types.js',
  'packages/agni-plugins/registry.js',
  'packages/agni-services/compiler.js',
  'packages/agni-services/governance.js',
  'packages/agni-services/lesson-assembly.js',
  'packages/agni-services/lesson-schema.js',
  'packages/agni-services/lms.js',
  'packages/agni-utils/lesson-validator.js',
  'packages/agni-utils/threshold-syntax.js',
  'packages/ols-compiler/builders/html.js',
  'packages/ols-compiler/builders/native.js',
  'packages/ols-compiler/builders/yaml-packet.js',
  'packages/ols-compiler/compiler/build-lesson-ir.js',
  'packages/ols-compiler/markdown-pipeline.js',
  'packages/ols-compiler/services/compiler.js',
  'packages/ols-compiler/services/lesson-assembly.js'
];

function walk(dir, out) {
  if (!fs.existsSync(dir)) return;
  var entries = fs.readdirSync(dir);
  for (var i = 0; i < entries.length; i++) {
    var name = entries[i];
    var full = path.join(dir, name);
    var stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (name !== 'node_modules') walk(full, out);
    } else if (name.endsWith('.js')) {
      out.push(full);
    }
  }
}

function hasModuleHeader(content, maxLines) {
  var lines = content.split('\n');
  var end = Math.min(maxLines, lines.length);
  for (var i = 0; i < end; i++) {
    var line = lines[i];
    if (/^\s*\/\*\*/.test(line) || /^\s*\/\*/.test(line)) return true;
    if (i < 5 && /^\s*\/\/\s*(packages\/|@agni|@ols|[\w-]+\.js)/.test(line)) return true;
  }
  return false;
}

var files = [];
walk(PACKAGES, files);
var missing = [];
for (var f = 0; f < files.length; f++) {
  var rel = path.relative(ROOT, files[f]).replace(/\\/g, '/');
  var allowed = ALLOWLIST.some(function (a) {
    return rel === a || rel.endsWith(a);
  });
  if (allowed) continue;
  var content = fs.readFileSync(files[f], 'utf8');
  if (!hasModuleHeader(content, 20)) {
    missing.push(rel);
  }
}

if (missing.length > 0) {
  console.error('FAIL  Module header required: each .js file in packages/ must have a block comment (/** or /*) in the first 20 lines.\n');
  console.error('Missing header:\n');
  missing.forEach(function (r) {
    console.error('  ' + r);
  });
  console.error('\nAdd a short header (what the file does, who uses it, contract). To allowlist, add the path to ALLOWLIST in scripts/check-module-headers.js.');
  process.exit(1);
}

console.log('check-module-headers: OK');
process.exit(0);
