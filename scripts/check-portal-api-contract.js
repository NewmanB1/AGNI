#!/usr/bin/env node
'use strict';

/**
 * Verifies that API paths used in portal/js/api.js are documented in docs/api-contract.md.
 * Extracts path strings from api.js and ensures each base path appears in the contract.
 * Exit 0 on pass, 1 if a portal path is undocumented.
 */

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var PORTAL_API = path.join(ROOT, 'portal/js/api.js');
var CONTRACT = path.join(ROOT, 'docs/api-contract.md');

function extractPathsFromApiJs(content) {
  var paths = new Set();
  // authGet('api/...'), get('health'), post('api/auth/login', ...), etc.
  var re = /(?:get|post|authGet|authPost|authPut|authDelete)\s*\(\s*['"`]([^'"`?]+)/g;
  var m;
  while ((m = re.exec(content)) !== null) {
    var p = m[1].replace(/\$\{[^}]+\}/g, ':id').trim();
    if (p === 'health' || p.indexOf('api/') === 0) paths.add(p);
  }
  return paths;
}

function extractPathsFromContract(content) {
  var paths = new Set();
  // Table rows: | GET | `/health` | ... or | POST | `/api/auth/login` | ...
  var re = /\|\s*(?:GET|POST|PUT|DELETE)\s*\|\s*`([^`?]+)/g;
  var m;
  while ((m = re.exec(content)) !== null) {
    var p = m[1].trim().replace(/^\//, '').split('?')[0].trim();
    if (p) paths.add(p);
  }
  return paths;
}

function normalize(base) {
  return base.replace(/:slug/g, ':id').replace(/:pseudoId/g, ':id').replace(/:id/g, ':id');
}

function main() {
  var apiContent = fs.readFileSync(PORTAL_API, 'utf8');
  var contractContent = fs.readFileSync(CONTRACT, 'utf8');

  var portalPaths = extractPathsFromApiJs(apiContent);
  var contractPaths = extractPathsFromContract(contractContent);
  var contractNorm = new Set();
  contractPaths.forEach(function (c) {
    contractNorm.add(normalize(c));
    contractNorm.add(c);
  });

  var undocumented = [];
  portalPaths.forEach(function (p) {
    var base = p.split('?')[0];
    var n = normalize(base);
    var found = contractNorm.has(base) || contractNorm.has(n);
    if (!found) {
      contractPaths.forEach(function (c) {
        if (normalize(c) === n || (c.indexOf('api/') === 0 && n.indexOf('api/') === 0 && c.split('/').slice(0, 3).join('/') === n.split('/').slice(0, 3).join('/'))) found = true;
      });
    }
    if (!found) undocumented.push(p);
  });

  if (undocumented.length > 0) {
    console.error('Portal api.js uses paths not documented in docs/api-contract.md:\n');
    undocumented.forEach(function (u) { console.error('  ' + u); });
    console.error('\nAdd these to the contract or remove from portal.');
    process.exit(1);
  }
  console.log('check-portal-api-contract: portal API paths are documented.');
}

main();
