#!/usr/bin/env node
'use strict';

/**
 * Detects orphaned source files — .js/.ts files in hub-tools/, server/ that are never
 * require()'d or imported by any other source or test file.
 *
 * Canonical implementation lives in packages/. Types in packages/types and packages/agni-engine.
 *
 * Exits non-zero if orphans are found, so it can serve as a CI gate.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const SOURCE_DIRS = ['hub-tools', 'server'];
const CONSUMER_DIRS = ['hub-tools', 'server', 'packages', 'tests', 'scripts'];

const ENTRY_POINTS = new Set([
  normalize('packages/agni-cli/cli.js'),
  normalize('hub-tools/theta.js'),
  normalize('hub-tools/sentry.js'),
  normalize('hub-tools/sync.js'),
  normalize('server/hub-transform.js'),
  normalize('packages/agni-hub/sw.js'),
  normalize('packages/agni-hub/pwa/shared.js'),
  normalize('packages/agni-runtime/shell/index.html'),
]);

const KNOWN_STANDALONE = new Set([
  normalize('packages/agni-runtime/shell/index.html'),
  normalize('packages/agni-runtime/shell/library.js'),
  normalize('packages/agni-runtime/style.css'),
  normalize('packages/agni-runtime/README.md'),
  normalize('packages/agni-runtime/sensors/sensorTypes.ts'),
  normalize('packages/types/index.d.ts'),
  normalize('packages/agni-engine/math.d.ts'),
  normalize('packages/agni-engine/thompson.d.ts'),
  normalize('packages/agni-engine/rasch.d.ts'),
  normalize('packages/agni-engine/embeddings.d.ts'),
  normalize('packages/agni-engine/federation.d.ts'),
  normalize('packages/agni-hub/pwa/shell-boot.js'),
]);

function normalize(p) {
  return p.replace(/\\/g, '/');
}

function collectFiles(dirs, extensions) {
  const results = [];
  dirs.forEach(function (dir) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) return;
    walk(abs, dir, extensions, results);
  });
  return results;
}

function walk(absDir, relDir, extensions, out) {
  const entries = fs.readdirSync(absDir);
  for (let i = 0; i < entries.length; i++) {
    const full = path.join(absDir, entries[i]);
    const rel = relDir + '/' + entries[i];
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (entries[i] === 'node_modules' || entries[i] === 'dist') continue;
      walk(full, rel, extensions, out);
    } else if (extensions.some(function (ext) { return entries[i].endsWith(ext); })) {
      out.push(normalize(rel));
    }
  }
}

const sourceFiles = collectFiles(SOURCE_DIRS, ['.js', '.ts']);
const consumerFiles = collectFiles(CONSUMER_DIRS, ['.js', '.ts']);

const referenced = new Set();

ENTRY_POINTS.forEach(function (ep) { referenced.add(ep); });
KNOWN_STANDALONE.forEach(function (f) { referenced.add(f); });

consumerFiles.forEach(function (file) {
  const absPath = path.join(ROOT, file);
  let content;
  try { content = fs.readFileSync(absPath, 'utf8'); } catch (_e) { return; }

  const requirePattern = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  const importPattern = /(?:import|from)\s+['"]([^'"]+)['"]/g;

  [requirePattern, importPattern].forEach(function (pattern) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const target = match[1];
      if (target.startsWith('.')) {
        const resolved = resolveRelative(file, target);
        if (resolved) referenced.add(resolved);
      }
    }
  });
});

function resolveRelative(fromFile, target) {
  const dir = normalize(path.dirname(fromFile));
  const joined = normalize(path.posix.normalize(path.posix.join(dir, target)));

  const candidates = [
    joined,
    joined + '.js',
    joined + '.ts',
    joined + '/index.js',
    joined + '/index.ts',
  ];

  for (let i = 0; i < candidates.length; i++) {
    if (sourceFiles.indexOf(candidates[i]) !== -1) return candidates[i];
  }
  return null;
}

// Runtime browser files in packages/agni-runtime are inlined at build time, not require()'d.
// No need to add them — they are not in SOURCE_DIRS.

const orphans = sourceFiles.filter(function (file) {
  return !referenced.has(file) && !KNOWN_STANDALONE.has(file);
});

if (orphans.length > 0) {
  console.error('FAIL: ' + orphans.length + ' orphaned source file(s) detected:\n');
  orphans.forEach(function (f) {
    console.error('  ' + f);
  });
  console.error('\nIf a file is intentionally standalone (entry point, runtime asset),');
  console.error('add it to ENTRY_POINTS or KNOWN_STANDALONE in scripts/check-dead-files.js.');
  process.exit(1);
} else {
  console.log('OK: No orphaned source files detected (' + sourceFiles.length + ' files scanned).');
}
