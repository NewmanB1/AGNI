// @ts-nocheck — global.AGNI_SVG, global.AGNI_SHARED, global.DEV_MODE
// packages/agni-runtime/rendering/svg-registry.js
// AGNI SVG Registry
//
// Makes the SVG library self-describing so a WYSIWYG editor can:
//   1. Discover available factories and their categories
//   2. Read typed property schemas with widget hints
//   3. Render live previews with default or supplied props
//   4. Serialize a visual spec to/from plain JSON (storable in YAML)
//   5. Reconstruct any visual from a spec at lesson runtime
//
// Load order:
//   svg-stage.js → svg-factories.js → svg-factories-dynamic.js
//   → svg-factories-geometry.js → svg-registry.js
//
// No factory code lives here. This file only declares schemas and wires
// them to the existing AGNI_SVG functions.
// ─────────────────────────────────────────────────────────────────────────────

(function (global) {
  'use strict';

  if (!global.AGNI_SVG) { console.error('[REGISTRY] AGNI_SVG not found'); return; }
  var SVG = global.AGNI_SVG;

  // ═══════════════════════════════════════════════════════════════════════════
  // Property type definitions
  // These are the primitive types the WYSIWYG understands.
  // Each maps to one or more UI widgets.
  // ═══════════════════════════════════════════════════════════════════════════

  var TYPES = {
    // Scalar
    integer:   'integer',    // slider or number input
    float:     'float',      // slider or number input
    boolean:   'boolean',    // toggle
    string:    'string',     // text input
    // Visual
    color:     'color',      // colour picker
    // Data
    array:     'array',      // dynamic row editor (itemSchema defines each row)
    object:    'object',     // grouped sub-properties (schema defines each key)
    // Special
    sensor:    'sensor',     // dropdown of available sensors + simulate slider
    fn:        'fn',         // inline code editor with live preview
    enum:      'enum',       // dropdown (values: [...])
    nodeList:  'nodeList',   // flow-map node editor (id, label, shape, color, x, y)
    edgeList:  'edgeList',   // flow-map edge editor (from, to, label)
    arrowList: 'arrowList',  // arrow-map arrow editor
    markList:  'markList',   // number-line mark editor
    streamList:'streamList', // time-graph stream editor
    setList:   'setList',    // venn set editor
    dataTable: 'dataTable'   // bar/pie chart data editor (label, value, color)
  };

  // ── Property descriptor builder helpers ─────────────────────────────────────
  function prop(name, type, label, defaultVal, extra) {
    return Object.assign({ name: name, type: type, label: label, default: defaultVal }, extra || {});
  }
  function intProp(name, label, def, min, max)   { return prop(name, TYPES.integer, label, def, { min: min, max: max, widget: 'slider' }); }
  function floatProp(name, label, def, min, max, step) { return prop(name, TYPES.float, label, def, { min: min, max: max, step: step || 0.01, widget: 'slider' }); }
  function boolProp(name, label, def)             { return prop(name, TYPES.boolean, label, def, { widget: 'toggle' }); }
  function colorProp(name, label, def)            { return prop(name, TYPES.color, label, def || '#4dabf7', { widget: 'colorpicker' }); }
  function strProp(name, label, def)              { return prop(name, TYPES.string, label, def, { widget: 'text' }); }
  function enumProp(name, label, values, def)     { return prop(name, TYPES.enum, label, def || values[0], { values: values, widget: 'dropdown' }); }
  function sensorProp(name, label)                { return prop(name, TYPES.sensor, label, null, { widget: 'sensordropdown', nullable: true }); }
  function fnProp(name, label, placeholder)       { return prop(name, TYPES.fn, label, null, { placeholder: placeholder || 'Math.sin(x)', widget: 'codeeditor' }); }

  // Shared property groups used by many factories
  var SHARED = {
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

  // ═══════════════════════════════════════════════════════════════════════════
  // Factory schema registry
  // Each entry describes one factory completely.
  // ═══════════════════════════════════════════════════════════════════════════

  var _registry = [

    // ── Static factories (svg-factories.js) ───────────────────────────────────

    {
      id: 'venn',
      label: 'Venn Diagram',
      category: 'comparison',
      description: 'Two or three overlapping sets. Use to compare groups or show shared properties.',
      icon: '⭕',
      factory: 'venn',
      dynamic: false,
      previewDefaults: {
        title: 'Venn Diagram',
        sets: [
          { label: 'Set A', items: ['apple', 'bat', 'cat'], color: '#4dabf7' },
          { label: 'Set B', items: ['cat', 'dog', 'eel'],  color: '#ff6b35' }
        ]
      },
      props: [
        SHARED.title, SHARED.w, SHARED.h,
        prop('sets', TYPES.setList, 'Sets', [
          { label: 'Set A', items: [], color: '#4dabf7' },
          { label: 'Set B', items: [], color: '#ff6b35' }
        ], { minItems: 2, maxItems: 3 })
      ]
    },

    {
      id: 'barGraph',
      label: 'Bar Graph',
      category: 'data',
      description: 'Vertical bars comparing values across categories.',
      icon: '📊',
      factory: 'barGraph',
      dynamic: false,
      previewDefaults: {
        title: 'Bar Graph',
        data: [
          { label: 'Mon', value: 40 },
          { label: 'Tue', value: 65 },
          { label: 'Wed', value: 30 },
          { label: 'Thu', value: 80 }
        ],
        yLabel: 'Count'
      },
      props: [
        SHARED.title, SHARED.w, SHARED.h,
        prop('data', TYPES.dataTable, 'Data', [], { columns: ['label','value','color?'] }),
        SHARED.yLabel,
        floatProp('yMax', 'Y axis max (0 = auto)', 0, 0, 10000),
        boolProp('horizontal', 'Horizontal bars', false)
      ]
    },

    {
      id: 'pieChart',
      label: 'Pie Chart',
      category: 'data',
      description: 'Proportional slices. Supports donut style.',
      icon: '🥧',
      factory: 'pieChart',
      dynamic: false,
      previewDefaults: {
        title: 'Pie Chart',
        data: [
          { label: 'A', value: 40 },
          { label: 'B', value: 30 },
          { label: 'C', value: 30 }
        ]
      },
      props: [
        SHARED.title, SHARED.w, SHARED.h,
        prop('data', TYPES.dataTable, 'Data', [], { columns: ['label','value','color?'] }),
        boolProp('donut', 'Donut style', false)
      ]
    },

    {
      id: 'numberLine',
      label: 'Number Line',
      category: 'number',
      description: 'Horizontal number line with tick marks and optional labelled points.',
      icon: '↔️',
      factory: 'numberLine',
      dynamic: false,
      previewDefaults: {
        title: 'Number Line',
        min: 0, max: 10, step: 1,
        marks: [{ value: 3, label: 'x', color: '#ff6b35' }]
      },
      props: [
        SHARED.title, SHARED.w, SHARED.h,
        floatProp('min', 'Min', 0, -1000, 0),
        floatProp('max', 'Max', 10, 0, 1000),
        floatProp('step', 'Tick interval', 1, 0.1, 100),
        prop('marks', TYPES.markList, 'Marks', [], { columns: ['value','label?','color?','arrow?'] })
      ]
    },

    {
      id: 'balanceScale',
      label: 'Balance Scale',
      category: 'comparison',
      description: 'Visual scale that tilts based on left/right values. Good for equation balance.',
      icon: '⚖️',
      factory: 'balanceScale',
      dynamic: false,
      previewDefaults: {
        title: 'Balance Scale',
        left:  { label: 'Left',  value: 3 },
        right: { label: 'Right', value: 7 }
      },
      props: [
        SHARED.title, SHARED.w, SHARED.h,
        prop('left',  TYPES.object, 'Left pan',  { label: 'Left',  value: 1 },
          { schema: [strProp('label','Label','Left'), floatProp('value','Value',1,-999,999), colorProp('color','Colour')] }),
        prop('right', TYPES.object, 'Right pan', { label: 'Right', value: 1 },
          { schema: [strProp('label','Label','Right'), floatProp('value','Value',1,-999,999), colorProp('color','Colour')] })
      ]
    },

    {
      id: 'clockFace',
      label: 'Clock Face',
      category: 'time',
      description: 'Analogue clock at a specified time. Add digital display optionally.',
      icon: '🕐',
      factory: 'clockFace',
      dynamic: false,
      previewDefaults: { hours: 3, minutes: 15, showDigital: true, label: 'Quarter past three' },
      props: [
        SHARED.w, SHARED.h,
        intProp('hours',   'Hours',   3,  0, 12),
        intProp('minutes', 'Minutes', 15, 0, 59),
        boolProp('showDigital', 'Show digital time', false),
        strProp('label', 'Label below clock', '')
      ]
    },

    {
      id: 'flowMap',
      label: 'Flow Map',
      category: 'process',
      description: 'Directed graph of nodes and edges. Use for processes, cycles, or concept maps.',
      icon: '🔀',
      factory: 'flowMap',
      dynamic: false,
      previewDefaults: {
        title: 'Flow Map',
        nodes: [
          { id: 'a', label: 'Start', shape: 'oval',    color: '#4dabf7' },
          { id: 'b', label: 'Step',  shape: 'rect',    color: '#51cf66' },
          { id: 'c', label: 'End',   shape: 'diamond', color: '#ff6b35' }
        ],
        edges: [{ from: 'a', to: 'b', label: '' }, { from: 'b', to: 'c', label: '' }]
      },
      props: [
        SHARED.title, SHARED.w, SHARED.h,
        prop('nodes', TYPES.nodeList, 'Nodes', [], { columns: ['id','label','shape','color?','x?','y?'] }),
        prop('edges', TYPES.edgeList, 'Edges', [], { columns: ['from','to','label?'] })
      ]
    },

    {
      id: 'polygon',
      label: 'Polygon (static)',
      category: 'geometry',
      description: 'Regular polygon with optional vertex labels. For dynamic version use Polygon Dynamic.',
      icon: '⬡',
      factory: 'polygon',
      dynamic: false,
      previewDefaults: { title: 'Hexagon', sides: 6, vertexLabels: ['A','B','C','D','E','F'] },
      props: [
        SHARED.title, SHARED.w, SHARED.h,
        intProp('sides', 'Sides', 6, 3, 12),
        SHARED.color, SHARED.fillOpacity,
        boolProp('filled', 'Filled', true),
        prop('vertexLabels', TYPES.array, 'Vertex labels', [], { itemType: TYPES.string })
      ]
    },

    {
      id: 'axis',
      label: 'Axis Plot (simple)',
      category: 'data',
      description: 'A simple axis with tick marks and optional function curve. For full algebra use Cartesian Grid.',
      icon: '📈',
      factory: 'axis',
      dynamic: false,
      previewDefaults: {
        title: 'Axis', min: 0, max: 10, step: 2,
        values: [{ x: 5, label: 'peak', color: '#ff6b35' }]
      },
      props: [
        SHARED.title, SHARED.w, SHARED.h,
        floatProp('min',  'Min', 0, -1000, 0),
        floatProp('max',  'Max', 10, 0, 1000),
        floatProp('step', 'Tick interval', 1, 0.01, 100),
        SHARED.xLabel, SHARED.yLabel,
        fnProp('fn', 'Function y = f(x)', 'Math.sin(x)'),
        prop('values', TYPES.markList, 'Marked points', [], { columns: ['x','label?','color?'] })
      ]
    },

    {
      id: 'tree',
      label: 'Tree (hierarchical)',
      category: 'process',
      description: 'Hierarchical tree with labelled nodes and connecting edges.',
      icon: '🌳',
      factory: 'tree',
      dynamic: false,
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
        prop('root', TYPES.object, 'Root node', { label: 'Root' }, {
          schema: [
            strProp('label', 'Label', 'Root'),
            colorProp('color', 'Colour')
          ]
        })
      ]
    },

    // ── Dynamic factories (svg-factories-dynamic.js) ──────────────────────────

    {
      id: 'numberLineDynamic',
      label: 'Number Line (dynamic)',
      category: 'number',
      description: 'Number line with a moving ball driven by sensor data or bounce animation.',
      icon: '↔️✨',
      factory: 'numberLineDynamic',
      dynamic: true,
      stageRequired: true,
      previewDefaults: {
        title: 'Dynamic Number Line',
        min: 0, max: 10, step: 2, bounce: true, bounceSpeed: 3, ballColor: '#ff6b35'
      },
      props: [
        SHARED.title, SHARED.w, SHARED.h,
        floatProp('min', 'Min', 0, -1000, 0),
        floatProp('max', 'Max', 10, 0, 1000),
        floatProp('step', 'Tick interval', 1, 0.1, 100),
        SHARED.sensor, SHARED.sensorMin, SHARED.sensorMax,
        boolProp('bounce', 'Bounce animation (no sensor)', true),
        floatProp('bounceSpeed', 'Bounce speed (units/s)', 3, 0.1, 30),
        colorProp('ballColor', 'Ball colour', '#ff6b35'),
        prop('marks', TYPES.markList, 'Static marks', [], { columns: ['value','label?','color?'] })
      ]
    },

    {
      id: 'clockFaceDynamic',
      label: 'Clock Face (dynamic)',
      category: 'time',
      description: 'Live clock that tracks real time, a sensor stream, or manual input.',
      icon: '🕐✨',
      factory: 'clockFaceDynamic',
      dynamic: true,
      stageRequired: true,
      previewDefaults: { mode: 'realtime', showDigital: true },
      props: [
        SHARED.h,
        enumProp('mode', 'Mode', ['realtime', 'sensor', 'manual'], 'realtime'),
        SHARED.sensor,
        intProp('hours',   'Initial hours',   12, 0, 12),
        intProp('minutes', 'Initial minutes',  0, 0, 59),
        boolProp('showDigital', 'Show digital time', true),
        strProp('label', 'Label', '')
      ]
    },

    {
      id: 'timeGraph',
      label: 'Time Graph',
      category: 'sensor',
      description: 'Scrolling real-time graph of sensor streams. Looks like phyphox.',
      icon: '📉',
      factory: 'timeGraph',
      dynamic: true,
      stageRequired: true,
      previewDefaults: {
        title: 'Time Graph',
        windowSeconds: 5,
        streams: [{ sensor: null, label: 'Stream 1', color: '#ff6b35', yMin: 0, yMax: 10 }]
      },
      props: [
        SHARED.title, SHARED.w, SHARED.h,
        floatProp('windowSeconds', 'Time window (s)', 5, 1, 60),
        SHARED.xLabel,
        prop('streams', TYPES.streamList, 'Sensor streams', [], {
          columns: ['sensor','label','color','yMin','yMax']
        })
      ]
    },

    {
      id: 'arrowMap',
      label: 'Arrow Map',
      category: 'geography',
      description: 'Animated arrows on a background image. Use for maps, biology diagrams, historical events.',
      icon: '🗺️',
      factory: 'arrowMap',
      dynamic: true,
      stageRequired: true,
      previewDefaults: {
        title: 'Arrow Map',
        arrows: [
          { id: 'a1', from: { x: 0.1, y: 0.5 }, to: { x: 0.9, y: 0.3 },
            label: 'Route', color: '#4dabf7', width: 3 }
        ]
      },
      props: [
        SHARED.title, SHARED.w, SHARED.h,
        strProp('background', 'Background image URL', ''),
        floatProp('bgOpacity', 'Background opacity', 1, 0, 1, 0.05),
        boolProp('timeline', 'Timeline mode (progressive)', false),
        prop('arrows', TYPES.arrowList, 'Arrows', [], {
          columns: ['id','from','to','via?','label','sublabel?','color','width',
                    'startTime?','endTime?','pulse?','sensor?']
        })
      ]
    },

    {
      id: 'gauge',
      label: 'Gauge / Meter',
      category: 'sensor',
      description: 'Dial gauge showing a single value via needle and colour zones. Sensor-driven or static.',
      icon: '🎛️',
      factory: 'gauge',
      dynamic: true,
      stageRequired: true,
      previewDefaults: {
        title: 'Acceleration', min: 0, max: 20, unit: 'm/s²',
        ticks: 5, animate: true, speed: 3,
        zones: [
          { from: 0, to: 0.5, color: '#4ade80' },
          { from: 0.5, to: 0.75, color: '#facc15' },
          { from: 0.75, to: 1.0, color: '#f87171' }
        ]
      },
      props: [
        SHARED.title, SHARED.w, SHARED.h,
        floatProp('min', 'Scale minimum', 0, -1000, 10000),
        floatProp('max', 'Scale maximum', 10, -1000, 10000),
        strProp('unit', 'Unit label', ''),
        intProp('ticks', 'Tick divisions', 5, 2, 20),
        SHARED.sensor, SHARED.sensorMin, SHARED.sensorMax,
        floatProp('value', 'Static value (no sensor)', 0, -1000, 10000),
        SHARED.animate, SHARED.speed,
        prop('zones', TYPES.array, 'Colour zones', [
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

    // ── Geometry factories (svg-factories-geometry.js) ────────────────────────

    {
      id: 'polygonDynamic',
      label: 'Polygon (dynamic)',
      category: 'geometry',
      description: 'Regular or custom polygon with rotation, scale, and triangle decomposition.',
      icon: '⬡✨',
      factory: 'polygonDynamic',
      dynamic: true,
      stageRequired: true,
      previewDefaults: {
        title: 'Polygon', sides: 6, rotateAnimation: true, rotateSpeed: 30,
        showCentroid: true, showVertexLabels: true
      },
      props: [
        SHARED.title, SHARED.w, SHARED.h,
        intProp('sides', 'Sides (regular polygon)', 6, 3, 24),
        floatProp('r', 'Circumradius (px)', 90, 20, 300),
        SHARED.color, SHARED.fillOpacity,
        boolProp('showCentroid',     'Show centroid',      false),
        boolProp('showVertexLabels', 'Vertex labels (A, B, C…)', false),
        boolProp('showSideLabels',   'Side lengths',       false),
        boolProp('showAngles',       'Interior angles',    false),
        // Rotation
        floatProp('rotate',       'Initial rotation (°)', 0, 0, 360),
        boolProp('rotateAnimation','Auto-rotate',          false),
        floatProp('rotateSpeed',  'Rotation speed (°/s)',  30, 1, 360),
        sensorProp('rotateSensor', 'Rotation sensor'),
        floatProp('rotateSensorMin', 'Sensor → 0°',  0, -100, 100),
        floatProp('rotateSensorMax', 'Sensor → 360°',10, -100, 100),
        enumProp('rotateOrigin', 'Pivot point',
          ['centroid','vertex:0','vertex:1','vertex:2'], 'centroid'),
        // Scale
        floatProp('scale', 'Initial scale', 1, 0.1, 5),
        boolProp('scaleAnimation', 'Breathing scale animation', false),
        floatProp('scaleMin', 'Scale min', 0.7, 0.1, 1),
        floatProp('scaleMax', 'Scale max', 1.3, 1,   5),
        sensorProp('scaleSensor', 'Scale sensor'),
        // Decomposition
        enumProp('decompose', 'Decomposition', ['none','triangles'], 'none'),
        boolProp('decomposeAnimate', 'Animate decomposition', true)
      ]
    },

    {
      id: 'cartesianGrid',
      label: 'Cartesian Grid',
      category: 'geometry',
      description: 'Full coordinate plane with function plots, tangent lines, slope triangles, and vectors.',
      icon: '📐',
      factory: 'cartesianGrid',
      dynamic: true,
      stageRequired: true,
      // cartesianGrid returns a grid object — extra overlays are specified separately
      overlays: ['plot','point','segment','vector','tangent','slopeTriangle','secant','animate'],
      previewDefaults: {
        title: 'Cartesian Grid',
        xMin: -5, xMax: 5, yMin: -4, yMax: 4,
        xLabel: 'x', yLabel: 'y',
        showGrid: true
      },
      props: [
        SHARED.title, SHARED.w, SHARED.h,
        SHARED.xMin, SHARED.xMax, SHARED.yMin, SHARED.yMax,
        floatProp('xStep', 'X tick interval', 1, 0.1, 10),
        floatProp('yStep', 'Y tick interval', 1, 0.1, 10),
        SHARED.xLabel, SHARED.yLabel,
        boolProp('showGrid',      'Major grid lines', true),
        boolProp('showMinorGrid', 'Minor grid lines', false),
        boolProp('labelAxes',     'Axis labels',      true),
        // Overlays (WYSIWYG renders each as a sub-panel)
        prop('plots', TYPES.array, 'Function plots', [], {
          itemSchema: [
            fnProp('fn', 'y = f(x)', 'Math.sin(x)'),
            colorProp('color', 'Colour'),
            floatProp('width', 'Line width', 2.5, 0.5, 8),
            boolProp('dashed', 'Dashed line', false),
            strProp('layer', 'Layer name (unique)', '')
          ]
        }),
        prop('points', TYPES.array, 'Points', [], {
          itemSchema: [
            floatProp('x', 'x', 0, -100, 100),
            floatProp('y', 'y', 0, -100, 100),
            colorProp('color', 'Colour'),
            strProp('label', 'Label', ''),
            boolProp('project', 'Projection lines', false),
            boolProp('showCoords', 'Show coordinates', false)
          ]
        }),
        prop('vectors', TYPES.array, 'Vectors', [], {
          itemSchema: [
            floatProp('x',  'Origin x', 0, -100, 100),
            floatProp('y',  'Origin y', 0, -100, 100),
            floatProp('dx', 'Δx', 1, -100, 100),
            floatProp('dy', 'Δy', 1, -100, 100),
            colorProp('color', 'Colour'),
            strProp('label', 'Label', '')
          ]
        }),
        prop('slopeTriangles', TYPES.array, 'Slope triangles', [], {
          itemSchema: [
            fnProp('fn', 'y = f(x)', '0.5 * x'),
            floatProp('x1', 'x₁', 1, -100, 100),
            floatProp('x2', 'x₂', 3, -100, 100)
          ]
        }),
        prop('tangents', TYPES.array, 'Tangent lines', [], {
          itemSchema: [
            fnProp('fn', 'y = f(x)', 'x * x'),
            floatProp('x', 'x', 0, -100, 100),
            colorProp('color', 'Colour', '#996600'),
            boolProp('showSlope', 'Show slope label', true)
          ]
        }),
        prop('animatedPlot', TYPES.object, 'Animated plot', null, {
          nullable: true,
          schema: [
            fnProp('fn', 'y = f(x, t) — write as a JS function body returning f(x)',
              'return Math.sin(x + t)'),
            colorProp('color', 'Colour')
          ]
        })
      ]
    },

    {
      id: 'unitCircle',
      label: 'Unit Circle',
      category: 'geometry',
      description: 'Animated trig unit circle. Shows sin, cos, tan projections. Sensor or auto-rotate.',
      icon: '🔵📐',
      factory: 'unitCircle',
      dynamic: true,
      stageRequired: true,
      previewDefaults: {
        title: 'Unit Circle', angleDeg: 45, animate: false,
        showSine: true, showCosine: true, showValues: true
      },
      props: [
        SHARED.title, SHARED.w, SHARED.h,
        floatProp('angleDeg', 'Initial angle (°)', 45, 0, 360),
        boolProp('animate',    'Auto-rotate',    false),
        floatProp('speed',     'Speed (°/s)',     45, 1, 360),
        sensorProp('sensor',   'Angle sensor'),
        floatProp('sensorMin', 'Sensor → 0°',     0, -100, 100),
        floatProp('sensorMax', 'Sensor → 360°',  10, -100, 100),
        boolProp('showSine',    'Show sine',      true),
        boolProp('showCosine',  'Show cosine',    true),
        boolProp('showTangent', 'Show tangent',   false),
        boolProp('showValues',  'Numeric readout',true)
      ]
    }

  ];

  // ═══════════════════════════════════════════════════════════════════════════
  // Spec format
  // A visual spec is what the WYSIWYG saves and the lesson runtime restores.
  //
  // Single factory:
  //   { factory: 'barGraph', opts: { title: '...', data: [...] } }
  //
  // Composed (multiple factories on one stage):
  //   { compose: true, w:400, h:300,
  //     layers: [
  //       { factory: 'cartesianGrid', opts: { ... }, name: 'grid' },
  //       { factory: 'polygonDynamic', opts: { ... }, name: 'poly' }
  //     ]
  //   }
  // ═══════════════════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════════════════════════

  var Registry = {

    // ── Discovery ─────────────────────────────────────────────────────────────

    /** Return all registered factory descriptors */
    all: function () { return _registry.slice(); },

    /** Return descriptors filtered by category */
    byCategory: function (cat) {
      return _registry.filter(function (d) { return d.category === cat; });
    },

    /** Return all unique category names */
    categories: function () {
      var cats = [], seen = {};
      _registry.forEach(function (d) {
        if (!seen[d.category]) { cats.push(d.category); seen[d.category] = true; }
      });
      return cats;
    },

    /** Return a single descriptor by factory id */
    get: function (id) {
      return _registry.find(function (d) { return d.id === id; }) || null;
    },

    // ── Schema ────────────────────────────────────────────────────────────────

    /**
     * Return the full property schema for a factory.
     * The WYSIWYG uses this to build its property panel.
     */
    schema: function (id) {
      var desc = Registry.get(id);
      if (!desc) return null;
      return {
        id:          desc.id,
        label:       desc.label,
        category:    desc.category,
        description: desc.description,
        dynamic:     desc.dynamic,
        stageRequired: !!desc.stageRequired,
        overlays:    desc.overlays || [],
        props:       desc.props
      };
    },

    /**
     * Return default opts for a factory (pulled from prop.default values).
     * The WYSIWYG uses this to seed a new instance.
     */
    defaults: function (id) {
      var desc = Registry.get(id);
      if (!desc) return {};
      var out = {};
      (desc.props || []).forEach(function (p) {
        if (p.default !== undefined && p.default !== null) out[p.name] = p.default;
      });
      return out;
    },

    // ── Preview ───────────────────────────────────────────────────────────────

    /**
     * Render a live preview of a factory into a container element.
     * Uses previewDefaults merged with any supplied opts.
     * For stageRequired factories, creates and returns a managed Stage.
     * Returns { stage, result } — call stage.destroy() to clean up.
     *
     * @param {string}      id         factory id
     * @param {HTMLElement} container
     * @param {object}      opts       override any preview defaults
     */
    preview: function (id, container, opts) {
      var desc = Registry.get(id);
      if (!desc) { console.warn('[REGISTRY] Unknown factory:', id); return null; }

      var mergedOpts = Object.assign({}, desc.previewDefaults || {}, opts || {});
      var factory = SVG[desc.factory];
      if (!factory) { console.warn('[REGISTRY] Factory function not found:', desc.factory); return null; }

      if (desc.stageRequired) {
        var stage = SVG.stage(container, {
          w: mergedOpts.w || 420,
          h: mergedOpts.h || 280,
          background: '#F4F1E8'
        });
        var result = factory(stage, mergedOpts);
        return { stage: stage, result: result };
      } else {
        var result = factory(container, mergedOpts);
        return { stage: null, result: result };
      }
    },

    // ── Serialization ─────────────────────────────────────────────────────────

    /**
     * Produce a JSON-serialisable spec from a factory id and opts.
     * This is what the WYSIWYG saves; the spec can be stored in lesson YAML.
     */
    serialize: function (id, opts) {
      return { factory: id, opts: opts || {} };
    },

    /**
     * Produce a composed spec from an array of layer descriptors.
     */
    serializeCompose: function (layers, stageOpts) {
      return Object.assign({ compose: true }, stageOpts || {}, { layers: layers });
    },

    // ── Validation (A2.5: coerce/clamp numeric params; return sanitized spec) ──

    /**
     * Validate and sanitize a spec. Coerces numeric params, clamps to min/max.
     * Returns sanitized spec or throws on irrecoverable error (unknown factory, invalid structure).
     *
     * @param {object} spec   { factory, opts } or { compose: true, layers: [...] }
     * @returns {object}      sanitized spec
     */
    validateSpec: function (spec) {
      if (!spec || typeof spec !== 'object') {
        throw new Error('validateSpec: spec must be an object');
      }
      if (spec.compose) {
        return Registry.validateComposeSpec(spec);
      }
      if (!spec.factory || typeof spec.factory !== 'string') {
        throw new Error('validateSpec: spec must have factory (string)');
      }
      var desc = Registry.get(spec.factory);
      if (!desc) {
        throw new Error('validateSpec: unknown factory "' + spec.factory + '"');
      }
      var opts = spec.opts && typeof spec.opts === 'object' ? spec.opts : {};
      var sanitized = Registry.sanitizeOpts(desc, opts);
      return { factory: spec.factory, opts: sanitized };
    },

    /**
     * Sanitize opts against a factory's prop schema. Coerces and clamps primitives.
     */
    sanitizeOpts: function (desc, opts) {
      var out = {};
      var props = desc.props || [];
      var defs = desc.previewDefaults || {};
      for (var i = 0; i < props.length; i++) {
        var p = props[i];
        var name = p.name;
        var val = opts[name];
        if (val === undefined && defs[name] !== undefined) {
          val = defs[name];
        }
        out[name] = Registry.coerceProp(val, p, defs[name]);
      }
      return out;
    },

    coerceProp: function (val, prop, fallback) {
      var t = prop.type;
      var def = prop.default !== undefined ? prop.default : fallback;
      if (val === undefined || val === null) return def;
      if (t === TYPES.integer || t === TYPES.float) {
        var n = Number(val);
        if (n !== n) return def !== undefined ? def : 0;
        var min = prop.min;
        var max = prop.max;
        if (typeof min === 'number' && n < min) n = min;
        if (typeof max === 'number' && n > max) n = max;
        return t === TYPES.integer ? Math.round(n) : n;
      }
      if (t === TYPES.boolean) {
        return val === true || val === 'true' || val === 1;
      }
      if (t === TYPES.string || t === TYPES.color) {
        return String(val);
      }
      if (t === TYPES.enum && prop.values && Array.isArray(prop.values)) {
        if (prop.values.indexOf(val) !== -1) return val;
        return def !== undefined ? def : prop.values[0];
      }
      return val;
    },

    validateComposeSpec: function (spec) {
      var layers = spec.layers;
      if (!Array.isArray(layers)) {
        throw new Error('validateSpec: compose spec must have layers array');
      }
      var out = { compose: true };
      if (typeof spec.w === 'number') out.w = spec.w;
      if (typeof spec.h === 'number') out.h = spec.h;
      if (typeof spec.background === 'string') out.background = spec.background;
      out.layers = [];
      for (var i = 0; i < layers.length; i++) {
        var layer = layers[i];
        if (!layer || !layer.factory) continue;
        var layerSanitized = Registry.validateSpec(layer);
        var merged = {};
        for (var k in layer) { if (Object.prototype.hasOwnProperty.call(layer, k)) merged[k] = layer[k]; }
        merged.opts = layerSanitized.opts;
        out.layers.push(merged);
      }
      return out;
    },

    // ── Deserialization (runtime) ─────────────────────────────────────────────

    /**
     * Instantiate a single factory from a spec.
     * Uses validateSpec to coerce malformed params before rendering.
     * Returns { stage, result } — same shape as preview().
     *
     * @param {object}      spec        { factory, opts }
     * @param {HTMLElement} container
     */
    fromSpec: function (spec, container) {
      var safe = Registry.validateSpec(spec);
      if (safe.compose) {
        return Registry.fromComposeSpec(safe, container);
      }
      return Registry.preview(safe.factory, container, safe.opts);
    },

    /**
     * Instantiate a composed multi-layer visual from a compose spec.
     * Returns { stage, results: {layerName: result} }
     */
    fromComposeSpec: function (spec, container) {
      var stage = SVG.stage(container, {
        w: spec.w || 420,
        h: spec.h || 280,
        background: spec.background || '#F4F1E8'
      });
      var results = {};
      (spec.layers || []).forEach(function (layerSpec) {
        var desc = Registry.get(layerSpec.factory);
        if (!desc) { console.warn('[REGISTRY] Unknown factory in compose:', layerSpec.factory); return; }
        var factory = SVG[desc.factory];
        if (!factory) return;
        var mergedOpts = Object.assign({}, desc.previewDefaults || {}, layerSpec.opts || {});
        results[layerSpec.name || layerSpec.factory] = factory(stage, mergedOpts);
      });
      return { stage: stage, results: results };
    },

    /**
     * Re-render an existing preview with updated opts (for live property editing).
     * Destroys the old stage if present and creates a fresh one.
     *
     * @param {string}      id
     * @param {HTMLElement} container
     * @param {object}      opts
     * @param {object}      prevHandle   { stage } returned by a previous preview() call
     */
    update: function (id, container, opts, prevHandle) {
      if (prevHandle && prevHandle.stage) prevHandle.stage.destroy();
      return Registry.preview(id, container, opts);
    },

    // ── Introspection helpers for WYSIWYG ─────────────────────────────────────

    /** Return the TYPES constant (widget type strings) */
    types: TYPES,

    /**
     * Return a flat map of { propName: currentValue } for a live stage's opts.
     * The WYSIWYG uses this to sync its property panel to a selected object.
     * Since we don't track live opts on the stage itself, the WYSIWYG must
     * maintain its own opts state and pass it here for round-tripping.
     */
    extractOpts: function (id, opts) {
      var desc = Registry.get(id);
      if (!desc) return opts || {};
      // Validate and fill missing keys with defaults
      var out = Object.assign({}, Registry.defaults(id), opts || {});
      return out;
    }
  };

  /**
   * Register a new factory at runtime.
   * Plugins call SVG.registerFactory(descriptor) where descriptor has at minimum:
   *   { id, label, category, factory (function name on SVG), props, previewDefaults }
   * The function must already exist on SVG (e.g. SVG.myFactory = function(...){})
   */
  Registry.registerFactory = function (desc) {
    if (!desc || !desc.id) return;
    if (_registry.some(function (d) { return d.id === desc.id; })) return;
    if (!desc.factory) desc.factory = desc.id;
    _registry.push(desc);
  };

  // ── Attach ──────────────────────────────────────────────────────────────────
  SVG.registry    = Registry.all;
  SVG.schema      = Registry.schema;
  SVG.defaults    = Registry.defaults;
  SVG.preview     = Registry.preview;
  SVG.serialize   = Registry.serialize;
  SVG.validateSpec = Registry.validateSpec;
  SVG.fromSpec    = Registry.fromSpec;
  SVG.update    = Registry.update;
  SVG.Registry  = Registry;   // full API on one object for the WYSIWYG
  SVG.registerFactory = Registry.registerFactory;

  if (global.AGNI_SHARED) global.AGNI_SHARED.svg = SVG;

  if (global.DEV_MODE) {
    console.log('[SVG-REGISTRY] loaded –', _registry.length, 'factories across',
      Registry.categories().join(', '));
  }

  // Node/portal export: single source for FACTORIES and CATEGORIES
  if (typeof module !== 'undefined' && module.exports) {
    var catMap = { comparison: 'Comparison', data: 'Data & Charts', number: 'Number', time: 'Time', process: 'Process', geometry: 'Geometry', sensor: 'Sensor', geography: 'Geography' };
    var catIcons = { comparison: '⚖️', data: '📊', number: '🔢', time: '🕐', process: '🔀', geometry: '📐', sensor: '📡', geography: '🗺️' };
    var catIds = Registry.categories();
    module.exports.FACTORIES = _registry.slice();
    module.exports.CATEGORIES = catIds.map(function (c) { return { id: c, label: catMap[c] || c, icon: catIcons[c] || '📊' }; });
  }

}(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : typeof global !== 'undefined' ? global : {})));
