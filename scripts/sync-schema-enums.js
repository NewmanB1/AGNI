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

var stepEnum = Array.from(plugins.getValidStepTypes());
var stepDef = schema.definitions.step.properties.type;
if (JSON.stringify(stepDef.enum) !== JSON.stringify(stepEnum)) {
  stepDef.enum = stepEnum;
  dirty = true;
}

// ── Factory names ───────────────────────────────────────────────────────────

var factoryEnum = Array.from(plugins.getFactoryIds());
var svgSpec = schema.definitions.step.properties.svg_spec;
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
