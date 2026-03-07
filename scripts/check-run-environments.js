#!/usr/bin/env node
'use strict';

/**
 * Verifies that source files self-document their run environment.
 * Ensures hardware constraints (Edge = Marshmallow/ES5, Hub = Pi) are documented.
 *
 * See docs/RUN-ENVIRONMENTS.md for the full mapping.
 * Exit 0 pass, 1 fail.
 */

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');

// Files that must document edge-device target (Android Marshmallow, ES5)
var EDGE_FILES = [
  'packages/agni-runtime/shared-runtime.js',
  'packages/agni-runtime/ui/player.js',
  'packages/agni-runtime/ui/factory-loader.js',
  'packages/agni-runtime/sensors/sensor-bridge.js',
  'packages/agni-hub/sw.js',
  'packages/agni-hub/pwa/shell-boot.js',
  'packages/agni-hub/pwa/precache.js',
  'packages/agni-hub/pwa/shared.js'
];

// Substrings that indicate edge-device documentation (any one suffices)
var EDGE_MARKERS = ['ES5', 'Chrome 44', 'Android 6', 'Marshmallow', 'edge device', 'WebView'];

// Files that must document Village Hub / Pi target
var HUB_FILES = [
  'packages/agni-hub/theta.js',
  'packages/agni-hub/hub-transform.js',
  'packages/agni-engine/math.js',
  'packages/agni-engine/index.js'
];

var HUB_MARKERS = ['Node', 'Raspberry', 'Pi', 'Village Hub', 'hub', 'CommonJS'];

function readFirstLines(filePath, n) {
  try {
    var content = fs.readFileSync(filePath, 'utf8');
    return content.split('\n').slice(0, n).join('\n');
  } catch (e) {
    return '';
  }
}

function hasMarker(text, markers) {
  var lower = text.toLowerCase();
  for (var i = 0; i < markers.length; i++) {
    if (lower.indexOf(markers[i].toLowerCase()) !== -1) return true;
  }
  return false;
}

var errors = [];

EDGE_FILES.forEach(function (rel) {
  var full = path.join(ROOT, rel.replace(/\//g, path.sep));
  if (!fs.existsSync(full)) return;
  var head = readFirstLines(full, 25);
  if (!hasMarker(head, EDGE_MARKERS)) {
    errors.push(rel + ': missing edge-device documentation (ES5, Chrome 44, Marshmallow) in header');
  }
});

HUB_FILES.forEach(function (rel) {
  var full = path.join(ROOT, rel.replace(/\//g, path.sep));
  if (!fs.existsSync(full)) return;
  var head = readFirstLines(full, 25);
  if (!hasMarker(head, HUB_MARKERS)) {
    errors.push(rel + ': missing hub documentation (Node, Pi, Village Hub) in header');
  }
});

if (!fs.existsSync(path.join(ROOT, 'docs', 'RUN-ENVIRONMENTS.md'))) {
  errors.push('docs/RUN-ENVIRONMENTS.md missing');
}

if (errors.length > 0) {
  console.error('check-run-environments: FAIL\n');
  errors.forEach(function (e) { console.error('  ' + e); });
  process.exit(1);
}

console.log('check-run-environments: OK');
process.exit(0);
