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

if (!fs.existsSync(CONFIG_PATH)) {
  console.error('check-hub-config-pi: data/hub-config.pi.json not found.');
  process.exit(1);
}

const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const notes = (cfg._engine_notes || []).join('\n');

// Bug 4: embeddingDim must be explicit
if (typeof cfg.embeddingDim !== 'number' || cfg.embeddingDim < 1 || cfg.embeddingDim > 1024) {
  errors.push('embeddingDim must be present and in [1,1024]. Prefer config over env to avoid mismatch with lms_state.json.');
}

// Bug 5: forgetting must be explicit; valid range [0.9,1] documented (0.5 floor was too permissive, degenerate bandit)
if (typeof cfg.forgetting !== 'number') {
  errors.push('forgetting must be present (e.g. 0.96). Values outside [0.9,1] corrupt bandit decay.');
} else if (cfg.forgetting < 0.9 || cfg.forgetting > 1) {
  errors.push('forgetting must be in [0.9,1]; got ' + cfg.forgetting + '. Values outside range corrupt decay.');
}
if (!notes.includes('0.9') && !notes.includes('[0.9') && !notes.includes('0.9,')) {
  errors.push('_engine_notes must document forgetting valid range [0.9,1].');
}

// Bug 7: maxStudents/maxLessons must be explicit; document that no enforcement exists
if (typeof cfg.maxStudents !== 'number' || cfg.maxStudents < 1) {
  errors.push('maxStudents must be present and >= 1. Budget assumes this limit; exceeding silently exceeds memory.');
}
if (typeof cfg.maxLessons !== 'number' || cfg.maxLessons < 1) {
  errors.push('maxLessons must be present and >= 1. Budget assumes this limit; exceeding silently exceeds memory.');
}
if (!notes.includes('Runtime') && !notes.includes('runtime') && !notes.includes('enforced') && !notes.includes('enforcement')) {
  errors.push('_engine_notes must document maxStudents/maxLessons enforcement (or lack thereof).');
}

// Bug 6: Template must use a placeholder so deployers replace it (duplicate hubIds corrupt sync)
if (typeof cfg.hubId !== 'string' || cfg.hubId.trim().length === 0) {
  errors.push('hubId must be present and non-empty.');
} else if (!/CHANGE_ME|REPLACE|__REPLACE__|<REPLACE>/i.test(cfg.hubId)) {
  errors.push('hubId must contain a placeholder (e.g. CHANGE_ME) so deployers replace it. Hardcoded values (e.g. village-pi-01) cause collisions when config is copied to a second Pi.');
}

// Bug 3: Node version must be documented
if (!cfg.nodeVersionRequired) {
  errors.push('nodeVersionRequired must be present (e.g. ">=18"). Bullseye ships Node 12; deployers need this documented.');
}
if (!cfg.nodeVersionNote) {
  errors.push('nodeVersionNote must warn about Bullseye Node 12 and silent failures.');
}

// Bug 1: Memory arithmetic — key values must appear
const raschBytes = 60 * 16;
const embStudentsBytes = 60 * 8 * 8;
const embLessonsBytes = 200 * 8 * 8;
const banditABytes = 16 * 16 * 8;
if (!notes.includes('960 B') && !notes.includes('960B')) {
  errors.push(`_engine_notes must show Rasch students: 60 × 16 B = 960 B (got ${raschBytes} bytes).`);
}
if (!notes.includes('3.8 KB') && !notes.includes('3.75')) {
  errors.push(`_engine_notes must show Embeddings (students) ≈ 3.8 KB (60×8×8 = ${embStudentsBytes} B).`);
}
if (!notes.includes('13 KB') && !notes.includes('12.5')) {
  errors.push(`_engine_notes must show Embeddings (lessons) ≈ 13 KB (200×8×8 = ${embLessonsBytes} B).`);
}
if (!notes.includes('2.0 KB') && !notes.includes('2 KB')) {
  errors.push(`_engine_notes must show Bandit A ≈ 2 KB (16×16×8 = ${banditABytes} B).`);
}
if (!notes.includes('ability+variance') && !notes.includes('RaschStudentState')) {
  errors.push('_engine_notes must clarify Rasch 16 B = ability+variance (2×float64).');
}
if (!notes.includes('featureDim') && !notes.includes('embeddingDim×2')) {
  errors.push('_engine_notes must note featureDim=embeddingDim×2 invariant for Bandit A.');
}

// Bug 8: Path assumptions — existence, fallback, permissions, failure mode
const pathNotes = (cfg._path_notes || []).join('\n');
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
