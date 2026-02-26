#!/usr/bin/env node
// scripts/sync-setup-wizard.js
// F2: Sync transport config. Starlink or USB, home URL, import/export paths.

'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const DATA_DIR = path.join(__dirname, '../data');
const CONFIG_PATH = path.join(DATA_DIR, 'hub_config.json');

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

  console.log('\n🔥 AGNI Sync Setup (F2)\n');
  console.log('Configure sync transport (Starlink or USB), home URL, import/export paths.\n');

  const transport = await prompt(rl, 'Transport (starlink/usb)', 'starlink');
  const homeUrl = await prompt(rl, 'Home URL (AGNI_HOME_URL)', '');
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
    syncTransport: transport === 'usb' ? 'usb' : 'starlink'
  };
  if (homeUrl) config.homeUrl = homeUrl;
  if (usbPath) config.usbPath = usbPath;

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  console.log('\n✓ Wrote', CONFIG_PATH);
  console.log('  Restart sync for changes to take effect.\n');
}

if (require.main === module) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { run };
