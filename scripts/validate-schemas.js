#!/usr/bin/env node
'use strict';

/**
 * Validates OLS lesson files and data files against their JSON schemas.
 * Replaces the inline shell loops that used temp files and unsafe interpolation.
 *
 * Exit 0 = all valid, 1 = any failure.
 */

const fs = require('fs');
const path = require('path');
const { safeYamlLoad } = require('@ols/compiler/services/compiler');

let Ajv, addFormats;
try {
  Ajv = require('ajv');
  addFormats = require('ajv-formats');
} catch {
  console.error('Missing deps: npm install ajv ajv-formats');
  process.exit(1);
}

const root = path.join(__dirname, '..');
const schemasDir = path.join(root, 'schemas');
const lessonsDir = path.join(root, 'lessons');
const fixturesDir = path.join(root, 'fixtures');
const dataDir = path.join(root, 'data');

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);

let failed = false;

function loadSchema(name) {
  const filePath = path.join(schemasDir, name);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function validate(schemaName, data, label) {
  const schema = loadSchema(schemaName);
  const valid = ajv.validate(schema, data);
  if (valid) {
    console.log('  OK  ' + label);
  } else {
    console.error('  FAIL ' + label);
    for (const err of ajv.errors) {
      console.error('       ' + (err.instancePath || '/') + ' ' + err.message);
    }
    failed = true;
  }
}

// ── OLS lesson files ────────────────────────────────────────────────────────
console.log('Validating OLS lesson files...');
if (fs.existsSync(lessonsDir)) {
  const lessons = fs.readdirSync(lessonsDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
  for (const file of lessons) {
    const filePath = path.join(lessonsDir, file);
    try {
      const data = safeYamlLoad(fs.readFileSync(filePath, 'utf8'));
      validate('ols.schema.json', data, file);
    } catch (err) {
      console.error('  FAIL ' + file + ' (parse error: ' + err.message + ')');
      failed = true;
    }
  }
}

// ── Graph weights fixtures ──────────────────────────────────────────────────
console.log('Validating graph weights fixtures...');
if (fs.existsSync(fixturesDir)) {
  const fixtures = fs.readdirSync(fixturesDir).filter(f => f.endsWith('.json'));
  for (const file of fixtures) {
    const filePath = path.join(fixturesDir, file);
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      validate('graph-weights.schema.json', data, file);
    } catch (err) {
      console.error('  FAIL ' + file + ' (parse error: ' + err.message + ')');
      failed = true;
    }
  }
}

// ── Data files against their schemas ────────────────────────────────────────
// Convention: data file "foo_bar.json" or "foo-bar.json" maps to schema "foo-bar.schema.json"
const dataSchemaMap = {
  'hub-config.json':              'hub-config.schema.json',
  'groups.json':                  'groups.schema.json',
  'feature-flags.json':           'feature-flags.schema.json',
  'learning-paths.json':          'learning-paths.schema.json',
  'review-schedule.json':         'review-schedule.schema.json',
  'telemetry-events.json':        'telemetry-events.schema.json',
  'archetypes.json':              'archetypes.schema.json',
  'governance-policy.json':       'governance-policy.schema.json',
  'approved-catalog.json':        'approved-catalog.schema.json',
  'mastery-summary.json':         'mastery-summary.schema.json',
  'parent-links.json':            'parent-links.schema.json',
  'recommendation-overrides.json':'recommendation-overrides.schema.json'
};

console.log('Validating data files...');
for (const [dataFile, schemaFile] of Object.entries(dataSchemaMap)) {
  const dataPath = path.join(dataDir, dataFile);
  const schemaPath = path.join(schemasDir, schemaFile);
  if (!fs.existsSync(dataPath)) continue;
  if (!fs.existsSync(schemaPath)) {
    console.log('  SKIP ' + dataFile + ' (no schema: ' + schemaFile + ')');
    continue;
  }
  try {
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    validate(schemaFile, data, 'data/' + dataFile);
  } catch (err) {
    console.error('  FAIL data/' + dataFile + ' (parse error: ' + err.message + ')');
    failed = true;
  }
}

if (failed) {
  console.error('\nValidation failed.');
  process.exit(1);
} else {
  console.log('\nAll validations passed.');
}
