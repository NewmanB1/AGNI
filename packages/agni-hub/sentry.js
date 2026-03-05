// hub-tools/sentry.js
// AGNI Village Sentry v1.8.0 â€“ O(1) Memory, Async Buffering, Health, Shutdown, Retry
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { createLogger } = require('../../src/utils/logger');
const envConfig = require('../../src/utils/env-config');
const sentryAnalysis = require('./sentry-analysis');

// â”€â”€ Hub config bootstrap (F1) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const { loadHubConfig } = require('../../src/utils/hub-config');
loadHubConfig(path.join(__dirname, '../../data'));

// â”€â”€ Configuration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const DATA_DIR = envConfig.dataDir;
const EVENTS_DIR = path.join(DATA_DIR, 'events');
const GRAPH_WEIGHTS = path.join(DATA_DIR, 'graph-weights.json');
const MASTERY_SUMMARY = path.join(DATA_DIR, 'mastery-summary.json');
const CONTINGENCY_TABLES = path.join(DATA_DIR, 'contingency-tables.json');
const SENTRY_STATE = path.join(DATA_DIR, 'sentry-state.json');
const SENTRY_LOG = path.join(DATA_DIR, 'sentry.log');

const PORT = envConfig.sentryPort;
const ANALYSE_AFTER_N = envConfig.analyseAfter;
const ANALYSE_SCHEDULE = envConfig.analyseCron;
const MIN_MS_BETWEEN_ANALYSIS = 4 * 60 * 60 * 1000;

const CHI2_THRESHOLD = envConfig.sentryChi2Threshold;
const MIN_SAMPLE = envConfig.sentryMinSample;
const JACCARD_THRESHOLD = envConfig.sentryJaccardThreshold;
const MIN_CLUSTER_SIZE = envConfig.sentryMinClusterSize;
const MASTERY_THRESHOLD = envConfig.masteryThreshold;
const PASS_THRESHOLD = 0.6;
const SCHEMA_VERSION = '1.7.0';
const SW_VERSION = 'sentry-agent v1.8.0';

const FLUSH_INTERVAL_MS = 30000;
const FLUSH_RETRY_ATTEMPTS = 3;
const FLUSH_RETRY_DELAY_MS = 1000;
const SHUTDOWN_TIMEOUT_MS = 10000;

let _httpServer = null;
let _shuttingDown = false;

function ensureDirs() {
  [DATA_DIR, EVENTS_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// 1. Asynchronous SD Card Logging & Buffering
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const log = createLogger('sentry', { logFile: SENTRY_LOG });

const EVENT_BUFFER_MAX = 50000;
let eventBuffer = [];
let _flushing = false;
let _lastAnalysisAt = null;
let _graphWeightsUpdatedAt = null;

function todayFile() { return path.join(EVENTS_DIR, new Date().toISOString().slice(0, 10) + '.ndjson'); }

function appendEvents(events) {
  const serialized = events.map(e => JSON.stringify(e));
  if (eventBuffer.length + serialized.length > EVENT_BUFFER_MAX) {
    log.warn('Event buffer full, dropping events', { dropped: serialized.length, bufferSize: eventBuffer.length });
    return;
  }
  eventBuffer.push(...serialized);
}

function failedEventsFile() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return path.join(EVENTS_DIR, 'failed-' + date + '.ndjson');
}

function doFlushOnce(callback) {
  if (eventBuffer.length === 0) return callback(null);
  const toWrite = eventBuffer.join('\n') + '\n';
  eventBuffer = [];
  let attempts = 0;
  function tryWrite() {
    attempts++;
    fs.appendFile(todayFile(), toWrite, 'utf8', (err) => {
      if (err && attempts < FLUSH_RETRY_ATTEMPTS) {
        log.warn('Flush retry', { attempt: attempts, error: err.message });
        setTimeout(tryWrite, FLUSH_RETRY_DELAY_MS);
      } else if (err) {
        try {
          fs.appendFileSync(failedEventsFile(), toWrite, 'utf8');
          log.warn('Event flush failed after retries, wrote to failed-events file', { error: err.message });
        } catch (fallbackErr) {
          log.error('Event flush failed, failed-events fallback also failed, data lost', { error: err.message, fallback: fallbackErr.message });
        }
        callback(err);
      } else {
        callback(null);
      }
    });
  }
  tryWrite();
}

let _flushTimer = null;
function startFlushTimer() {
  if (_flushTimer) return;
  _flushTimer = setInterval(() => {
    if (eventBuffer.length === 0 || _flushing || _shuttingDown) return;
    _flushing = true;
    doFlushOnce(() => {
      _flushing = false;
    });
  }, FLUSH_INTERVAL_MS);
}

function pruneOldEvents(maxAgeDays) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxAgeDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  try {
    const files = fs.readdirSync(EVENTS_DIR).filter(f => f.endsWith('.ndjson'));
    let pruned = 0;
    for (const f of files) {
      const datePrefix = f.slice(0, 10);
      if (datePrefix < cutoffStr) {
        fs.unlinkSync(path.join(EVENTS_DIR, f));
        pruned++;
      }
    }
    if (pruned > 0) log.info('Pruned old event files', { pruned, maxAgeDays });
  } catch (e) {
    log.warn('Event pruning failed', { error: e.message });
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// 2. HTTP receiver & Health
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
let _eventsSinceLastAnalysis = 0;
let lastAnalysisAttempt = 0;

function validateEvent(raw) {
  return sentryAnalysis.validateEvent(raw);
}

function startReceiver() {
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', envConfig.corsOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method === 'GET' && req.url === '/api/sentry/status') {
      let edgesCount = null;
      try {
        if (fs.existsSync(GRAPH_WEIGHTS)) {
          const gw = JSON.parse(fs.readFileSync(GRAPH_WEIGHTS, 'utf8'));
          edgesCount = Array.isArray(gw.edges) ? gw.edges.length : 0;
        }
      } catch (_) { /* ignore */ }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        bufferSize: eventBuffer.length,
        lastAnalysisAt: _lastAnalysisAt,
        graphWeightsUpdatedAt: _graphWeightsUpdatedAt,
        edgesCount: edgesCount
      }));
      return;
    }

    if (_shuttingDown) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Server shutting down' }));
      return;
    }

    if (req.method === 'POST' && req.url === '/api/telemetry') {
      const chunks = [];
      let size = 0;
      let tooBig = false;
      req.on('data', chunk => {
        if (tooBig) return;
        size += chunk.length;
        if (size > 1e6) { tooBig = true; req.destroy(); return; }
        chunks.push(chunk);
      });
      req.on('end', () => {
        if (tooBig) { res.writeHead(413); res.end(); return; }
        try {
          const body = Buffer.concat(chunks).toString('utf8');
          const payload = JSON.parse(body);
          const raw = Array.isArray(payload.events) ? payload.events : [payload];
          const valid = raw.map(validateEvent).filter(Boolean);

          if (!valid.length) { res.writeHead(400); res.end(); return; }

          appendEvents(valid);
          _eventsSinceLastAnalysis += valid.length;
          log.info('Events received', { count: valid.length });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ accepted: valid.map(e => e.eventId) }));

          if (_eventsSinceLastAnalysis >= ANALYSE_AFTER_N && Date.now() - lastAnalysisAttempt > MIN_MS_BETWEEN_ANALYSIS) {
            lastAnalysisAttempt = Date.now();
            setImmediate(() => runAnalysis().catch(e => log.error('Analysis error', { error: e.message })));
          }
        } catch (e) { res.writeHead(400); res.end(); }
      });
      return;
    }
    res.writeHead(404); res.end();
  });
  _httpServer = server;
  server.listen(PORT, '0.0.0.0', () => log.info('Receiver listening', { port: PORT }));
}

// â”€â”€ Graceful shutdown â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function shutdown() {
  if (_shuttingDown) return;
  _shuttingDown = true;
  log.info('Shutdown initiated, draining buffer');
  const timeout = setTimeout(() => {
    log.warn('Shutdown timeout, exiting');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  doFlushOnce((err) => {
    clearTimeout(timeout);
    if (err) log.error('Final flush failed', { error: err.message });
    if (_httpServer) _httpServer.close(() => process.exit(0));
    else process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// 3. O(1) Memory Graph Engine & Analysis
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const { loadJSONAsync, saveJSONAsync } = require('../../src/utils/json-store');
let _graphWeightsValidator = null;

function getGraphWeightsValidator() {
  if (_graphWeightsValidator) return _graphWeightsValidator;
  try {
    const Ajv = require('ajv');
    const addFormats = require('ajv-formats');
    const schemaPath = path.join(__dirname, '../../schemas/graph-weights.schema.json');
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const ajv = new Ajv({ allErrors: true });
    addFormats(ajv);
    _graphWeightsValidator = ajv.compile(schema);
    return _graphWeightsValidator;
  } catch (e) {
    log.warn('Could not load graph_weights schema, skipping validation', { error: e.message });
    return null;
  }
}

async function runAnalysis() {
  log.info('Starting O(1) Incremental Analysis');
  _eventsSinceLastAnalysis = 0;

  const state = await loadJSONAsync(SENTRY_STATE, { cursors: {} });
  const mastery = await loadJSONAsync(MASTERY_SUMMARY, { schemaVersion: '1.7.0', students: {} });
  const contingencies = await loadJSONAsync(CONTINGENCY_TABLES, {});

  const opts = {
    masteryThreshold: MASTERY_THRESHOLD,
    passThreshold: PASS_THRESHOLD,
    chi2Threshold: CHI2_THRESHOLD,
    minSample: MIN_SAMPLE,
    jaccardThreshold: JACCARD_THRESHOLD,
    minClusterSize: MIN_CLUSTER_SIZE,
    minVectors: 20
  };

  const fsp = fs.promises;
  const files = (await fsp.readdir(EVENTS_DIR)).filter(f => f.endsWith('.ndjson')).sort();
  let eventsProcessed = 0;

  for (const file of files) {
    const filePath = path.join(EVENTS_DIR, file);
    const content = await fsp.readFile(filePath, 'utf8');
    const lines = content.split('\n');
    let startIdx = state.cursors[file] || 0;

    for (let i = startIdx; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        const ev = JSON.parse(line);
        sentryAnalysis.processOneEvent(ev, mastery, contingencies, opts);
        state.cursors[file] = i + 1;
        eventsProcessed++;
      } catch (e) { log.warn('Skipping malformed event', { file, error: e.message }); }
    }
  }

  if (eventsProcessed === 0) { log.info('No new events to process'); return; }

  await saveJSONAsync(SENTRY_STATE, state);
  await saveJSONAsync(MASTERY_SUMMARY, mastery);
  await saveJSONAsync(CONTINGENCY_TABLES, contingencies, { minified: true });

  const cohortResult = sentryAnalysis.discoverCohort(mastery, opts);
  if (!cohortResult) {
    log.info('Cohort too small for graph building', { size: Object.keys(mastery.students).length });
    _lastAnalysisAt = new Date().toISOString();
    return;
  }

  const { largest } = cohortResult;
  const cohortSet = new Set(largest.members);

  const globalPairs = {};
  cohortSet.forEach(pid => {
    const tables = contingencies[pid] || {};
    Object.entries(tables).forEach(([pair, counts]) => {
      if (!globalPairs[pair]) globalPairs[pair] = { a: 0, b: 0, c: 0, d: 0 };
      globalPairs[pair].a += counts.a;
      globalPairs[pair].b += counts.b;
      globalPairs[pair].c += counts.c;
      globalPairs[pair].d += counts.d;
    });
  });

  const edges = sentryAnalysis.computeEdgesFromGlobalPairs(globalPairs, opts);

  const cohortId = 'c_' + crypto.createHash('sha256').update(largest.centroid.map(v => v.toFixed(4)).join(',')).digest('hex').slice(0, 8);
  const now = new Date().toISOString();
  const gw = {
    '$schema': 'https://github.com/NewmanB1/AGNI/schemas/graph-weights.schema.json',
    version: SCHEMA_VERSION,
    discovered_cohort: cohortId,
    level: 'village',
    sample_size: largest.members.length,
    created_date: now,
    last_updated: now,
    default_weight: 1.0,
    weight_estimation_method: 'correlation_based',
    clustering_method: 'jaccard_similarity',
    edges,
    metadata: { computation_date: now, software_version: SW_VERSION }
  };

  const validate = getGraphWeightsValidator();
  if (validate && !validate(gw)) {
    log.error('Graph weights failed schema validation, not writing', { errors: validate.errors });
    return;
  }

  await saveJSONAsync(GRAPH_WEIGHTS, gw);
  _lastAnalysisAt = now;
  _graphWeightsUpdatedAt = now;
  log.info('Analysis complete', { eventsProcessed, edges: edges.length });

  pruneOldEvents(envConfig.sentryRetentionDays);
}

// â”€â”€ Cron-based analysis â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function parseCronTime(cronStr) {
  if (!cronStr || typeof cronStr !== 'string') return null;
  const m = cronStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return { hour: parseInt(m[1], 10), minute: parseInt(m[2], 10) };
}

let _lastCronCheck = 0;
function checkCronAndRunAnalysis() {
  const cron = parseCronTime(ANALYSE_SCHEDULE);
  if (!cron) return;
  const now = new Date();
  if (now.getHours() === cron.hour && now.getMinutes() === cron.minute) {
    const key = now.getFullYear() * 10000 + now.getMonth() * 100 + now.getDate();
    if (key !== _lastCronCheck) {
      _lastCronCheck = key;
      setImmediate(() => runAnalysis().catch(e => log.error('Cron analysis error', { error: e.message })));
    }
  }
}

if (require.main === module) {
  ensureDirs();
  pruneOldEvents(envConfig.sentryRetentionDays);
  startFlushTimer();
  startReceiver();
  runAnalysis().catch(e => log.error('Startup analysis error', { error: e.message }));
  setInterval(() => runAnalysis().catch(e => log.error('Scheduled analysis error', { error: e.message })), MIN_MS_BETWEEN_ANALYSIS);
  setInterval(checkCronAndRunAnalysis, 60000);
}
