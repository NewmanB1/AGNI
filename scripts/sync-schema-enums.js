'use strict';

// Synchronises the enum values in schemas/ols.schema.json with the plugin
// registry. Run this after adding a new factory, step type, or sensor to
// packages/agni-plugins/builtins/ to keep the JSON Schema in sync.
//
// Usage:  node scripts/sync-schema-enums.js [--check]
//   --check  exits with code 1 if the schema is out of date (for CI)

var fs   = require('fs');
var path = require('path');
var plugins = require('@agni/plugins');

var SCHEMA_PATH = path.resolve(__dirname, '..', 'schemas', 'ols.schema.json');
var checkOnly = process.argv.includes('--check');

var raw = fs.readFileSync(SCHEMA_PATH, 'utf8');
var schema = JSON.parse(raw);

var dirty = false;

// ── Step types ──────────────────────────────────────────────────────────────
// Step type enum lives in stepCommonProps (referenced by all step variants).

var stepEnum = Array.from(plugins.getValidStepTypes());
var stepCommonProps = schema.definitions && schema.definitions.stepCommonProps;
var stepTypeDef = stepCommonProps && stepCommonProps.properties && stepCommonProps.properties.type;
if (stepTypeDef) {
  if (JSON.stringify(stepTypeDef.enum || null) !== JSON.stringify(stepEnum)) {
    stepTypeDef.enum = stepEnum;
    dirty = true;
  }
} else {
  console.error('sync-schema-enums: definitions.stepCommonProps.properties.type not found');
  process.exit(1);
}

// ── Factory names ───────────────────────────────────────────────────────────
// Factory enum lives in definitions.svgSpec.properties.factory.

var factoryEnum = Array.from(plugins.getFactoryIds());
var svgSpec = schema.definitions && schema.definitions.svgSpec;
if (svgSpec && svgSpec.properties && svgSpec.properties.factory) {
  var fProp = svgSpec.properties.factory;
  if (JSON.stringify(fProp.enum) !== JSON.stringify(factoryEnum)) {
    fProp.enum = factoryEnum;
    fProp.description = 'Registered factory name: ' + factoryEnum.join(', ') + '.';
    dirty = true;
  }
}

// ── Result ──────────────────────────────────────────────────────────────────

if (!dirty) {
  console.log('OK: ols.schema.json enums are in sync with @agni/plugins.');
  process.exit(0);
}

if (checkOnly) {
  console.error('FAIL: ols.schema.json enums are out of date. Run: node scripts/sync-schema-enums.js');
  process.exit(1);
}

var out = JSON.stringify(schema, null, 2) + '\n';
fs.writeFileSync(SCHEMA_PATH, out, 'utf8');
console.log('Updated ols.schema.json enums from @agni/plugins.');
