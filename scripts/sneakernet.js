#!/usr/bin/env node
// scripts/sneakernet.js — Export/import progress for sneakernet (Backlog task 17).
//
// Export: serializes the LMS bandit summary to gzip+base64. When AGNI_PRIVATE_KEY_PATH
// is set, produces a signed packet (JSON envelope with signature). Otherwise legacy format.
//
// Import: accepts signed packets (verify before merge) or legacy base64. Use --allow-unsigned
// to import legacy packets (not recommended).
//
// Usage:
//   node scripts/sneakernet.js export [--out progress.txt]
//   node scripts/sneakernet.js import [--in progress.txt] [--allow-unsigned]
//   node scripts/sneakernet.js import   # read from stdin
//
// For QR codes: use the export string as-is or re-encode to Base45 externally.

'use strict';

var fs   = require('fs');
var zlib = require('zlib');

var lms = require('@agni/services/lms');
var envConfig = require('@agni/utils/env-config');
var crypto = require('@agni/utils/crypto');

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
  var payload = gzip.toString('base64');

  var privateKeyPath = envConfig.privateKeyPath || '';
  if (privateKeyPath && fs.existsSync(privateKeyPath)) {
    var signature = crypto.signManifestPayload(payload, privateKeyPath);
    var publicKey = crypto.getPublicKeySpki(privateKeyPath);
    if (signature && publicKey) {
      var envelope = {
        v: 1,
        payload: payload,
        signature: signature,
        publicKey: publicKey,
        hubId: summary.hubId || envConfig.hubId || 'hub-local'
      };
      return JSON.stringify(envelope);
    }
  } else {
    console.warn('AGNI_PRIVATE_KEY_PATH not set — exporting unsigned packet. Use --allow-unsigned on import.');
  }
  return payload;
}

function parsePayload(payload) {
  var raw = Buffer.from(payload, 'base64');
  var json;
  try {
    json = zlib.gunzipSync(raw).toString('utf8');
  } catch (e) {
    return { error: 'Invalid payload (not gzip+base64?): ' + e.message };
  }
  try {
    return { summary: JSON.parse(json) };
  } catch (e) {
    return { error: 'Invalid JSON in payload: ' + e.message };
  }
}

function validateSummary(summary) {
  if (typeof summary.embeddingDim !== 'number' || !summary.mean || !summary.precision || typeof summary.sampleSize !== 'number') {
    return 'Payload is not a valid bandit summary (missing embeddingDim/mean/precision/sampleSize). Federating hubs must use identical AGNI_EMBEDDING_DIM.';
  }
  return null;
}

function importProgress(input, allowUnsigned) {
  var payload;
  var summary;

  try {
    var parsed = JSON.parse(input);
    if (parsed.v === 1 && parsed.payload && parsed.signature && parsed.publicKey) {
      if (!crypto.verifyPayload(parsed.payload, parsed.signature, parsed.publicKey)) {
        console.error('Signature verification failed — packet may be tampered.');
        process.exit(1);
      }
      var result = parsePayload(parsed.payload);
      if (result.error) {
        console.error(result.error);
        process.exit(1);
      }
      summary = result.summary;
    } else {
      throw new Error('not a signed envelope');
    }
  } catch (e) {
    if (e instanceof SyntaxError || e.message === 'not a signed envelope') {
      if (!allowUnsigned) {
        console.error('Unsigned packet. Use --allow-unsigned to import (not recommended for untrusted sources).');
        process.exit(1);
      }
      var result = parsePayload(input.trim());
      if (result.error) {
        console.error(result.error);
        process.exit(1);
      }
      summary = result.summary;
      console.warn('Imported unsigned packet — no integrity guarantee.');
    } else {
      throw e;
    }
  }

  var err = validateSummary(summary);
  if (err) {
    console.error(err);
    process.exit(1);
  }
  return lms.mergeRemoteSummary(summary).then(function () { return summary; });
}

function main() {
  var args = process.argv.slice(2);
  var cmd  = args[0];

  if (cmd === 'export') {
    var outIdx = args.indexOf('--out');
    var outFile = outIdx >= 0 ? args[outIdx + 1] : null;
    var out = exportProgress();
    if (outFile) {
      fs.writeFileSync(outFile, out, 'utf8');
      console.log('Exported to', outFile);
    } else {
      console.log(out);
    }
    return;
  }

  if (cmd === 'import') {
    var inIdx = args.indexOf('--in');
    var inFile = inIdx >= 0 ? args[inIdx + 1] : null;
    var allowUnsigned = args.indexOf('--allow-unsigned') >= 0;
    var input;
    if (inFile) {
      input = fs.readFileSync(inFile, 'utf8').trim();
    } else {
      if (process.stdin.isTTY) {
        console.error('Paste payload and press Ctrl+D (or use --in <file>)');
      }
      input = fs.readFileSync(0, 'utf8').trim();
    }
    if (!input) {
      console.error('No payload to import.');
      process.exit(1);
    }
    importProgress(input, allowUnsigned).then(function (summary) {
      console.log('Merged remote summary; sampleSize:', summary.sampleSize);
    }).catch(function (e) {
      console.error('Merge failed:', e.message);
      process.exit(1);
    });
    return;
  }

  console.log('Usage: node scripts/sneakernet.js export [--out file]');
  console.log('       node scripts/sneakernet.js import [--in file] [--allow-unsigned]');
  process.exit(1);
}

main();
