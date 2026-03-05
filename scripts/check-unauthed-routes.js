#!/usr/bin/env node
'use strict';

/**
 * Verifies that all mutating hub routes (POST, PUT, DELETE) are protected by
 * auth middleware (requireHubKey, authOnly, adminOnly, roleOnly).
 * Exits non-zero if any unprotected mutating route is found.
 * CI gate: prevents regression of route auth.
 */

const fs = require('fs');
const path = require('path');

const ROUTES_DIR = path.resolve(__dirname, '../packages/agni-hub/routes');
const AUTH_MIDDLEWARE = ['requireHubKey', 'authOnly', 'adminOnly', 'roleOnly'];

// Paths intentionally open (no auth middleware)
const ALLOWLIST = new Set([
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/accounts/student/claim',
  '/api/accounts/student/verify-pin'
]);

function normalizePath(p) {
  return p.replace(/:\w+/g, ':id').replace(/\/\*/g, '');
}

function isPathAllowlisted(method, pathStr) {
  const base = pathStr.split('?')[0].split('(')[0].trim();
  return method === 'POST' && ALLOWLIST.has(base);
}

function extractRoutePath(str) {
  const m = str.match(/router\.(post|put|delete)\s*\(\s*['"`]([^'"`]+)['"`]/);
  return m ? { method: m[1].toUpperCase(), path: m[2] } : null;
}

function hasAuthWrapper(line) {
  const handlerStart = line.replace(/router\.(post|put|delete)\s*\(\s*['"`][^'"`]+['"`]\s*,\s*/, '');
  const trimmed = handlerStart.trim();
  for (const mw of AUTH_MIDDLEWARE) {
    if (trimmed.startsWith(mw + '(') || trimmed.startsWith('withRateLimit(')) {
      if (mw === 'withRateLimit') return true;
      return true;
    }
  }
  if (trimmed.startsWith('withRateLimit(')) {
    return true;
  }
  return false;
}

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const failures = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/router\.(post|put|delete)\s*\(\s*['"`]([^'"`]+)['"`]/);
    if (!m) continue;

    const method = m[1].toUpperCase();
    const routePath = m[2];

    if (isPathAllowlisted(method, routePath)) continue;

    const handlerPart = line.substring(line.indexOf(m[2]) + m[2].length + 3).trim();
    const fullHandler = handlerPart + (lines[i + 1] || '');

    const hasAuth = AUTH_MIDDLEWARE.some(mw => fullHandler.includes(mw + '('));

    if (!hasAuth) {
      failures.push({ file: path.basename(filePath), line: i + 1, method, path: routePath });
    }
  }

  return failures;
}

function main() {
  const files = fs.readdirSync(ROUTES_DIR).filter(f => f.endsWith('.js'));
  let allFailures = [];

  for (const file of files) {
    const failures = checkFile(path.join(ROUTES_DIR, file));
    allFailures = allFailures.concat(failures);
  }

  if (allFailures.length > 0) {
    console.error('Unprotected mutating routes found:');
    allFailures.forEach(f => {
      console.error('  %s %s %s:%d', f.method, f.path, f.file, f.line);
    });
    console.error('\nWrap with requireHubKey, authOnly, adminOnly, or roleOnly.');
    process.exit(1);
  }

  console.log('All mutating routes are protected.');
}

main();
