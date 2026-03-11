#!/usr/bin/env node
/**
 * Generate TypeScript type declarations from JSON schemas.
 * Run: node scripts/codegen-types.js
 * Exit 0 = success, 1 = failure.
 *
 * Generated files go to packages/types/generated/. They are committed so that
 * CI, Pi, and offline devs do not need to run codegen. Regenerate when schemas change.
 *
 * Hardware note: Codegen runs at build/CI time only. No runtime impact on edge
 * devices (Android Nougat) or Village Hub (Raspberry Pi).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SCHEMAS_DIR = path.join(__dirname, '..', 'schemas');
const OUT_DIR = path.join(__dirname, '..', 'packages', 'types', 'generated');

const BANNER = `/**
 * DO NOT EDIT. Generated from schemas/*.schema.json by scripts/codegen-types.js.
 * Regenerate with: npm run codegen:types
 */`;

const SCHEMA_MAP = [
  { file: 'ols.schema.json', out: 'ols.d.ts', rootName: 'OlsLesson' },
  { file: 'graph-weights.schema.json', out: 'graph-weights.d.ts', rootName: 'GraphWeights' },
  { file: 'governance-policy.schema.json', out: 'governance-policy.d.ts', rootName: 'GovernancePolicy' },
];

async function main() {
  let compile;
  try {
    ({ compile } = require('json-schema-to-typescript'));
  } catch (e) {
    console.error('json-schema-to-typescript not installed. npm install -D json-schema-to-typescript');
    process.exit(1);
  }

  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  let failed = false;
  for (const { file, out, rootName } of SCHEMA_MAP) {
    const schemaPath = path.join(SCHEMAS_DIR, file);
    const outPath = path.join(OUT_DIR, out);

    if (!fs.existsSync(schemaPath)) {
      console.error('SKIP', file, '(not found)');
      continue;
    }

    try {
      const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
      const ts = await compile(schema, rootName, {
        bannerComment: BANNER,
        cwd: SCHEMAS_DIR,
        declareExternallyReferenced: true,
        format: true,
        unknownAny: true,
        strictIndexSignatures: false,
      });
      fs.writeFileSync(outPath, ts, 'utf8');
      console.log('OK', file, '->', out);
    } catch (err) {
      console.error('FAIL', file, err.message);
      failed = true;
    }
  }

  if (failed) process.exit(1);
  process.exit(0);
}

main();
