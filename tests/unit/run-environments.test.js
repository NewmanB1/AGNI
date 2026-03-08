'use strict';

/**
 * Unit tests for run-environment constraints.
 * Verifies that edge device code is ES5-only and hub code is Pi-aware.
 * See docs/RUN-ENVIRONMENTS.md.
 */

const { describe, it } = require('../helpers/test-api');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

describe('Run environments', () => {
  it('docs/RUN-ENVIRONMENTS.md exists and documents hardware constraints', () => {
    const docPath = path.join(ROOT, 'docs', 'RUN-ENVIRONMENTS.md');
    assert.ok(fs.existsSync(docPath), 'RUN-ENVIRONMENTS.md must exist');
    const content = fs.readFileSync(docPath, 'utf8');
    assert.ok(content.includes('Raspberry Pi'), 'must document Pi for hub');
    assert.ok(content.includes('Marshmallow') || content.includes('Android 6'), 'must document Marshmallow for edge');
    assert.ok(content.includes('ES5'), 'must document ES5 for edge');
  });

  it('check-es5 script covers hub sw.js and pwa files', () => {
    const checkPath = path.join(ROOT, 'scripts', 'check-es5.js');
    const content = fs.readFileSync(checkPath, 'utf8');
    assert.ok(content.includes('packages/agni-hub/sw.js'), 'check-es5 must include sw.js');
    assert.ok(content.includes('pwa'), 'check-es5 must include pwa files');
  });

  it('check-run-environments script exists', () => {
    const scriptPath = path.join(ROOT, 'scripts', 'check-run-environments.js');
    assert.ok(fs.existsSync(scriptPath), 'check-run-environments.js must exist');
  });

  it('hub-config.pi.json exists for Pi deployment', () => {
    const configPath = path.join(ROOT, 'data', 'hub-config.pi.json');
    assert.ok(fs.existsSync(configPath), 'hub-config.pi.json must exist for Pi');
  });

  it('edge device code uses vanilla JS only (no frameworks)', () => {
    const runtimeDir = path.join(ROOT, 'packages', 'agni-runtime');
    const hubPwaDir = path.join(ROOT, 'packages', 'agni-hub', 'pwa');
    const hubSwPath = path.join(ROOT, 'packages', 'agni-hub', 'sw.js');
    const frameworkPattern = /\b(react|vue|angular|svelte|preact)\b/i;

    function scanDir(dir, files = []) {
      if (!fs.existsSync(dir)) return files;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory() && e.name !== 'node_modules') scanDir(full, files);
        else if (e.name.endsWith('.js')) files.push(full);
      }
      return files;
    }

    const edgeFiles = scanDir(runtimeDir).concat(
      fs.existsSync(hubPwaDir) ? scanDir(hubPwaDir) : [],
      fs.existsSync(hubSwPath) ? [hubSwPath] : []
    );

    const violations = [];
    for (const f of edgeFiles) {
      if (f.includes('index.js') || f.includes('svg-catalog')) continue; // Node-only
      const content = fs.readFileSync(f, 'utf8');
      if (frameworkPattern.test(content)) {
        violations.push(path.relative(ROOT, f));
      }
    }
    assert.strictEqual(violations.length, 0,
      'Edge code must be vanilla JS; no React/Vue/Angular/Svelte. Found in: ' + violations.join(', '));
  });
});
