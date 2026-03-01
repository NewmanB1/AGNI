#!/usr/bin/env node
'use strict';

/**
 * Validates that src/runtime/ files use strict ES5 only.
 * Checks both syntax patterns and ES6+ API usage that
 * non-updatable Android 6.0 WebViews (Chrome 44) may lack.
 */

var fs = require('fs');
var path = require('path');

var runtimeDir = path.join(__dirname, '..', 'src', 'runtime');

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
      results.push(rel);
    }
  }
  return results;
}
var files = collectJsFiles(runtimeDir, '');

var SYNTAX_PATTERNS = [
  { re: /\b(let|const)\s/,         name: 'let/const' },
  { re: /=>/,                       name: 'arrow function' },
  { re: /`[^`]*`/,                  name: 'template literal' },
  { re: /\bclass\s/,               name: 'class keyword' },
  { re: /\.\.\./,                   name: 'spread/rest operator' },
  { re: /\bfor\s*\(\s*(?:var\s+)?(?:\w+)\s+of\b/, name: 'for...of loop' },
  { re: /\{\s*\[/,                  name: 'computed property' },
  { re: /\bfunction\s*\*\s/,       name: 'generator function' },
  { re: /\basync\s+function/,      name: 'async function' },
  { re: /\bawait\s/,               name: 'await keyword' }
];

var API_PATTERNS = [
  { re: /\bObject\.assign\b/,      name: 'Object.assign' },
  { re: /\bObject\.entries\b/,     name: 'Object.entries' },
  { re: /\bObject\.values\b/,      name: 'Object.values' },
  { re: /\bObject\.keys\b/,        name: null },  // ES5 — skip
  { re: /\bArray\.from\b/,         name: 'Array.from' },
  { re: /\bArray\.of\b/,           name: 'Array.of' },
  { re: /\.includes\s*\(/,         name: '.includes()' },
  { re: /\.find\s*\(/,             name: '.find()' },
  { re: /\.findIndex\s*\(/,        name: '.findIndex()' },
  { re: /\.startsWith\s*\(/,       name: '.startsWith()' },
  { re: /\.endsWith\s*\(/,         name: '.endsWith()' },
  { re: /\.repeat\s*\(/,           name: '.repeat()' },
  { re: /\bSymbol\b/,              name: 'Symbol' },
  { re: /\bnew\s+Map\b/,           name: 'Map constructor' },
  { re: /\bnew\s+Set\b/,           name: 'Set constructor' },
  { re: /\bnew\s+WeakMap\b/,       name: 'WeakMap constructor' },
  { re: /\bnew\s+WeakSet\b/,       name: 'WeakSet constructor' },
  { re: /\bnew\s+Promise\b/,       name: 'Promise constructor' },
  { re: /\bPromise\.(all|race|resolve|reject)\b/, name: 'Promise static' },
  { re: /\bNumber\.isFinite\b/,    name: 'Number.isFinite' },
  { re: /\bNumber\.isNaN\b/,       name: 'Number.isNaN' },
  { re: /\bNumber\.isInteger\b/,   name: 'Number.isInteger' }
];

var allPatterns = SYNTAX_PATTERNS.concat(API_PATTERNS.filter(function (p) { return p.name !== null; }));

var failed = false;

files.forEach(function (file) {
  var filePath = path.join(runtimeDir, file.replace(/\//g, path.sep));
  var content = fs.readFileSync(filePath, 'utf8');
  var lines = content.split('\n');
  var errors = [];

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (/^\s*\/\//.test(line) || /^\s*\*/.test(line)) continue;

    for (var p = 0; p < allPatterns.length; p++) {
      if (allPatterns[p].re.test(line)) {
        errors.push('  line ' + (i + 1) + ': ' + allPatterns[p].name + ' — ' + line.trim().substring(0, 80));
      }
    }
  }

  if (errors.length > 0) {
    console.error('FAIL ' + file + ' (' + errors.length + ' issues):');
    errors.forEach(function (e) { console.error(e); });
    failed = true;
  } else {
    console.log('OK   ' + file);
  }
});

if (failed) {
  console.error('\nES5 check failed. Runtime files must be strict ES5 for Chrome 44+ WebViews.');
  process.exit(1);
} else {
  console.log('\nAll runtime files pass ES5 check.');
}
