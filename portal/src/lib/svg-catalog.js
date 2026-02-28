/**
 * SVG Factory Catalog — static mirror of src/runtime/svg-registry.js
 *
 * The runtime registry lives on the edge device (window.AGNI_SVG.Registry).
 * This module extracts the factory metadata (schemas, defaults, categories)
 * so the portal's SvgSpecEditor can build property panels without loading
 * the rendering code. Lessons store only { factory, opts } — the edge
 * device's cached factories do the actual SVG generation.
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
