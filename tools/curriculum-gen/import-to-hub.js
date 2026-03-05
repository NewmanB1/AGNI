#!/usr/bin/env node
'use strict';

/**
 * Copy a generated lesson YAML into the hub's YAML directory.
 * Use AGNI_YAML_DIR or default data/yaml (relative to repo root).
 *
 * Usage:
 *   node import-to-hub.js output/lessons/math/grade-8/lesson-name.yaml
 *   node import-to-hub.js path/to/lesson.yaml
 *
 * Environment:
 *   AGNI_YAML_DIR  Target directory (default: ../../data/yaml from this script)
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_YAML_DIR = path.join(REPO_ROOT, 'data', 'yaml');
const YAML_DIR = process.env.AGNI_YAML_DIR || DEFAULT_YAML_DIR;

const srcPath = process.argv[2];
if (!srcPath) {
  console.error('Usage: node import-to-hub.js <lesson.yaml>');
  console.error('Copies the lesson YAML to AGNI_YAML_DIR (default: data/yaml).');
  process.exit(1);
}

const absSrc = path.resolve(process.cwd(), srcPath);
if (!fs.existsSync(absSrc)) {
  console.error('File not found:', absSrc);
  process.exit(1);
}

const baseName = path.basename(absSrc, path.extname(absSrc));
const destPath = path.join(YAML_DIR, baseName + '.yaml');

try {
  fs.mkdirSync(YAML_DIR, { recursive: true });
  fs.copyFileSync(absSrc, destPath);
  console.log('Copied to:', destPath);
} catch (e) {
  console.error('Failed:', e.message);
  process.exit(1);
}
