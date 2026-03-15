#!/usr/bin/env node
'use strict';

/**
 * Verifies that every hub route (method + path) is documented in docs/api-contract.md.
 * Prevents new routes from shipping without a contract update. Complements check-api-contract-auth.js.
 *
 * Exit 0 on pass, 1 if any route is undocumented.
 */

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var CONTRACT_PATH = path.join(ROOT, 'docs/api-contract.md');
var ROUTES_DIR = path.join(ROOT, 'packages/agni-hub/routes');
var PATHFINDER = path.join(ROOT, 'packages/agni-hub/pathfinder.js');

function normalizePathForMatch(p) {
  return p
    .replace(/\?.*$/, '')
    .replace(/:[^/]+/g, ':id')
    .trim();
}

function parseContractPaths(content) {
  var set = new Set();
  var lines = content.split('\n');
  for (var i = 0; i < lines.length; i++) {
    var m = lines[i].match(/\|\s*(GET|POST|PUT|DELETE|PATCH)\s*\|\s*`([^`]+)`/);
    if (!m) continue;
    var method = m[1].toUpperCase();
    var rawPath = m[2].split('?')[0].trim();
    var norm = normalizePathForMatch(rawPath);
    set.add(method + ' ' + norm);
  }
  return set;
}

function extractRoutesFromFile(filePath) {
  var content = fs.readFileSync(filePath, 'utf8');
  var lines = content.split('\n');
  var routes = [];
  for (var i = 0; i < lines.length; i++) {
    var m = lines[i].match(/router\.(get|post|put|delete)\s*\(\s*['"`]([^'"`?]+)/);
    if (!m) continue;
    var method = m[1].toUpperCase();
    var routePath = m[2].trim();
    var norm = normalizePathForMatch(routePath);
    routes.push({ key: method + ' ' + norm, path: routePath });
  }
  return routes;
}

function main() {
  var contractContent = fs.readFileSync(CONTRACT_PATH, 'utf8');
  var documented = parseContractPaths(contractContent);

  var allRoutes = [];
  if (fs.existsSync(ROUTES_DIR)) {
    var files = fs.readdirSync(ROUTES_DIR).filter(function (f) {
      return f.endsWith('.js');
    });
    for (var i = 0; i < files.length; i++) {
      var r = extractRoutesFromFile(path.join(ROUTES_DIR, files[i]));
      allRoutes = allRoutes.concat(r);
    }
  }
  if (fs.existsSync(PATHFINDER)) {
    allRoutes = allRoutes.concat(extractRoutesFromFile(PATHFINDER));
  }

  var seen = new Set();
  var undocumented = [];
  for (var j = 0; j < allRoutes.length; j++) {
    var route = allRoutes[j];
    if (seen.has(route.key)) continue;
    seen.add(route.key);
    if (!documented.has(route.key)) {
      undocumented.push(route.key + ' (' + route.path + ')');
    }
  }

  if (undocumented.length > 0) {
    console.error('Every hub route must be documented in docs/api-contract.md.\n');
    console.error('Undocumented routes:\n');
    undocumented.forEach(function (r) {
      console.error('  ' + r);
    });
    console.error('\nAdd a row to the appropriate Endpoints table: Method | Path | Auth | Description');
    process.exit(1);
  }

  console.log('check-api-contract-routes: all routes documented in api-contract.md');
}

main();
