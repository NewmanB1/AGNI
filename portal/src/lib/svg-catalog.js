/**
 * SVG Factory Catalog
 *
 * FACTORIES and CATEGORIES are imported from @agni/runtime (single source of truth).
 * The runtime registry lives on the edge device (window.AGNI_SVG.Registry).
 * Portal-specific: EXPERIMENT_PRESETS, SENSOR_GROUPS, ALL_SENSORS.
 */

import { FACTORIES as _FACTORIES, CATEGORIES as _CATEGORIES } from '@agni/runtime/svg-catalog';

export const FACTORIES = _FACTORIES;
export const CATEGORIES = _CATEGORIES;

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
