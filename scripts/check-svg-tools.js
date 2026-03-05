#!/usr/bin/env node
'use strict';

/**
 * CI gate: verify SVG tools improvements from docs/SVG-TOOLS-IMPROVEMENT-PLAN.md.
 * Proof of completion for regression guards.
 *
 * Checks:
 *   P1.1  svg-helpers.js in load order (before svg-factories)
 *   P1.2  No Object.assign in runtime (ES5 compatibility)
 *   P1.3  Bar graph horizontal mode implemented
 *   P1.4  Pie donut hole drawn once
 *   P3.1  rootSvg ARIA support (ariaLabel, title)
 *   P3.2  Axis fn as serializable string
 *   P4.1  shell-boot uses svg_spec before legacy
 *   Gauge in FACTORY_FILE_MAP
 *
 * Exit 0 on pass, exit 1 on any failure.
 */

var fs = require('fs');
var path = require('path');

var root = path.resolve(__dirname, '..');
var runtimeRoot = path.join(root, 'packages', 'agni-runtime');
var failed = false;

function fail(msg) {
  console.error('FAIL  ' + msg);
  failed = true;
}

function pass(msg) {
  console.log('OK    ' + msg);
}

// ── P1.1: svg-helpers in load order ─────────────────────────────────────────

var manifest = require(path.join(root, 'packages', 'agni-utils', 'runtimeManifest.js'));
if (manifest.FACTORY_PATH_MAP && manifest.FACTORY_PATH_MAP['svg-helpers.js']) {
  pass('P1.1 svg-helpers.js in FACTORY_PATH_MAP');
} else {
  fail('P1.1 svg-helpers.js must be in FACTORY_PATH_MAP');
}

var ordered = manifest.getOrderedFactoryFiles({ specIds: ['barGraph'], hasDynamic: false, hasGeometry: false, includeTableRenderer: false, includeSensorBridge: true });
var stageIdx = ordered.indexOf('svg-stage.js');
var helpersIdx = ordered.indexOf('svg-helpers.js');
var factoriesIdx = ordered.indexOf('svg-factories.js');
if (helpersIdx >= 0 && stageIdx < helpersIdx && helpersIdx < factoriesIdx) {
  pass('P1.1 svg-helpers loads before svg-factories');
} else {
  fail('P1.1 svg-helpers must load after svg-stage and before svg-factories');
}

// ── P1.2: No Object.assign in runtime ───────────────────────────────────────

var runtimeFiles = [
  'rendering/svg-helpers.js',
  'rendering/svg-factories.js',
  'rendering/svg-factories-dynamic.js',
  'rendering/svg-factories-geometry.js'
];
runtimeFiles.forEach(function (rel) {
  var p = path.join(runtimeRoot, rel);
  if (!fs.existsSync(p)) {
    fail('P1.2 ' + rel + ' not found');
    return;
  }
  var src = fs.readFileSync(p, 'utf8');
  // Exclude comments: strip single-line // and multi-line /* */
  var code = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  if (code.indexOf('Object.assign') !== -1) {
    fail('P1.2 ' + rel + ' must not use Object.assign (ES5 compat)');
  } else {
    pass('P1.2 ' + rel + ' has no Object.assign');
  }
});

if (!fs.readFileSync(path.join(runtimeRoot, 'rendering/svg-helpers.js'), 'utf8').includes('function assign(')) {
  fail('P1.2 svg-helpers must define assign()');
} else {
  pass('P1.2 svg-helpers defines assign()');
}

// ── P1.3: Bar graph horizontal mode ─────────────────────────────────────────

var barSrc = fs.readFileSync(path.join(runtimeRoot, 'rendering/svg-factories.js'), 'utf8');
if (barSrc.indexOf('horizontal') !== -1 && (barSrc.indexOf('opts.horizontal') !== -1 || barSrc.indexOf('horizontal:') !== -1)) {
  pass('P1.3 barGraph implements horizontal mode');
} else {
  fail('P1.3 barGraph must honour opts.horizontal');
}

// ── P1.4: Pie donut hole drawn once ─────────────────────────────────────────

if (barSrc.indexOf('Donut hole') !== -1 || barSrc.indexOf('donut hole') !== -1) {
  if (barSrc.indexOf('draw once') !== -1 || barSrc.indexOf('after all slices') !== -1) {
    pass('P1.4 pieChart donut hole drawn once after slices');
  } else {
    fail('P1.4 pieChart donut hole must be drawn once after slices');
  }
} else {
  fail('P1.4 pieChart must have donut hole logic');
}

// ── P3.1: rootSvg ARIA ─────────────────────────────────────────────────────

var helpersSrc = fs.readFileSync(path.join(runtimeRoot, 'rendering/svg-helpers.js'), 'utf8');
if (helpersSrc.indexOf('ariaLabel') !== -1 && helpersSrc.indexOf('aria-label') !== -1 && helpersSrc.indexOf('role') !== -1) {
  pass('P3.1 rootSvg supports ariaLabel');
} else {
  fail('P3.1 rootSvg must support opts.ariaLabel (aria-label, role)');
}

if (helpersSrc.indexOf("el('title'") !== -1 || helpersSrc.indexOf('el("title"') !== -1) {
  pass('P3.1 rootSvg adds title element for a11y');
} else {
  fail('P3.1 rootSvg must add <title> for screen readers');
}

// ── P3.2: Axis fn as string ─────────────────────────────────────────────────

if (barSrc.indexOf('typeof opts.fn === \'string\'') !== -1 || barSrc.indexOf('typeof opts.fn === "string"') !== -1) {
  pass('P3.2 axis accepts fn as string');
} else {
  fail('P3.2 axis must accept opts.fn as serializable string');
}

// ── P4.1: shell-boot svg_spec ───────────────────────────────────────────────

var shellSrc = fs.readFileSync(path.join(root, 'server', 'pwa', 'shell-boot.js'), 'utf8');
if (shellSrc.indexOf('step.svg_spec') !== -1 && shellSrc.indexOf('AGNI_SVG.fromSpec') !== -1) {
  pass('P4.1 shell-boot uses svg_spec and fromSpec');
} else {
  fail('P4.1 shell-boot must check step.svg_spec and use AGNI_SVG.fromSpec');
}

// ── Gauge in FACTORY_FILE_MAP ───────────────────────────────────────────────

var fileForGauge = manifest.getFileForFactoryId ? manifest.getFileForFactoryId('gauge') : null;
if (fileForGauge === 'svg-factories-dynamic.js') {
  pass('gauge in FACTORY_FILE_MAP');
} else {
  fail('gauge must map to svg-factories-dynamic.js in FACTORY_FILE_MAP');
}

// ── Exit ───────────────────────────────────────────────────────────────────

if (failed) {
  console.error('\nSVG tools verification failed. See docs/SVG-TOOLS-IMPROVEMENT-PLAN.md');
  process.exit(1);
}
console.log('\nSVG tools verification passed.');
process.exit(0);
