// hub-tools/sentry.js
// AGNI Village Sentry  v1.7.0
//
// Runs on the village hub (Node.js). Two responsibilities:
//
//   1. HTTP RECEIVER — accepts POST /api/telemetry from edge devices,
//      validates events, assigns pseudonymous IDs if missing, persists
//      to the local event log (newline-delimited JSON, one file per day).
//
//   2. ANALYSER — runs on a schedule (nightly or after N new events) to:
//      a. Detect skill collapses in the local cohort
//      b. Update graph_weights.json
//      c. Compute per-student skill mastery summaries
//
// SKILL COLLAPSE DETECTION:
//   For each pair of skills (A provides, B requires), the Sentry tests:
//   "Does having demonstrated skill A reduce the cost of learning skill B?"
//   Using a chi-square test on the 2×2 contingency table:
//     rows: had_skill_A (yes/no)
//     cols: passed_lesson_B on first attempt (yes/no)
//   Only runs when N_min is met:
//     N_min = 20 / min(p_prior, 1 - p_prior)
//   where p_prior = fraction of students who had skill A before lesson B.
//
// GRAPH_WEIGHTS.JSON FORMAT: see writeGraphWeights() below.
//
// PRIVACY:
//   All pseudoIds in this file are hub-local.
//   They are re-pseudonymized before leaving the hub in sync.js.
//   The Sentry never logs real student names.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const fs   = require('fs');
const path = require('path');
const http = require('http');

// ── Configuration (overridden by CLI args or environment) ──────────────────

const DATA_DIR         = process.env.AGNI_DATA_DIR   || path.join(__dirname, '../data');
const EVENTS_DIR       = path.join(DATA_DIR, 'events');
const GRAPH_WEIGHTS    = path.join(DATA_DIR, 'graph_weights.json');
const MASTERY_SUMMARY  = path.join(DATA_DIR, 'mastery_summary.json');
const SENTRY_LOG       = path.join(DATA_DIR, 'sentry.log');

const PORT             = parseInt(process.env.AGNI_SENTRY_PORT || '8081', 10);
const ANALYSE_AFTER_N  = parseInt(process.env.AGNI_ANALYSE_AFTER || '20', 10);
const ANALYSE_SCHEDULE = process.env.AGNI_ANALYSE_CRON || '02:00'; // HH:MM local time

// Minimum chi-square value for significance at p<0.05, df=1
const CHI2_THRESHOLD = 3.841;

// ── State ──────────────────────────────────────────────────────────────────

let _eventsSinceLastAnalysis = 0;


// ═══════════════════════════════════════════════════════════════════════════
// 1. Ensure data directories
// ═══════════════════════════════════════════════════════════════════════════

function ensureDirs() {
  [DATA_DIR, EVENTS_DIR].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });
}


// ═══════════════════════════════════════════════════════════════════════════
// 2. Event persistence
//    One NDJSON file per day: events/2026-02-21.ndjson
//    Each line is one validated completion event.
// ═══════════════════════════════════════════════════════════════════════════

function todayFile() {
  const d = new Date().toISOString().slice(0, 10);
  return path.join(EVENTS_DIR, d + '.ndjson');
}

function appendEvents(events) {
  const file  = todayFile();
  const lines = events.map(e => JSON.stringify(e)).join('\n') + '\n';
  fs.appendFileSync(file, lines, 'utf8');
}

/** Read all event files, return array of parsed events */
function loadAllEvents() {
  if (!fs.existsSync(EVENTS_DIR)) return [];
  const events = [];
  fs.readdirSync(EVENTS_DIR)
    .filter(f => f.endsWith('.ndjson'))
    .sort()
    .forEach(file => {
      const lines = fs.readFileSync(path.join(EVENTS_DIR, file), 'utf8')
                      .split('\n')
                      .filter(l => l.trim());
      lines.forEach(line => {
        try { events.push(JSON.parse(line)); } catch (e) { /* skip malformed */ }
      });
    });
  return events;
}


// ═══════════════════════════════════════════════════════════════════════════
// 3. HTTP receiver — POST /api/telemetry
// ═══════════════════════════════════════════════════════════════════════════

function validateEvent(raw) {
  // Minimum required fields
  if (!raw || typeof raw !== 'object') return null;
  if (!raw.lessonId || !raw.completedAt) return null;
  if (typeof raw.mastery !== 'number' || raw.mastery < 0 || raw.mastery > 1) return null;
  if (!Array.isArray(raw.steps)) return null;

  // Assign pseudoId if device didn't send one (shouldn't happen but be safe)
  if (!raw.pseudoId) {
    raw.pseudoId = 'px-anon-' + Math.random().toString(36).slice(2, 10);
  }

  // Strip any fields we don't want stored (defence in depth)
  return {
    eventId:        raw.eventId       || ('ev-' + Date.now()),
    schemaVersion:  raw.schemaVersion || '1.7.0',
    pseudoId:       raw.pseudoId,
    lessonId:       String(raw.lessonId),
    lessonVersion:  raw.lessonVersion || '1.0.0',
    difficulty:     Number(raw.difficulty) || 0,
    language:       String(raw.language || 'en'),
    skillsRequired: Array.isArray(raw.skillsRequired) ? raw.skillsRequired : [],
    skillsProvided: Array.isArray(raw.skillsProvided) ? raw.skillsProvided : [],
    mastery:        raw.mastery,
    steps:          raw.steps,
    durationMs:     Number(raw.durationMs) || 0,
    completedAt:    raw.completedAt,
    receivedAt:     new Date().toISOString()
  };
}

function startReceiver() {
  const server = http.createServer((req, res) => {
    // CORS for local WiFi
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
          const raw     = Array.isArray(payload.events) ? payload.events : [payload];
          const valid   = raw.map(validateEvent).filter(Boolean);

          if (!valid.length) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'No valid events' }));
            return;
          }

          appendEvents(valid);
          _eventsSinceLastAnalysis += valid.length;
          _log(`Received ${valid.length} event(s) from ${req.socket.remoteAddress}`);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ accepted: valid.map(e => e.eventId) }));

          // Trigger analysis if threshold reached
          if (_eventsSinceLastAnalysis >= ANALYSE_AFTER_N) {
            setImmediate(() => runAnalysis().catch(err => _log('Analysis error: ' + err.message)));
          }

        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
      return;
    }

    res.writeHead(404); res.end();
  });

  server.listen(PORT, '0.0.0.0', () => {
    _log(`Sentry receiver listening on port ${PORT}`);
  });

  return server;
}


// ═══════════════════════════════════════════════════════════════════════════
// 4. Skill collapse detection
// ═══════════════════════════════════════════════════════════════════════════

/**
 * For a given skill pair (priorSkill → targetSkill), compute the collapse
 * probability from the event log.
 *
 * Returns null if N_min not met; otherwise returns:
 *   { priorSkill, targetSkill, collapseProbability, n, chiSquare, significant }
 */
function detectCollapse(events, priorSkill, targetSkill) {
  // Students who have demonstrated priorSkill (mastery > 0.6 on a providing lesson)
  const MASTERY_THRESHOLD = 0.6;

  // Build per-student skill history ordered by completedAt
  const studentHistory = {};
  events
    .slice()
    .sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt))
    .forEach(ev => {
      if (!studentHistory[ev.pseudoId]) studentHistory[ev.pseudoId] = [];
      studentHistory[ev.pseudoId].push(ev);
    });

  // For each student's attempt at targetSkill, note whether they had priorSkill first
  const observations = [];

  Object.values(studentHistory).forEach(history => {
    history.forEach((ev, idx) => {
      const providesTarget = ev.skillsProvided.some(s => s.skill === targetSkill);
      if (!providesTarget) return;

      // Did this student demonstrate priorSkill in any earlier event?
      const hadPrior = history.slice(0, idx).some(earlier =>
        earlier.skillsProvided.some(s =>
          s.skill === priorSkill && s.evidencedLevel >= MASTERY_THRESHOLD
        )
      );

      // Did they pass this lesson well? (mastery > 0.6 = "first attempt quality")
      const passedWell = ev.mastery >= MASTERY_THRESHOLD;

      observations.push({ hadPrior, passedWell });
    });
  });

  const n = observations.length;
  if (n === 0) return null;

  // Compute p_prior for N_min check
  const nWithPrior = observations.filter(o => o.hadPrior).length;
  const pPrior     = nWithPrior / n;

  // N_min = 20 / min(p_prior, 1 - p_prior)
  // Guard against p=0 or p=1 (no variance → can't detect collapse)
  if (pPrior === 0 || pPrior === 1) return null;
  const nMin = Math.ceil(20 / Math.min(pPrior, 1 - pPrior));
  if (n < nMin) return null;   // insufficient data — skip

  // 2×2 contingency table:
  //           passedWell=T   passedWell=F
  // hadPrior=T     a              b
  // hadPrior=F     c              d
  const a = observations.filter(o =>  o.hadPrior &&  o.passedWell).length;
  const b = observations.filter(o =>  o.hadPrior && !o.passedWell).length;
  const c = observations.filter(o => !o.hadPrior &&  o.passedWell).length;
  const d = observations.filter(o => !o.hadPrior && !o.passedWell).length;

  // Chi-square with Yates continuity correction
  const N   = a + b + c + d;
  const num = Math.pow(Math.abs(a * d - b * c) - N / 2, 2) * N;
  const den = (a + b) * (c + d) * (a + c) * (b + d);
  if (den === 0) return null;
  const chiSquare = num / den;

  // Collapse probability: among students with prior skill, fraction who passed well
  // vs among those without. Difference = strength of collapse effect.
  const passRateWithPrior    = (a + b) > 0 ? a / (a + b) : 0;
  const passRateWithoutPrior = (c + d) > 0 ? c / (c + d) : 0;
  const collapseProbability  = Math.max(0, passRateWithPrior - passRateWithoutPrior);

  return {
    priorSkill,
    targetSkill,
    collapseProbability: Math.round(collapseProbability * 1000) / 1000,
    n,
    nMin,
    chiSquare:   Math.round(chiSquare * 1000) / 1000,
    significant: chiSquare >= CHI2_THRESHOLD
  };
}


// ═══════════════════════════════════════════════════════════════════════════
// 5. Graph weights update
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Rebuild graph_weights.json from all events.
 * Only includes edges where collapse is statistically significant.
 */
function buildGraphWeights(events) {
  // Collect all skill pairs (priorSkill → targetSkill) that appear in the log
  const skillPairs = new Set();
  events.forEach(ev => {
    ev.skillsRequired.forEach(req => {
      ev.skillsProvided.forEach(prov => {
        skillPairs.add(req + '→' + prov.skill);
      });
    });
  });

  const edges = [];
  skillPairs.forEach(pair => {
    const [prior, target] = pair.split('→');
    const result = detectCollapse(events, prior, target);
    if (result && result.significant) {
      edges.push({
        from:               result.priorSkill,
        to:                 result.targetSkill,
        collapseProbability: result.collapseProbability,
        n:                  result.n,
        chiSquare:          result.chiSquare,
        computedAt:         new Date().toISOString()
      });
    }
  });

  // Also include all declared ontology edges with probability 0 if not yet significant
  // (so the graph is complete even before statistical significance is reached)
  skillPairs.forEach(pair => {
    const [from, to] = pair.split('→');
    if (!edges.find(e => e.from === from && e.to === to)) {
      edges.push({
        from,
        to,
        collapseProbability: 0,
        n:                   0,
        chiSquare:           0,
        computedAt:          new Date().toISOString()
      });
    }
  });

  // Collect all unique skill nodes
  const nodes = new Set();
  edges.forEach(e => { nodes.add(e.from); nodes.add(e.to); });

  return {
    schemaVersion: '1.7.0',
    updatedAt:     new Date().toISOString(),
    hubId:         process.env.AGNI_HUB_ID || 'hub-local',
    cohortSize:    new Set(events.map(e => e.pseudoId)).size,
    eventCount:    events.length,
    nodes:         Array.from(nodes),
    edges
  };
}

function writeGraphWeights(weights) {
  fs.writeFileSync(GRAPH_WEIGHTS, JSON.stringify(weights, null, 2));
  _log(`graph_weights.json updated: ${weights.edges.length} edges, ` +
       `${weights.cohortSize} students, ${weights.eventCount} events`);
}


// ═══════════════════════════════════════════════════════════════════════════
// 6. Per-student mastery summary
//    Consumed by theta.js to compute CohortDiscount.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute the current mastery level for each student × skill pair.
 * Takes the highest evidencedLevel across all completion events for that skill.
 */
function buildMasterySummary(events) {
  const summary = {};   // { pseudoId: { skillId: evidencedLevel } }

  events
    .slice()
    .sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt))
    .forEach(ev => {
      if (!summary[ev.pseudoId]) summary[ev.pseudoId] = {};
      ev.skillsProvided.forEach(s => {
        const current = summary[ev.pseudoId][s.skill] || 0;
        summary[ev.pseudoId][s.skill] = Math.max(current, s.evidencedLevel);
      });
    });

  return {
    schemaVersion: '1.7.0',
    updatedAt:     new Date().toISOString(),
    students:      summary
  };
}

function writeMasterySummary(summary) {
  fs.writeFileSync(MASTERY_SUMMARY, JSON.stringify(summary, null, 2));
  _log(`mastery_summary.json updated: ${Object.keys(summary.students).length} students`);
}


// ═══════════════════════════════════════════════════════════════════════════
// 7. Full analysis run
// ═══════════════════════════════════════════════════════════════════════════

async function runAnalysis() {
  _log('Running analysis...');
  _eventsSinceLastAnalysis = 0;

  const events = loadAllEvents();
  if (!events.length) { _log('No events to analyse.'); return; }

  const weights = buildGraphWeights(events);
  writeGraphWeights(weights);

  const mastery = buildMasterySummary(events);
  writeMasterySummary(mastery);

  _log(`Analysis complete. ${weights.edges.filter(e => e.collapseProbability > 0).length} ` +
       `significant collapse edges detected.`);
}


// ═══════════════════════════════════════════════════════════════════════════
// 8. Scheduled analysis
// ═══════════════════════════════════════════════════════════════════════════

function scheduleAnalysis() {
  const [hh, mm] = ANALYSE_SCHEDULE.split(':').map(Number);

  function msUntilNext() {
    const now  = new Date();
    const next = new Date();
    next.setHours(hh, mm, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next - now;
  }

  function loop() {
    runAnalysis()
      .catch(err => _log('Scheduled analysis error: ' + err.message))
      .finally(() => setTimeout(loop, msUntilNext()));
  }

  setTimeout(loop, msUntilNext());
  _log(`Analysis scheduled daily at ${ANALYSE_SCHEDULE}`);
}


// ═══════════════════════════════════════════════════════════════════════════
// 9. Logging
// ═══════════════════════════════════════════════════════════════════════════

function _log(msg) {
  const line = new Date().toISOString() + '  ' + msg;
  console.log('[SENTRY]', msg);
  try { fs.appendFileSync(SENTRY_LOG, line + '\n'); } catch (e) { /* non-fatal */ }
}


// ═══════════════════════════════════════════════════════════════════════════
// 10. Exports and main
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  runAnalysis,
  buildGraphWeights,
  buildMasterySummary,
  detectCollapse,
  loadAllEvents
};

// Only start servers when run directly (not when required by tests)
if (require.main === module) {
  ensureDirs();
  startReceiver();
  scheduleAnalysis();

  // Run analysis immediately on startup to catch up on any missed events
  runAnalysis().catch(err => _log('Startup analysis error: ' + err.message));
}
