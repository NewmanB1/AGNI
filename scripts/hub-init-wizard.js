#!/usr/bin/env node
// scripts/hub-init-wizard.js
// A3: First-run onboarding. Creates minimal hub config in one flow.

'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const REPO_ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(REPO_ROOT, 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'hub_config.json');
const POLICY_PATH = path.join(DATA_DIR, 'governance_policy.json');
const CATALOG_PATH = path.join(DATA_DIR, 'approved_catalog.json');

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

  console.log('\n🔥 AGNI Hub Init — First-run Onboarding (A3)\n');

  const exists = fs.existsSync(CONFIG_PATH);
  if (exists) {
    const cont = await prompt(rl, 'hub_config.json already exists. Overwrite? (y/n)', 'n');
    if (cont.toLowerCase() !== 'y' && cont.toLowerCase() !== 'yes') {
      console.log('Aborted.');
      rl.close();
      return;
    }
  }

  console.log('Minimal config. Values in brackets are defaults (Enter to accept).\n');

  const dataDir = await prompt(rl, 'Data directory (AGNI_DATA_DIR)', path.join(REPO_ROOT, 'data'));
  const thetaPort = await prompt(rl, 'Theta port (AGNI_THETA_PORT)', '8082');
  const createPolicy = await prompt(rl, 'Create default governance policy? (y/n)', 'y');

  rl.close();

  const config = {
    thetaPort: parseInt(thetaPort, 10) || 8082,
    minLocalSample: 40,
    minLocalEdges: 5,
    cacheMax: 100
  };
  if (dataDir) config.dataDir = dataDir;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log('✓ Created', DATA_DIR);
  }

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  console.log('✓ Wrote', CONFIG_PATH);

  if (createPolicy.toLowerCase() === 'y' || createPolicy.toLowerCase() === 'yes') {
    const policy = { minDifficulty: 1, maxDifficulty: 5, requireUtu: false, requireTeachingMode: false };
    fs.writeFileSync(POLICY_PATH, JSON.stringify(policy, null, 2));
    console.log('✓ Wrote', POLICY_PATH);
  }

  const catalogPath = CATALOG_PATH;
  if (!fs.existsSync(catalogPath)) {
    fs.writeFileSync(catalogPath, JSON.stringify({ lessonIds: [] }, null, 2));
    console.log('✓ Wrote', catalogPath);
  }

  console.log('\nHub provisioned. Restart theta for changes to take effect.');
  console.log('  node hub-tools/theta.js\n');
}

if (require.main === module) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { run };
