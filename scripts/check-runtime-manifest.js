#!/usr/bin/env node
'use strict';

/**
 * CI gate: verify runtimeManifest consistency and hub whitelist sync.
 *
 * Checks:
 *  1. Every value in FACTORY_FILE_MAP is a key in FACTORY_PATH_MAP
 *  2. Every file in FACTORY_LOAD_ORDER is in FACTORY_PATH_MAP
 *  3. Every file in FACTORY_LOAD_ORDER is in hub ALLOWED_FACTORY_FILES
 *
 * Exit 0 on pass, exit 1 on any failure.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const manifest = require(path.join(ROOT, 'packages', 'agni-utils', 'runtimeManifest.js'));
const { FACTORY_LOAD_ORDER, FACTORY_FILE_MAP, FACTORY_PATH_MAP } = manifest;

let failed = false;

function fail(msg) {
  console.error('FAIL  ' + msg);
  failed = true;
}

function pass(msg) {
  console.log('OK    ' + msg);
}

// 1. Every value in FACTORY_FILE_MAP is a key in FACTORY_PATH_MAP
let sectionFailed = false;
const fileMapValues = new Set(Object.values(FACTORY_FILE_MAP));
for (const filename of fileMapValues) {
  if (!FACTORY_PATH_MAP[filename]) {
    fail('FACTORY_FILE_MAP maps to ' + filename + ' but it is not in FACTORY_PATH_MAP');
    sectionFailed = true;
  }
}
if (!sectionFailed) pass('All FACTORY_FILE_MAP values are in FACTORY_PATH_MAP');

// 2. Every file in FACTORY_LOAD_ORDER is in FACTORY_PATH_MAP
sectionFailed = false;
for (const file of FACTORY_LOAD_ORDER) {
  if (!FACTORY_PATH_MAP[file]) {
    fail('FACTORY_LOAD_ORDER includes ' + file + ' but it is not in FACTORY_PATH_MAP');
    sectionFailed = true;
  }
}
if (!sectionFailed) pass('All FACTORY_LOAD_ORDER files are in FACTORY_PATH_MAP');

// 3. Ensure FACTORY_LOAD_ORDER files are in hub ALLOWED_FACTORY_FILES
const hubConstantsPath = path.join(ROOT, 'packages', 'agni-hub', 'lesson-server', 'constants.js');
let hubConstants;
try {
  hubConstants = require(hubConstantsPath);
} catch (e) {
  fail('Could not load lesson-server/constants.js: ' + e.message);
}
if (hubConstants) {
  const allowedSet = hubConstants.ALLOWED_FACTORY_FILES;
  if (!allowedSet || typeof allowedSet.has !== 'function') {
    fail('lesson-server/constants.js does not export ALLOWED_FACTORY_FILES Set');
  } else {
    sectionFailed = false;
    for (const file of FACTORY_LOAD_ORDER) {
      if (!allowedSet.has(file)) {
        fail('FACTORY_LOAD_ORDER includes ' + file + ' but it is not in hub ALLOWED_FACTORY_FILES');
        sectionFailed = true;
      }
    }
    if (!sectionFailed) pass('All FACTORY_LOAD_ORDER files are in hub ALLOWED_FACTORY_FILES');
  }
}

if (failed) {
  process.exit(1);
}
console.log('check-runtime-manifest: OK');
process.exit(0);
