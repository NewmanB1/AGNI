// src/runtime/player.js
// This file is injected into the HTML bundle.
// LESSON_DATA, OLS_SIGNATURE, OLS_INTENDED_OWNER are prepended by the compiler.

// ── Imports ── (these will be bundled/inlined by build process)
import { svgGenerators } from './svgLibrary.js'; // All generator functions live here
// import { SUPPORTED_SENSORS } from './sensorTypes.js'; // Uncomment when ready

// ── Global State ──
let currentStepIndex = 0;
let lesson = null; // Populated from LESSON_DATA
let sensorSubscriptions = new Map(); // sensorId → Set<callback>
let lastSensorValues = new Map(); // sensorId → latest value

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
      publishSensorReading({ sensorId: 'orientation.beta', value: e.beta || 0, timestamp: e.timeStamp });
      publishSensorReading({ sensorId: 'orientation.gamma', value: e.gamma || 0, timestamp: e.timeStamp });
    });
  }
  // Future: light, sound, magnetometer, etc. (via Permissions API + separate events)
}

// ── Device UUID Management (IndexedDB + spoof detection) ──

// Utility to generate UUID v4-like
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Simple fingerprint: hash of stable-ish browser properties (for basic tamper detection)
function getBrowserFingerprintHash() {
  const props = [
    navigator.userAgent,
    screen.width,
    screen.height,
    navigator.hardwareConcurrency || 'unknown',
    navigator.language || 'unknown',
  ].join('|');
  let hash = 0;
  for (let i = 0; i < props.length; i++) {
    hash = ((hash << 5) - hash) + props.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return hash.toString(16);
}

// Get persistent device UUID from IndexedDB, create if missing, with spoof check
async function getDeviceUUID() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ols_device_db', 1);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('device')) {
        db.createObjectStore('device', { keyPath: 'key' });
      }
    };

    request.onsuccess = (event) => {
      const db = event.target.result;
      const tx = db.transaction('device', 'readwrite');
      const store = tx.objectStore('device');

      const getReq = store.get('uuid');
      getReq.onsuccess = () => {
        const entry = getReq.result;
        const currentFingerprint = getBrowserFingerprintHash();

        if (entry) {
          // Integrity/spoof check
          if (entry.fingerprint !== currentFingerprint) {
            console.warn('Potential device spoof/tampering detected (fingerprint mismatch)');
            // For production: could force re-bind or add stricter checks
            reject(new Error('Device integrity check failed. Re-bind required.'));
            return;
          }
          resolve(entry.value);
        } else {
          // First time: generate and store
          const newUUID = generateUUID();
          store.put({ key: 'uuid', value: newUUID, fingerprint: currentFingerprint });
          resolve(newUUID);
        }
      };

      getReq.onerror = () => reject(getReq.error);
      tx.oncomplete = () => db.close();
    };

    request.onerror = () => reject(request.error);
  });
}

// ── Integrity & Binding Verification (now async) ──
async function verifyIntegrity() {
  const app = document.getElementById('app') || document.body;

  try {
    const currentUUID = await getDeviceUUID();

    if (currentUUID !== OLS_INTENDED_OWNER) {
      app.innerHTML = `
        <div class="error-screen" style="padding: 2rem; text-align: center; background: #111; color: #fff;">
          <h1>🔒 Security Alert</h1>
          <p>This lesson is bound to device ID: <code>${OLS_INTENDED_OWNER}</code></p>
          <p>Your current device ID: <code>${currentUUID}</code></p>
          <p>Possible causes: factory reset, app data cleared, or unauthorized copy.</p>
          <p>Please connect to the <strong>Village Hub</strong> to re-authorize this device.</p>
          <button onclick="location.reload()" style="margin-top:1rem; padding:0.8rem 1.5rem;">Retry</button>
        </div>
      `;
      return false;
    }

    // Future: Add signature verification here (using OLS_SIGNATURE)
    // e.g., if (typeof verifySignature === 'function') verifySignature(LESSON_DATA, OLS_SIGNATURE);

    return true;
  } catch (err) {
    console.error('UUID/Integrity error:', err);
    app.innerHTML = `
      <div class="error-screen" style="padding: 2rem; text-align: center; background: #111; color: #fff;">
        <h1>⚠️ Device Setup Error</h1>
        <p>Could not verify device identity: ${err.message}</p>
        <p>Please connect to the Village Hub to initialize or re-bind this device.</p>
      </div>
    `;
    return false;
  }
}

// ── Render a single step ──
function renderStep(step) {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = ''; // Clear previous

  const stepDiv = document.createElement('div');
  stepDiv.className = 'step';

  // Instruction / text (assumes Markdown → HTML already done by compiler)
  if (step.content) {
    const contentDiv = document.createElement('div');
    contentDiv.innerHTML = step.content;
    stepDiv.appendChild(contentDiv);
  }

  // Hardware trigger example
  if (step.type === 'hardware_trigger') {
    const instr = document.createElement('p');
    instr.textContent = step.content || 'Perform the required action...';
    stepDiv.appendChild(instr);

    // Placeholder threshold listener (customize per step later)
    subscribeToSensor('accel.magnitude', (reading) => {
      if (reading.value > 2.5) {
        vibrate('short');
        // TODO: advance step or complete trigger logic
      }
    });
  }

  // Visual / SVG with dynamic sensor bindings
  if (step.type === 'visual' && step.template && svgGenerators[step.template]) {
    const svgContainer = document.createElement('div');
    svgContainer.className = 'svg-container';

    const renderSvg = () => {
      const dynamicParams = { ...step.params };
      if (step.params?.sensorBindings) {
        Object.entries(step.params.sensorBindings).forEach(([key, sensorId]) => {
          const val = lastSensorValues.get(sensorId);
          if (val !== undefined) dynamicParams[key] = val;
        });
      }
      svgContainer.innerHTML = svgGenerators[step.template](dynamicParams);
    };

    renderSvg(); // Initial
    stepDiv.appendChild(svgContainer);

    // Auto-update on sensor changes
    if (step.params?.sensorBindings) {
      Object.values(step.params.sensorBindings).forEach(sensorId => {
        subscribeToSensor(sensorId, renderSvg);
      });
    }
  }

  app.appendChild(stepDiv);
}

// ── Main flow ──
async function initPlayer() {
  lesson = LESSON_DATA;
  if (!lesson || !Array.isArray(lesson.steps) || lesson.steps.length === 0) {
    document.body.innerHTML = '<h1>Error: Invalid or empty lesson data.</h1>';
    return;
  }

  startSensorListeners();
  renderStep(lesson.steps[currentStepIndex]);
}

// ── Entry point ──
window.addEventListener('load', async () => {
  if (await verifyIntegrity()) {
    initPlayer();
  }
  // Optional: Add global nextStep for manual / debug
  window.nextStep = () => {
    if (currentStepIndex < lesson?.steps.length - 1) {
      currentStepIndex++;
      renderStep(lesson.steps[currentStepIndex]);
    }
  };
});
