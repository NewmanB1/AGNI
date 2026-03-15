#!/usr/bin/env node
'use strict';

/**
 * Optional check: finds markdown links like [text](path) or [text](path#anchor)
 * in docs/ and ensures the target file exists (anchors are not validated).
 * Exit 0 on pass, 1 if a linked file is missing.
 */

var path = require('path');
var fs = require('fs');

var ROOT = path.resolve(__dirname, '..');
var DOCS = path.join(ROOT, 'docs');

function findMarkdownFiles(dir, list) {
  list = list || [];
  var entries = fs.readdirSync(dir, { withFileTypes: true });
  entries.forEach(function (e) {
    var full = path.join(dir, e.name);
    if (e.isDirectory() && e.name !== 'node_modules' && e.name !== '.git') {
      findMarkdownFiles(full, list);
    } else if (e.isFile() && /\.md$/.test(e.name)) {
      list.push(full);
    }
  });
  return list;
}

function extractLinks(content, baseDir) {
  var links = [];
  // [text](url) or [text](url#anchor)
  var re = /\]\(([^)#\s]+)(?:#([^)]*))?\)/g;
  var m;
  while ((m = re.exec(content)) !== null) {
    var url = m[1];
    if (/^(https?:|\/\/|mailto:|javascript:)/.test(url)) continue;
    if (url.indexOf('#') === 0) continue;
    var resolved = path.resolve(baseDir, url.split('#')[0]);
    links.push(resolved);
  }
  return links;
}

var mdFiles = findMarkdownFiles(DOCS);
var missing = [];
var checked = {};

mdFiles.forEach(function (file) {
  var baseDir = path.dirname(file);
  var content = fs.readFileSync(file, 'utf8');
  var links = extractLinks(content, baseDir);
  links.forEach(function (target) {
    var key = target;
    if (checked[key]) return;
    checked[key] = true;
    if (!fs.existsSync(target)) {
      missing.push({ from: path.relative(ROOT, file), to: path.relative(ROOT, target) });
    }
  });
});

// Also check CONVENTIONS and CONTRIBUTING from repo root
['CONVENTIONS.md', 'CONTRIBUTING.md'].forEach(function (name) {
  var file = path.join(ROOT, name);
  if (!fs.existsSync(file)) return;
  var baseDir = ROOT;
  var content = fs.readFileSync(file, 'utf8');
  var links = extractLinks(content, baseDir);
  links.forEach(function (target) {
    var key = target;
    if (checked[key]) return;
    checked[key] = true;
    if (!fs.existsSync(target)) {
      missing.push({ from: name, to: path.relative(ROOT, target) });
    }
  });
});

if (missing.length > 0) {
  console.error('check-doc-links: broken internal links (target file missing):\n');
  missing.forEach(function (o) { console.error('  ' + o.from + ' → ' + o.to); });
  console.error('\nFix or remove the link.');
  process.exit(1);
}
console.log('check-doc-links: no broken file links in docs (and CONVENTIONS/CONTRIBUTING).');
