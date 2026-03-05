#!/usr/bin/env node
'use strict';

/**
 * Verifies that docs/api-contract.md Auth column matches hub route middleware.
 * Parses api-contract and route files, compares, exits non-zero on mismatch.
 * CI gate: prevents doc/implementation drift.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CONTRACT_PATH = path.join(ROOT, 'docs/api-contract.md');
const ROUTES_DIR = path.join(ROOT, 'hub-tools/routes');

const AUTH_MAP = {
  'No': 'none',
  'Bearer': 'authOnly',
  'Admin': 'adminOnly',
  'HubKey': 'requireHubKey'
};

function parseApiContract(content) {
  const expected = new Map();
  const lines = content.split('\n');

  for (const line of lines) {
    const m = line.match(/\|\s*(GET|POST|PUT|DELETE)\s*\|\s*`([^`]+)`\s*\|\s*(\S+)\s*\|/);
    if (!m) continue;
    const method = m[1];
    const rawPath = m[2].split('?')[0].trim();
    const auth = m[3].trim();
    const key = method + ' ' + rawPath;
    expected.set(key, auth);
  }
  return expected;
}

function parseRouteFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const actual = new Map();
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/router\.(get|post|put|delete)\s*\(\s*['"`]([^'"`?]+)/);
    if (!m) continue;
    const method = m[1].toUpperCase();
    const routePath = m[2];
    const handlerLine = lines[i] + (lines[i + 1] || '');

    let auth = 'none';
    if (handlerLine.includes('requireHubKey(')) auth = 'requireHubKey';
    else if (handlerLine.includes('adminOnly(')) auth = 'adminOnly';
    else if (handlerLine.includes('authOnly(')) auth = 'authOnly';
    else if (handlerLine.includes('roleOnly(')) auth = 'roleOnly';
    else if ((routePath.includes('auth/me') || routePath.includes('auth/logout')) && (handlerLine.includes('validateSession') || handlerLine.includes('extractBearerToken'))) auth = 'authOnly';

    const key = method + ' ' + routePath;
    actual.set(key, auth);
  }
  return actual;
}

function normalizePathForMatch(pathStr) {
  return pathStr.replace(/:[^/]+/g, ':id');
}

function main() {
  const contractContent = fs.readFileSync(CONTRACT_PATH, 'utf8');
  const expected = parseApiContract(contractContent);

  const allActual = new Map();
  const routeFiles = fs.readdirSync(ROUTES_DIR).filter(f => f.endsWith('.js'));
  for (const f of routeFiles) {
    const m = parseRouteFile(path.join(ROUTES_DIR, f));
    m.forEach((v, k) => allActual.set(k, v));
  }

  const mismatches = [];
  expected.forEach((docAuth, key) => {
    const actualAuth = allActual.get(key);
    if (!actualAuth) return;
    const docNorm = AUTH_MAP[docAuth] || docAuth;
    if (docNorm === 'none' && actualAuth !== 'none') {
      mismatches.push({ key, doc: docAuth, impl: actualAuth, msg: 'Doc says No auth but route has ' + actualAuth });
    } else if (docNorm !== 'none' && actualAuth === 'none') {
      mismatches.push({ key, doc: docAuth, impl: actualAuth, msg: 'Doc says ' + docAuth + ' but route has no auth' });
    } else if (docNorm !== actualAuth && docNorm !== 'none') {
      mismatches.push({ key, doc: docAuth, impl: actualAuth, msg: 'Doc says ' + docAuth + ', route has ' + actualAuth });
    }
  });

  if (mismatches.length > 0) {
    console.error('api-contract.md Auth does not match route implementations:');
    mismatches.forEach(m => console.error('  %s: %s', m.key, m.msg));
    process.exit(1);
  }

  console.log('api-contract Auth column matches route middleware.');
}

main();
