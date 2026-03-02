// src/cli.js
// AGNI CLI – Builds lesson bundles (HTML, native, etc.)

const fs = require('fs');
const compilerService = require('./services/compiler');

async function run() {
  const args = process.argv.slice(2);

  // ── Help ────────────────────────────────────────────────────────────────
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log(`
  🔥 AGNI — Open Lesson Standard Compiler
  Usage:
    node src/cli.js <input.yaml> [options]
    node src/cli.js hub setup --wizard   # Hub config (paths, ports, cache)
    node src/cli.js hub init --wizard    # First-run: minimal config
    node src/cli.js deploy setup --wizard # Deployment: hub ID, home URL, ports, USB
    node src/cli.js sync setup --wizard   # Sync: transport, home URL, USB path
    node src/cli.js lms-repair   # Migrate/repair LMS state file (data/lms-state.json)
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
    node src/cli.js lessons/gravity.yaml --validate
    node src/cli.js lessons/gravity.yaml --format=html --output=dist/gravity.html
    node src/cli.js lessons/gravity.yaml --format=html --output=dist/gravity.html --dev
    node src/cli.js lessons/gravity.yaml --format=native --output-dir=dist/native-gravity
    node src/cli.js lessons/gravity.yaml --format=yaml-packet --output-dir=dist/yaml-gravity
    node src/cli.js lms-repair
    `);
    process.exit(0);
  }

  // ── Hub setup wizard (A1) ────────────────────────────────────────────────
  const firstArg = args.find(a => !a.startsWith('-'));
  const secondArg = args.filter(a => !a.startsWith('-'))[1];
  if (firstArg === 'hub' && secondArg === 'setup' && args.includes('--wizard')) {
    await require('../scripts/hub-setup-wizard.js').run();
    return;
  }
  if (firstArg === 'hub' && secondArg === 'init' && args.includes('--wizard')) {
    await require('../scripts/hub-init-wizard.js').run();
    return;
  }
  if (firstArg === 'deploy' && secondArg === 'setup' && args.includes('--wizard')) {
    await require('../scripts/deploy-setup-wizard.js').run();
    return;
  }
  if (firstArg === 'sync' && secondArg === 'setup' && args.includes('--wizard')) {
    await require('../scripts/sync-setup-wizard.js').run();
    return;
  }

  // ── LMS repair (Backlog task 7) ──────────────────────────────────────────
  if (firstArg === 'lms-repair') {
    const engine = require('./engine');
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
    console.error('Usage: node src/cli.js <input.yaml> --format=<html|native|yaml-packet> [options]');
    process.exit(1);
  }

  // ── Validate-only mode ────────────────────────────────────────────────
  if (params.validateOnly) {
    const yaml = require('js-yaml');
    const lessonSchema = require('./services/lesson-schema');
    const lessonValidator = require('./utils/lesson-validator');

    const raw = fs.readFileSync(params.inputFile, 'utf8');
    let lessonData;
    try {
      lessonData = yaml.load(raw);
    } catch (e) {
      console.error('YAML parse error:', e.message);
      process.exit(1);
    }

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
      if (issue.level === 'error') {
        console.error('ERROR [' + (issue.stepId || 'lesson') + ']', msg);
        hasErrors = true;
      } else {
        console.warn('WARN  [' + (issue.stepId || 'lesson') + ']', msg);
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
