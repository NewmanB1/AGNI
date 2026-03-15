/**
 * SVG Factory Wizard — guides the lesson creator to pick an SVG factory and set its parameters.
 * Optional: link the graphic to a sensor toy (drive visual with Phyphox/DeviceMotion sensor).
 * Returns { factory, opts } (svg_spec) via callback. Vanilla JS, no framework.
 *
 * Usage: openSVGFactoryWizard(function(svgSpec) { ... use svgSpec ... });
 */

import { openLinkToyToGraphicWizard } from './link-toy-to-graphic-wizard.js';

// Mirror of @agni/plugins builtins/factories.js for portal (no Node require).
const SVG_FACTORIES = [
  { id: 'venn', label: 'Venn Diagram', category: 'comparison', icon: '⭕', dynamic: false,
    description: 'Two or three overlapping sets. Use to compare groups or show shared properties.',
    opts: ['title', 'w', 'h', 'sets'] },
  { id: 'barGraph', label: 'Bar Graph', category: 'data', icon: '📊', dynamic: false,
    description: 'Vertical bars comparing values across categories.',
    opts: ['title', 'w', 'h', 'data', 'yLabel', 'yMax', 'horizontal'] },
  { id: 'pieChart', label: 'Pie Chart', category: 'data', icon: '🥧', dynamic: false,
    description: 'Proportional slices. Supports donut style.',
    opts: ['title', 'w', 'h', 'data', 'donut'] },
  { id: 'numberLine', label: 'Number Line', category: 'number', icon: '↔️', dynamic: false,
    description: 'Horizontal number line with tick marks and optional labelled points.',
    opts: ['title', 'w', 'h', 'min', 'max', 'step', 'marks'] },
  { id: 'balanceScale', label: 'Balance Scale', category: 'comparison', icon: '⚖️', dynamic: false,
    description: 'Visual scale that tilts based on left/right values. Good for equation balance.',
    opts: ['title', 'w', 'h', 'left', 'right'] },
  { id: 'clockFace', label: 'Clock Face', category: 'time', icon: '🕐', dynamic: false,
    description: 'Analogue clock at a specified time. Add digital display optionally.',
    opts: ['w', 'h', 'hours', 'minutes', 'showDigital', 'label'] },
  { id: 'flowMap', label: 'Flow Map', category: 'process', icon: '🔀', dynamic: false,
    description: 'Directed graph of nodes and edges. Use for processes, cycles, or concept maps.',
    opts: ['title', 'w', 'h', 'nodes', 'edges'] },
  { id: 'polygon', label: 'Polygon (static)', category: 'geometry', icon: '⬡', dynamic: false,
    description: 'Regular polygon with optional vertex labels.',
    opts: ['title', 'w', 'h', 'sides', 'color', 'fillOpacity', 'filled', 'vertexLabels'] },
  { id: 'axis', label: 'Axis Plot (simple)', category: 'data', icon: '📈', dynamic: false,
    description: 'A simple axis with tick marks and optional function curve.',
    opts: ['title', 'w', 'h', 'min', 'max', 'step', 'xLabel', 'yLabel', 'fn', 'values'] },
  { id: 'tree', label: 'Tree (hierarchical)', category: 'process', icon: '🌳', dynamic: false,
    description: 'Hierarchical tree with labelled nodes and connecting edges.',
    opts: ['title', 'w', 'h', 'root'] },
  { id: 'numberLineDynamic', label: 'Number Line (dynamic)', category: 'number', icon: '↔️✨', dynamic: true,
    description: 'Number line with a moving ball driven by sensor data or bounce animation.',
    opts: ['title', 'w', 'h', 'min', 'max', 'step', 'sensor', 'sensorMin', 'sensorMax', 'bounce', 'bounceSpeed', 'ballColor', 'marks'] },
  { id: 'clockFaceDynamic', label: 'Clock Face (dynamic)', category: 'time', icon: '🕐✨', dynamic: true,
    description: 'Live clock that tracks real time, a sensor stream, or manual input.',
    opts: ['h', 'mode', 'sensor', 'hours', 'minutes', 'showDigital', 'label'] },
  { id: 'timeGraph', label: 'Time Graph', category: 'sensor', icon: '📉', dynamic: true,
    description: 'Scrolling real-time graph of sensor streams.',
    opts: ['title', 'w', 'h', 'windowSeconds', 'xLabel', 'streams'] },
  { id: 'arrowMap', label: 'Arrow Map', category: 'geography', icon: '🗺️', dynamic: true,
    description: 'Animated arrows on a background image. Use for maps, biology diagrams.',
    opts: ['title', 'w', 'h', 'background', 'bgOpacity', 'timeline', 'arrows'] },
  { id: 'gauge', label: 'Gauge / Meter', category: 'sensor', icon: '🎛️', dynamic: true,
    description: 'Dial gauge showing a single value via needle and colour zones.',
    opts: ['title', 'w', 'h', 'min', 'max', 'unit', 'ticks', 'sensor', 'sensorMin', 'sensorMax', 'value', 'animate', 'speed', 'zones'] },
  { id: 'polygonDynamic', label: 'Polygon (dynamic)', category: 'geometry', icon: '⬡✨', dynamic: true,
    description: 'Regular or custom polygon with rotation, scale, and triangle decomposition.',
    opts: ['title', 'w', 'h', 'sides', 'r', 'color', 'fillOpacity', 'showCentroid', 'showVertexLabels', 'rotate', 'rotateAnimation', 'scale'] },
  { id: 'cartesianGrid', label: 'Cartesian Grid', category: 'geometry', icon: '📐', dynamic: true,
    description: 'Full coordinate plane with function plots, tangent lines, slope triangles.',
    opts: ['title', 'w', 'h', 'xMin', 'xMax', 'yMin', 'yMax', 'xStep', 'yStep', 'xLabel', 'yLabel', 'showGrid', 'plots', 'points'] },
  { id: 'unitCircle', label: 'Unit Circle', category: 'geometry', icon: '🔵📐', dynamic: true,
    description: 'Animated trig unit circle. Shows sin, cos, tan projections.',
    opts: ['title', 'w', 'h', 'angleDeg', 'animate', 'speed', 'sensor', 'showSine', 'showCosine', 'showTangent', 'showValues'] }
];

const CATEGORY_LABELS = {
  comparison: 'Comparison',
  data: 'Data & charts',
  number: 'Number line',
  time: 'Time',
  process: 'Process & flow',
  geometry: 'Geometry',
  sensor: 'Sensor & live',
  geography: 'Maps & arrows'
};

function escapeHtml(s) {
  if (s == null) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

function buildOptInputs(factory) {
  const opts = factory.opts || [];
  const hasTitle = opts.indexOf('title') !== -1;
  const hasW = opts.indexOf('w') !== -1;
  const hasH = opts.indexOf('h') !== -1;
  let html = '';
  if (hasTitle) html += '<div class="wizard-field"><label for="svg-opt-title">Title</label><input type="text" id="svg-opt-title" class="input" placeholder="Chart title" /></div>';
  if (hasW) html += '<div class="wizard-field"><label for="svg-opt-w">Width (px)</label><input type="number" id="svg-opt-w" class="input" min="100" max="900" value="420" /></div>';
  if (hasH) html += '<div class="wizard-field"><label for="svg-opt-h">Height (px)</label><input type="number" id="svg-opt-h" class="input" min="80" max="700" value="280" /></div>';
  const other = opts.filter(function (o) { return o !== 'title' && o !== 'w' && o !== 'h'; });
  if (other.length) {
    html += '<div class="wizard-field"><label for="svg-opt-extra">Extra options (JSON, optional)</label>';
    html += '<textarea id="svg-opt-extra" class="input" rows="4" placeholder=\'e.g. {"min": 0, "max": 10, "data": [{"label": "A", "value": 5}]}\'></textarea>';
    html += '<p class="hint">Add any other parameters as a JSON object. Leave empty to use defaults.</p></div>';
  }
  return html;
}

function collectOpts(factory) {
  const opts = {};
  const titleEl = document.getElementById('svg-opt-title');
  const wEl = document.getElementById('svg-opt-w');
  const hEl = document.getElementById('svg-opt-h');
  const extraEl = document.getElementById('svg-opt-extra');
  if (titleEl && titleEl.value.trim()) opts.title = titleEl.value.trim();
  if (wEl) { const w = parseInt(wEl.value, 10); if (!isNaN(w)) opts.w = w; }
  if (hEl) { const h = parseInt(hEl.value, 10); if (!isNaN(h)) opts.h = h; }
  if (extraEl && extraEl.value.trim()) {
    try {
      const extra = JSON.parse(extraEl.value.trim());
      Object.keys(extra).forEach(function (k) { opts[k] = extra[k]; });
    } catch (e) { /* ignore invalid JSON */ }
  }
  return opts;
}

/**
 * Opens the SVG Factory Wizard as a modal. On "Insert", calls onDone({ factory, opts }).
 * @param {function(object): void} onDone - callback with svg_spec { factory, opts }
 */
export function openSVGFactoryWizard(onDone) {
  let step = 1;
  let selectedFactory = null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay wizard-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-labelledby', 'svg-wizard-title');

  function close() {
    overlay.remove();
  }

  function renderStep1() {
    const categories = {};
    SVG_FACTORIES.forEach(function (f) {
      const cat = f.category || 'other';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(f);
    });
    let listHtml = '';
    Object.keys(categories).sort().forEach(function (cat) {
      const label = CATEGORY_LABELS[cat] || cat;
      listHtml += '<div class="wizard-category"><h4 class="wizard-cat-title">' + escapeHtml(label) + '</h4><div class="wizard-factory-grid">';
      categories[cat].forEach(function (f) {
        listHtml += '<button type="button" class="wizard-factory-card" data-id="' + escapeHtml(f.id) + '">';
        listHtml += '<span class="wizard-factory-icon">' + escapeHtml(f.icon) + '</span>';
        listHtml += '<span class="wizard-factory-label">' + escapeHtml(f.label) + '</span>';
        listHtml += '<span class="wizard-factory-desc">' + escapeHtml(f.description) + '</span>';
        listHtml += '</button>';
      });
      listHtml += '</div></div>';
    });
    return '<div class="wizard-step">' +
      '<h2 id="svg-wizard-title">Choose a visual</h2>' +
      '<p class="wizard-hint">Select the type of chart or diagram you want to add.</p>' +
      '<div class="wizard-scroll">' + listHtml + '</div>' +
      '<div class="wizard-actions"><button type="button" class="btn" data-action="cancel">Cancel</button></div></div>';
  }

  function renderStep2() {
    const f = selectedFactory;
    const optHtml = buildOptInputs(f);
    const canLinkSensor = ['timeGraph', 'gauge', 'numberLineDynamic', 'clockFaceDynamic', 'unitCircle', 'polygonDynamic'].indexOf(f.id) !== -1;
    return '<div class="wizard-step">' +
      '<h2>Configure ' + escapeHtml(f.label) + '</h2>' +
      '<p class="wizard-hint">' + escapeHtml(f.description) + '</p>' +
      '<div class="wizard-form">' + optHtml + '</div>' +
      '<div class="wizard-actions">' +
      '<button type="button" class="btn" data-action="back">← Back</button> ' +
      (canLinkSensor ? '<button type="button" class="btn" data-action="link-sensor">Link to sensor toy</button> ' : '') +
      '<button type="button" class="btn btn-primary" data-action="insert">Insert into lesson</button>' +
      '</div></div>';
  }

  function render() {
    const content = document.getElementById('svg-wizard-content');
    if (!content) return;
    if (step === 1) {
      content.innerHTML = renderStep1();
      content.querySelectorAll('.wizard-factory-card').forEach(function (btn) {
        btn.addEventListener('click', function () {
          selectedFactory = SVG_FACTORIES.find(function (f) { return f.id === this.getAttribute('data-id'); }.bind(btn));
          if (selectedFactory) { step = 2; render(); }
        });
      });
    } else {
      content.innerHTML = renderStep2();
      content.querySelector('[data-action="back"]').addEventListener('click', function () {
        step = 1;
        selectedFactory = null;
        render();
      });
      content.querySelector('[data-action="insert"]').addEventListener('click', function () {
        const opts = collectOpts(selectedFactory);
        onDone({ factory: selectedFactory.id, opts: opts });
        close();
      });
      var linkBtn = content.querySelector('[data-action="link-sensor"]');
      if (linkBtn) {
        linkBtn.addEventListener('click', function () {
          var opts = collectOpts(selectedFactory);
          openLinkToyToGraphicWizard(
            { preselectedSvgSpec: { factory: selectedFactory.id, opts: opts } },
            function (mergedSpec) {
              onDone(mergedSpec);
              close();
            }
          );
        });
      }
    }
    content.querySelector('[data-action="cancel"]')?.addEventListener('click', close);
  }

  overlay.innerHTML = '<div class="modal-content wizard-modal" id="svg-wizard-modal">' +
    '<div id="svg-wizard-content"></div>' +
    '</div>';
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) close();
  });
  document.body.appendChild(overlay);
  render();
}
