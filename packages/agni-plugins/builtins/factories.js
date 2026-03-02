'use strict';

// Built-in SVG factory descriptors.
// This is the SINGLE SOURCE OF TRUTH for factory metadata.
//
// To add a new factory, add ONE entry here and write the implementation.
// The validator, portal, and browser registry all read from this file.

var reg = require('../registry');

// ── Static factories (svg-factories.js) ─────────────────────────────────────

reg.registerFactory({
  id: 'venn', label: 'Venn Diagram', category: 'comparison',
  description: 'Two or three overlapping sets. Use to compare groups or show shared properties.',
  icon: '⭕', dynamic: false,
  opts: ['title','w','h','sets']
});

reg.registerFactory({
  id: 'barGraph', label: 'Bar Graph', category: 'data',
  description: 'Vertical bars comparing values across categories.',
  icon: '📊', dynamic: false,
  opts: ['title','w','h','data','yLabel','yMax','horizontal']
});

reg.registerFactory({
  id: 'pieChart', label: 'Pie Chart', category: 'data',
  description: 'Proportional slices. Supports donut style.',
  icon: '🥧', dynamic: false,
  opts: ['title','w','h','data','donut']
});

reg.registerFactory({
  id: 'numberLine', label: 'Number Line', category: 'number',
  description: 'Horizontal number line with tick marks and optional labelled points.',
  icon: '↔️', dynamic: false,
  opts: ['title','w','h','min','max','step','marks']
});

reg.registerFactory({
  id: 'balanceScale', label: 'Balance Scale', category: 'comparison',
  description: 'Visual scale that tilts based on left/right values. Good for equation balance.',
  icon: '⚖️', dynamic: false,
  opts: ['title','w','h','left','right']
});

reg.registerFactory({
  id: 'clockFace', label: 'Clock Face', category: 'time',
  description: 'Analogue clock at a specified time. Add digital display optionally.',
  icon: '🕐', dynamic: false,
  opts: ['w','h','hours','minutes','showDigital','label']
});

reg.registerFactory({
  id: 'flowMap', label: 'Flow Map', category: 'process',
  description: 'Directed graph of nodes and edges. Use for processes, cycles, or concept maps.',
  icon: '🔀', dynamic: false,
  opts: ['title','w','h','nodes','edges']
});

reg.registerFactory({
  id: 'polygon', label: 'Polygon (static)', category: 'geometry',
  description: 'Regular polygon with optional vertex labels. For dynamic version use Polygon Dynamic.',
  icon: '⬡', dynamic: false,
  opts: ['title','w','h','sides','color','fillOpacity','filled','vertexLabels']
});

reg.registerFactory({
  id: 'axis', label: 'Axis Plot (simple)', category: 'data',
  description: 'A simple axis with tick marks and optional function curve. For full algebra use Cartesian Grid.',
  icon: '📈', dynamic: false,
  opts: ['title','w','h','min','max','step','xLabel','yLabel','fn','values']
});

reg.registerFactory({
  id: 'tree', label: 'Tree (hierarchical)', category: 'process',
  description: 'Hierarchical tree with labelled nodes and connecting edges.',
  icon: '🌳', dynamic: false,
  opts: ['title','w','h','root']
});

// ── Dynamic factories (svg-factories-dynamic.js) ────────────────────────────

reg.registerFactory({
  id: 'numberLineDynamic', label: 'Number Line (dynamic)', category: 'number',
  description: 'Number line with a moving ball driven by sensor data or bounce animation.',
  icon: '↔️✨', dynamic: true, stageRequired: true,
  opts: ['title','w','h','min','max','step','sensor','sensorMin','sensorMax',
         'bounce','bounceSpeed','ballColor','marks']
});

reg.registerFactory({
  id: 'clockFaceDynamic', label: 'Clock Face (dynamic)', category: 'time',
  description: 'Live clock that tracks real time, a sensor stream, or manual input.',
  icon: '🕐✨', dynamic: true, stageRequired: true,
  opts: ['h','mode','sensor','hours','minutes','showDigital','label']
});

reg.registerFactory({
  id: 'timeGraph', label: 'Time Graph', category: 'sensor',
  description: 'Scrolling real-time graph of sensor streams. Looks like phyphox.',
  icon: '📉', dynamic: true, stageRequired: true,
  opts: ['title','w','h','windowSeconds','xLabel','streams']
});

reg.registerFactory({
  id: 'arrowMap', label: 'Arrow Map', category: 'geography',
  description: 'Animated arrows on a background image. Use for maps, biology diagrams, historical events.',
  icon: '🗺️', dynamic: true, stageRequired: true,
  opts: ['title','w','h','background','bgOpacity','timeline','arrows']
});

reg.registerFactory({
  id: 'gauge', label: 'Gauge / Meter', category: 'sensor',
  description: 'Dial gauge showing a single value via needle and colour zones. Sensor-driven or static.',
  icon: '🎛️', dynamic: true, stageRequired: true,
  opts: ['title','w','h','min','max','unit','ticks','sensor','sensorMin','sensorMax',
         'value','animate','speed','zones']
});

// ── Geometry factories (svg-factories-geometry.js) ──────────────────────────

reg.registerFactory({
  id: 'polygonDynamic', label: 'Polygon (dynamic)', category: 'geometry',
  description: 'Regular or custom polygon with rotation, scale, and triangle decomposition.',
  icon: '⬡✨', dynamic: true, stageRequired: true,
  opts: ['title','w','h','sides','r','color','fillOpacity',
         'showCentroid','showVertexLabels','showSideLabels','showAngles',
         'rotate','rotateAnimation','rotateSpeed','rotateSensor','rotateSensorMin','rotateSensorMax','rotateOrigin',
         'scale','scaleAnimation','scaleMin','scaleMax','scaleSensor',
         'decompose','decomposeAnimate']
});

reg.registerFactory({
  id: 'cartesianGrid', label: 'Cartesian Grid', category: 'geometry',
  description: 'Full coordinate plane with function plots, tangent lines, slope triangles, and vectors.',
  icon: '📐', dynamic: true, stageRequired: true,
  opts: ['title','w','h','xMin','xMax','yMin','yMax','xStep','yStep','xLabel','yLabel',
         'showGrid','showMinorGrid','labelAxes',
         'plots','points','vectors','slopeTriangles','tangents','animatedPlot']
});

reg.registerFactory({
  id: 'unitCircle', label: 'Unit Circle', category: 'geometry',
  description: 'Animated trig unit circle. Shows sin, cos, tan projections. Sensor or auto-rotate.',
  icon: '🔵📐', dynamic: true, stageRequired: true,
  opts: ['title','w','h','angleDeg','animate','speed','sensor','sensorMin','sensorMax',
         'showSine','showCosine','showTangent','showValues']
});
