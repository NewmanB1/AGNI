#!/usr/bin/env node
'use strict';

// packages/agni-cli/cli.js
// AGNI CLI – Builds lesson bundles (HTML, native, etc.)
// Canonical entry point. Use: agni <input.yaml> [options] or node packages/agni-cli/cli.js

const path = require('path');
const fs = require('fs');
const compilerService = require('@ols/compiler/services/compiler');

const SCRIPTS_ROOT = path.join(__dirname, '../../scripts');

async function run() {
  const args = process.argv.slice(2);

  // ── Help ────────────────────────────────────────────────────────────────
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log(`
  🔥 AGNI — Open Lesson Standard Compiler
  Usage:
    agni <input.yaml> [options]
    agni hub setup --wizard   # Hub config (paths, ports, cache)
    agni hub init --wizard    # First-run: minimal config
    agni deploy setup --wizard # Deployment: hub ID, home URL, ports, USB
    agni sync setup --wizard   # Sync: transport, home URL, USB path
    agni analyze <lesson.yaml> [--curriculum=<path>]  # Lesson static analysis
    agni lms-repair   # Migrate/repair LMS state file (data/lms-state.json)
    npm run build   # if using package.json script

  Options:
    --validate               Validate only (no compilation) — runs schema + runtime checks
    --format=html|native|yaml-packet   Output format (default: html)
    --output=<path>          Output file path (required for html)
    --output-dir=<path>      Output directory (required for native and yaml-packet)
    --device-id=<uuid>       Bind output to a specific device
    --private-key=<path>     Path to Ed25519 private key for signing
    --dev                    Enable developer mode (sensor logging, emulator controls)

  Examples:
    agni lessons/gravity.yaml --validate
    agni lessons/gravity.yaml --format=html --output=dist/gravity.html
    agni lessons/gravity.yaml --format=html --output=dist/gravity.html --dev
    agni lessons/gravity.yaml --format=native --output-dir=dist/native-gravity
    agni lessons/gravity.yaml --format=yaml-packet --output-dir=dist/yaml-gravity
    agni lms-repair
    `);
    process.exit(0);
  }

  // ── Hub setup wizard (A1) ────────────────────────────────────────────────
  const firstArg = args.find(a => !a.startsWith('-'));
  const secondArg = args.filter(a => !a.startsWith('-'))[1];
  if (firstArg === 'hub' && secondArg === 'setup' && args.includes('--wizard')) {
    await require(path.join(SCRIPTS_ROOT, 'hub-setup-wizard.js')).run();
    return;
  }
  if (firstArg === 'hub' && secondArg === 'init' && args.includes('--wizard')) {
    await require(path.join(SCRIPTS_ROOT, 'hub-init-wizard.js')).run();
    return;
  }
  if (firstArg === 'deploy' && secondArg === 'setup' && args.includes('--wizard')) {
    await require(path.join(SCRIPTS_ROOT, 'deploy-setup-wizard.js')).run();
    return;
  }
  if (firstArg === 'sync' && secondArg === 'setup' && args.includes('--wizard')) {
    await require(path.join(SCRIPTS_ROOT, 'sync-setup-wizard.js')).run();
    return;
  }

  // ── Analyze lesson (static analysis) ─────────────────────────────────────
  if (firstArg === 'analyze') {
    const analyzeInput = args.filter(function (a) { return !a.startsWith('-'); })[1];
    let curriculumPath = null;
    args.forEach(function (a) {
      if (a.startsWith('--curriculum=')) curriculumPath = a.split('=')[1];
    });
    if (!analyzeInput) {
      console.error('Error: analyze requires a lesson file. Usage: agni analyze <lesson.yaml> [--curriculum=<path>]');
      process.exit(1);
    }
    return require(path.join(SCRIPTS_ROOT, 'analyze-lesson.js')).run(analyzeInput, { curriculum: curriculumPath });
  }

  // ── LMS repair (Backlog task 7) ──────────────────────────────────────────
  if (firstArg === 'lms-repair') {
    const engine = require('@agni/engine');
    engine.reloadState();
    console.log('LMS state reloaded; migration applied if needed. State path: AGNI_DATA_DIR/data/lms-state.json');
    return;
  }

  // ── Parse arguments ─────────────────────────────────────────────────────
  const params = {
    format: 'html',
    inputFile: null,
    output: null,
    outputDir: null,
    deviceId: null,
    privateKey: null,
    dev: false,
    validateOnly: false
  };

  args.forEach((arg) => {
    if (arg.startsWith('--format='))          params.format    = arg.split('=')[1];
    else if (arg.startsWith('--output-dir=')) params.outputDir = arg.split('=')[1];
    else if (arg.startsWith('--output='))     params.output    = arg.split('=')[1];
    else if (arg.startsWith('--device-id='))  params.deviceId  = arg.split('=')[1];
    else if (arg.startsWith('--private-key=')) params.privateKey = arg.split('=')[1];
    else if (arg === '--dev')                 params.dev       = true;
    else if (arg === '--validate')            params.validateOnly = true;
    else if (!arg.startsWith('-') && !params.inputFile) {
      params.inputFile = arg;
    }
  });

  if (!params.inputFile) {
    console.error('Error: No input file specified.');
    console.error('Usage: agni <input.yaml> --format=<html|native|yaml-packet> [options]');
    process.exit(1);
  }

  // ── Validate-only mode ────────────────────────────────────────────────
  if (params.validateOnly) {
    const lessonSchema = require('@ols/schema/lesson-schema');
    const lessonValidator = require('@ols/schema/lesson-validator');
    const envConfig = require('@agni/utils/env-config');

    const stat = fs.statSync(params.inputFile);
    const maxBytes = envConfig.yamlMaxBytes || 2 * 1024 * 1024;
    if (stat.size > maxBytes) {
      console.error('YAML file exceeds max size (' + stat.size + ' > ' + maxBytes + ')');
      process.exit(1);
    }
    const raw = fs.readFileSync(params.inputFile, 'utf8');
    const parsed = compilerService.parseLessonFromString(raw, { maxBytes: maxBytes });
    if (parsed.error) {
      console.error('YAML parse error:', parsed.error);
      process.exit(1);
    }
    const lessonData = parsed.lessonData;

    let hasErrors = false;
    const seen = new Set();

    // Layer 1: schema + structural validation
    const schemaResult = lessonSchema.validateLessonData(lessonData);
    if (!schemaResult.valid) {
      for (const err of schemaResult.errors) {
        seen.add(err);
        console.error('ERROR', err);
      }
      hasErrors = true;
    }
    for (const w of (schemaResult.warnings || [])) {
      seen.add(w);
      console.warn('WARN ', w);
    }

    // Layer 2: runtime compatibility validation (deduplicated)
    const runtimeResult = lessonValidator.validateLesson(lessonData);
    for (const issue of runtimeResult) {
      const msg = issue.message || '';
      if (seen.has(msg)) continue;
      seen.add(msg);
      if (issue.severity === 'error') {
        console.error('ERROR [' + (issue.step || 'lesson') + ']', msg);
        hasErrors = true;
      } else {
        console.warn('WARN  [' + (issue.step || 'lesson') + ']', msg);
      }
    }

    if (hasErrors) {
      console.error('\nValidation failed.');
      process.exit(1);
    }
    console.log('Validation passed — no errors.');
    process.exit(0);
  }

  // ── Dispatch to compiler service ────────────────────────────────────────
  try {
    await compilerService.compileLessonFromYamlFile(params.inputFile, {
      format:      params.format,
      output:      params.output,
      outputDir:   params.outputDir,
      deviceId:    params.deviceId,
      privateKey:  params.privateKey,
      dev:         params.dev,
      logFeatures: true
    });
  } catch (err) {
    console.error('Build failed:');
    console.error(err.message);
    if (err.stack) console.error(err.stack.split('\n').slice(0, 6).join('\n'));
    process.exit(1);
  }

  console.log('Build complete.');
}

// ── Auto-execute when called directly ──────────────────────────────────────
if (require.main === module) {
  (async () => {
    try {
      await run();
    } catch (err) {
      console.error('Unexpected CLI error:');
      console.error(err);
      process.exit(1);
    }
  })();
}

module.exports = { run };
