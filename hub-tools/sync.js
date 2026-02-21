// hub-tools/sync.js
// AGNI Hub Sync  v1.7.0
//
// Manages data flow between the village hub and the home server.
//
// OUTBOUND (hub → home server):
//   Packages anonymized learning events for home server IRT calibration.
//   Re-pseudonymization: hub-local pseudoIds are replaced with one-time
//   batch tokens. The home server receives the same token for all events
//   in one batch, allowing within-batch cohort analysis, but cannot link
//   events across batches or to real students.
//
// INBOUND (home server → hub):
//   Receives updated BaseCost table (IRT-calibrated skill difficulty).
//   Writes to data/base_costs.json which theta.js reads to compute θ.
//
// TRANSPORT:
//   - Starlink window: HTTP POST to home server URL when connectivity available
//   - USB/sneakernet: writes a sync_package_<date>.json file to a nominated
//     export directory; home server operator imports it manually
//   The two transports are selected by --transport flag.
//
// SCHEDULING:
//   Run by cron or systemd timer. Typical pattern:
//     "When Starlink comes up: node sync.js --transport=starlink"
//     "When USB is inserted: node sync.js --transport=usb --usb-path=/mnt/usb"
//
// Usage:
//   node sync.js [--transport=starlink|usb] [--home-url=https://...] [--usb-path=/mnt/usb]
//   node sync.js --import=<path_to_base_costs.json>   # receive inbound update
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const https  = require('https');
const http   = require('http');

// ── Configuration ──────────────────────────────────────────────────────────

const DATA_DIR   = process.env.AGNI_DATA_DIR || path.join(__dirname, '../data');
const EVENTS_DIR = path.join(DATA_DIR, 'events');
const BASE_COSTS = path.join(DATA_DIR, 'base_costs.json');
const SYNC_STATE = path.join(DATA_DIR, 'sync_state.json');   // tracks last sync cursor
const SYNC_LOG   = path.join(DATA_DIR, 'sync.log');

const args       = parseArgs(process.argv.slice(2));
const TRANSPORT  = args['transport'] || 'starlink';
const HOME_URL   = (args['home-url'] || process.env.AGNI_HOME_URL || '').replace(/\/$/, '');
const USB_PATH   = args['usb-path']  || process.env.AGNI_USB_PATH || '/mnt/usb/agni-sync';
const HUB_ID     = process.env.AGNI_HUB_ID || 'hub-local';
const IMPORT_FILE = args['import']  || null;


// ═══════════════════════════════════════════════════════════════════════════
// 1. Re-pseudonymization
//    Hub-local pseudoIds never leave the hub.
//    Each sync run generates a fresh mapping: pseudoId → batchToken.
//    The mapping is discarded after the run — not stored anywhere.
// ═══════════════════════════════════════════════════════════════════════════

function buildTokenMap(pseudoIds) {
  const map = {};
  pseudoIds.forEach(id => {
    // One-way: batchToken cannot be reversed to pseudoId
    map[id] = 'bt-' + crypto.randomBytes(6).toString('hex');
  });
  return map;
}

function repseudonymize(events, tokenMap) {
  return events.map(ev => ({
    // Replace pseudoId with batch token
    batchToken:     tokenMap[ev.pseudoId] || ('bt-' + crypto.randomBytes(6).toString('hex')),
    // Lesson and outcome data — no identity fields
    lessonId:       ev.lessonId,
    lessonVersion:  ev.lessonVersion,
    difficulty:     ev.difficulty,
    language:       ev.language,
    skillsRequired: ev.skillsRequired,
    skillsProvided: ev.skillsProvided,
    mastery:        ev.mastery,
    // Step data: keep weights and scores, strip timing (could fingerprint individuals)
    steps:          (ev.steps || []).map(s => ({
      stepId:   s.stepId,
      type:     s.type,
      weight:   s.weight,
      score:    s.score,
      passed:   s.passed,
      skipped:  s.skipped,
      attempts: s.attempts
      // durationMs deliberately omitted
    })),
    // Temporal data rounded to the nearest day (prevents timing-based re-identification)
    completedDate:  ev.completedAt ? ev.completedAt.slice(0, 10) : null
  }));
}


// ═══════════════════════════════════════════════════════════════════════════
// 2. Sync state — track which events have been synced
// ═══════════════════════════════════════════════════════════════════════════

function loadSyncState() {
  if (!fs.existsSync(SYNC_STATE)) return { lastSyncAt: null, syncedFiles: [] };
  try { return JSON.parse(fs.readFileSync(SYNC_STATE, 'utf8')); }
  catch (e) { return { lastSyncAt: null, syncedFiles: [] }; }
}

function saveSyncState(state) {
  fs.writeFileSync(SYNC_STATE, JSON.stringify(state, null, 2));
}


// ═══════════════════════════════════════════════════════════════════════════
// 3. Load unsyced events
// ═══════════════════════════════════════════════════════════════════════════

function loadUnsynced() {
  const state   = loadSyncState();
  const synced  = new Set(state.syncedFiles || []);

  if (!fs.existsSync(EVENTS_DIR)) return { events: [], files: [] };

  const files  = fs.readdirSync(EVENTS_DIR)
    .filter(f => f.endsWith('.ndjson') && !synced.has(f))
    .sort();

  const events = [];
  files.forEach(file => {
    fs.readFileSync(path.join(EVENTS_DIR, file), 'utf8')
      .split('\n').filter(l => l.trim())
      .forEach(line => {
        try { events.push(JSON.parse(line)); } catch (e) { /* skip */ }
      });
  });

  return { events, files };
}


// ═══════════════════════════════════════════════════════════════════════════
// 4. Build sync package
// ═══════════════════════════════════════════════════════════════════════════

function buildPackage(events) {
  const pseudoIds  = [...new Set(events.map(e => e.pseudoId))];
  const tokenMap   = buildTokenMap(pseudoIds);
  const anonymized = repseudonymize(events, tokenMap);

  return {
    schemaVersion: '1.7.0',
    hubId:         HUB_ID,
    packageId:     'pkg-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex'),
    createdAt:     new Date().toISOString(),
    eventCount:    anonymized.length,
    cohortSize:    pseudoIds.length,
    events:        anonymized
    // tokenMap is NOT included — it is discarded here
  };
}


// ═══════════════════════════════════════════════════════════════════════════
// 5. Starlink transport — POST to home server
// ═══════════════════════════════════════════════════════════════════════════

function sendViaStarlink(pkg) {
  if (!HOME_URL) {
    _log('ERROR: --home-url not set for Starlink transport');
    return Promise.reject(new Error('home-url required for Starlink transport'));
  }

  const body    = JSON.stringify(pkg);
  const url     = new URL(HOME_URL + '/api/hub-sync');
  const isHttps = url.protocol === 'https:';
  const lib     = isHttps ? https : http;

  _log(`Sending ${pkg.eventCount} events to ${url.href}`);

  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      port:     url.port || (isHttps ? 443 : 80),
      path:     url.pathname,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-AGNI-Hub-ID':  HUB_ID,
        'X-AGNI-Version': '1.7.0'
      }
    };

    const req = lib.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const result = JSON.parse(data);
            resolve(result);
          } catch (e) {
            resolve({ accepted: pkg.eventCount });
          }
        } else {
          reject(new Error('Home server returned HTTP ' + res.statusCode));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Request timeout')); });
    req.write(body);
    req.end();
  });
}


// ═══════════════════════════════════════════════════════════════════════════
// 6. USB / sneakernet transport — write to export directory
// ═══════════════════════════════════════════════════════════════════════════

function sendViaUsb(pkg) {
  if (!fs.existsSync(USB_PATH)) {
    try { fs.mkdirSync(USB_PATH, { recursive: true }); }
    catch (e) {
      _log('ERROR: USB path not accessible: ' + USB_PATH);
      return Promise.reject(new Error('USB path not accessible: ' + USB_PATH));
    }
  }

  const filename = `sync_${HUB_ID}_${new Date().toISOString().slice(0,10)}_${pkg.packageId}.json`;
  const dest     = path.join(USB_PATH, filename);

  fs.writeFileSync(dest, JSON.stringify(pkg, null, 2));
  _log(`Sync package written to USB: ${dest} (${pkg.eventCount} events)`);

  return Promise.resolve({ accepted: pkg.eventCount, packageFile: dest });
}


// ═══════════════════════════════════════════════════════════════════════════
// 7. Receive inbound BaseCost update from home server
//    Called when the return USB stick or Starlink brings updated IRT data.
// ═══════════════════════════════════════════════════════════════════════════

function importBaseCosts(filePath) {
  if (!fs.existsSync(filePath)) {
    _log('ERROR: import file not found: ' + filePath);
    return false;
  }

  let incoming;
  try {
    incoming = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    _log('ERROR: could not parse import file: ' + e.message);
    return false;
  }

  // Validate: must have a costs object
  if (!incoming.costs || typeof incoming.costs !== 'object') {
    _log('ERROR: import file missing .costs object');
    return false;
  }

  // Merge with existing base_costs.json (incoming values override local)
  let existing = {};
  if (fs.existsSync(BASE_COSTS)) {
    try { existing = JSON.parse(fs.readFileSync(BASE_COSTS, 'utf8')); }
    catch (e) { existing = {}; }
  }

  const merged = Object.assign({}, existing, incoming.costs);
  fs.writeFileSync(BASE_COSTS, JSON.stringify(merged, null, 2));

  _log(`BaseCosts imported: ${Object.keys(incoming.costs).length} skills updated from ${filePath}`);
  _log(`Total skills in base_costs.json: ${Object.keys(merged).length}`);
  return true;
}


// ═══════════════════════════════════════════════════════════════════════════
// 8. Main sync flow
// ═══════════════════════════════════════════════════════════════════════════

async function runSync() {
  // If --import flag: receive inbound data, no outbound
  if (IMPORT_FILE) {
    _log('Importing inbound BaseCost update...');
    importBaseCosts(IMPORT_FILE);
    return;
  }

  const { events, files } = loadUnsynced();

  if (!events.length) {
    _log('No new events to sync.');
    return;
  }

  _log(`Preparing ${events.length} events from ${files.length} file(s)...`);

  const pkg = buildPackage(events);

  let result;
  try {
    if (TRANSPORT === 'usb') {
      result = await sendViaUsb(pkg);
    } else {
      result = await sendViaStarlink(pkg);
    }
  } catch (err) {
    _log('SYNC FAILED: ' + err.message);
    process.exitCode = 1;
    return;
  }

  // Mark files as synced
  const state = loadSyncState();
  state.syncedFiles = (state.syncedFiles || []).concat(files);
  state.lastSyncAt  = new Date().toISOString();
  state.lastPackageId = pkg.packageId;
  saveSyncState(state);

  _log(`Sync complete: ${result.accepted || pkg.eventCount} events accepted.`);
  _log(`Package ID: ${pkg.packageId}`);
}


// ═══════════════════════════════════════════════════════════════════════════
// 9. Helpers
// ═══════════════════════════════════════════════════════════════════════════

function _log(msg) {
  const line = new Date().toISOString() + '  ' + msg;
  console.log('[SYNC]', msg);
  try { fs.appendFileSync(SYNC_LOG, line + '\n'); } catch (e) { /* non-fatal */ }
}

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [key, val] = a.slice(2).split('=');
      if (val !== undefined) { result[key] = val; }
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
// 10. Exports and entry point
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  runSync,
  buildPackage,
  repseudonymize,
  importBaseCosts,
  loadUnsynced
};

if (require.main === module) {
  runSync().catch(err => {
    _log('Fatal: ' + err.message);
    process.exit(1);
  });
}
