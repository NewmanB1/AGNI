// hub-tools/sync.js
// AGNI Hub Sync v1.7.0 – hardened for low-resource environments
//
// Packages anonymized learning events for the home server and receives
// updated BaseCost tables, regional graphs, curriculums, and schedules.
//
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const http = require('http');

// ── Configuration ──────────────────────────────────────────────────────────
const DATA_DIR = process.env.AGNI_DATA_DIR || path.join(__dirname, '../data');
const EVENTS_DIR = path.join(DATA_DIR, 'events');
const GRAPH_WEIGHTS = path.join(DATA_DIR, 'graph_weights.json');
const BASE_COSTS = path.join(DATA_DIR, 'base_costs.json');
const SYNC_STATE = path.join(DATA_DIR, 'sync_state.json');
const SYNC_LOG = path.join(DATA_DIR, 'sync.log');

const args = parseArgs(process.argv.slice(2));
const TRANSPORT = args['transport'] || 'starlink';
const HOME_URL = (args['home-url'] || process.env.AGNI_HOME_URL || '').replace(/\/$/, '');
const USB_PATH = args['usb-path'] || process.env.AGNI_USB_PATH || '/mnt/usb/agni-sync';
const HUB_ID = process.env.AGNI_HUB_ID || 'hub-local';
const IMPORT_FILE = args['import'] || null;

// ═══════════════════════════════════════════════════════════════════════════
// 1. Re-pseudonymization
// ═══════════════════════════════════════════════════════════════════════════
function buildTokenMap(pseudoIds) {
  const map = {};
  pseudoIds.forEach(id => {
    map[id] = 'bt-' + crypto.randomBytes(6).toString('hex');
  });
  return map;
}

function repseudonymize(events, tokenMap) {
  return events.map(ev => ({
    batchToken: tokenMap[ev.pseudoId] || ('bt-' + crypto.randomBytes(6).toString('hex')),
    lessonId: ev.lessonId,
    lessonVersion: ev.lessonVersion,
    difficulty: ev.difficulty,
    language: ev.language,
    skillsRequired: ev.skillsRequired || [],
    skillsProvided: ev.skillsProvided || [],
    mastery: ev.mastery,
    steps: (ev.steps || []).map(s => ({
      stepId: s.stepId,
      type: s.type,
      weight: s.weight,
      score: s.score,
      passed: s.passed,
      skipped: s.skipped,
      attempts: s.attempts
      // durationMs intentionally omitted
    })),
    completedDate: ev.completedAt ? ev.completedAt.slice(0, 10) : null
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Sync state
// ═══════════════════════════════════════════════════════════════════════════
function loadSyncState() {
  if (!fs.existsSync(SYNC_STATE)) return { lastSyncAt: null, syncedFiles: [] };
  try { return JSON.parse(fs.readFileSync(SYNC_STATE, 'utf8')); } catch (e) { return { lastSyncAt: null, syncedFiles: [] }; }
}

function saveSyncState(state) {
  fs.writeFileSync(SYNC_STATE, JSON.stringify(state, null, 2));
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Load unsynced events
// ═══════════════════════════════════════════════════════════════════════════
function loadUnsynced() {
  const state = loadSyncState();
  const synced = new Set(state.syncedFiles || []);
  if (!fs.existsSync(EVENTS_DIR)) return { events: [], files: [] };

  const files = fs.readdirSync(EVENTS_DIR)
    .filter(f => f.endsWith('.ndjson') && !synced.has(f))
    .sort();

  const events = [];
  files.forEach(file => {
    const content = fs.readFileSync(path.join(EVENTS_DIR, file), 'utf8');
    content.split('\n').filter(l => l.trim()).forEach(line => {
      try { events.push(JSON.parse(line)); } catch (e) {}
    });
  });

  return { events, files };
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Build sync package
// ═══════════════════════════════════════════════════════════════════════════
function loadDiscoveredCohort() {
  if (!fs.existsSync(GRAPH_WEIGHTS)) return null;
  try {
    const gw = JSON.parse(fs.readFileSync(GRAPH_WEIGHTS, 'utf8'));
    return gw.discovered_cohort || null;
  } catch (e) {
    return null;
  }
}

function buildPackage(events) {
  const pseudoIds = [...new Set(events.map(e => e.pseudoId))];
  const tokenMap = buildTokenMap(pseudoIds);
  const discoveredCohort = loadDiscoveredCohort();

  return {
    schemaVersion: '1.7.0',
    hubId: HUB_ID,
    packageId: 'pkg-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex'),
    createdAt: new Date().toISOString(),
    eventCount: events.length,
    cohortSize: pseudoIds.length,
    discovered_cohort: discoveredCohort,
    events: repseudonymize(events, tokenMap)
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Starlink transport
// ═══════════════════════════════════════════════════════════════════════════
function sendViaStarlink(pkg) {
  if (!HOME_URL) return Promise.reject(new Error('--home-url required for Starlink transport'));

  const body = JSON.stringify(pkg);
  const url = new URL(HOME_URL + '/api/hub-sync');
  const lib = url.protocol === 'https:' ? https : http;

  _log(`Sending ${pkg.eventCount} event(s) to ${url.href}`);

  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-AGNI-Hub-ID': HUB_ID,
        'X-AGNI-Version': '1.7.0'
      }
    };

    const req = lib.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); }
          catch (e) { resolve({ accepted: pkg.eventCount }); }
        } else {
          reject(new Error(`Home server HTTP ${res.statusCode}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(body);
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. USB / sneakernet transport
// ═══════════════════════════════════════════════════════════════════════════
function sendViaUsb(pkg) {
  if (!fs.existsSync(USB_PATH)) {
    try { fs.mkdirSync(USB_PATH, { recursive: true }); }
    catch (e) { return Promise.reject(new Error('USB path not accessible: ' + USB_PATH)); }
  }

  const filename = `sync_${HUB_ID}_${new Date().toISOString().slice(0,10)}_${pkg.packageId}.json`;
  const dest = path.join(USB_PATH, filename);
  fs.writeFileSync(dest, JSON.stringify(pkg, null, 2));

  _log(`Package written to USB: ${dest} (${pkg.eventCount} events)`);
  return Promise.resolve({ accepted: pkg.eventCount, packageFile: dest });
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. Inbound import – hardened version
// ═══════════════════════════════════════════════════════════════════════════
function importInbound(filePath) {
  if (!fs.existsSync(filePath)) {
    _log(`ERROR: import file not found: ${filePath}`);
    return false;
  }

  const stats = fs.statSync(filePath);
  if (stats.size > 10 * 1024 * 1024) {  // cap at ~10 MB
    _log(`ERROR: inbound file too large (${Math.round(stats.size / 1024 / 1024)} MB)`);
    return false;
  }

  let incoming;
  try {
    incoming = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    _log(`ERROR: could not parse inbound file: ${e.message}`);
    return false;
  }

  // 1. BaseCosts
  if (incoming.costs && typeof incoming.costs === 'object' && Object.keys(incoming.costs).length > 0) {
    let existing = {};
    if (fs.existsSync(BASE_COSTS)) {
      try { existing = JSON.parse(fs.readFileSync(BASE_COSTS, 'utf8')); } catch {}
    }
    const merged = { ...existing, ...incoming.costs };
    fs.writeFileSync(BASE_COSTS, JSON.stringify(merged, null, 2));
    _log(`BaseCosts: ${Object.keys(incoming.costs).length} skill(s) updated, total now ${Object.keys(merged).length}`);
  }

  // 2. Regional / higher-level graph weights
  if (incoming.graph_weights?.level && incoming.graph_weights.level !== 'village' &&
      Array.isArray(incoming.graph_weights.edges) && incoming.graph_weights.edges.length > 0) {
    const level = incoming.graph_weights.level;
    const levelPath = path.join(DATA_DIR, `graph_weights_${level}.json`);
    fs.writeFileSync(levelPath, JSON.stringify(incoming.graph_weights, null, 2));
    _log(`Stored ${level} graph_weights: ${levelPath} (${incoming.graph_weights.edges.length} edges)`);
  }

  // 3. Jurisdictional Curriculum Overrides
  if (incoming.curriculum?.graph && typeof incoming.curriculum.graph === 'object') {
    const dest = path.join(DATA_DIR, 'curriculum.json');
    fs.writeFileSync(dest, JSON.stringify(incoming.curriculum, null, 2));
    _log(`Jurisdictional curriculum imported (${Object.keys(incoming.curriculum.graph).length} skills defined)`);
  }

  // 4. Governance Student Schedules
  if (incoming.schedules?.students && typeof incoming.schedules.students === 'object') {
    const dest = path.join(DATA_DIR, 'schedules.json');
    fs.writeFileSync(dest, JSON.stringify(incoming.schedules, null, 2));
    _log(`Student schedules imported (${Object.keys(incoming.schedules.students).length} students)`);
  }

  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. Main sync flow
// ═══════════════════════════════════════════════════════════════════════════
async function runSync() {
  if (IMPORT_FILE) {
    _log(`Importing inbound update from: ${IMPORT_FILE}`);
    const success = importInbound(IMPORT_FILE);
    if (!success) process.exitCode = 1;
    return;
  }

  const { events, files } = loadUnsynced();
  if (!events.length) {
    _log('No new events to sync.');
    return;
  }

  _log(`Preparing ${events.length} event(s) from ${files.length} file(s)...`);
  const pkg = buildPackage(events);

  const cohortMsg = pkg.discovered_cohort
    ? `cohort ${pkg.discovered_cohort}`
    : 'cohort not yet discovered';

  _log(`Package ${pkg.packageId}: ${pkg.cohortSize} student(s), ${cohortMsg}`);

  let result;
  try {
    result = TRANSPORT === 'usb'
      ? await sendViaUsb(pkg)
      : await sendViaStarlink(pkg);
  } catch (err) {
    _log(`SYNC FAILED: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  const state = loadSyncState();
  state.syncedFiles = (state.syncedFiles || []).concat(files);
  state.lastSyncAt = new Date().toISOString();
  state.lastPackageId = pkg.packageId;
  saveSyncState(state);

  _log(`Sync complete: ${result.accepted || pkg.eventCount} event(s) accepted.`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. Helpers
// ═══════════════════════════════════════════════════════════════════════════
function _log(msg) {
  const line = new Date().toISOString() + ' ' + msg;
  console.log('[SYNC]', msg);
  try { fs.appendFileSync(SYNC_LOG, line + '\n'); } catch (e) {}
}

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [key, val] = a.slice(2).split('=');
      if (val !== undefined) result[key] = val;
      else {
        const next = argv[i + 1];
        if (next && !next.startsWith('--')) { result[key] = next; i++; }
        else result[key] = true;
      }
    }
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// 10. Entry point
// ═══════════════════════════════════════════════════════════════════════════
if (require.main === module) {
  runSync().catch(err => {
    _log(`Fatal: ${err.message}`);
    process.exit(1);
  });
}

module.exports = {
  runSync,
  buildPackage,
  repseudonymize,
  importInbound,
  loadUnsynced
};
