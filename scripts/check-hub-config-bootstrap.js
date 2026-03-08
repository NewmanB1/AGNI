#!/usr/bin/env node
'use strict';

/**
 * Regression guard for Bug 4: embeddingDim from hub-config must flow to engine.
 *
 * - hub-config.js CONFIG_KEYS must include embeddingDim → AGNI_EMBEDDING_DIM.
 * - theta.js, sentry.js, sync.js must call loadHubConfig() before require('env-config').
 *
 * Exit 0 pass, 1 fail.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const errors = [];

// 1. CONFIG_KEYS must include embeddingDim
const hubConfigPath = path.join(ROOT, 'packages', 'agni-utils', 'hub-config.js');
const hubConfigSrc = fs.readFileSync(hubConfigPath, 'utf8');
if (!hubConfigSrc.includes("['embeddingDim', 'AGNI_EMBEDDING_DIM']") &&
    !hubConfigSrc.includes('["embeddingDim", "AGNI_EMBEDDING_DIM"]')) {
  errors.push('hub-config.js CONFIG_KEYS must include embeddingDim → AGNI_EMBEDDING_DIM.');
}
if (!hubConfigSrc.includes("['forgetting', 'AGNI_FORGETTING']") &&
    !hubConfigSrc.includes('["forgetting", "AGNI_FORGETTING"]')) {
  errors.push('hub-config.js CONFIG_KEYS must include forgetting → AGNI_FORGETTING.');
}
if (!hubConfigSrc.includes("['maxStudents', 'AGNI_MAX_STUDENTS']") &&
    !hubConfigSrc.includes('["maxStudents", "AGNI_MAX_STUDENTS"]')) {
  errors.push('hub-config.js CONFIG_KEYS must include maxStudents → AGNI_MAX_STUDENTS.');
}
if (!hubConfigSrc.includes("['maxLessons', 'AGNI_MAX_LESSONS']") &&
    !hubConfigSrc.includes('["maxLessons", "AGNI_MAX_LESSONS"]')) {
  errors.push('hub-config.js CONFIG_KEYS must include maxLessons → AGNI_MAX_LESSONS.');
}

// 2. Bootstrap order: loadHubConfig before env-config
function checkBootstrap(filePath, label) {
  const src = fs.readFileSync(filePath, 'utf8');
  const lines = src.split(/\r?\n/);
  let loadHubLine = -1;
  let envConfigLine = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (loadHubLine < 0 && /loadHubConfig\s*\(/.test(line)) loadHubLine = i;
    if (envConfigLine < 0 && /require\s*\(\s*['"]@agni\/utils\/env-config['"]\s*\)/.test(line)) envConfigLine = i;
    if (envConfigLine < 0 && /require\s*\(\s*['"]\.\/env-config['"]\s*\)/.test(line)) envConfigLine = i;
  }
  if (loadHubLine < 0) {
    errors.push(`${label}: must call loadHubConfig() before env-config.`);
    return;
  }
  if (envConfigLine >= 0 && loadHubLine > envConfigLine) {
    errors.push(`${label}: loadHubConfig must run before require(env-config). Move loadHubConfig earlier.`);
  }
}

checkBootstrap(path.join(ROOT, 'packages', 'agni-hub', 'theta.js'), 'theta.js');
checkBootstrap(path.join(ROOT, 'packages', 'agni-hub', 'sentry.js'), 'sentry.js');
checkBootstrap(path.join(ROOT, 'packages', 'agni-hub', 'sync.js'), 'sync.js');
checkBootstrap(path.join(ROOT, 'packages', 'agni-hub', 'hub-transform.js'), 'hub-transform.js');

if (errors.length > 0) {
  console.error('check-hub-config-bootstrap: regression guards failed\n');
  errors.forEach((e) => console.error('  ', e));
  process.exit(1);
}
console.log('check-hub-config-bootstrap: OK');
process.exit(0);
