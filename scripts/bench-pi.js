#!/usr/bin/env node
// scripts/bench-pi.js
// Performance benchmark simulating a Raspberry Pi village deployment.
//
// Simulates 60 students completing lessons and measures:
//   - Time per recordObservation (Rasch + embeddings + bandit + Markov)
//   - Time per selectBestLesson (Thompson sample + Markov score + PageRank)
//   - Memory usage (heap, RSS)
//   - State file size on disk
//
// Run: AGNI_EMBEDDING_DIM=8 AGNI_DATA_DIR=/tmp/agni-bench node scripts/bench-pi.js
//
// On a Pi 4 (ARM Cortex-A72 1.5GHz), expect:
//   recordObservation: < 5ms
//   selectBestLesson:  < 15ms
//   Memory RSS:        < 50 MB

'use strict';

var fs = require('fs');
var path = require('path');
var os = require('os');

// Use a temp directory so we don't pollute real data
var BENCH_DIR = path.join(os.tmpdir(), 'agni-bench-' + Date.now());
process.env.AGNI_DATA_DIR = BENCH_DIR;
process.env.AGNI_EMBEDDING_DIM = process.env.AGNI_EMBEDDING_DIM || '8';
fs.mkdirSync(BENCH_DIR, { recursive: true });

var NUM_STUDENTS = 60;
var NUM_LESSONS = 200;
var OBSERVATIONS_PER_STUDENT = 20;
var CANDIDATES_PER_SELECTION = 15;

console.log('=== AGNI Pi Deployment Benchmark ===');
console.log('Students:', NUM_STUDENTS);
console.log('Lessons:', NUM_LESSONS);
console.log('Observations per student:', OBSERVATIONS_PER_STUDENT);
console.log('Embedding dim:', process.env.AGNI_EMBEDDING_DIM);
console.log('Data dir:', BENCH_DIR);
console.log('');

// Require engine after env vars are set
var rasch = require('../src/engine/rasch');
var embeddings = require('../src/engine/embeddings');
var thompson = require('../src/engine/thompson');
var markov = require('../src/engine/markov');
var pagerank = require('../src/engine/pagerank');
var math = require('../src/engine/math');

var dim = parseInt(process.env.AGNI_EMBEDDING_DIM, 10);

function buildState() {
  return {
    rasch: {
      students: {},
      probes: {},
      globalAnchor: { meanAbility: 0, stdAbility: 1 }
    },
    embedding: {
      dim: dim,
      lr: 0.01,
      reg: 0.001,
      forgetting: 0.96,
      students: {},
      lessons: {}
    },
    bandit: {
      A: null,
      b: null,
      featureDim: dim * 2,
      forgetting: 0.96,
      observationCount: 0
    },
    markov: {
      transitions: {},
      studentHistory: {},
      bigrams: {},
      dropouts: {},
      cooldowns: {}
    }
  };
}

function seedLessons(state) {
  var skills = ['algebra', 'geometry', 'trig', 'calculus', 'physics',
                'chemistry', 'biology', 'literacy', 'civics', 'history'];
  for (var i = 0; i < NUM_LESSONS; i++) {
    var lid = 'lesson-' + i;
    var difficulty = (i % 5) - 2;
    var skill = skills[i % skills.length];
    state.rasch.probes[lid] = { difficulty: difficulty, skill: skill };
    embeddings.ensureLessonVector(state, lid);
  }
}

function randomProbeResults(state) {
  var probeIds = Object.keys(state.rasch.probes);
  var count = 1 + Math.floor(Math.random() * 3);
  var results = [];
  for (var i = 0; i < count; i++) {
    results.push({
      probeId: probeIds[Math.floor(Math.random() * probeIds.length)],
      correct: Math.random() > 0.4
    });
  }
  return results;
}

function randomCandidates(state) {
  var all = Object.keys(state.rasch.probes);
  var shuffled = all.sort(function () { return Math.random() - 0.5; });
  return shuffled.slice(0, CANDIDATES_PER_SELECTION);
}

function median(arr) {
  var s = arr.slice().sort(function (a, b) { return a - b; });
  var mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function p99(arr) {
  var s = arr.slice().sort(function (a, b) { return a - b; });
  return s[Math.floor(s.length * 0.99)];
}

// ── Run Benchmark ────────────────────────────────────────────────────────────

var state = buildState();
seedLessons(state);
thompson.ensureBanditInitialized(state);

console.log('Seeded', NUM_LESSONS, 'lessons (dim=' + dim + ', featureDim=' + state.bandit.featureDim + ')');
console.log('');

// Phase 1: Record observations
console.log('--- Phase 1: recordObservation (Rasch + Embeddings + Bandit + Markov) ---');
var obsTimes = [];

for (var s = 0; s < NUM_STUDENTS; s++) {
  var sid = 'student-' + s;
  for (var o = 0; o < OBSERVATIONS_PER_STUDENT; o++) {
    var lid = 'lesson-' + Math.floor(Math.random() * NUM_LESSONS);
    var probeResults = randomProbeResults(state);

    var t0 = process.hrtime.bigint();
    var gain = rasch.updateAbility(state, sid, probeResults);
    embeddings.updateEmbedding(state, sid, lid, gain);
    thompson.updateBandit(state, sid, lid, gain);
    markov.recordTransition(state, sid, lid, gain);
    var t1 = process.hrtime.bigint();

    obsTimes.push(Number(t1 - t0) / 1e6);
  }
}

console.log('  Total observations:', obsTimes.length);
console.log('  Median:', median(obsTimes).toFixed(3), 'ms');
console.log('  P99:   ', p99(obsTimes).toFixed(3), 'ms');
console.log('  Max:   ', Math.max.apply(null, obsTimes).toFixed(3), 'ms');
console.log('');

// Phase 2: Select lessons
console.log('--- Phase 2: selectBestLesson (Thompson + Markov + PageRank) ---');
var selTimes = [];

for (var s2 = 0; s2 < NUM_STUDENTS; s2++) {
  var sid2 = 'student-' + s2;
  var candidates = randomCandidates(state);

  var t2 = process.hrtime.bigint();

  // Thompson score (with regularization matching the engine's approach)
  thompson.ensureBanditInitialized(state);
  var regA = state.bandit.A.map(function (row, ri) {
    return row.map(function (v, ci) { return v + (ri === ci ? 1e-6 : 0); });
  });
  var Ainv;
  try { Ainv = math.invertSPD(regA); }
  catch (_) { Ainv = math.identity(state.bandit.featureDim); }
  var mean = math.matVec(Ainv, state.bandit.b);
  var L;
  try { L = math.cholesky(Ainv); }
  catch (_) { L = math.identity(state.bandit.featureDim); }
  var z = [];
  for (var zi = 0; zi < mean.length; zi++) z.push(math.randn());
  var noise = math.matVec(L, z);
  var thetaSample = mean.map(function (m, i) { return m + noise[i]; });
  var studentVec = embeddings.ensureStudentVector(state, sid2);

  for (var ci = 0; ci < candidates.length; ci++) {
    var lessonVec = embeddings.ensureLessonVector(state, candidates[ci]);
    var x = studentVec.concat(lessonVec);
    math.dot(thetaSample, x);
  }

  // Markov scores
  for (var mi = 0; mi < candidates.length; mi++) {
    markov.scoreCandidate(state, sid2, candidates[mi]);
  }

  // PageRank scores
  pagerank.scoreCandidates(state, sid2, candidates);

  var t3 = process.hrtime.bigint();
  selTimes.push(Number(t3 - t2) / 1e6);
}

console.log('  Selections:', selTimes.length);
console.log('  Median:', median(selTimes).toFixed(3), 'ms');
console.log('  P99:   ', p99(selTimes).toFixed(3), 'ms');
console.log('  Max:   ', Math.max.apply(null, selTimes).toFixed(3), 'ms');
console.log('');

// Phase 3: Memory and state size
var stateJson = JSON.stringify(state);
var stateSize = Buffer.byteLength(stateJson, 'utf8');
var mem = process.memoryUsage();

console.log('--- Phase 3: Resource Usage ---');
console.log('  State JSON size:', (stateSize / 1024).toFixed(1), 'KB');
console.log('  Heap used:      ', (mem.heapUsed / 1024 / 1024).toFixed(1), 'MB');
console.log('  Heap total:     ', (mem.heapTotal / 1024 / 1024).toFixed(1), 'MB');
console.log('  RSS:            ', (mem.rss / 1024 / 1024).toFixed(1), 'MB');
console.log('  Students:       ', Object.keys(state.rasch.students).length);
console.log('  Lessons:        ', Object.keys(state.embedding.lessons).length);
console.log('  Markov edges:   ', Object.keys(state.markov.transitions).length);
console.log('  Observations:   ', state.bandit.observationCount);
console.log('');

// Phase 4: Throughput estimate
var avgObs = obsTimes.reduce(function (a, b) { return a + b; }, 0) / obsTimes.length;
var avgSel = selTimes.reduce(function (a, b) { return a + b; }, 0) / selTimes.length;

console.log('--- Phase 4: Throughput Estimate (single-threaded) ---');
console.log('  Avg observation:', avgObs.toFixed(3), 'ms → ~' + Math.floor(1000 / avgObs), 'obs/sec');
console.log('  Avg selection:  ', avgSel.toFixed(3), 'ms → ~' + Math.floor(1000 / avgSel), 'sel/sec');
console.log('');

var PI3_FACTOR = 6;
var PI4_FACTOR = 3;
console.log('  Estimated Pi 3B+ (ARM Cortex-A53 1.4GHz, ~' + PI3_FACTOR + 'x slower):');
console.log('    observation:', (avgObs * PI3_FACTOR).toFixed(1), 'ms → ~' + Math.floor(1000 / (avgObs * PI3_FACTOR)), 'obs/sec');
console.log('    selection:  ', (avgSel * PI3_FACTOR).toFixed(1), 'ms → ~' + Math.floor(1000 / (avgSel * PI3_FACTOR)), 'sel/sec');
console.log('');
console.log('  Estimated Pi 4 (ARM Cortex-A72 1.5GHz, ~' + PI4_FACTOR + 'x slower):');
console.log('    observation:', (avgObs * PI4_FACTOR).toFixed(1), 'ms → ~' + Math.floor(1000 / (avgObs * PI4_FACTOR)), 'obs/sec');
console.log('    selection:  ', (avgSel * PI4_FACTOR).toFixed(1), 'ms → ~' + Math.floor(1000 / (avgSel * PI4_FACTOR)), 'sel/sec');
console.log('');

// Concurrent load analysis
var LESSONS_PER_SESSION = 5;
var SESSION_DURATION_MIN = 45;
var peakObsPerMin = NUM_STUDENTS * LESSONS_PER_SESSION / SESSION_DURATION_MIN;
var peakSelPerMin = peakObsPerMin;
var obsPerSecNeeded = peakObsPerMin / 60;
var selPerSecNeeded = peakSelPerMin / 60;

console.log('--- Phase 5: 60-Student Concurrent Load Analysis ---');
console.log('  Scenario: 60 students, ' + LESSONS_PER_SESSION + ' lessons each, ' + SESSION_DURATION_MIN + '-min session');
console.log('  Peak observations/sec needed: ', obsPerSecNeeded.toFixed(2));
console.log('  Peak selections/sec needed:   ', selPerSecNeeded.toFixed(2));
console.log('  Pi 4 can handle ~' + Math.floor(1000 / (avgObs * PI4_FACTOR)) + ' obs/sec — headroom: ' +
  Math.floor((1000 / (avgObs * PI4_FACTOR)) / obsPerSecNeeded) + 'x');
console.log('  Pi 3B+ can handle ~' + Math.floor(1000 / (avgObs * PI3_FACTOR)) + ' obs/sec — headroom: ' +
  Math.floor((1000 / (avgObs * PI3_FACTOR)) / obsPerSecNeeded) + 'x');

console.log('');
console.log('=== Benchmark Complete ===');

// Cleanup
try { fs.rmSync(BENCH_DIR, { recursive: true }); } catch (_) {}
