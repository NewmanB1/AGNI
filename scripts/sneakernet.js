#!/usr/bin/env node
// scripts/sneakernet.js — Export/import progress for sneakernet (Backlog task 17).
//
// Export: serializes the LMS bandit summary to gzip+base64 for QR or file transfer.
// Import: reads gzip+base64, parses, and merges into local LMS state.
//
// Usage:
//   node scripts/sneakernet.js export [--out progress.txt]
//   node scripts/sneakernet.js import [--in progress.txt]
//   node scripts/sneakernet.js import   # read base64 from stdin
//
// For QR codes: use the export string as-is or re-encode to Base45 externally.

'use strict';

var fs   = require('fs');
var zlib = require('zlib');
var path = require('path');

var lms = require('@agni/services/lms');
if (!lms.isAvailable()) {
  console.error('LMS engine not available (required for export/import).');
  process.exit(1);
}

function exportProgress() {
  var summary = lms.exportBanditSummary();
  if (!summary) {
    console.error('No bandit summary to export.');
    process.exit(1);
  }
  var json = JSON.stringify(summary);
  var gzip = zlib.gzipSync(Buffer.from(json, 'utf8'));
  var b64  = gzip.toString('base64');
  return b64;
}

function importProgress(b64) {
  var raw = Buffer.from(b64, 'base64');
  var json;
  try {
    json = zlib.gunzipSync(raw).toString('utf8');
  } catch (e) {
    console.error('Invalid payload (not gzip+base64?):', e.message);
    process.exit(1);
  }
  var summary;
  try {
    summary = JSON.parse(json);
  } catch (e) {
    console.error('Invalid JSON in payload:', e.message);
    process.exit(1);
  }
  if (typeof summary.embeddingDim !== 'number' || !summary.mean || !summary.precision || typeof summary.sampleSize !== 'number') {
    console.error('Payload is not a valid bandit summary (missing embeddingDim/mean/precision/sampleSize). Federating hubs must use identical AGNI_EMBEDDING_DIM.');
    process.exit(1);
  }
  lms.mergeRemoteSummary(summary);
  console.log('Merged remote summary; sampleSize:', summary.sampleSize);
}

function main() {
  var args = process.argv.slice(2);
  var cmd  = args[0];

  if (cmd === 'export') {
    var outIdx = args.indexOf('--out');
    var outFile = outIdx >= 0 ? args[outIdx + 1] : null;
    var b64 = exportProgress();
    if (outFile) {
      fs.writeFileSync(outFile, b64, 'utf8');
      console.log('Exported to', outFile);
    } else {
      console.log(b64);
    }
    return;
  }

  if (cmd === 'import') {
    var inIdx = args.indexOf('--in');
    var inFile = inIdx >= 0 ? args[inIdx + 1] : null;
    var b64;
    if (inFile) {
      b64 = fs.readFileSync(inFile, 'utf8').trim();
    } else {
      b64 = '';
      if (process.stdin.isTTY) {
        console.error('Paste base64 payload and press Ctrl+D (or use --in <file>)');
      }
      b64 = fs.readFileSync(0, 'utf8').trim();
    }
    if (!b64) {
      console.error('No payload to import.');
      process.exit(1);
    }
    importProgress(b64);
    return;
  }

  console.log('Usage: node scripts/sneakernet.js export [--out file]');
  console.log('       node scripts/sneakernet.js import [--in file]');
  process.exit(1);
}

main();
