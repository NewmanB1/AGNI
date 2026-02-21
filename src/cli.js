// src/cli.js
// AGNI CLI – Builds lesson bundles (HTML, native, etc.)

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const buildHtml = require('./builders/html');
const buildNative = require('./builders/native');

async function run() {
  const args = process.argv.slice(2);

  // ── Help ────────────────────────────────────────────────────────────────
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log(`
  🔥 AGNI — Open Lesson Standard Compiler
  Usage:
    node src/cli.js <input.yaml> [options]
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
    `);
    process.exit(0);
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

  if (!fs.existsSync(params.inputFile)) {
    console.error(`Error: File not found: ${params.inputFile}`);
    process.exit(1);
  }

  if (params.dev) {
    console.log('⚠️  Developer mode enabled — not for distribution');
  }

  // ── Load and parse YAML ─────────────────────────────────────────────────
  let data;
  try {
    const raw = fs.readFileSync(params.inputFile, 'utf8');
    data = yaml.load(raw);
  } catch (err) {
    console.error(`Error parsing YAML: ${err.message}`);
    process.exit(1);
  }

  // ── FEATURE INFERENCE (optional, continues on failure) ──────────────────
  try {
    const { inferFeatures } = require('./utils/featureInference');
    const inferred = inferFeatures(data);
    console.log(`\n[FEATURE INFERENCE] ${data.meta?.title || 'Unnamed lesson'} (${params.inputFile})`);
    console.log(JSON.stringify(inferred, null, 2));
    data.inferredFeatures = inferred;
  } catch (err) {
    console.warn(`[Warning] Feature inference failed: ${err.message}`);
  }

  // ── Basic validation ────────────────────────────────────────────────────
  if (!data || !data.meta || !data.steps) {
    console.error('Error: Invalid OLS file. Must contain "meta" and "steps" fields.');
    process.exit(1);
  }
  if (!Array.isArray(data.steps)) {
    console.error('Error: "steps" must be a YAML array (each item prefixed with "-").');
    process.exit(1);
  }

  // ── Dispatch to builder ─────────────────────────────────────────────────
  try {
    if (params.format === 'html') {
      if (!params.output) {
        console.error('Error: --output=<path> is required for HTML format.');
        process.exit(1);
      }
      await buildHtml(data, params);
    } else if (params.format === 'native') {
      if (!params.outputDir) {
        console.error('Error: --output-dir=<path> is required for Native format.');
        process.exit(1);
      }
      await buildNative(data, params);
    } else {
      console.error(`Error: Unknown format "${params.format}". Use "html" or "native".`);
      process.exit(1);
    }
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
