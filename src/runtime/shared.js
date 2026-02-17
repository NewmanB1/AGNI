// src/runtime/shared.js – cached shared utilities for AGNI lessons
// This file should be distributed once and cached on edge devices

// ============================================================================
// SVG Generators – reusable parametric SVG elements
// ============================================================================

export const svgGenerators = {
  /**
   * Circle SVG element
   * @param {Object} props
   * @returns {string} SVG circle string
   */
  circle: (props = {}) => {
    const { cx = 50, cy = 50, r = 20, fill = 'blue', stroke = 'none', strokeWidth = 0 } = props;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
  },

  rect: (props = {}) => {
    const { x = 0, y = 0, width = 100, height = 100, fill = 'green', rx = 0, ry = 0, stroke = 'none', strokeWidth = 0 } = props;
    return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
  },

  line: (props = {}) => {
    const { x1 = 0, y1 = 0, x2 = 100, y2 = 100, stroke = 'black', strokeWidth = 2, strokeDasharray = 'none' } = props;
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-dasharray="${strokeDasharray}" />`;
  },

  ellipse: (props = {}) => {
    const { cx = 50, cy = 50, rx = 40, ry = 20, fill = 'purple', stroke = 'none', strokeWidth = 0 } = props;
    return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
  },

  path: (props = {}) => {
    const { d = 'M10 10 L90 90', fill = 'none', stroke = 'red', strokeWidth = 3 } = props;
    return `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
  },

  polygon: (props = {}) => {
    const { points = '50,10 90,90 10,90', fill = 'orange', stroke = 'none', strokeWidth = 0 } = props;
    return `<polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
  },

  text: (props = {}) => {
    const { x = 50, y = 50, text = 'Text', fontSize = 20, fill = 'white', textAnchor = 'middle' } = props;
    return `<text x="${x}" y="${y}" font-size="${fontSize}" fill="${fill}" text-anchor="${textAnchor}">${text}</text>`;
  }
};

/**
 * Helper to wrap any SVG element in a full <svg> tag with defaults
 * @param {string} innerSvg - inner SVG content from svgGenerators
 * @param {Object} svgProps - svg container props
 * @returns {string}
 */
export function createSvgElement(innerSvg, svgProps = {}) {
  const { width = 200, height = 200, viewBox = '0 0 100 100', style = '' } = svgProps;
  return `<svg width="${width}" height="${height}" viewBox="${viewBox}" style="${style}">
    ${innerSvg}
  </svg>`;
}

// ============================================================================
// Vibration & Feedback Utilities
// ============================================================================

export function vibrate(pattern = 'short', intensity = 1) {
  if (!('vibrate' in navigator)) return;

  const basePatterns = {
    short: 70,
    medium: 150,
    long: 400,
    success: [50, 30, 50, 30, 100],
    success_pattern: [100, 50, 100, 50, 150],
    error: 250,
    double: [80, 40, 80],
    triple: [60, 30, 60, 30, 60]
  };

  let pat = basePatterns[pattern] || 120;

  // Scale intensity (0–1) by adjusting duration (simple approximation)
  if (typeof pat === 'number') {
    pat = Math.round(pat * intensity);
  } else if (Array.isArray(pat)) {
    pat = pat.map(v => Math.round(v * intensity));
  }

  navigator.vibrate(pat);
  if (window.DEV_MODE) console.log(`[VIBRATE] ${pattern} (intensity ${intensity})`);
}

// ============================================================================
// Sensor Pub/Sub Helpers (shared across lessons)
// ============================================================================

const sensorSubscriptions = new Map(); // sensorId → Set<callback>
const lastSensorValues = new Map();    // sensorId → latest value

export function subscribeToSensor(sensorId, callback) {
  if (!sensorSubscriptions.has(sensorId)) {
    sensorSubscriptions.set(sensorId, new Set());
  }
  sensorSubscriptions.get(sensorId).add(callback);
}

export function unsubscribeFromSensor(sensorId, callback) {
  if (sensorSubscriptions.has(sensorId)) {
    const subs = sensorSubscriptions.get(sensorId);
    subs.delete(callback);
    if (subs.size === 0) sensorSubscriptions.delete(sensorId);
  }
}

export function publishSensorReading(reading) {
  lastSensorValues.set(reading.sensorId, reading.value);
  const subs = sensorSubscriptions.get(reading.sensorId);
  if (subs) {
    subs.forEach(cb => cb(reading));
  }
}

export function getSensorValue(sensorId) {
  return lastSensorValues.get(sensorId);
}

// ============================================================================
// Future Shared Helpers (add as needed)
// ============================================================================

// e.g. export function getDeviceInfo() { ... }
// e.g. export function throttle(fn, delay) { ... }
// e.g. export const defaultThresholds = { ... };

if (window.DEV_MODE) {
  console.log("[SHARED] shared-runtime loaded – svgGenerators, vibrate, sensor helpers ready");
}
