'use strict';

/**
 * Regression tests for SVG tools improvements (2026-03-04).
 * Proof of completion for docs/SVG-TOOLS-IMPROVEMENT-PLAN.md.
 *
 * Each test validates a specific improvement. If a test fails, the corresponding
 * feature has regressed.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setupGlobals, teardownGlobals, makeElement, dom } = require('../helpers/browser-globals');

const root = path.resolve(__dirname, '../..');
const runtimeRoot = path.join(root, 'packages/agni-runtime');

// ── SVG-TOOLS-P1.1: svg-helpers.js exists and is wired before factories ───────

describe('SVG-TOOLS-P1.1: svg-helpers.js is wired before svg-factories', () => {
  const { getOrderedFactoryFiles } = require('@agni/utils/runtimeManifest');

  it('svg-helpers.js is in FACTORY_PATH_MAP', () => {
    const manifest = require('@agni/utils/runtimeManifest');
    assert.ok(manifest.FACTORY_PATH_MAP['svg-helpers.js'], 'svg-helpers.js must be in FACTORY_PATH_MAP');
  });

  it('getOrderedFactoryFiles includes svg-helpers between svg-stage and svg-factories', () => {
    const files = getOrderedFactoryFiles({
      hasDynamic: false,
      hasGeometry: false,
      includeTableRenderer: false,
      includeSensorBridge: true
    });
    const stageIdx = files.indexOf('svg-stage.js');
    const helpersIdx = files.indexOf('svg-helpers.js');
    const factoriesIdx = files.indexOf('svg-factories.js');
    assert.ok(helpersIdx >= 0, 'svg-helpers.js must be in manifest');
    assert.ok(stageIdx < helpersIdx, 'svg-stage must load before svg-helpers');
    assert.ok(helpersIdx < factoriesIdx, 'svg-helpers must load before svg-factories');
  });

  it('svg-helpers.js file exists in package', () => {
    const p = path.join(runtimeRoot, 'rendering/svg-helpers.js');
    assert.ok(fs.existsSync(p), 'svg-helpers.js must exist at packages/agni-runtime/rendering/');
  });
});

// ── SVG-TOOLS-P1.2: No Object.assign in runtime (ES5 compatibility) ───────────

describe('SVG-TOOLS-P1.2: runtime uses ES5-safe assign, not Object.assign', () => {
  it('svg-helpers.js exports assign and does not use Object.assign', () => {
    const src = fs.readFileSync(path.join(runtimeRoot, 'rendering/svg-helpers.js'), 'utf8');
    assert.ok(src.indexOf('function assign(') !== -1, 'svg-helpers must define assign()');
    assert.ok(src.indexOf('Object.assign') === -1, 'svg-helpers must not use Object.assign');
  });

  it('svg-factories.js does not use Object.assign', () => {
    const src = fs.readFileSync(path.join(runtimeRoot, 'rendering/svg-factories.js'), 'utf8');
    assert.ok(src.indexOf('Object.assign') === -1, 'svg-factories must not use Object.assign');
  });

  it('svg-factories-dynamic.js does not use Object.assign', () => {
    const src = fs.readFileSync(path.join(runtimeRoot, 'rendering/svg-factories-dynamic.js'), 'utf8');
    assert.ok(src.indexOf('Object.assign') === -1, 'svg-factories-dynamic must not use Object.assign');
  });

  it('svg-factories-geometry.js does not use Object.assign', () => {
    const src = fs.readFileSync(path.join(runtimeRoot, 'rendering/svg-factories-geometry.js'), 'utf8');
    assert.ok(src.indexOf('Object.assign') === -1, 'svg-factories-geometry must not use Object.assign');
  });
});

// ── SVG-TOOLS: DOM-dependent tests (shared setup to avoid require cache issues) ─

describe('SVG-TOOLS: DOM-dependent factory and helper tests', () => {
  before(() => {
    setupGlobals();
    require(path.join(runtimeRoot, 'rendering/svg-helpers.js'));
    require(path.join(runtimeRoot, 'rendering/svg-factories.js'));
  });
  after(() => teardownGlobals());

  it('P1.3: horizontal bar graph produces rects with width > height (bars extend right)', () => {
    const container = makeElement('div');
    container.innerHTML = '';
    const SVG = globalThis.AGNI_SVG;
    assert.ok(SVG && SVG.barGraph, 'AGNI_SVG.barGraph must exist');

    SVG.barGraph(container, {
      data: [{ label: 'A', value: 5 }, { label: 'B', value: 8 }],
      horizontal: true,
      w: 400,
      h: 200
    });

    const svg = container._children[0];
    assert.ok(svg, 'barGraph must produce an SVG root');
    const rects = [];
    function findRects(node) {
      if (node._tag === 'rect' && node._attrs && node._attrs.width && node._attrs.height) {
        rects.push({ w: parseFloat(node._attrs.width), h: parseFloat(node._attrs.height) });
      }
      (node._children || []).forEach(findRects);
    }
    findRects(svg);
    assert.ok(rects.length >= 2, 'horizontal bar graph must have bar rects');
    const firstBar = rects.find(r => r.w > 10 && r.h > 10);
    assert.ok(firstBar, 'at least one bar must have significant size');
    assert.ok(firstBar.w > firstBar.h, 'horizontal bars must have width > height');
  });

  it('P1.4: donut chart has exactly one centre circle (hole)', () => {
    const container = makeElement('div');
    container.innerHTML = '';
    const SVG = globalThis.AGNI_SVG;
    SVG.pieChart(container, {
      data: [{ label: 'A', value: 40 }, { label: 'B', value: 60 }],
      donut: true,
      w: 300,
      h: 280
    });

    const svg = container._children[0];
    let centreCircles = 0;
    const cx = 300 * 0.42;
    const cy = 280 * 0.5;
    function countHoles(node) {
      if (node._tag === 'circle' && node._attrs) {
        const r = parseFloat(node._attrs.r || 0);
        const cxc = parseFloat(node._attrs.cx || 0);
        const cyc = parseFloat(node._attrs.cy || 0);
        if (r < 100 && Math.abs(cxc - cx) < 5 && Math.abs(cyc - cy) < 5) {
          centreCircles++;
        }
      }
      (node._children || []).forEach(countHoles);
    }
    countHoles(svg);
    assert.equal(centreCircles, 1, 'donut must have exactly one hole circle (was ' + centreCircles + ')');
  });

  it('P3.2: axis with fn string produces polyline (plotted curve)', () => {
    const container = makeElement('div');
    container.innerHTML = '';
    const SVG = globalThis.AGNI_SVG;
    SVG.axis(container, {
      min: 0,
      max: 10,
      fn: 'Math.sin(x)',
      w: 400,
      h: 280
    });

    const svg = container._children[0];
    let hasPolyline = false;
    function findPolyline(node) {
      if (node._tag === 'polyline' && node._attrs && node._attrs.points) {
        hasPolyline = true;
      }
      (node._children || []).forEach(findPolyline);
    }
    findPolyline(svg);
    assert.ok(hasPolyline, 'axis with fn string must produce a polyline');
  });

  it('P3.1: rootSvg with opts.ariaLabel adds role=img and aria-label', () => {
    const H = globalThis.AGNI_SVG_HELPERS;
    assert.ok(H && H.rootSvg, 'AGNI_SVG_HELPERS.rootSvg must exist');

    const container = makeElement('div');
    container.innerHTML = '';
    const svg = H.rootSvg(container, 400, 300, { ariaLabel: 'Test Chart' });
    assert.equal(svg.getAttribute('aria-label'), 'Test Chart');
    assert.equal(svg.getAttribute('role'), 'img');
  });

  it('P3.1: rootSvg with ariaLabel adds title element', () => {
    const H = globalThis.AGNI_SVG_HELPERS;
    const container = makeElement('div');
    container.innerHTML = '';
    H.rootSvg(container, 400, 300, { ariaLabel: 'My Chart' });
    const svg = container._children[0];
    const titles = (svg._children || []).filter(c => c._tag === 'title');
    assert.ok(titles.length >= 1, 'must have title element for screen readers');
    assert.ok(titles[0].textContent === 'My Chart', 'title must match ariaLabel');
  });
});

// ── SVG-TOOLS-P4.1: shell-boot uses svg_spec when available ───────────────────

describe('SVG-TOOLS-P4.1: shell-boot checks svg_spec before legacy svg_type', () => {
  it('shell-boot.js references step.svg_spec and AGNI_SVG.fromSpec', () => {
    const src = fs.readFileSync(path.join(root, 'packages/agni-hub/pwa/shell-boot.js'), 'utf8');
    assert.ok(src.indexOf('step.svg_spec') !== -1, 'shell-boot must check svg_spec');
    assert.ok(src.indexOf('AGNI_SVG.fromSpec') !== -1, 'shell-boot must use fromSpec when available');
  });
});

// ── SVG-TOOLS: gauge in FACTORY_FILE_MAP ─────────────────────────────────────

describe('SVG-TOOLS: gauge factory is in FACTORY_FILE_MAP', () => {
  it('getFileForFactoryId returns svg-factories-dynamic.js for gauge', () => {
    const { getFileForFactoryId } = require('@agni/utils/runtimeManifest');
    assert.equal(getFileForFactoryId('gauge'), 'svg-factories-dynamic.js');
  });
});
