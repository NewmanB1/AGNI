// packages/agni-utils/runtimeManifest.js
// Maps high-level runtime capabilities to concrete file names and load order.
// Feature inference uses this to build the factory manifest; adding or
// renaming runtime modules is done here instead of inside featureInference.
// Backlog task 12 — ARCH §5.3.

'use strict';

const path = require('path');

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

function resolveFactoryPath(runtimeDir, filename) {
  const rel = FACTORY_PATH_MAP[filename];
  return path.join(runtimeDir, rel || filename);
}

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

function getFileForFactoryId(id) {
  return FACTORY_FILE_MAP[id];
}

function getOrderedFactoryFiles(capabilities) {
  const files = [
    'a11y.js',
    'narration.js',
    'gate-renderer.js',
    'integrity.js',
    'checkpoint.js',
    'frustration.js',
    'completion.js'
  ];
  if (capabilities.includeSensorBridge) files.push('sensor-bridge.js');
  files.push('svg-stage.js');
  files.push('svg-helpers.js');
  files.push('svg-factories.js');
  if (capabilities.hasDynamic)  files.push('svg-factories-dynamic.js');
  if (capabilities.hasGeometry) files.push('svg-factories-geometry.js');
  files.push('svg-registry.js');
  if (capabilities.includeTableRenderer) files.push('table-renderer.js');
  return files;
}

module.exports = {
  FACTORY_LOAD_ORDER:      FACTORY_LOAD_ORDER,
  FACTORY_FILE_MAP:        FACTORY_FILE_MAP,
  FACTORY_PATH_MAP:        FACTORY_PATH_MAP,
  resolveFactoryPath:      resolveFactoryPath,
  getFileForFactoryId:     getFileForFactoryId,
  getOrderedFactoryFiles:  getOrderedFactoryFiles
};
