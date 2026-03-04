/**
 * SVG Factory Catalog
 *
 * The runtime registry lives on the edge device (window.AGNI_SVG.Registry).
 * This module provides the factory metadata (schemas, defaults, categories)
 * so the portal's SvgSpecEditor can build property panels without loading
 * the rendering code. Sensors are read from @agni/plugins (single source
 * of truth). Factories still carry full prop-schemas here because the
 * WYSIWYG needs widget hints the lightweight plugin descriptors don't store.
 */

export const PROP_TYPES = {
  integer: 'integer',
  float: 'float',
  boolean: 'boolean',
  string: 'string',
  color: 'color',
  array: 'array',
  object: 'object',
  sensor: 'sensor',
  fn: 'fn',
  enum: 'enum',
  nodeList: 'nodeList',
  edgeList: 'edgeList',
  arrowList: 'arrowList',
  markList: 'markList',
  streamList: 'streamList',
  setList: 'setList',
  dataTable: 'dataTable'
};

function prop(name, type, label, def, extra) {
  return { name, type, label, default: def, ...(extra || {}) };
}
function intProp(name, label, def, min, max) {
  return prop(name, 'integer', label, def, { min, max, widget: 'slider' });
}
function floatProp(name, label, def, min, max, step) {
  return prop(name, 'float', label, def, { min, max, step: step || 0.01, widget: 'slider' });
}
function boolProp(name, label, def) {
  return prop(name, 'boolean', label, def, { widget: 'toggle' });
}
function colorProp(name, label, def) {
  return prop(name, 'color', label, def || '#4dabf7', { widget: 'colorpicker' });
}
function strProp(name, label, def) {
  return prop(name, 'string', label, def, { widget: 'text' });
}
function enumProp(name, label, values, def) {
  return prop(name, 'enum', label, def || values[0], { values, widget: 'dropdown' });
}
function sensorProp(name, label) {
  return prop(name, 'sensor', label, null, { widget: 'sensordropdown', nullable: true });
}
function fnProp(name, label, placeholder) {
  return prop(name, 'fn', label, null, { placeholder: placeholder || 'Math.sin(x)', widget: 'codeeditor' });
}

const SHARED = {
  title:    strProp('title', 'Title', ''),
  w:        intProp('w', 'Width (px)', 420, 100, 900),
  h:        intProp('h', 'Height (px)', 280, 80, 700),
  color:    colorProp('color', 'Colour'),
  fillOpacity: floatProp('fillOpacity', 'Fill opacity', 0.2, 0, 1, 0.05),
  sensor:   sensorProp('sensor', 'Sensor'),
  sensorMin: floatProp('sensorMin', 'Sensor range min', 0, -100, 100),
  sensorMax: floatProp('sensorMax', 'Sensor range max', 10, -100, 100),
  animate:  boolProp('animate', 'Auto-animate', false),
  speed:    floatProp('speed', 'Animation speed', 30, 1, 360),
  showValues: boolProp('showValues', 'Show numeric values', true),
  xLabel:   strProp('xLabel', 'X-axis label', ''),
  yLabel:   strProp('yLabel', 'Y-axis label', ''),
  xMin:     floatProp('xMin', 'X min', -5, -100, 0),
  xMax:     floatProp('xMax', 'X max', 5, 0, 100),
  yMin:     floatProp('yMin', 'Y min', -4, -100, 0),
  yMax:     floatProp('yMax', 'Y max', 4, 0, 100)
};

export const CATEGORIES = [
  { id: 'comparison', label: 'Comparison', icon: '⚖️' },
  { id: 'data', label: 'Data & Charts', icon: '📊' },
  { id: 'number', label: 'Number', icon: '🔢' },
  { id: 'time', label: 'Time', icon: '🕐' },
  { id: 'process', label: 'Process', icon: '🔀' },
  { id: 'geometry', label: 'Geometry', icon: '📐' },
  { id: 'sensor', label: 'Sensor', icon: '📡' },
  { id: 'geography', label: 'Geography', icon: '🗺️' },
];

/** @type {Array<import('./svg-catalog-types').FactoryDescriptor>} */
export const FACTORIES = [

  // ── Static factories ──────────────────────────────────────────────────────

  {
    id: 'venn', label: 'Venn Diagram', category: 'comparison',
    description: 'Two or three overlapping sets for comparing groups.',
    icon: '⭕', dynamic: false,
    previewDefaults: {
      title: 'Venn Diagram',
      sets: [
        { label: 'Set A', items: ['apple', 'bat', 'cat'], color: '#4dabf7' },
        { label: 'Set B', items: ['cat', 'dog', 'eel'], color: '#ff6b35' }
      ]
    },
    props: [
      SHARED.title, SHARED.w, SHARED.h,
      prop('sets', 'setList', 'Sets', [
        { label: 'Set A', items: [], color: '#4dabf7' },
        { label: 'Set B', items: [], color: '#ff6b35' }
      ], { minItems: 2, maxItems: 3 })
    ]
  },

  {
    id: 'barGraph', label: 'Bar Graph', category: 'data',
    description: 'Vertical bars comparing values across categories.',
    icon: '📊', dynamic: false,
    previewDefaults: { title: 'Bar Graph', data: [{ label: 'Mon', value: 40 }, { label: 'Tue', value: 65 }], yLabel: 'Count' },
    props: [
      SHARED.title, SHARED.w, SHARED.h,
      prop('data', 'dataTable', 'Data', [], { columns: ['label', 'value', 'color?'] }),
      SHARED.yLabel,
      floatProp('yMax', 'Y axis max (0=auto)', 0, 0, 10000),
      boolProp('horizontal', 'Horizontal bars', false)
    ]
  },

  {
    id: 'pieChart', label: 'Pie Chart', category: 'data',
    description: 'Proportional slices with optional donut style.',
    icon: '🥧', dynamic: false,
    previewDefaults: { title: 'Pie Chart', data: [{ label: 'A', value: 40 }, { label: 'B', value: 30 }, { label: 'C', value: 30 }] },
    props: [
      SHARED.title, SHARED.w, SHARED.h,
      prop('data', 'dataTable', 'Data', [], { columns: ['label', 'value', 'color?'] }),
      boolProp('donut', 'Donut style', false)
    ]
  },

  {
    id: 'numberLine', label: 'Number Line', category: 'number',
    description: 'Horizontal line with ticks and labelled marks.',
    icon: '↔️', dynamic: false,
    previewDefaults: { title: 'Number Line', min: 0, max: 10, step: 1, marks: [{ value: 3, label: 'x', color: '#ff6b35' }] },
    props: [
      SHARED.title, SHARED.w, SHARED.h,
      floatProp('min', 'Min', 0, -1000, 0), floatProp('max', 'Max', 10, 0, 1000),
      floatProp('step', 'Tick interval', 1, 0.1, 100),
      prop('marks', 'markList', 'Marks', [], { columns: ['value', 'label?', 'color?', 'arrow?'] })
    ]
  },

  {
    id: 'balanceScale', label: 'Balance Scale', category: 'comparison',
    description: 'Visual scale that tilts based on left/right values.',
    icon: '⚖️', dynamic: false,
    previewDefaults: { title: 'Balance Scale', left: { label: 'Left', value: 3 }, right: { label: 'Right', value: 7 } },
    props: [
      SHARED.title, SHARED.w, SHARED.h,
      prop('left', 'object', 'Left pan', { label: 'Left', value: 1 },
        { schema: [strProp('label', 'Label', 'Left'), floatProp('value', 'Value', 1, -999, 999), colorProp('color', 'Colour')] }),
      prop('right', 'object', 'Right pan', { label: 'Right', value: 1 },
        { schema: [strProp('label', 'Label', 'Right'), floatProp('value', 'Value', 1, -999, 999), colorProp('color', 'Colour')] })
    ]
  },

  {
    id: 'clockFace', label: 'Clock Face', category: 'time',
    description: 'Analogue clock at a set time.',
    icon: '🕐', dynamic: false,
    previewDefaults: { hours: 3, minutes: 15, showDigital: true, label: 'Quarter past three' },
    props: [
      SHARED.w, SHARED.h,
      intProp('hours', 'Hours', 3, 0, 12), intProp('minutes', 'Minutes', 15, 0, 59),
      boolProp('showDigital', 'Digital time', false), strProp('label', 'Label', '')
    ]
  },

  {
    id: 'flowMap', label: 'Flow Map', category: 'process',
    description: 'Directed graph for processes, cycles, or concept maps.',
    icon: '🔀', dynamic: false,
    previewDefaults: {
      title: 'Flow Map',
      nodes: [
        { id: 'a', label: 'Start', shape: 'oval', color: '#4dabf7' },
        { id: 'b', label: 'Step', shape: 'rect', color: '#51cf66' },
        { id: 'c', label: 'End', shape: 'diamond', color: '#ff6b35' }
      ],
      edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }]
    },
    props: [
      SHARED.title, SHARED.w, SHARED.h,
      prop('nodes', 'nodeList', 'Nodes', [], { columns: ['id', 'label', 'shape', 'color?'] }),
      prop('edges', 'edgeList', 'Edges', [], { columns: ['from', 'to', 'label?'] })
    ]
  },

  {
    id: 'polygon', label: 'Polygon (static)', category: 'geometry',
    description: 'Regular polygon with optional vertex labels.',
    icon: '⬡', dynamic: false,
    previewDefaults: { title: 'Hexagon', sides: 6, vertexLabels: ['A', 'B', 'C', 'D', 'E', 'F'] },
    props: [
      SHARED.title, SHARED.w, SHARED.h,
      intProp('sides', 'Sides', 6, 3, 12), SHARED.color, SHARED.fillOpacity,
      boolProp('filled', 'Filled', true),
      prop('vertexLabels', 'array', 'Vertex labels', [], { itemType: 'string' })
    ]
  },

  {
    id: 'axis', label: 'Axis Plot', category: 'data',
    description: 'Simple axis with ticks and optional function curve.',
    icon: '📈', dynamic: false,
    previewDefaults: { title: 'Axis', min: 0, max: 10, step: 2, values: [{ x: 5, label: 'peak', color: '#ff6b35' }] },
    props: [
      SHARED.title, SHARED.w, SHARED.h,
      floatProp('min', 'Min', 0, -1000, 0), floatProp('max', 'Max', 10, 0, 1000),
      floatProp('step', 'Tick interval', 1, 0.01, 100),
      SHARED.xLabel, SHARED.yLabel,
      fnProp('fn', 'Function y = f(x)', 'Math.sin(x)'),
      prop('values', 'markList', 'Marked points', [], { columns: ['x', 'label?', 'color?'] })
    ]
  },

  {
    id: 'tree', label: 'Tree (hierarchical)', category: 'process',
    description: 'Hierarchical tree with labelled nodes and connecting edges.',
    icon: '🌳', dynamic: false,
    previewDefaults: {
      title: 'Tree',
      root: {
        label: 'Root',
        children: [
          { label: 'Branch A', children: [{ label: 'Leaf 1' }, { label: 'Leaf 2' }] },
          { label: 'Branch B', children: [{ label: 'Leaf 3' }] }
        ]
      }
    },
    props: [
      SHARED.title, SHARED.w, SHARED.h,
      prop('root', 'object', 'Root node', { label: 'Root' }, {
        schema: [strProp('label', 'Label', 'Root'), colorProp('color', 'Colour')]
      })
    ]
  },

  // ── Dynamic factories ─────────────────────────────────────────────────────

  {
    id: 'numberLineDynamic', label: 'Number Line (dynamic)', category: 'number',
    description: 'Number line with moving ball driven by sensor or animation.',
    icon: '↔️', dynamic: true,
    previewDefaults: { title: 'Dynamic Number Line', min: 0, max: 10, step: 2, bounce: true, bounceSpeed: 3, ballColor: '#ff6b35' },
    props: [
      SHARED.title, SHARED.w, SHARED.h,
      floatProp('min', 'Min', 0, -1000, 0), floatProp('max', 'Max', 10, 0, 1000),
      floatProp('step', 'Tick interval', 1, 0.1, 100),
      SHARED.sensor, SHARED.sensorMin, SHARED.sensorMax,
      boolProp('bounce', 'Bounce animation', true),
      floatProp('bounceSpeed', 'Bounce speed', 3, 0.1, 30),
      colorProp('ballColor', 'Ball colour', '#ff6b35'),
      prop('marks', 'markList', 'Static marks', [], { columns: ['value', 'label?', 'color?'] })
    ]
  },

  {
    id: 'clockFaceDynamic', label: 'Clock Face (dynamic)', category: 'time',
    description: 'Live clock tracking real time, sensor, or manual input.',
    icon: '🕐', dynamic: true,
    previewDefaults: { mode: 'realtime', showDigital: true },
    props: [
      SHARED.h,
      enumProp('mode', 'Mode', ['realtime', 'sensor', 'manual'], 'realtime'),
      SHARED.sensor,
      intProp('hours', 'Initial hours', 12, 0, 12), intProp('minutes', 'Initial minutes', 0, 0, 59),
      boolProp('showDigital', 'Digital time', true), strProp('label', 'Label', '')
    ]
  },

  {
    id: 'timeGraph', label: 'Time Graph', category: 'sensor',
    description: 'Scrolling real-time graph of sensor streams.',
    icon: '📉', dynamic: true,
    previewDefaults: { title: 'Time Graph', windowSeconds: 5, streams: [{ sensor: null, label: 'Stream 1', color: '#ff6b35', yMin: 0, yMax: 10 }] },
    props: [
      SHARED.title, SHARED.w, SHARED.h,
      floatProp('windowSeconds', 'Time window (s)', 5, 1, 60), SHARED.xLabel,
      prop('streams', 'streamList', 'Sensor streams', [], { columns: ['sensor', 'label', 'color', 'yMin', 'yMax'] })
    ]
  },

  {
    id: 'arrowMap', label: 'Arrow Map', category: 'geography',
    description: 'Animated arrows on a background for maps and diagrams.',
    icon: '🗺️', dynamic: true,
    previewDefaults: { title: 'Arrow Map', arrows: [{ id: 'a1', from: { x: 0.1, y: 0.5 }, to: { x: 0.9, y: 0.3 }, label: 'Route', color: '#4dabf7', width: 3 }] },
    props: [
      SHARED.title, SHARED.w, SHARED.h,
      strProp('background', 'Background image URL', ''),
      floatProp('bgOpacity', 'Background opacity', 1, 0, 1, 0.05),
      boolProp('timeline', 'Timeline mode', false),
      prop('arrows', 'arrowList', 'Arrows', [], { columns: ['id', 'from', 'to', 'label', 'color', 'width'] })
    ]
  },

  {
    id: 'gauge', label: 'Gauge / Meter', category: 'sensor',
    description: 'Dial gauge showing a single value with needle and colour zones. Sensor-driven or static.',
    icon: '🎛️', dynamic: true,
    previewDefaults: {
      title: 'Acceleration', min: 0, max: 20, unit: 'm/s²', ticks: 5, animate: true, speed: 3,
      zones: [{ from: 0, to: 0.5, color: '#4ade80' }, { from: 0.5, to: 0.75, color: '#facc15' }, { from: 0.75, to: 1.0, color: '#f87171' }]
    },
    props: [
      SHARED.title, SHARED.w, SHARED.h,
      floatProp('min', 'Scale minimum', 0, -1000, 10000),
      floatProp('max', 'Scale maximum', 10, -1000, 10000),
      strProp('unit', 'Unit label', ''),
      intProp('ticks', 'Tick divisions', 5, 2, 20),
      SHARED.sensor, SHARED.sensorMin, SHARED.sensorMax,
      floatProp('value', 'Static value', 0, -1000, 10000),
      SHARED.animate, SHARED.speed,
      prop('zones', 'array', 'Colour zones', [
        { from: 0, to: 0.6, color: '#4ade80' },
        { from: 0.6, to: 0.8, color: '#facc15' },
        { from: 0.8, to: 1.0, color: '#f87171' }
      ], {
        itemSchema: [
          floatProp('from', 'From (0–1)', 0, 0, 1, 0.05),
          floatProp('to', 'To (0–1)', 1, 0, 1, 0.05),
          colorProp('color', 'Zone colour', '#4ade80')
        ]
      })
    ]
  },

  {
    id: 'polygonDynamic', label: 'Polygon (dynamic)', category: 'geometry',
    description: 'Polygon with rotation, scale, and triangle decomposition.',
    icon: '⬡', dynamic: true,
    previewDefaults: { title: 'Polygon', sides: 6, rotateAnimation: true, rotateSpeed: 30, showCentroid: true },
    props: [
      SHARED.title, SHARED.w, SHARED.h,
      intProp('sides', 'Sides', 6, 3, 24), floatProp('r', 'Radius (px)', 90, 20, 300),
      SHARED.color, SHARED.fillOpacity,
      boolProp('showCentroid', 'Show centroid', false),
      boolProp('showVertexLabels', 'Vertex labels', false),
      boolProp('showSideLabels', 'Side lengths', false),
      boolProp('showAngles', 'Interior angles', false),
      floatProp('rotate', 'Initial rotation', 0, 0, 360),
      boolProp('rotateAnimation', 'Auto-rotate', false),
      floatProp('rotateSpeed', 'Rotation speed', 30, 1, 360),
      enumProp('decompose', 'Decomposition', ['none', 'triangles'], 'none')
    ]
  },

  {
    id: 'cartesianGrid', label: 'Cartesian Grid', category: 'geometry',
    description: 'Full coordinate plane with function plots, vectors, tangent lines.',
    icon: '📐', dynamic: true,
    previewDefaults: { title: 'Cartesian Grid', xMin: -5, xMax: 5, yMin: -4, yMax: 4, xLabel: 'x', yLabel: 'y', showGrid: true },
    props: [
      SHARED.title, SHARED.w, SHARED.h,
      SHARED.xMin, SHARED.xMax, SHARED.yMin, SHARED.yMax,
      floatProp('xStep', 'X tick', 1, 0.1, 10), floatProp('yStep', 'Y tick', 1, 0.1, 10),
      SHARED.xLabel, SHARED.yLabel,
      boolProp('showGrid', 'Grid lines', true), boolProp('showMinorGrid', 'Minor grid', false),
      prop('plots', 'array', 'Function plots', [], {
        itemSchema: [fnProp('fn', 'y = f(x)', 'Math.sin(x)'), colorProp('color', 'Colour'), floatProp('width', 'Line width', 2.5, 0.5, 8)]
      }),
      prop('points', 'array', 'Points', [], {
        itemSchema: [floatProp('x', 'x', 0, -100, 100), floatProp('y', 'y', 0, -100, 100), colorProp('color', 'Colour'), strProp('label', 'Label', '')]
      }),
      prop('vectors', 'array', 'Vectors', [], {
        itemSchema: [floatProp('x', 'Origin x', 0, -100, 100), floatProp('y', 'Origin y', 0, -100, 100), floatProp('dx', 'dx', 1, -100, 100), floatProp('dy', 'dy', 1, -100, 100), colorProp('color', 'Colour')]
      })
    ]
  },

  {
    id: 'unitCircle', label: 'Unit Circle', category: 'geometry',
    description: 'Animated trig unit circle with sin, cos, tan projections.',
    icon: '🔵', dynamic: true,
    previewDefaults: { title: 'Unit Circle', angleDeg: 45, animate: false, showSine: true, showCosine: true, showValues: true },
    props: [
      SHARED.title, SHARED.w, SHARED.h,
      floatProp('angleDeg', 'Initial angle', 45, 0, 360),
      boolProp('animate', 'Auto-rotate', false), floatProp('speed', 'Speed (deg/s)', 45, 1, 360),
      sensorProp('sensor', 'Angle sensor'),
      boolProp('showSine', 'Show sine', true), boolProp('showCosine', 'Show cosine', true),
      boolProp('showTangent', 'Show tangent', false), boolProp('showValues', 'Numeric readout', true)
    ]
  }
];

// ── Sensor catalog ──────────────────────────────────────────────────────────
// Read from the @agni/plugins registry (single source of truth).
// Use namespace import; Vite handles CJS interop for browser builds.

import * as _plugins from '@agni/plugins';

export const SENSOR_GROUPS = _plugins.getSensorGroups();
export const ALL_SENSORS   = _plugins.getSensors();

export function getSensorById(id) {
  return ALL_SENSORS.find(s => s.id === id) || null;
}

// ── Physics experiment presets ──────────────────────────────────────────────
// One-click pre-wired factory+sensor combos for common physics experiments.

export const EXPERIMENT_PRESETS = [
  {
    id: 'exp-accel-graph',
    label: 'Acceleration Graph',
    description: 'Live scrolling graph of acceleration. Drop, shake, or tilt the phone to see forces.',
    icon: '📉',
    category: 'motion',
    factory: 'timeGraph',
    opts: {
      title: 'Acceleration',
      w: 420, h: 280,
      windowSeconds: 5,
      xLabel: 'Time (s)',
      streams: [
        { sensor: 'accel.total', label: 'Total (m/s²)', color: '#ff6b35', yMin: 0, yMax: 25 }
      ]
    }
  },
  {
    id: 'exp-accel-xyz',
    label: 'Acceleration XYZ',
    description: 'Three-axis acceleration plotted simultaneously. See which axis dominates.',
    icon: '📊',
    category: 'motion',
    factory: 'timeGraph',
    opts: {
      title: 'Acceleration (3-axis)',
      w: 420, h: 300,
      windowSeconds: 5,
      xLabel: 'Time (s)',
      streams: [
        { sensor: 'accel.x', label: 'X', color: '#f87171', yMin: -15, yMax: 15 },
        { sensor: 'accel.y', label: 'Y', color: '#4ade80', yMin: -15, yMax: 15 },
        { sensor: 'accel.z', label: 'Z', color: '#60a5fa', yMin: -15, yMax: 15 }
      ]
    }
  },
  {
    id: 'exp-freefall-gauge',
    label: 'G-Force Meter',
    description: 'Dial gauge showing total acceleration. Watch it drop to zero during freefall.',
    icon: '🎛️',
    category: 'motion',
    factory: 'gauge',
    opts: {
      title: 'G-Force', min: 0, max: 3, unit: 'g',
      w: 260, h: 200, ticks: 6,
      sensor: 'accel.total', sensorMin: 0, sensorMax: 29.43,
      zones: [
        { from: 0, to: 0.1, color: '#60a5fa' },
        { from: 0.1, to: 0.7, color: '#4ade80' },
        { from: 0.7, to: 0.9, color: '#facc15' },
        { from: 0.9, to: 1.0, color: '#f87171' }
      ]
    }
  },
  {
    id: 'exp-pendulum',
    label: 'Pendulum Tracker',
    description: 'Number line tracks swing angle. Attach phone to a string and watch the oscillation.',
    icon: '🔄',
    category: 'motion',
    factory: 'numberLineDynamic',
    opts: {
      title: 'Pendulum Angle',
      w: 420, h: 120,
      min: -90, max: 90, step: 15,
      sensor: 'rotation.gamma', sensorMin: -90, sensorMax: 90,
      ballColor: '#4dabf7',
      marks: [{ value: 0, label: 'rest', color: '#4ade80' }]
    }
  },
  {
    id: 'exp-tilt-polygon',
    label: 'Tilt-Controlled Shape',
    description: 'Polygon rotates and scales based on device orientation. Explore angles physically.',
    icon: '⬡',
    category: 'geometry',
    factory: 'polygonDynamic',
    opts: {
      title: 'Tilt Me!',
      w: 300, h: 300,
      sides: 6, r: 90,
      color: '#4dabf7', fillOpacity: 0.25,
      showAngles: true, showVertexLabels: true,
      rotateSensor: 'rotation.gamma', rotateSensorMin: -90, rotateSensorMax: 90,
      scaleSensor: 'rotation.beta', scaleMin: 0.5, scaleMax: 1.5
    }
  },
  {
    id: 'exp-unit-circle-tilt',
    label: 'Trig with Tilt',
    description: 'Unit circle angle follows device tilt. See sin/cos/tan change as you rotate the phone.',
    icon: '🔵',
    category: 'geometry',
    factory: 'unitCircle',
    opts: {
      title: 'Tilt to Explore Trig',
      w: 320, h: 300,
      angleDeg: 0,
      sensor: 'rotation.gamma', sensorMin: -90, sensorMax: 90,
      showSine: true, showCosine: true, showTangent: true, showValues: true
    }
  },
  {
    id: 'exp-compass',
    label: 'Digital Compass',
    description: 'Unit circle follows device heading. Explore cardinal directions and bearings.',
    icon: '🧭',
    category: 'environment',
    factory: 'unitCircle',
    opts: {
      title: 'Compass',
      w: 320, h: 300,
      angleDeg: 0,
      sensor: 'rotation.alpha', sensorMin: 0, sensorMax: 360,
      showSine: false, showCosine: false, showTangent: false, showValues: true
    }
  },
  {
    id: 'exp-gyro-graph',
    label: 'Rotation Rate Graph',
    description: 'Plot angular velocity in real time. Spin the phone to see peaks.',
    icon: '📉',
    category: 'motion',
    factory: 'timeGraph',
    opts: {
      title: 'Angular Velocity',
      w: 420, h: 280,
      windowSeconds: 5,
      xLabel: 'Time (s)',
      streams: [
        { sensor: 'gyro.magnitude', label: 'Total (deg/s)', color: '#c084fc', yMin: 0, yMax: 500 }
      ]
    }
  },
  {
    id: 'exp-magnetic-field',
    label: 'Magnetic Field Meter',
    description: 'Gauge showing magnetic field strength. Move magnets or metal objects near the phone.',
    icon: '🧲',
    category: 'environment',
    factory: 'gauge',
    opts: {
      title: 'Magnetic Field', min: 0, max: 200, unit: 'μT',
      w: 260, h: 200, ticks: 5,
      sensor: 'mag.magnitude', sensorMin: 0, sensorMax: 200,
      zones: [
        { from: 0, to: 0.3, color: '#4ade80' },
        { from: 0.3, to: 0.6, color: '#facc15' },
        { from: 0.6, to: 1.0, color: '#f87171' }
      ]
    }
  },
  {
    id: 'exp-light-meter',
    label: 'Light Level Meter',
    description: 'Gauge measuring ambient light. Cover the sensor, point at light sources.',
    icon: '💡',
    category: 'environment',
    factory: 'gauge',
    opts: {
      title: 'Light Level', min: 0, max: 1000, unit: 'lux',
      w: 260, h: 200, ticks: 5,
      sensor: 'light', sensorMin: 0, sensorMax: 1000,
      zones: [
        { from: 0, to: 0.2, color: '#334155' },
        { from: 0.2, to: 0.5, color: '#facc15' },
        { from: 0.5, to: 1.0, color: '#fbbf24' }
      ]
    }
  },
  {
    id: 'exp-barometer',
    label: 'Barometric Pressure',
    description: 'Graph atmospheric pressure over time. Take the phone up stairs or outside.',
    icon: '🌡️',
    category: 'environment',
    factory: 'timeGraph',
    opts: {
      title: 'Atmospheric Pressure',
      w: 420, h: 280,
      windowSeconds: 30,
      xLabel: 'Time (s)',
      streams: [
        { sensor: 'pressure', label: 'Pressure (hPa)', color: '#38bdf8', yMin: 950, yMax: 1050 }
      ]
    }
  },
  {
    id: 'exp-multi-sensor-dash',
    label: 'Multi-Sensor Dashboard',
    description: 'Acceleration + gyro + tilt on one scrolling graph. Full sensor overview.',
    icon: '🖥️',
    category: 'motion',
    factory: 'timeGraph',
    opts: {
      title: 'Sensor Dashboard',
      w: 460, h: 320,
      windowSeconds: 8,
      xLabel: 'Time (s)',
      streams: [
        { sensor: 'accel.total', label: 'Accel (m/s²)', color: '#f87171', yMin: 0, yMax: 25 },
        { sensor: 'gyro.magnitude', label: 'Gyro (deg/s)', color: '#4dabf7', yMin: 0, yMax: 200 },
        { sensor: 'rotation.beta', label: 'Tilt (°)', color: '#4ade80', yMin: -90, yMax: 90 }
      ]
    }
  }
];

export const EXPERIMENT_CATEGORIES = [
  { id: 'motion',      label: 'Motion & Forces',  icon: '🚀' },
  { id: 'geometry',    label: 'Sensor Geometry',   icon: '📐' },
  { id: 'environment', label: 'Environment',       icon: '🌡️' },
];

export function getExperimentById(id) {
  return EXPERIMENT_PRESETS.find(e => e.id === id) || null;
}

// ── Utility functions ──────────────────────────────────────────────────────

export function getFactoryById(id) {
  return FACTORIES.find(f => f.id === id) || null;
}

export function getFactoriesByCategory(cat) {
  return FACTORIES.filter(f => f.category === cat);
}

export function getDefaults(id) {
  const desc = getFactoryById(id);
  if (!desc) return {};
  const out = {};
  for (const p of desc.props) {
    if (p.default !== undefined && p.default !== null) out[p.name] = p.default;
  }
  return out;
}

export function serializeSpec(factoryId, opts) {
  return { factory: factoryId, opts: opts || {} };
}
