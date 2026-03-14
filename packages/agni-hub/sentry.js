// packages/agni-hub/sentry.js
// AGNI Village Sentry v1.8.0 â€“ O(1) Memory, Async Buffering, Health, Shutdown, Retry
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
'use strict';
const fs = require('fs');
const path = require('path');
const { loadHubConfig } = require('@agni/utils/hub-config');
loadHubConfig(path.join(__dirname, '../../data'));
const { validateEnv } = require('@agni/utils/env-validate');
validateEnv();

const http = require('http');
const crypto = require('crypto');
const { createLogger } = require('@agni/utils/logger');
const envConfig = require('@agni/utils/env-config');
const { ensureDataDirExists } = require('@agni/utils/ensure-paths');
ensureDataDirExists(envConfig);
const sentryAnalysis = require('./sentry-analysis');

// â”€â”€ Hub config bootstrap (F1) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// â”€â”€ Configuration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const DATA_DIR = envConfig.dataDir;
const EVENTS_DIR = path.join(DATA_DIR, 'events');
const GRAPH_WEIGHTS = path.join(DATA_DIR, 'graph-weights.json');
const GRAPH_WEIGHTS_PENDING = path.join(DATA_DIR, 'graph-weights-pending.json');
const COHORT_ASSIGNMENTS = path.join(DATA_DIR, 'cohort-assignments.json');
const GRAPH_WEIGHTS_BACKUP = path.join(DATA_DIR, 'graph-weights.backup.json');
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

// Time-skew protection: Pi without RTC may boot at epoch (1970). Reject writes when year is invalid.
const MIN_VALID_YEAR = envConfig.sentryMinValidYear;
const AGGREGATOR_ENABLED = envConfig.aggregatorIngestEnabled;
const AGGREGATOR_SECRET = envConfig.aggregatorIngestSecret;

function isSystemClockValid() {
  return new Date().getFullYear() >= MIN_VALID_YEAR;
}

/** B1.1: Anonymize pseudoId for cross-village aggregation. Same (sourceHubId, pseudoId) -> same anon. */
function anonymizeForAggregator(pseudoId, sourceHubId) {
  if (!pseudoId || !sourceHubId) return pseudoId;
  var h = crypto.createHash('sha256').update(String(sourceHubId) + ':' + String(pseudoId)).digest('hex').slice(0, 12);
  return 'anon-' + String(sourceHubId).replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 32) + '-' + h;
}

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
let _pendingReviewPath = null;

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
  if (!isSystemClockValid()) {
    log.warn('System clock skewed (year < ' + MIN_VALID_YEAR + '), skipping event flush');
    return callback(null);
  }
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
      } catch { /* ignore */ }
      const pendingReview = !!_pendingReviewPath && fs.existsSync(_pendingReviewPath);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        bufferSize: eventBuffer.length,
        lastAnalysisAt: _lastAnalysisAt,
        graphWeightsUpdatedAt: _graphWeightsUpdatedAt,
        edgesCount: edgesCount,
        pendingReview: pendingReview,
        pendingPath: pendingReview ? _pendingReviewPath : null
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

          if (!isSystemClockValid()) {
            log.warn('System clock skewed (year < ' + MIN_VALID_YEAR + '), rejecting telemetry');
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'System clock invalid', minValidYear: MIN_VALID_YEAR }));
            return;
          }

          appendEvents(valid);
          _eventsSinceLastAnalysis += valid.length;
          log.info('Events received', { count: valid.length });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ accepted: valid.map(e => e.eventId) }));

          if (_eventsSinceLastAnalysis >= ANALYSE_AFTER_N && Date.now() - lastAnalysisAttempt > MIN_MS_BETWEEN_ANALYSIS) {
            lastAnalysisAttempt = Date.now();
            setImmediate(() => runAnalysis().catch(e => log.error('Analysis error', { error: e.message })));
          }
        } catch { res.writeHead(400); res.end(); }
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/api/telemetry/ingest') {
      if (!AGGREGATOR_ENABLED || !AGGREGATOR_SECRET) {
        res.writeHead(404); res.end();
        return;
      }
      var secret = req.headers['x-aggregator-secret'];
      if (secret !== AGGREGATOR_SECRET) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
      var chunks = [];
      var size = 0;
      var tooBig = false;
      req.on('data', function (chunk) {
        if (tooBig) return;
        size += chunk.length;
        if (size > 1e6) { tooBig = true; req.destroy(); return; }
        chunks.push(chunk);
      });
      req.on('end', function () {
        if (tooBig) { res.writeHead(413); res.end(); return; }
        try {
          var body = Buffer.concat(chunks).toString('utf8');
          var payload = JSON.parse(body);
          var sourceHubId = (payload.sourceHubId || req.headers['x-source-hub'] || 'unknown').toString().slice(0, 64);
          var raw = Array.isArray(payload.events) ? payload.events : [payload];
          var valid = [];
          for (var i = 0; i < raw.length; i++) {
            var ev = validateEvent(raw[i]);
            if (ev) {
              ev.sourceHubId = sourceHubId;
              ev.pseudoId = anonymizeForAggregator(ev.pseudoId, sourceHubId);
              valid.push(ev);
            }
          }
          if (!valid.length) { res.writeHead(400); res.end(); return; }
          if (!isSystemClockValid()) {
            log.warn('System clock skewed, rejecting ingest');
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'System clock invalid' }));
            return;
          }
          appendEvents(valid);
          _eventsSinceLastAnalysis += valid.length;
          log.info('Ingest received', { count: valid.length, sourceHubId: sourceHubId });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ accepted: valid.map(function (e) { return e.eventId; }) }));
          if (_eventsSinceLastAnalysis >= ANALYSE_AFTER_N && Date.now() - lastAnalysisAttempt > MIN_MS_BETWEEN_ANALYSIS) {
            lastAnalysisAttempt = Date.now();
            setImmediate(function () { runAnalysis().catch(function (e) { log.error('Analysis error', { error: e.message }); }); });
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
const { loadJSONAsync, saveJSONAsync } = require('@agni/utils/json-store');
let _graphWeightsValidator = null;

function getGraphWeightsValidator() {
  if (_graphWeightsValidator) return _graphWeightsValidator;
  try {
    const { createSchemaValidator } = require('@agni/utils/schema-validator');
    const schemaPath = path.join(__dirname, '../../schemas/graph-weights.schema.json');
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const ajv = createSchemaValidator({ allErrors: true, addFormats: true });
    if (!ajv) return null;
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
    const startIdx = state.cursors[file] || 0;

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

  const { largest, clusters } = cohortResult;
  const clustersQualifying = clusters.filter(function (c) { return c.members.length >= MIN_CLUSTER_SIZE; });
  const clustersWithIds = clustersQualifying.map(function (c) {
    return {
      cohortId: sentryAnalysis.cohortIdFromCentroid(c.centroid),
      members: c.members,
      centroid: c.centroid
    };
  });
  const cohortAssignments = sentryAnalysis.buildCohortAssignments(clustersWithIds);
  await saveJSONAsync(COHORT_ASSIGNMENTS, { assignments: cohortAssignments }, { minified: true });

  const cohortSet = new Set(largest.members);
  const globalPairs = {};
  cohortSet.forEach(function (pid) {
    const tables = contingencies[pid] || {};
    Object.keys(tables).forEach(function (pair) {
      const counts = tables[pair];
      if (!globalPairs[pair]) globalPairs[pair] = { a: 0, b: 0, c: 0, d: 0 };
      globalPairs[pair].a += counts.a;
      globalPairs[pair].b += counts.b;
      globalPairs[pair].c += counts.c;
      globalPairs[pair].d += counts.d;
    });
  });

  let edges = sentryAnalysis.computeEdgesFromGlobalPairs(globalPairs, opts);

  // INVARIANT: graph_weights affect only MLC (sort order), never eligibility (BFS prerequisites).
  // Theta uses ontology.requires/provides for eligibility; graph_weights only tune MLC.
  const maxDelta = envConfig.sentryWeightMaxDelta;
  const reviewThreshold = envConfig.sentryWeightReviewThreshold;
  let maxWeightChange = 0;
  const prevGw = await loadJSONAsync(GRAPH_WEIGHTS, null);
  const prevByKey = {};
  if (prevGw && Array.isArray(prevGw.edges)) {
    prevGw.edges.forEach(function (e) { prevByKey[e.from + '\x00' + e.to] = e; });
  }
  edges = edges.map(function (e) {
    const key = e.from + '\x00' + e.to;
    const prev = prevByKey[key];
    if (!prev || typeof prev.weight !== 'number') return e;
    const delta = Math.max(-maxDelta, Math.min(maxDelta, e.weight - prev.weight));
    const newWeight = Math.round((prev.weight + delta) * 1000) / 1000;
    const change = Math.abs(newWeight - prev.weight);
    if (change > maxWeightChange) maxWeightChange = change;
    return Object.assign({}, e, { weight: Math.max(0, Math.min(1, newWeight)) });
  });

  const cohortId = sentryAnalysis.cohortIdFromCentroid(largest.centroid);
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

  _lastAnalysisAt = now;
  if (maxWeightChange >= reviewThreshold) {
    await saveJSONAsync(GRAPH_WEIGHTS_PENDING, gw);
    _pendingReviewPath = GRAPH_WEIGHTS_PENDING;
    log.warn('Large weight change requires human review; wrote to pending', {
      maxWeightChange, reviewThreshold, pendingPath: GRAPH_WEIGHTS_PENDING
    });
  } else {
    _pendingReviewPath = null;
    if (fs.existsSync(GRAPH_WEIGHTS)) {
      const backup = await loadJSONAsync(GRAPH_WEIGHTS, null);
      if (backup) await saveJSONAsync(GRAPH_WEIGHTS_BACKUP, backup);
    }
    await saveJSONAsync(GRAPH_WEIGHTS, gw);
    _graphWeightsUpdatedAt = now;
    log.info('Analysis complete', { eventsProcessed, edges: edges.length });
  }

  for (var ci = 0; ci < clustersWithIds.length; ci++) {
    var cl = clustersWithIds[ci];
    if (cl.cohortId === cohortId) continue;
    var cpairs = {};
    cl.members.forEach(function (pid) {
      var tables = contingencies[pid] || {};
      Object.keys(tables).forEach(function (pair) {
        var counts = tables[pair];
        if (!cpairs[pair]) cpairs[pair] = { a: 0, b: 0, c: 0, d: 0 };
        cpairs[pair].a += counts.a;
        cpairs[pair].b += counts.b;
        cpairs[pair].c += counts.c;
        cpairs[pair].d += counts.d;
      });
    });
    var cedges = sentryAnalysis.computeEdgesFromGlobalPairs(cpairs, opts);
    var cgw = {
      '$schema': 'https://github.com/NewmanB1/AGNI/schemas/graph-weights.schema.json',
      version: SCHEMA_VERSION,
      discovered_cohort: cl.cohortId,
      level: 'village',
      sample_size: cl.members.length,
      created_date: now,
      last_updated: now,
      default_weight: 1.0,
      weight_estimation_method: 'correlation_based',
      clustering_method: 'jaccard_similarity',
      edges: cedges,
      metadata: { computation_date: now, software_version: SW_VERSION }
    };
    var cv = getGraphWeightsValidator();
    if (!cv || cv(cgw)) {
      await saveJSONAsync(path.join(DATA_DIR, 'graph-weights-' + cl.cohortId + '.json'), cgw);
    }
  }

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
