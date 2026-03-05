// packages/agni-utils/runtimeManifest.js
// Maps runtime capabilities to factory filenames and load order.
// Used by feature-inference, html builder, and hub-transform. Adding or
// renaming runtime modules is done here instead of inside feature-inference.

'use strict';

const path = require('path');

// Bare filename → relative path under runtime root. Used by resolveFactoryPath.
// Includes all runtime files; some (player, factory-loader, etc.) are loaded
// by html builder or shared-runtime, not via getOrderedFactoryFiles.
const FACTORY_PATH_MAP = {
  'a11y.js':                    'ui/a11y.js',
  'narration.js':               'ui/narration.js',
  'player.js':                  'ui/player.js',
  'factory-loader.js':          'ui/factory-loader.js',
  'export.js':                  'ui/export.js',
  'i18n.js':                    'ui/i18n.js',
  'frustration.js':             'ui/frustration.js',
  'gate-renderer.js':           'rendering/gate-renderer.js',
  'math-renderer.js':           'rendering/math-renderer.js',
  'svg-stage.js':               'rendering/svg-stage.js',
  'svg-helpers.js':             'rendering/svg-helpers.js',
  'svg-factories.js':           'rendering/svg-factories.js',
  'svg-factories-dynamic.js':   'rendering/svg-factories-dynamic.js',
  'svg-factories-geometry.js':  'rendering/svg-factories-geometry.js',
  'svg-registry.js':            'rendering/svg-registry.js',
  'table-renderer.js':          'rendering/table-renderer.js',
  'sensor-bridge.js':           'sensors/sensor-bridge.js',
  'threshold-evaluator.js':     'sensors/threshold-evaluator.js',
  'integrity.js':               'integrity/integrity.js',
  'binary-utils.js':            'integrity/binary-utils.js',
  'checkpoint.js':              'telemetry/checkpoint.js',
  'completion.js':              'telemetry/completion.js',
  'telemetry.js':               'telemetry/telemetry.js',
  'navigator.js':               'engine/navigator.js'
};

/**
 * Resolve a factory filename to a full path under the runtime root.
 * @param {string} runtimeDir - Root directory of the runtime package
 * @param {string} filename - Bare filename (e.g. 'sensor-bridge.js')
 * @returns {string} Full path; if filename is not in FACTORY_PATH_MAP, falls back to path.join(runtimeDir, filename)
 */
function resolveFactoryPath(runtimeDir, filename) {
  const rel = FACTORY_PATH_MAP[filename];
  return rel ? path.join(runtimeDir, rel) : path.join(runtimeDir, filename);
}

// Canonical order for on-demand factory files. getOrderedFactoryFiles filters
// this by capabilities (optional files included only when flag is true).
const FACTORY_LOAD_ORDER = [
  'a11y.js',
  'narration.js',
  'gate-renderer.js',
  'integrity.js',
  'checkpoint.js',
  'frustration.js',
  'completion.js',
  'sensor-bridge.js',
  'svg-stage.js',
  'svg-helpers.js',
  'svg-factories.js',
  'svg-factories-dynamic.js',
  'svg-factories-geometry.js',
  'svg-registry.js',
  'table-renderer.js'
];

// Visual factory ID (e.g. 'barGraph') → filename. Used by getFileForFactoryId.
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
  'gauge':             'svg-factories-dynamic.js',
  'compose':           'svg-factories-dynamic.js',
  'polygonDynamic':  'svg-factories-geometry.js',
  'cartesianGrid':   'svg-factories-geometry.js',
  'unitCircle':      'svg-factories-geometry.js'
};

/**
 * @param {string} id - Factory ID (e.g. 'barGraph', 'timeGraph')
 * @returns {string|undefined} Filename or undefined if unknown
 */
function getFileForFactoryId(id) {
  return FACTORY_FILE_MAP[id];
}

// Optional files: included only when the corresponding capability flag is true
const OPTIONAL_FILE_FLAGS = {
  'sensor-bridge.js': 'includeSensorBridge',
  'svg-factories-dynamic.js': 'hasDynamic',
  'svg-factories-geometry.js': 'hasGeometry',
  'table-renderer.js': 'includeTableRenderer'
};

/**
 * @param {{ includeSensorBridge?: boolean, hasDynamic?: boolean, hasGeometry?: boolean, includeTableRenderer?: boolean }} capabilities
 * @returns {string[]} Ordered list of factory filenames
 */
function getOrderedFactoryFiles(capabilities) {
  return FACTORY_LOAD_ORDER.filter(function (file) {
    const flag = OPTIONAL_FILE_FLAGS[file];
    if (!flag) return true;
    return !!capabilities[flag];
  });
}

module.exports = {
  FACTORY_LOAD_ORDER:      FACTORY_LOAD_ORDER,
  FACTORY_FILE_MAP:        FACTORY_FILE_MAP,
  FACTORY_PATH_MAP:        FACTORY_PATH_MAP,
  resolveFactoryPath:      resolveFactoryPath,
  getFileForFactoryId:     getFileForFactoryId,
  getOrderedFactoryFiles:  getOrderedFactoryFiles
};
