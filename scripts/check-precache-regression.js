#!/usr/bin/env node
'use strict';

/**
 * CI gate: regression guards for the Opportunistic Precache Plan.
 * See docs/OPPORTUNISTIC-PRECACHE-PLAN.md.
 *
 * Phase 3: SW bounded lesson cache + eviction
 *   - sw.js defines MAX_LESSON_CACHE_ENTRIES
 *   - _networkFirst for LESSON_CACHE evicts when at capacity (FIFO)
 *
 * Phase 4: Shell integration
 *   - shell.html loads precache.js
 *   - hub-transform.js serves /precache.js
 *
 * Exit 0 on pass, 1 on failure.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let failed = false;

function fail(msg) {
  console.error('FAIL  ' + msg);
  failed = true;
}

function pass(msg) {
  console.log('OK    ' + msg);
}

// Phase 3: SW bounded lesson cache
const swPath = path.join(ROOT, 'packages', 'agni-hub', 'sw.js');
const swSrc = fs.readFileSync(swPath, 'utf8');

if (!/MAX_LESSON_CACHE_ENTRIES\s*=\s*\d+/.test(swSrc)) {
  fail('sw.js must define MAX_LESSON_CACHE_ENTRIES (bounded lesson cache)');
} else {
  pass('sw.js defines MAX_LESSON_CACHE_ENTRIES');
}

if (!/cacheName\s*===\s*LESSON_CACHE/.test(swSrc)) {
  fail('sw.js _networkFirst must check cacheName === LESSON_CACHE for eviction');
} else if (!/keys\.length\s*>=\s*MAX_LESSON_CACHE_ENTRIES/.test(swSrc)) {
  fail('sw.js LESSON_CACHE must evict when keys.length >= MAX_LESSON_CACHE_ENTRIES');
} else if (!/cache\.delete\(/.test(swSrc)) {
  fail('sw.js LESSON_CACHE eviction must call cache.delete');
} else {
  pass('sw.js LESSON_CACHE has FIFO eviction before put');
}

// Phase 4: Shell integration
const shellPath = path.join(ROOT, 'packages', 'agni-hub', 'pwa', 'shell.html');
const shellSrc = fs.readFileSync(shellPath, 'utf8');

if (!/precache\.js/.test(shellSrc)) {
  fail('shell.html must include precache.js script');
} else {
  pass('shell.html loads precache.js');
}

const hubTransformPath = path.join(ROOT, 'packages', 'agni-hub', 'hub-transform.js');
const hubSrc = fs.readFileSync(hubTransformPath, 'utf8');

if (!/\/precache\.js/.test(hubSrc) || !/urlPath\s*===\s*['"]\/precache\.js['"]/.test(hubSrc)) {
  fail('hub-transform.js must serve GET /precache.js');
} else {
  pass('hub-transform.js has /precache.js route');
}

if (failed) {
  process.exit(1);
}
console.log('check-precache-regression: OK');
process.exit(0);
