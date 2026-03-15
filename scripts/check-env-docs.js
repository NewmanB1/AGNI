#!/usr/bin/env node
'use strict';

/**
 * Verifies that every env key validated in packages/agni-utils/env-validate.js
 * is documented in docs/CONFIGURATION.md. Exit 0 on pass, 1 if a key is missing.
 */

var path = require('path');
var fs = require('fs');

var ROOT = path.resolve(__dirname, '..');
var CONFIG_DOC = path.join(ROOT, 'docs/CONFIGURATION.md');

// Avoid loading env-validate (which may log); extract keys from the module
var envValidatePath = path.join(ROOT, 'packages/agni-utils/env-validate.js');
var content = fs.readFileSync(envValidatePath, 'utf8');

function extractNumericKeys(src) {
  var keys = [];
  var re = /key:\s*['"](AGNI_[A-Z0-9_]+)['"]/g;
  var m;
  while ((m = re.exec(src)) !== null) keys.push(m[1]);
  return keys;
}

function extractDirKeys(src) {
  var keys = [];
  var re = /DIR_ENV_KEYS\s*=\s*\[([^\]]+)\]/;
  var m = re.exec(src);
  if (!m) return keys;
  var inner = m[1];
  var keyRe = /['"](AGNI_[A-Z0-9_]+)['"]/g;
  while ((m = keyRe.exec(inner)) !== null) keys.push(m[1]);
  return keys;
}

var numericKeys = extractNumericKeys(content);
var dirKeys = extractDirKeys(content);
var allKeys = [];
numericKeys.forEach(function (k) { allKeys.push(k); });
dirKeys.forEach(function (k) {
  if (allKeys.indexOf(k) === -1) allKeys.push(k);
});

var configContent = fs.readFileSync(CONFIG_DOC, 'utf8');
var missing = [];
allKeys.forEach(function (key) {
  if (configContent.indexOf(key) === -1) missing.push(key);
});

if (missing.length > 0) {
  console.error('check-env-docs: env keys validated in env-validate.js are not documented in docs/CONFIGURATION.md:\n');
  missing.forEach(function (k) { console.error('  ' + k); });
  console.error('\nAdd these to docs/CONFIGURATION.md (Environment Variables Reference or hub-config table).');
  process.exit(1);
}
console.log('check-env-docs: all env-validate keys are documented in docs/CONFIGURATION.md.');
