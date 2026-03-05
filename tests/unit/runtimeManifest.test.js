'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const {
  FACTORY_LOAD_ORDER, FACTORY_FILE_MAP,
  resolveFactoryPath, getFileForFactoryId, getOrderedFactoryFiles
} = require('@agni/utils/runtimeManifest');

// ── Constants ────────────────────────────────────────────────────────────────

describe('FACTORY_LOAD_ORDER', () => {
  it('is an array of strings', () => {
    assert.ok(Array.isArray(FACTORY_LOAD_ORDER));
    FACTORY_LOAD_ORDER.forEach(f => assert.equal(typeof f, 'string'));
  });

  it('starts with a11y.js (core modules load before factories)', () => {
    assert.equal(FACTORY_LOAD_ORDER[0], 'a11y.js');
  });

  it('includes svg-stage.js before factory files', () => {
    const stageIdx = FACTORY_LOAD_ORDER.indexOf('svg-stage.js');
    const factoriesIdx = FACTORY_LOAD_ORDER.indexOf('svg-factories.js');
    assert.ok(stageIdx >= 0, 'svg-stage.js must be in load order');
    assert.ok(stageIdx < factoriesIdx, 'svg-stage.js must precede svg-factories.js');
  });
});

// ── resolveFactoryPath ───────────────────────────────────────────────────────

describe('resolveFactoryPath', () => {
  it('resolves known file to path under runtime root', () => {
    const result = resolveFactoryPath('/tmp/runtime', 'sensor-bridge.js');
    assert.ok(result.endsWith('sensors' + path.sep + 'sensor-bridge.js'));
  });

  it('falls back to path.join for unknown filename', () => {
    const result = resolveFactoryPath('/tmp/runtime', 'unknown.js');
    assert.equal(result, path.join('/tmp/runtime', 'unknown.js'));
  });
});

describe('FACTORY_FILE_MAP', () => {
  it('maps known factory IDs to file names', () => {
    assert.equal(FACTORY_FILE_MAP['barGraph'], 'svg-factories.js');
    assert.equal(FACTORY_FILE_MAP['numberLineDynamic'], 'svg-factories-dynamic.js');
    assert.equal(FACTORY_FILE_MAP['unitCircle'], 'svg-factories-geometry.js');
  });
});

// ── getFileForFactoryId ──────────────────────────────────────────────────────

describe('getFileForFactoryId', () => {
  it('returns the file for a known static factory', () => {
    assert.equal(getFileForFactoryId('barGraph'), 'svg-factories.js');
    assert.equal(getFileForFactoryId('venn'), 'svg-factories.js');
    assert.equal(getFileForFactoryId('pieChart'), 'svg-factories.js');
  });

  it('returns the file for a known dynamic factory', () => {
    assert.equal(getFileForFactoryId('timeGraph'), 'svg-factories-dynamic.js');
    assert.equal(getFileForFactoryId('arrowMap'), 'svg-factories-dynamic.js');
  });

  it('returns the file for geometry factories', () => {
    assert.equal(getFileForFactoryId('polygonDynamic'), 'svg-factories-geometry.js');
    assert.equal(getFileForFactoryId('cartesianGrid'), 'svg-factories-geometry.js');
  });

  it('returns undefined for unknown factory', () => {
    assert.equal(getFileForFactoryId('nonExistentFactory'), undefined);
  });
});

// ── getOrderedFactoryFiles ───────────────────────────────────────────────────

describe('getOrderedFactoryFiles', () => {
  it('always includes svg-stage.js, svg-factories.js, svg-registry.js', () => {
    const files = getOrderedFactoryFiles({ hasDynamic: false, hasGeometry: false, includeTableRenderer: false, includeSensorBridge: false });
    assert.ok(files.includes('svg-stage.js'));
    assert.ok(files.includes('svg-factories.js'));
    assert.ok(files.includes('svg-registry.js'));
  });

  it('includes sensor-bridge.js when requested (after core modules)', () => {
    const files = getOrderedFactoryFiles({ hasDynamic: false, hasGeometry: false, includeTableRenderer: false, includeSensorBridge: true });
    assert.ok(files.includes('sensor-bridge.js'));
    const coreIdx = files.indexOf('completion.js');
    const sensorIdx = files.indexOf('sensor-bridge.js');
    assert.ok(sensorIdx > coreIdx, 'sensor-bridge should come after core modules');
  });

  it('excludes sensor-bridge.js when not requested', () => {
    const files = getOrderedFactoryFiles({ hasDynamic: false, hasGeometry: false, includeTableRenderer: false, includeSensorBridge: false });
    assert.ok(!files.includes('sensor-bridge.js'));
  });

  it('includes dynamic factories when hasDynamic is true', () => {
    const files = getOrderedFactoryFiles({ hasDynamic: true, hasGeometry: false, includeTableRenderer: false, includeSensorBridge: false });
    assert.ok(files.includes('svg-factories-dynamic.js'));
  });

  it('includes geometry factories when hasGeometry is true', () => {
    const files = getOrderedFactoryFiles({ hasDynamic: false, hasGeometry: true, includeTableRenderer: false, includeSensorBridge: false });
    assert.ok(files.includes('svg-factories-geometry.js'));
  });

  it('includes table-renderer when requested', () => {
    const files = getOrderedFactoryFiles({ hasDynamic: false, hasGeometry: false, includeTableRenderer: true, includeSensorBridge: false });
    assert.ok(files.includes('table-renderer.js'));
  });

  it('excludes optional files when not requested', () => {
    const files = getOrderedFactoryFiles({ hasDynamic: false, hasGeometry: false, includeTableRenderer: false, includeSensorBridge: false });
    assert.ok(!files.includes('svg-factories-dynamic.js'));
    assert.ok(!files.includes('svg-factories-geometry.js'));
    assert.ok(!files.includes('table-renderer.js'));
  });

  it('maintains correct order: stage before factories', () => {
    const files = getOrderedFactoryFiles({ hasDynamic: true, hasGeometry: true, includeTableRenderer: true, includeSensorBridge: true });
    const stageIdx = files.indexOf('svg-stage.js');
    const staticIdx = files.indexOf('svg-factories.js');
    const dynamicIdx = files.indexOf('svg-factories-dynamic.js');
    const geoIdx = files.indexOf('svg-factories-geometry.js');
    const registryIdx = files.indexOf('svg-registry.js');
    assert.ok(stageIdx < staticIdx);
    assert.ok(staticIdx < dynamicIdx);
    assert.ok(dynamicIdx < geoIdx);
    assert.ok(geoIdx < registryIdx);
  });
});
