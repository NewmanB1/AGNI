// src/utils/runtimeManifest.js
// Maps high-level runtime capabilities to concrete file names and load order.
// Feature inference uses this to build the factory manifest; adding or
// renaming runtime modules is done here instead of inside featureInference.
// Backlog task 12 — ARCH §5.3.

'use strict';

// ── Canonical load order (after shared-runtime.js, which html/hub prepend) ─────
// binary-utils.js is prepended by html.js before shared-runtime; not listed here.
const FACTORY_LOAD_ORDER = [
  'a11y.js',
  'gate-renderer.js',
  'integrity.js',
  'checkpoint.js',
  'frustration.js',
  'completion.js',
  'sensor-bridge.js',
  'svg-stage.js',
  'svg-factories.js',
  'svg-factories-dynamic.js',
  'svg-factories-geometry.js',
  'svg-registry.js',
  'table-renderer.js'
];

// ── Registry ID → file membership ────────────────────────────────────────────
const FACTORY_FILE_MAP = {
  'venn':          'svg-factories.js',
  'axis':          'svg-factories.js',
  'numberLine':    'svg-factories.js',
  'balanceScale':  'svg-factories.js',
  'barGraph':      'svg-factories.js',
  'clockFace':     'svg-factories.js',
  'flowMap':       'svg-factories.js',
  'pieChart':      'svg-factories.js',
  'polygon':       'svg-factories.js',
  'tree':          'svg-factories.js',
  'numberLineDynamic': 'svg-factories-dynamic.js',
  'clockFaceDynamic':  'svg-factories-dynamic.js',
  'timeGraph':         'svg-factories-dynamic.js',
  'arrowMap':          'svg-factories-dynamic.js',
  'compose':           'svg-factories-dynamic.js',
  'polygonDynamic':  'svg-factories-geometry.js',
  'cartesianGrid':   'svg-factories-geometry.js',
  'unitCircle':      'svg-factories-geometry.js'
};

/**
 * Get the runtime file that implements a factory registry id.
 * @param {string} id  Registry id (e.g. 'barGraph', 'numberLineDynamic').
 * @returns {string|undefined}
 */
function getFileForFactoryId(id) {
  return FACTORY_FILE_MAP[id];
}

/**
 * Build ordered list of factory filenames from capabilities.
 * Caller (featureInference) supplies only capability flags; this module
 * owns the mapping to filenames and order.
 *
 * @param {{
 *   specIds: string[],
 *   hasDynamic: boolean,
 *   hasGeometry: boolean,
 *   includeTableRenderer: boolean,
 *   includeSensorBridge: boolean
 * }} capabilities
 * @returns {string[]}
 */
function getOrderedFactoryFiles(capabilities) {
  const files = [
    'a11y.js',
    'gate-renderer.js',
    'integrity.js',
    'checkpoint.js',
    'frustration.js',
    'completion.js'
  ];
  if (capabilities.includeSensorBridge) files.push('sensor-bridge.js');
  files.push('svg-stage.js');
  files.push('svg-factories.js');
  if (capabilities.hasDynamic)  files.push('svg-factories-dynamic.js');
  if (capabilities.hasGeometry) files.push('svg-factories-geometry.js');
  files.push('svg-registry.js');
  if (capabilities.includeTableRenderer) files.push('table-renderer.js');
  return files;
}

module.exports = {
  FACTORY_LOAD_ORDER:   FACTORY_LOAD_ORDER,
  FACTORY_FILE_MAP:     FACTORY_FILE_MAP,
  getFileForFactoryId:  getFileForFactoryId,
  getOrderedFactoryFiles: getOrderedFactoryFiles
};
