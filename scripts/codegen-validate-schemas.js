#!/usr/bin/env node
/**
 * Validate that all JSON schemas in schemas/ are loadable by Ajv (Phase 3 / Sprint N).
 * Run: node scripts/codegen-validate-schemas.js
 * Exit 0 = all valid, 1 = invalid or missing.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const schemasDir = path.join(__dirname, '..', 'schemas');
let Ajv;
try {
  Ajv = require('ajv');
} catch (e) {
  console.error('ajv not installed. npm install ajv');
  process.exit(1);
}

const ajv = new Ajv({ strict: false });
const files = fs.readdirSync(schemasDir).filter(f => f.endsWith('.schema.json'));

let failed = false;
for (const file of files) {
  const filePath = path.join(schemasDir, file);
  try {
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    ajv.compile(schema);
    console.log('OK', file);
  } catch (err) {
    console.error('FAIL', file, err.message);
    failed = true;
  }
}

if (failed) process.exit(1);
process.exit(0);
