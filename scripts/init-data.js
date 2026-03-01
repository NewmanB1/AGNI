#!/usr/bin/env node
'use strict';

/**
 * Creates empty runtime state files if they don't already exist.
 * Run once after cloning or on first hub startup.
 *
 * These files are gitignored — they hold per-deployment state
 * (student data, sessions, telemetry) that must never be committed.
 */

const fs = require('fs');
const path = require('path');

const dataDir = process.env.AGNI_DATA_DIR || path.join(__dirname, '..', 'data');

const defaults = {
  'groups.json':                   { groups: [] },
  'mastery-summary.json':          { students: {} },
  'review-schedule.json':          { students: {} },
  'telemetry-events.json':         { events: [] },
  'learning-paths.json':           { paths: [] },
  'feature-flags.json':            { flags: {} },
  'parent-links.json':             { links: [], invites: [] },
  'recommendation-overrides.json': {},
  'creator-accounts.json':         { creators: [] },
  'student-accounts.json':         { students: [] },
  'sessions.json':                 { sessions: [] }
};

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let created = 0;
for (const [file, content] of Object.entries(defaults)) {
  const filePath = path.join(dataDir, file);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(content, null, 2) + '\n');
    console.log('Created ' + file);
    created++;
  }
}

if (created === 0) {
  console.log('All data files already exist.');
} else {
  console.log('Initialized ' + created + ' data file(s) in ' + dataDir);
}
