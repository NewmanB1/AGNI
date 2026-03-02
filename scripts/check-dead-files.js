#!/usr/bin/env node
'use strict';

/**
 * Detects orphaned source files — .js files in src/ that are never
 * require()'d or imported by any other source or test file.
 *
 * Exits non-zero if orphans are found, so it can serve as a CI gate.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const SOURCE_DIRS = ['src', 'hub-tools', 'server'];
const CONSUMER_DIRS = ['src', 'hub-tools', 'server', 'tests', 'scripts'];

const ENTRY_POINTS = new Set([
  normalize('src/cli.js'),
  normalize('hub-tools/theta.js'),
  normalize('hub-tools/sentry.js'),
  normalize('hub-tools/sync.js'),
  normalize('server/hub-transform.js'),
  normalize('server/sw.js'),
  normalize('server/pwa/shared.js'),
  normalize('src/runtime/shell/index.html'),
]);

const KNOWN_STANDALONE = new Set([
  normalize('src/runtime/shell/index.html'),
  normalize('src/runtime/shell/library.js'),
  normalize('src/runtime/style.css'),
  normalize('src/runtime/README.md'),
  normalize('src/runtime/sensors/sensorTypes.ts'),
  normalize('src/runtime/polyfills.js'),
  normalize('src/types/index.d.ts'),
  normalize('src/engine/math.d.ts'),
  normalize('src/engine/thompson.d.ts'),
  normalize('src/engine/rasch.d.ts'),
  normalize('src/engine/embeddings.d.ts'),
  normalize('src/engine/federation.d.ts'),
  normalize('src/services/index.js'),
  normalize('server/pwa/shell-boot.js'),
  normalize('src/governance/catalog.js'),
  normalize('src/governance/schema-store.js'),
]);

// Runtime browser files listed in runtimeManifest.js are inlined by the HTML
// builder at build time, not require()'d. Load them as known-referenced.
const runtimeManifestPath = normalize('src/utils/runtimeManifest.js');
try {
  const manifest = require(path.join(ROOT, runtimeManifestPath));
  Object.keys(manifest.FACTORY_PATH_MAP || {}).forEach(function (bare) {
    const rel = manifest.FACTORY_PATH_MAP[bare];
    KNOWN_STANDALONE.add(normalize('src/runtime/' + rel));
  });
  // shared-runtime.js and other root-level runtime files are prepended by builders
  ['shared-runtime.js', 'style.css'].forEach(function (f) {
    KNOWN_STANDALONE.add(normalize('src/runtime/' + f));
  });
} catch (_e) {
  // If runtimeManifest can't load, skip — the dead-file check will be stricter.
}

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
  const joined = normalize(path.posix.join(dir, target));

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

const runtimeFiles = sourceFiles.filter(function (f) {
  return f.startsWith('src/runtime/');
});
runtimeFiles.forEach(function (file) {
  const absPath = path.join(ROOT, file);
  let content;
  try { content = fs.readFileSync(absPath, 'utf8'); } catch (_e) { return; }

  sourceFiles.forEach(function (candidate) {
    if (!candidate.startsWith('src/runtime/')) return;
    const basename = path.basename(candidate, '.js');
    const patterns = [
      new RegExp('src=[\'"].*' + escapeRegex(path.basename(candidate)) + '[\'"]'),
      new RegExp('[\'"]' + escapeRegex(basename) + '(?:\\.js)?[\'"]'),
    ];
    patterns.forEach(function (re) {
      if (re.test(content)) referenced.add(candidate);
    });
  });
});

function escapeRegex(s) {
  return s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

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
