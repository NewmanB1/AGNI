#!/usr/bin/env node
'use strict';

/**
 * Regression guards for hub-config.pi.json (audit bugs 1–8).
 *
 * Bug 1: Memory arithmetic must be correct (960 B Rasch, 3.8 KB / 13 KB embeddings, 2.0 KB Bandit A).
 * Bug 2: _engine_notes must caveat JS object overhead (plain Array, V8, 3–5×).
 * Bug 3: Node version must be documented (nodeVersionRequired, nodeVersionNote).
 * Bug 4: embeddingDim must be explicit in config (not env-only).
 *
 * Exit 0 pass, 1 fail.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'data', 'hub-config.pi.json');

const errors = [];

/** Rasch bytes per student (ability + variance = 2×float64). Update if engine changes. */
var RASCH_BYTES_PER_STUDENT = 16;

var MAX_CAPACITY = 100000;

let cfg;
try {
  var raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  cfg = JSON.parse(raw);
} catch (e) {
  if (e.code === 'ENOENT') {
    console.error('check-hub-config-pi: data/hub-config.pi.json not found.');
  } else if (e instanceof SyntaxError) {
    console.error('check-hub-config-pi: failed to parse JSON:', e.message);
  } else {
    console.error('check-hub-config-pi: failed to read config:', e.message);
  }
  process.exit(1);
}

if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
  console.error('check-hub-config-pi: config must be a non-null object.');
  process.exit(1);
}

function toNotes(val, key) {
  if (Array.isArray(val)) return val.join('\n');
  if (typeof val === 'string') return val;
  if (val !== undefined && val !== null) {
    errors.push(key + ' must be array or string; got ' + typeof val + '.');
  }
  return '';
}
/** Match number as whole word to avoid "4" matching "40" or "14". */
function notesIncludeNum(notes, num) {
  var s = String(num);
  var re = new RegExp('\\b' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
  return re.test(notes);
}
const notes = toNotes(cfg._engine_notes, '_engine_notes');

// Bug 4: embeddingDim must be explicit and integer
if (typeof cfg.embeddingDim !== 'number' || !Number.isInteger(cfg.embeddingDim) || cfg.embeddingDim < 1 || cfg.embeddingDim > 1024) {
  errors.push('embeddingDim must be present and integer in [1,1024]. Prefer config over env to avoid mismatch with lms_state.json.');
}

// Bug 5: forgetting must be explicit; valid range [0.9,1] documented (0.5 floor was too permissive, degenerate bandit)
if (typeof cfg.forgetting !== 'number' || !Number.isFinite(cfg.forgetting)) {
  errors.push('forgetting must be present and finite (e.g. 0.96). Values outside [0.9,1] corrupt bandit decay.');
} else if (cfg.forgetting < 0.9 || cfg.forgetting > 1) {
  errors.push('forgetting must be in [0.9,1]; got ' + cfg.forgetting + '. Values outside range corrupt decay.');
}
if (!notes.includes('0.9') && !notes.includes('[0.9') && !notes.includes('0.9,')) {
  errors.push('_engine_notes must document forgetting valid range [0.9,1].');
}

// Bug 7: maxStudents/maxLessons must be explicit integers
if (typeof cfg.maxStudents !== 'number' || !Number.isInteger(cfg.maxStudents) || cfg.maxStudents < 1 || cfg.maxStudents > MAX_CAPACITY) {
  errors.push('maxStudents must be present and integer in [1,' + MAX_CAPACITY + ']. Budget assumes this limit; exceeding silently exceeds memory.');
}
if (typeof cfg.maxLessons !== 'number' || !Number.isInteger(cfg.maxLessons) || cfg.maxLessons < 1 || cfg.maxLessons > MAX_CAPACITY) {
  errors.push('maxLessons must be present and integer in [1,' + MAX_CAPACITY + ']. Budget assumes this limit; exceeding silently exceeds memory.');
}
if (!notes.includes('Runtime') && !notes.includes('runtime') && !notes.includes('enforced') && !notes.includes('enforcement')) {
  errors.push('_engine_notes must document maxStudents/maxLessons enforcement (or lack thereof).');
}

// Path fields required for hub operation
var pathKeys = ['dataDir', 'serveDir', 'yamlDir'];
for (var pi = 0; pi < pathKeys.length; pi++) {
  var pk = pathKeys[pi];
  var pv = cfg[pk];
  if (typeof pv !== 'string' || pv.trim().length === 0) {
    errors.push(pk + ' must be non-empty string.');
  }
}

// Bug 6: Template must use a placeholder so deployers replace it (duplicate hubIds corrupt sync)
if (typeof cfg.hubId !== 'string' || cfg.hubId.trim().length === 0) {
  errors.push('hubId must be present and non-empty.');
} else if (!/CHANGE_ME|REPLACE|__REPLACE__|<REPLACE>|\bTODO\b|\bFIXME\b/i.test(cfg.hubId)) {
  errors.push('hubId must contain a placeholder (e.g. CHANGE_ME) so deployers replace it. Hardcoded values (e.g. village-pi-01) cause collisions when config is copied to a second Pi.');
}

// Bug 3: Node version must be documented
if (typeof cfg.nodeVersionRequired !== 'string' || cfg.nodeVersionRequired.trim().length === 0) {
  errors.push('nodeVersionRequired must be present string (e.g. ">=18"). Bullseye ships Node 12; deployers need this documented.');
}
if (typeof cfg.nodeVersionNote !== 'string' || cfg.nodeVersionNote.trim().length === 0) {
  errors.push('nodeVersionNote must warn about Bullseye Node 12 and silent failures.');
}

// Bug 1: Memory arithmetic — key values must appear (derive from config)
const dim = (typeof cfg.embeddingDim === 'number' && Number.isInteger(cfg.embeddingDim)) ? cfg.embeddingDim : 8;
const nStu = (typeof cfg.maxStudents === 'number' && Number.isInteger(cfg.maxStudents)) ? cfg.maxStudents : 60;
const nLes = (typeof cfg.maxLessons === 'number' && Number.isInteger(cfg.maxLessons)) ? cfg.maxLessons : 200;
const featureDim = dim * 2;
const raschBytes = nStu * RASCH_BYTES_PER_STUDENT;
const embStudentsBytes = nStu * dim * 8;
const embLessonsBytes = nLes * dim * 8;
const banditABytes = featureDim * featureDim * 8;

const raschSizeOk = notesIncludeNum(notes, raschBytes) || notes.includes(raschBytes + ' B') || notes.includes(raschBytes + 'B');
if (!raschSizeOk) {
  errors.push(`_engine_notes must show Rasch students: ${nStu} × ${RASCH_BYTES_PER_STUDENT} B = ${raschBytes} B (ability+variance).`);
}

const embStuKB = embStudentsBytes / 1024;
const embStuSizeOk = notesIncludeNum(notes, embStudentsBytes) || notes.includes(embStuKB.toFixed(1)) ||
  notesIncludeNum(notes, Math.round(embStuKB)) || (embStuKB >= 1 && notes.includes((embStuKB).toFixed(1) + ' KB'));
if (!embStuSizeOk) {
  errors.push(`_engine_notes must show Embeddings (students): ${nStu}×${dim}×8 = ${embStudentsBytes} B (≈${embStuKB.toFixed(1)} KB).`);
}

const embLesKB = embLessonsBytes / 1024;
const embLesSizeOk = notesIncludeNum(notes, embLessonsBytes) || notes.includes(embLesKB.toFixed(1)) ||
  notesIncludeNum(notes, Math.round(embLesKB)) || (embLesKB >= 1 && notes.includes((embLesKB).toFixed(1) + ' KB'));
if (!embLesSizeOk) {
  errors.push(`_engine_notes must show Embeddings (lessons): ${nLes}×${dim}×8 = ${embLessonsBytes} B (≈${embLesKB.toFixed(1)} KB).`);
}
const banditKB = banditABytes / 1024;
const banditSizeOk = notesIncludeNum(notes, banditABytes) || notes.includes(banditKB.toFixed(1)) ||
  notes.includes(String(Math.round(banditKB)) + ' KB') || notes.includes(String(Math.round(banditKB)) + '.0 KB');
if (!banditSizeOk) {
  errors.push(`_engine_notes must show Bandit A ≈ ${banditKB >= 1 ? banditKB.toFixed(1) + ' KB' : banditABytes + ' B'} (${featureDim}×${featureDim}×8 = ${banditABytes} B).`);
}
if (!notes.includes('ability+variance') && !notes.includes('RaschStudentState')) {
  errors.push('_engine_notes must clarify Rasch 16 B = ability+variance (2×float64).');
}
if (!notes.includes('featureDim') && !notes.includes('embeddingDim×2') && !notes.includes('embeddingDim*2')) {
  errors.push('_engine_notes must note featureDim=embeddingDim×2 invariant for Bandit A.');
}

// Bug 8: Path assumptions — existence, fallback, permissions, failure mode
const pathNotes = toNotes(cfg._path_notes, '_path_notes');
if (!pathNotes.includes('ENOENT') && !pathNotes.includes('no such file')) {
  errors.push('_path_notes must document failure mode when dataDir missing (ENOENT at first file access).');
}
if (!pathNotes.includes('init') && !pathNotes.includes('init:data')) {
  errors.push('_path_notes must document init:data (or equivalent) before first start.');
}
if (!pathNotes.includes('Permissions') && !pathNotes.includes('permissions') && !pathNotes.includes('rwx')) {
  errors.push('_path_notes must document required filesystem permissions (rwx on dataDir/serveDir/yamlDir).');
}
if (!pathNotes.includes('fallback') && !pathNotes.includes('Fallback') && !pathNotes.includes('No fallback')) {
  errors.push('_path_notes must state that there is no fallback when paths do not exist.');
}

// Bug 2: JS object overhead caveat
if (!notes.includes('plain Array') && !notes.includes('TypedArray')) {
  errors.push('_engine_notes must mention plain Array vs TypedArray or V8 object overhead.');
}
if (!/3[-–]5|3\.5|overhead.*raw|raw.*overhead/.test(notes)) {
  errors.push('_engine_notes must caveat in-RAM 3–5× raw bytes due to V8 overhead.');
}

if (errors.length > 0) {
  console.error('check-hub-config-pi: hub-config.pi.json regression guards failed\n');
  errors.forEach((e) => console.error('  ', e));
  process.exit(1);
}
console.log('check-hub-config-pi: OK');
process.exit(0);
