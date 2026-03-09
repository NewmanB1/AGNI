#!/usr/bin/env node
'use strict';

/**
 * Validates that all edge-device browser code uses strict ES5 only.
 *
 * Target: Android 7.0 (Nougat, API 24) WebView (Chrome 51).
 * Scope: packages/agni-runtime + packages/agni-hub/sw.js + packages/agni-hub/pwa/*.js
 *
 * Three categories:
 *   SYNTAX  — ES6 syntax that causes parse errors. Always an error.
 *   API     — ES6+ APIs not available in Chrome 51 without a polyfill.
 *             Error UNLESS covered by packages/agni-runtime/polyfills.js.
 *   NATIVE  — APIs not in the ES5 spec but available natively in Chrome 51+.
 *             (Promise, Map, Set, etc.) Informational only — not errors.
 *
 * polyfills.js is exempt from API checks because it necessarily references
 * the APIs it is polyfilling.
 * sw.js and pwa/*.js run in separate contexts (no polyfills) — must use only
 * Chrome 51–native or ES5 APIs.
 */

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var runtimeDir = require('@agni/runtime').RUNTIME_ROOT;

function collectJsFiles(dir, prefix) {
  var results = [];
  var entries = fs.readdirSync(dir);
  for (var i = 0; i < entries.length; i++) {
    var full = path.join(dir, entries[i]);
    var rel = prefix ? prefix + '/' + entries[i] : entries[i];
    var stat = fs.statSync(full);
    if (stat.isDirectory()) {
      results = results.concat(collectJsFiles(full, rel));
    } else if (entries[i].endsWith('.js')) {
      if (rel === 'index.js') continue;  // Node-only barrel — not a browser file
      results.push({ path: full, rel: rel, dir: dir });
    }
  }
  return results;
}

// Edge device browser files: runtime + hub sw + pwa
var runtimeFiles = collectJsFiles(runtimeDir, '').map(function (o) {
  return { path: o.path, rel: 'packages/agni-runtime/' + o.rel, dir: runtimeDir, isRuntime: true };
});
var hubSwPath = path.join(ROOT, 'packages', 'agni-hub', 'sw.js');
var hubPwaDir = path.join(ROOT, 'packages', 'agni-hub', 'pwa');
var hubEdgeFiles = [];
if (fs.existsSync(hubSwPath)) {
  hubEdgeFiles.push({ path: hubSwPath, rel: 'packages/agni-hub/sw.js', dir: path.dirname(hubSwPath), isRuntime: false });
}
if (fs.existsSync(hubPwaDir)) {
  var pwaEntries = fs.readdirSync(hubPwaDir);
  for (var j = 0; j < pwaEntries.length; j++) {
    if (pwaEntries[j].endsWith('.js')) {
      hubEdgeFiles.push({
        path: path.join(hubPwaDir, pwaEntries[j]),
        rel: 'packages/agni-hub/pwa/' + pwaEntries[j],
        dir: hubPwaDir,
        isRuntime: false
      });
    }
  }
}

var files = runtimeFiles.concat(hubEdgeFiles);

// ── Syntax patterns (always errors — cause parse failures) ──────────────────
var SYNTAX_PATTERNS = [
  { re: /\b(let|const)\s/,         name: 'let/const' },
  { re: /=>/,                       name: 'arrow function' },
  { re: /`[^`]*`/,                  name: 'template literal' },
  { re: /\bclass\s/,               name: 'class keyword' },
  { re: /\.\.\.\w/,                 name: 'spread/rest operator' },
  { re: /\bfor\s*\(\s*(?:var\s+)?(?:\w+)\s+of\b/, name: 'for...of loop' },
  { re: /\{\s*\[/,                  name: 'computed property' },
  { re: /\bfunction\s*\*\s/,       name: 'generator function' },
  { re: /\basync\s+function/,      name: 'async function' },
  { re: /\bawait\s/,               name: 'await keyword' }
];

// ── API patterns NOT in Chrome 51 — errors unless polyfilled ────────────────
// Polyfilled APIs (covered by src/runtime/polyfills.js) are flagged as warnings
// in files other than polyfills.js itself, and skipped entirely in polyfills.js.
var POLYFILLED_APIS = [
  { re: /\bObject\.assign\b/,      name: 'Object.assign' },
  { re: /\.find\s*\(/,             name: '.find()' },
  { re: /\.padStart\s*\(/,         name: '.padStart()' },
  { re: /\.repeat\s*\(/,           name: '.repeat()' },
];

var UNPOLYFILLED_APIS = [
  { re: /\bObject\.entries\b/,     name: 'Object.entries' },
  { re: /\bObject\.values\b/,      name: 'Object.values' },
  { re: /\bObject\.keys\b/,        name: null },  // ES5 — skip
  { re: /\bArray\.from\b/,         name: 'Array.from' },
  { re: /\bArray\.of\b/,           name: 'Array.of' },
  { re: /\.includes\s*\(/,         name: '.includes()' },
  { re: /\.findIndex\s*\(/,        name: '.findIndex()' },
  { re: /\bSymbol\b/,              name: 'Symbol' },
  { re: /\bNumber\.isFinite\b/,    name: 'Number.isFinite' },
  { re: /\bNumber\.isNaN\b/,       name: 'Number.isNaN' },
  { re: /\bNumber\.isInteger\b/,   name: 'Number.isInteger' }
];

// ── APIs native to Chrome 51 but not ES5 — informational only ───────────────
var NATIVE_44_APIS = [
  { re: /\.startsWith\s*\(/,       name: '.startsWith()' },
  { re: /\.endsWith\s*\(/,         name: '.endsWith()' },
  { re: /\bnew\s+Map\b/,           name: 'Map constructor' },
  { re: /\bnew\s+Set\b/,           name: 'Set constructor' },
  { re: /\bnew\s+WeakMap\b/,       name: 'WeakMap constructor' },
  { re: /\bnew\s+WeakSet\b/,       name: 'WeakSet constructor' },
  { re: /\bnew\s+Promise\b/,       name: 'Promise constructor' },
  { re: /\bPromise\.(all|race|resolve|reject)\b/, name: 'Promise static' },
];

function stripTrailingComment(line) {
  var inStr = false;
  var strCh = '';
  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    if (inStr) {
      if (ch === '\\') { i++; continue; }
      if (ch === strCh) inStr = false;
    } else {
      if (ch === '"' || ch === "'") { inStr = true; strCh = ch; }
      else if (ch === '/' && line[i + 1] === '/') return line.substring(0, i);
    }
  }
  return line;
}

var failed = false;
var warnCount = 0;

files.forEach(function (entry) {
  var filePath = entry.path;
  var fileRel = entry.rel;
  var isPolyfillFile = (fileRel.indexOf('polyfills.js') !== -1 && fileRel.indexOf('agni-runtime') !== -1);
  var content = fs.readFileSync(filePath, 'utf8');
  var lines = content.split('\n');
  var errors = [];
  var warnings = [];

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (/^\s*\/\//.test(line) || /^\s*\*/.test(line)) continue;

    var codePart = stripTrailingComment(line);

    var p;
    for (p = 0; p < SYNTAX_PATTERNS.length; p++) {
      if (SYNTAX_PATTERNS[p].re.test(codePart)) {
        errors.push('  line ' + (i + 1) + ': [SYNTAX] ' + SYNTAX_PATTERNS[p].name + ' — ' + codePart.trim().substring(0, 80));
      }
    }

    if (!isPolyfillFile) {
      for (p = 0; p < POLYFILLED_APIS.length; p++) {
        if (POLYFILLED_APIS[p].re.test(codePart)) {
          var msg = '  line ' + (i + 1) + ': [POLYFILLED] ' + POLYFILLED_APIS[p].name + ' — ' + codePart.trim().substring(0, 80);
          if (entry.isRuntime) {
            warnings.push(msg);
          } else {
            errors.push(msg.replace('[POLYFILLED]', '[API]') + ' (no polyfill in sw/pwa context)');
          }
        }
      }
    }

    for (p = 0; p < UNPOLYFILLED_APIS.length; p++) {
      if (UNPOLYFILLED_APIS[p].name === null) continue;
      if (UNPOLYFILLED_APIS[p].re.test(codePart)) {
        errors.push('  line ' + (i + 1) + ': [API] ' + UNPOLYFILLED_APIS[p].name + ' — ' + codePart.trim().substring(0, 80));
      }
    }
  }

  if (errors.length > 0) {
    console.error('FAIL ' + fileRel + ' (' + errors.length + ' errors):');
    errors.forEach(function (e) { console.error(e); });
    if (warnings.length > 0) {
      warnings.forEach(function (w) { console.log('  ' + w.trim()); });
    }
    failed = true;
  } else if (warnings.length > 0) {
    console.log('OK   ' + fileRel + ' (' + warnings.length + ' polyfilled APIs used)');
    warnCount += warnings.length;
  } else {
    console.log('OK   ' + fileRel);
  }
});

console.log('');
if (failed) {
  console.error('ES5 check FAILED. Runtime files must be compatible with Chrome 51 WebViews (Android 7.0).');
  console.error('  [SYNTAX] errors = ES6 syntax that causes parse errors — must be removed.');
  console.error('  [API] errors = ES6+ APIs not in Chrome 51 and not polyfilled — must be fixed.');
  console.error('  [POLYFILLED] warnings = APIs covered by polyfills.js (loaded first) — OK.');
  process.exit(1);
} else {
  console.log('All runtime files pass ES5 check for Chrome 51 (Android 7.0).' + (warnCount > 0 ? ' (' + warnCount + ' polyfill-covered API usages noted)' : ''));
}
