#!/usr/bin/env node
'use strict';

/**
 * Regression guards for hub-config.pi.json (audit bugs 1–4).
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
