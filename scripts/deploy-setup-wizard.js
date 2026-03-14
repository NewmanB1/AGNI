#!/usr/bin/env node
// scripts/deploy-setup-wizard.js
// F1: Deployment wizard. Hub ID, home URL, ports, USB path for field tech provisioning.

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

  console.log('\n🔥 AGNI Deployment Setup (F1)\n');
  console.log('Field tech: hub ID, home URL, ports, USB path. Provision hub in one flow.\n');

  const hubId = await prompt(rl, 'Hub ID (AGNI_HUB_ID)', 'hub-local');
  const homeUrl = await prompt(rl, 'Home URL (AGNI_HOME_URL)', '');
  const pathfinderPort = await prompt(rl, 'Pathfinder port (AGNI_PATHFINDER_PORT)', '8082');
  const servePort = await prompt(rl, 'Serve port (AGNI_SERVE_PORT)', '8083');
  const telemetryEnginePort = await prompt(rl, 'Telemetry Engine port (AGNI_TELEMETRY_ENGINE_PORT)', '8081');
  const usbPath = await prompt(rl, 'USB path (AGNI_USB_PATH)', '/mnt/usb/agni-sync');

  rl.close();

  let existing = {};
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      existing = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (e) {}
  }

  const config = {
    ...existing,
    hubId: hubId || 'hub-local',
    pathfinderPort: parseInt(pathfinderPort, 10) || 8082,
    servePort: parseInt(servePort, 10) || 8083,
    telemetryEnginePort: parseInt(telemetryEnginePort, 10) || 8081
  };
  if (homeUrl) config.homeUrl = homeUrl;
  if (usbPath) config.usbPath = usbPath;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  console.log('\n✓ Wrote', CONFIG_PATH);
  console.log('  Restart pathfinder, sync, and Telemetry Engine for changes to take effect.\n');
}

if (require.main === module) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { run };
