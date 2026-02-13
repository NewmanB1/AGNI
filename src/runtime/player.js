// src/runtime/player.js
// This file is injected into the HTML bundle.
// LESSON_DATA, OLS_SIGNATURE, OLS_INTENDED_OWNER are prepended by the compiler.

// ── Imports ── (these will be bundled/inlined by build process)
import { svgGenerators } from './svgLibrary.js';   // All generator functions live here
// import { SUPPORTED_SENSORS } from './sensorTypes.js';   // Uncomment when ready

// ── Global State ──
let currentStepIndex = 0;
let lesson = null;                      // Populated from LESSON_DATA
let sensorSubscriptions = new Map();    // sensorId → Set<callback>
let lastSensorValues = new Map();       // sensorId → latest value

// ── Utility: Safe haptic feedback ──
function vibrate(pattern = 'short') {
  if (!('vibrate' in navigator)) return;
  const patterns = {
    short: 50,
    medium: 150,
    long: 400,
    success: [50, 30, 50, 30, 100],
  };
  navigator.vibrate(patterns[pattern] || 100);
}

// ── Sensor Manager (simple pub/sub) ──
function subscribeToSensor(sensorId, callback) {
  if (!sensorSubscriptions.has(sensorId)) {
    sensorSubscriptions.set(sensorId, new Set());
  }
  sensorSubscriptions.get(sensorId).add(callback);
}

function unsubscribeFromSensor(sensorId, callback) {
  if (sensorSubscriptions.has(sensorId)) {
    sensorSubscriptions.get(sensorId).delete(callback);
    if (sensorSubscriptions.get(sensorId).size === 0) {
      sensorSubscriptions.delete(sensorId);
    }
  }
}

function publishSensorReading(reading) {
  lastSensorValues.set(reading.sensorId, reading.value);
  const subs = sensorSubscriptions.get(reading.sensorId);
  if (subs) {
    subs.forEach(cb => cb(reading));
  }
}

// ── Real sensor listeners (DeviceMotion + DeviceOrientation) ──
function startSensorListeners() {
  // Acceleration (including gravity)
  if (window.DeviceMotionEvent) {
    window.addEventListener('devicemotion', (e) => {
      const acc = e.accelerationIncludingGravity;
      if (acc) {
        const mag = Math.hypot(acc.x || 0, acc.y || 0, acc.z || 0);
        publishSensorReading({ sensorId: 'accel.x', value: acc.x || 0, timestamp: e.timeStamp });
        publishSensorReading({ sensorId: 'accel.y', value: acc.y || 0, timestamp: e.timeStamp });
        publishSensorReading({ sensorId: 'accel.z', value: acc.z || 0, timestamp: e.timeStamp });
        publishSensorReading({ sensorId: 'accel.magnitude', value: mag, timestamp: e.timeStamp });
      }
    });
  }

  // Orientation (tilt)
  if (window.DeviceOrientationEvent) {
    window.addEventListener('deviceorientation', (e) => {
      publishSensorReading({ sensorId: 'orientation.alpha', value: e.alpha || 0, timestamp: e.timeStamp });
      publishSensorReading({ sensorId: 'orientation.beta',  value: e.beta  || 0, timestamp: e.timeStamp });
      publishSensorReading({ sensorId: 'orientation.gamma', value: e.gamma || 0, timestamp: e.timeStamp });
    });
  }

  // Future: light, sound, magnetometer, etc. (via Permissions API + separate events)
  // e.g., navigator.permissions.query({name: 'ambient-light-sensor'})
}

// ── Integrity Check (unchanged from original) ──
function verifyIntegrity() {
  const localId = localStorage.getItem('ols_device_id');

  if (!localId) {
    document.body.innerHTML = '<h1>Error: Device ID missing.</h1>';
    return false;
  }

  if (localId !== OLS_INTENDED_OWNER) {
    document.body.innerHTML = `
      <div class="error-screen">
        <h1>🔒 Security Alert</h1>
        <p>This lesson is authorized for device: <code>${OLS_INTENDED_OWNER}</code></p>
        <p>Your device: <code>${localId}</code></p>
        <p>Please visit the Village Hub to authorize this device.</p>
      </div>
    `;
    return false;
  }

  return true;
}

// ── Render a single step ──
function renderStep(step) {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = ''; // Clear previous content

  const stepDiv = document.createElement('div');
  stepDiv.className = 'step';

  // Instruction / text
  if (step.content) {
    const contentDiv = document.createElement('div');
    contentDiv.innerHTML = step.content; // Assumes compiler already converted Markdown → HTML
    stepDiv.appendChild(contentDiv);
  }

  // Hardware trigger (e.g., shake, tilt)
  if (step.type === 'hardware_trigger') {
    const instr = document.createElement('p');
    instr.textContent = step.content || 'Perform action...';
    stepDiv.appendChild(instr);

    // Example: listen for threshold (placeholder)
    subscribeToSensor('accel.magnitude', (reading) => {
      if (reading.value > 2.5) { // simplistic threshold
        vibrate('short');
        // Advance step logic here
      }
    });
  }

  // Visual / SVG generator
  if (step.type === 'visual' && step.template && svgGenerators[step.template]) {
    const svgContainer = document.createElement('div');
    svgContainer.className = 'svg-container';

    // Pass params + live sensor bindings
    const renderSvg = () => {
      const dynamicParams = { ...step.params };

      // Inject live sensor values if bound
      if (step.params.sensorBindings) {
        Object.entries(step.params.sensorBindings).forEach(([key, sensorId]) => {
          const val = lastSensorValues.get(sensorId);
          if (val !== undefined) dynamicParams[key] = val;
        });
      }

      svgContainer.innerHTML = svgGenerators[step.template](dynamicParams);
    };

    renderSvg(); // Initial render
    stepDiv.appendChild(svgContainer);

    // Re-render on sensor change if bound
    if (step.params.sensorBindings) {
      Object.values(step.params.sensorBindings).forEach(sensorId => {
        subscribeToSensor(sensorId, () => renderSvg());
      });
    }
  }

  app.appendChild(stepDiv);
}

// ── Main flow ──
function initPlayer() {
  lesson = LESSON_DATA;

  if (!lesson || !Array.isArray(lesson.steps) || lesson.steps.length === 0) {
    document.body.innerHTML = '<h1>Error: Invalid lesson data.</h1>';
    return;
  }

  startSensorListeners(); // Begin polling sensors

  renderStep(lesson.steps[currentStepIndex]);
}

// ── Entry point ──
window.addEventListener('load', () => {
  if (verifyIntegrity()) {
    initPlayer();
  }
});

// Optional: Basic navigation (add buttons or swipe later)
function nextStep() {
  if (currentStepIndex < lesson.steps.length - 1) {
    currentStepIndex++;
    renderStep(lesson.steps[currentStepIndex]);
  }
}

// Expose for debugging / manual testing
window.nextStep = nextStep;
