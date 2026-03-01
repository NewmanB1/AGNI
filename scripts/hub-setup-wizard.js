#!/usr/bin/env node
// scripts/hub-setup-wizard.js
// A1: Interactive hub setup wizard. Writes data/hub-config.json and optionally agni.env.

'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const DATA_DIR = path.join(__dirname, '../data');
const CONFIG_PATH = path.join(DATA_DIR, 'hub-config.json');

function prompt(rl, question, defaultVal) {
  const def = defaultVal !== undefined && defaultVal !== '' ? ` [${defaultVal}]` : '';
  return new Promise((resolve) => {
    rl.question(question + def + ': ', (answer) => {
      resolve(answer.trim() || (defaultVal !== undefined ? String(defaultVal) : ''));
    });
  });
}

async function run() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('\n🔥 AGNI Hub Setup Wizard (A1)\n');
  console.log('Configure paths, ports, and cache. Values in brackets are defaults (Enter to accept).\n');

  const dataDir = await prompt(rl, 'Data directory (AGNI_DATA_DIR)', path.join(__dirname, '../data'));
  const serveDir = await prompt(rl, 'Serve directory (AGNI_SERVE_DIR)', path.join(__dirname, '../serve'));
  const thetaPort = await prompt(rl, 'Theta port (AGNI_THETA_PORT)', '8082');
  const approvedCatalog = await prompt(rl, 'Approved catalog path (AGNI_APPROVED_CATALOG)', '');
  const minLocalSample = await prompt(rl, 'Min local sample size (AGNI_MIN_LOCAL_SAMPLE)', '40');
  const minLocalEdges = await prompt(rl, 'Min local edges (AGNI_MIN_LOCAL_EDGES)', '5');
  const yamlDir = await prompt(rl, 'YAML directory (AGNI_YAML_DIR)', '');
  const cacheMax = await prompt(rl, 'Lesson cache max (AGNI_CACHE_MAX)', '100');

  rl.close();

  const config = {};
  if (dataDir) config.dataDir = dataDir;
  if (serveDir) config.serveDir = serveDir;
  if (thetaPort) config.thetaPort = parseInt(thetaPort, 10) || 8082;
  if (approvedCatalog) config.approvedCatalog = approvedCatalog;
  if (minLocalSample) config.minLocalSample = parseInt(minLocalSample, 10) || 40;
  if (minLocalEdges) config.minLocalEdges = parseInt(minLocalEdges, 10) || 5;
  if (yamlDir) config.yamlDir = yamlDir;
  if (cacheMax) config.cacheMax = parseInt(cacheMax, 10) || 100;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  console.log('\n✓ Wrote', CONFIG_PATH);
  console.log('  Restart the hub (theta) for changes to take effect.\n');

  // Also write env snippet
  const envPath = path.join(__dirname, '../agni.env');
  const lines = [];
  if (config.dataDir) lines.push('AGNI_DATA_DIR=' + config.dataDir);
  if (config.serveDir) lines.push('AGNI_SERVE_DIR=' + config.serveDir);
  if (config.thetaPort) lines.push('AGNI_THETA_PORT=' + config.thetaPort);
  if (config.approvedCatalog) lines.push('AGNI_APPROVED_CATALOG=' + config.approvedCatalog);
  if (config.minLocalSample != null) lines.push('AGNI_MIN_LOCAL_SAMPLE=' + config.minLocalSample);
  if (config.minLocalEdges != null) lines.push('AGNI_MIN_LOCAL_EDGES=' + config.minLocalEdges);
  if (config.yamlDir) lines.push('AGNI_YAML_DIR=' + config.yamlDir);
  if (config.cacheMax != null) lines.push('AGNI_CACHE_MAX=' + config.cacheMax);
  if (lines.length > 0) {
    fs.writeFileSync(envPath, lines.join('\n') + '\n');
    console.log('✓ Wrote', envPath);
    console.log('  Run: source agni.env  (or set env vars before starting hub)\n');
  }
}

if (require.main === module) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { run };
