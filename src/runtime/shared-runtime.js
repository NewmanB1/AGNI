// shared-runtime.js – cached shared utilities for all AGNI lessons

// ============================================================================
// SVG Generators
// ============================================================================
const svgGenerators = {
  circle: function(props) {
    var cx = props.cx || 50, cy = props.cy || 50, r = props.r || 20, fill = props.fill || 'blue';
    return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + fill + '" />';
  },
  rect: function(props) {
    var x = props.x || 0, y = props.y || 0, w = props.width || 100, h = props.height || 100, fill = props.fill || 'green';
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + fill + '" />';
  },
  line: function(props) {
    var x1 = props.x1 || 0, y1 = props.y1 || 0, x2 = props.x2 || 100, y2 = props.y2 || 100, stroke = props.stroke || 'black', sw = props.strokeWidth || 2;
    return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + stroke + '" stroke-width="' + sw + '" />';
  },
  // Add ellipse, path, polygon, text, etc. as needed
};

// ============================================================================
// Vibration
// ============================================================================
function vibrate(pattern) {
  if (pattern === void 0) pattern = 'short';
  if (!('vibrate' in navigator)) return;
  var patterns = {
    short: 70,
    success_pattern: [100, 50, 100, 50, 150],
    error: 250
  };
  navigator.vibrate(patterns[pattern] || 120);
  if (window.DEV_MODE) console.log("[VIBRATE] " + pattern);
}

// ============================================================================
// Sensor Pub/Sub (shared state)
// ============================================================================
var sensorSubscriptions = new Map();
var lastSensorValues = new Map();

function subscribeToSensor(sensorId, callback) {
  if (!sensorSubscriptions.has(sensorId)) sensorSubscriptions.set(sensorId, new Set());
  sensorSubscriptions.get(sensorId).add(callback);
}

function publishSensorReading(reading) {
  lastSensorValues.set(reading.sensorId, reading.value);
  var subs = sensorSubscriptions.get(reading.sensorId);
  if (subs) subs.forEach(function(cb) { cb(reading); });
}

// Export everything needed by lessons
window.AGNI_SHARED = {
  svgGenerators: svgGenerators,
  vibrate: vibrate,
  subscribeToSensor: subscribeToSensor,
  publishSensorReading: publishSensorReading,
  lastSensorValues: lastSensorValues
};

if (window.DEV_MODE) console.log("[SHARED] AGNI shared-runtime loaded");
