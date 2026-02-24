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
    node src/cli.js lms-repair   # Migrate/repair LMS state file (data/lms_state.json)
    npm run build   # if using package.json script

  Options:
    --format=html|native     Output format (default: html)
    --output=<path>          Output file path (required for html)
    --output-dir=<path>      Output directory (required for native)
    --device-id=<uuid>       Bind output to a specific device
    --private-key=<path>     Path to Ed25519 private key for signing
    --dev                    Enable developer mode (sensor logging, emulator controls)

  Examples:
    node src/cli.js lessons/gravity.yaml --format=html --output=dist/gravity.html
    node src/cli.js lessons/gravity.yaml --format=html --output=dist/gravity.html --dev
    node src/cli.js lessons/gravity.yaml --format=native --output-dir=dist/native-gravity
    node src/cli.js lms-repair
    `);
    process.exit(0);
  }

  // ── LMS repair (Backlog task 7) ──────────────────────────────────────────
  const firstArg = args.find(a => !a.startsWith('-'));
  if (firstArg === 'lms-repair') {
    const engine = require('./engine');
    engine.reloadState();
    console.log('LMS state reloaded; migration applied if needed. State path: AGNI_DATA_DIR/data/lms_state.json');
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
    dev: false
  };

  args.forEach((arg) => {
    if (arg.startsWith('--format='))          params.format    = arg.split('=')[1];
    else if (arg.startsWith('--output-dir=')) params.outputDir = arg.split('=')[1];
    else if (arg.startsWith('--output='))     params.output    = arg.split('=')[1];
    else if (arg.startsWith('--device-id='))  params.deviceId  = arg.split('=')[1];
    else if (arg.startsWith('--private-key=')) params.privateKey = arg.split('=')[1];
    else if (arg === '--dev')                 params.dev       = true;
    else if (!arg.startsWith('-') && !params.inputFile) {
      params.inputFile = arg;
    }
  });

  if (!params.inputFile) {
    console.error('Error: No input file specified.');
    console.error('Usage: node src/cli.js <input.yaml> --format=<html|native> [options]');
    process.exit(1);
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
