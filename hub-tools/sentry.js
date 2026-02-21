// hub-tools/sentry.js
// AGNI Village Sentry v1.7.3 – with O(1) Memory Contingency Tables & Async Buffering
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

// ── Configuration ──────────────────────────────────────────────────────────
const DATA_DIR = process.env.AGNI_DATA_DIR || path.join(__dirname, '../data');
const EVENTS_DIR = path.join(DATA_DIR, 'events');
const GRAPH_WEIGHTS = path.join(DATA_DIR, 'graph_weights.json');
const MASTERY_SUMMARY = path.join(DATA_DIR, 'mastery_summary.json');
const CONTINGENCY_TABLES = path.join(DATA_DIR, 'contingency_tables.json'); // NEW: O(1) state
const SENTRY_STATE = path.join(DATA_DIR, 'sentry_state.json'); // NEW: Event Cursors
const SENTRY_LOG = path.join(DATA_DIR, 'sentry.log');

const PORT = parseInt(process.env.AGNI_SENTRY_PORT || '8081', 10);
const ANALYSE_AFTER_N = parseInt(process.env.AGNI_ANALYSE_AFTER || '50', 10);
const ANALYSE_SCHEDULE = process.env.AGNI_ANALYSE_CRON || '02:00';
const MIN_MS_BETWEEN_ANALYSIS = 4 * 60 * 60 * 1000;

const CHI2_THRESHOLD = 3.841;
const MASTERY_THRESHOLD = 0.6;
const PASS_THRESHOLD = 0.6;
const SCHEMA_VERSION = '1.7.0';
const SW_VERSION = 'sentry-agent v1.7.3 (O1-incremental)';

function ensureDirs() {
  [DATA_DIR, EVENTS_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Asynchronous SD Card Logging & Buffering
// ═══════════════════════════════════════════════════════════════════════════
function _log(msg) {
  const line = `${new Date().toISOString()} ${msg}\n`;
  console.log('[SENTRY]', msg);
  fs.appendFile(SENTRY_LOG, line, () => {}); // Async, non-blocking
}

let eventBuffer = [];
function todayFile() { return path.join(EVENTS_DIR, new Date().toISOString().slice(0, 10) + '.ndjson'); }

function appendEvents(events) {
  eventBuffer.push(...events.map(e => JSON.stringify(e)));
}

// Flush to SD card every 30 seconds asynchronously to prevent write-wear
setInterval(() => {
  if (eventBuffer.length === 0) return;
  const toWrite = eventBuffer.join('\n') + '\n';
  eventBuffer = []; 
  fs.appendFile(todayFile(), toWrite, 'utf8', (err) => {
    if (err) _log(`File write error: ${err.message}`);
  });
}, 30000);

// ═══════════════════════════════════════════════════════════════════════════
// 2. HTTP receiver
// ═══════════════════════════════════════════════════════════════════════════
let _eventsSinceLastAnalysis = 0;
let lastAnalysisAttempt = 0;

function validateEvent(raw) {
  if (!raw || typeof raw !== 'object' || !raw.lessonId || !raw.completedAt) return null;
  if (typeof raw.mastery !== 'number' || raw.mastery < 0 || raw.mastery > 1) return null;
  if (!Array.isArray(raw.steps)) return null;
  return {
    eventId: raw.eventId || ('ev-' + Date.now()),
    pseudoId: raw.pseudoId || ('px-anon-' + crypto.randomBytes(4).toString('hex')),
    lessonId: String(raw.lessonId),
    skillsProvided: Array.isArray(raw.skillsProvided) ? raw.skillsProvided : [],
    skillsRequired: Array.isArray(raw.skillsRequired) ? raw.skillsRequired : [],
    mastery: raw.mastery,
    completedAt: raw.completedAt
  };
}

function startReceiver() {
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    if (req.method === 'POST' && req.url === '/api/telemetry') {
      let body = '';
      req.on('data', chunk => { body += chunk; if (body.length > 1e6) req.destroy(); });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body);
          const raw = Array.isArray(payload.events) ? payload.events : [payload];
          const valid = raw.map(validateEvent).filter(Boolean);

          if (!valid.length) { res.writeHead(400); res.end(); return; }

          appendEvents(valid);
          _eventsSinceLastAnalysis += valid.length;
          _log(`Received ${valid.length} event(s).`);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ accepted: valid.map(e => e.eventId) }));

          if (_eventsSinceLastAnalysis >= ANALYSE_AFTER_N && Date.now() - lastAnalysisAttempt > MIN_MS_BETWEEN_ANALYSIS) {
            lastAnalysisAttempt = Date.now();
            setImmediate(() => runAnalysis().catch(e => _log(`Analysis error: ${e.message}`)));
          }
        } catch (e) { res.writeHead(400); res.end(); }
      });
      return;
    }
    res.writeHead(404); res.end();
  });
  server.listen(PORT, '0.0.0.0', () => _log(`Receiver listening on port ${PORT}`));
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. O(1) Memory Graph Engine & Analysis
// ═══════════════════════════════════════════════════════════════════════════
function loadJSON(fp, fallback) {
  try { return fs.existsSync(fp) ? JSON.parse(fs.readFileSync(fp, 'utf8')) : fallback; } 
  catch { return fallback; }
}

function jaccardSimilarity(a, centroid) {
  let intersection = 0, union = 0;
  for (let i = 0; i < a.length; i++) {
    const cVal = centroid[i] >= 0.5 ? 1 : 0; // Fixed Truthiness Bug
    if (a[i] || cVal) union++;
    if (a[i] && cVal) intersection++;
  }
  return union === 0 ? 1 : intersection / union;
}

function _computeConfidence(chiSquare, n, nMin) {
  if (chiSquare < CHI2_THRESHOLD) return 0;
  const chiConf = 1 - 1 / (1 + (chiSquare - CHI2_THRESHOLD) / 4);
  const nRatio = Math.min(1, n / (nMin * 2));
  return Math.round(chiConf * nRatio * 1000) / 1000;
}

async function runAnalysis() {
  _log('Starting O(1) Incremental Analysis...');
  _eventsSinceLastAnalysis = 0;

  const state = loadJSON(SENTRY_STATE, { cursors: {} });
  const mastery = loadJSON(MASTERY_SUMMARY, { schemaVersion: '1.7.0', students: {} });
  // Contingency tables: { "pseudoId": { "priorSkill\x00targetSkill": { a, b, c, d } } }
  const contingencies = loadJSON(CONTINGENCY_TABLES, {});

  const files = fs.readdirSync(EVENTS_DIR).filter(f => f.endsWith('.ndjson')).sort();
  let eventsProcessed = 0;

  // 1. Process New Events Incrementally
  files.forEach(file => {
    const filePath = path.join(EVENTS_DIR, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    let startIdx = state.cursors[file] || 0;

    for (let i = startIdx; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      try {
        const ev = JSON.parse(line);
        const pid = ev.pseudoId;
        const passedWell = ev.mastery >= PASS_THRESHOLD;

        if (!mastery.students[pid]) mastery.students[pid] = {};
        if (!contingencies[pid]) contingencies[pid] = {};

        const studentSkills = mastery.students[pid];
        const studentTables = contingencies[pid];

        // A. Update Contingency Matrices BEFORE applying this event's mastery
        (ev.skillsProvided || []).forEach(target => {
          Object.keys(studentSkills).forEach(prior => {
            if (prior === target.skill) return; // Ignore self-loops
            
            const pair = `${prior}\x00${target.skill}`;
            if (!studentTables[pair]) studentTables[pair] = { a:0, b:0, c:0, d:0 };
            
            const hadPrior = studentSkills[prior] >= MASTERY_THRESHOLD;
            if (hadPrior && passedWell) studentTables[pair].a++;
            else if (hadPrior && !passedWell) studentTables[pair].b++;
            else if (!hadPrior && passedWell) studentTables[pair].c++;
            else if (!hadPrior && !passedWell) studentTables[pair].d++;
          });
        });

        // B. Update Student Mastery AFTER matrices
        (ev.skillsProvided || []).forEach(prov => {
          if ((prov.evidencedLevel || 0) > (studentSkills[prov.skill] || 0)) {
            studentSkills[prov.skill] = prov.evidencedLevel;
          }
        });

        state.cursors[file] = i + 1;
        eventsProcessed++;
      } catch (e) {} // Skip bad JSON
    }
  });

  if (eventsProcessed === 0) { _log('No new events to process.'); return; }

  // Save State
  fs.writeFileSync(SENTRY_STATE, JSON.stringify(state, null, 2));
  fs.writeFileSync(MASTERY_SUMMARY, JSON.stringify(mastery, null, 2));
  fs.writeFileSync(CONTINGENCY_TABLES, JSON.stringify(contingencies)); // Minified to save space

  // 2. Discover Cohort using Jaccard Similarity on Current Mastery
  const allSkills = Array.from(new Set(Object.values(mastery.students).flatMap(Object.keys))).sort();
  const vectors = Object.entries(mastery.students).map(([pid, skills]) => ({
    pseudoId: pid,
    vector: allSkills.map(s => (skills[s] || 0) >= MASTERY_THRESHOLD ? 1 : 0)
  }));

  if (vectors.length < 20) { _log('Cohort too small for graph building.'); return; }

  const clusters = [];
  vectors.forEach(({ pseudoId, vector }) => {
    let placed = false;
    for (const cluster of clusters) {
      if (jaccardSimilarity(vector, cluster.centroid) >= 0.5) {
        cluster.members.push(pseudoId);
        cluster.vectors.push(vector);
        const n = cluster.vectors.length;
        cluster.centroid = cluster.centroid.map((v, i) => cluster.vectors.reduce((s, vec) => s + vec[i], 0) / n);
        placed = true; break;
      }
    }
    if (!placed) clusters.push({ members: [pseudoId], vectors: [vector], centroid: [...vector] });
  });

  const largest = clusters.reduce((a, b) => a.members.length >= b.members.length ? a : b);
  if (largest.members.length < 20) return;

  const cohortId = 'c_' + crypto.createHash('sha256').update(largest.centroid.map(v => v.toFixed(4)).join(',')).digest('hex').slice(0, 8);
  const cohortSet = new Set(largest.members);

  // 3. Aggregate Matrices for the Cohort
  const globalPairs = {};
  cohortSet.forEach(pid => {
    const tables = contingencies[pid] || {};
    Object.entries(tables).forEach(([pair, counts]) => {
      if (!globalPairs[pair]) globalPairs[pair] = { a:0, b:0, c:0, d:0 };
      globalPairs[pair].a += counts.a;
      globalPairs[pair].b += counts.b;
      globalPairs[pair].c += counts.c;
      globalPairs[pair].d += counts.d;
    });
  });

  // 4. Compute Final Graph Weights
  const edges = [];
  Object.entries(globalPairs).forEach(([pair, counts]) => {
    const { a, b, c, d } = counts;
    const n = a + b + c + d;
    if (n < 20) return;

    const pPrior = (a + b) / n;
    if (pPrior === 0 || pPrior === 1) return;

    const nMin = Math.ceil(20 / Math.min(pPrior, 1 - pPrior));
    const den = (a+b) * (c+d) * (a+c) * (b+d);
    const chi2 = den > 0 ? Math.pow(Math.abs(a*d - b*c) - n/2, 2) * n / den : 0;
    
    const passWithPrior = (a + b) > 0 ? a / (a + b) : 0;
    const passWithoutPrior = (c + d) > 0 ? c / (c + d) : 0;
    const benefit = Math.max(0, passWithPrior - passWithoutPrior);
    const weight = Math.round((1 - benefit) * 1000) / 1000;
    
    const [prior, target] = pair.split('\x00');
    edges.push({
      from: prior, to: target,
      weight: Math.max(0, Math.min(1, weight)),
      confidence: Math.max(0, Math.min(1, _computeConfidence(chi2, n, nMin))),
      sample_size: n
    });
  });

  const now = new Date().toISOString();
  const gw = {
    '$schema': 'https://github.com/NewmanB1/AGNI/schemas/graph_weights.schema.json',
    version: SCHEMA_VERSION, discovered_cohort: cohortId, level: 'village', sample_size: largest.members.length,
    created_date: now, last_updated: now, default_weight: 1.0, edges,
    metadata: { computation_date: now, software_version: SW_VERSION }
  };

  fs.writeFileSync(GRAPH_WEIGHTS, JSON.stringify(gw, null, 2));
  _log(`Analysis done. Processed ${eventsProcessed} new events. Generated ${edges.length} edges.`);
}

if (require.main === module) {
  ensureDirs();
  startReceiver();
  runAnalysis().catch(e => _log(`Startup error: ${e.message}`));
  setInterval(() => runAnalysis().catch(e => _log(`Scheduled error: ${e.message}`)), MIN_MS_BETWEEN_ANALYSIS);
}
