// src/runtime/player.js
// Updated: February 2025 — dynamic thresholds + freefall duration + separated CONFIG

// ── CONFIG ── (all tunable / "add later" values live here — edit freely)
//     Keep this block at the top; later extract to config.js if needed

const CONFIG = {
  // Development & testing flags
  isDevMode: true,
  skipIntegrityCheck: true,
  fakeDeviceUUID: "emulator-test-uuid-1234-5678",

  // Security (fill in when ready for real devices)
  hubPublicKeyBase64: "", // ← paste real Ed25519 public key here later

  // Physics & UX tuning
  freefallThresholdG: 0.5,          // accel below this = freefall (in g)
  calibrationZThreshold: 9.0,       // accel.z > this = flat face-up (m/s²)
  freefallMinDurationSec: 0.3,      // minimum freefall time to trigger

  // Vibration patterns (can be overridden per-lesson via feedback)
  vibrationPatterns: {
    short: 50,
    medium: 150,
    long: 400,
    success: [50, 30, 50, 30, 100],
  },

  // Logging / debug level (0 = silent, 1 = important, 2 = verbose)
  debugLevel: 2,
};

// ── Helper: log only if debug is enabled ──
function log(...args) {
  if (CONFIG.debugLevel >= 1) console.log(...args);
}

// ── Global State ──
let currentStepIndex = 0;
let lesson = null;
let sensorSubscriptions = new Map();
let lastSensorValues = new Map();
let freefallStartTime = null;

// ── Utility: Vibration ──
function vibrate(patternName = 'short') {
  if (!('vibrate' in navigator)) return;
  const pattern = CONFIG.vibrationPatterns[patternName] || 100;
  navigator.vibrate(pattern);
  log(`Vibration triggered: ${patternName}`);
}

// ── Sensor pub/sub ──
function subscribeToSensor(sensorId, callback) {
  if (!sensorSubscriptions.has(sensorId)) sensorSubscriptions.set(sensorId, new Set());
  sensorSubscriptions.get(sensorId).add(callback);
}

function unsubscribeFromSensor(sensorId, callback) {
  if (sensorSubscriptions.has(sensorId)) {
    sensorSubscriptions.get(sensorId).delete(callback);
    if (sensorSubscriptions.get(sensorId).size === 0) sensorSubscriptions.delete(sensorId);
  }
}

function publishSensorReading(reading) {
  lastSensorValues.set(reading.sensorId, reading);
  const subs = sensorSubscriptions.get(reading.sensorId);
  if (subs) subs.forEach(cb => cb(reading));
}

// ── Normalize sensor values ──
function normalizeSensorValue(reading) {
  let value = reading.value;
  if (typeof value === 'number' && Math.abs(value) < 20) value *= 9.80665; // g → m/s²
  return value;
}

function getSensorNumericValue(sensorId) {
  const reading = lastSensorValues.get(sensorId);
  return reading ? normalizeSensorValue(reading) : null;
}

// ── Freefall duration tracker ──
function isInFreefall() {
  const mag = getSensorNumericValue('accel.magnitude');
  if (mag === null) return 0;

  if (mag < CONFIG.freefallThresholdG * 9.80665) {
    if (!freefallStartTime) freefallStartTime = performance.now();
    return (performance.now() - freefallStartTime) / 1000;
  }
  freefallStartTime = null;
  return 0;
}

// ── Safe expression evaluator ──
function evaluateThreshold(expression, getValueFn) {
  if (!expression || typeof expression !== 'string') return false;

  // Tokenize (same as before — omitted for brevity; copy from your current version or previous message)
  // ... full tokenizer, shunting-yard, RPN eval logic here ...

  // (paste your working evaluateThreshold function from earlier here)
  // Make sure it uses getValueFn(varName) to fetch values including 'freefall'
}

// ── Sensor listeners ── (unchanged)
function startSensorListeners() {
  // ... your existing devicemotion + deviceorientation listeners ...
}

// ── Dev stubs (controlled by CONFIG) ──
async function getDeviceUUID() {
  if (CONFIG.isDevMode) return CONFIG.fakeDeviceUUID;
  // Real IndexedDB logic goes here later
  throw new Error("Real UUID not implemented");
}

async function verifyIntegrity() {
  if (CONFIG.isDevMode && CONFIG.skipIntegrityCheck) {
    console.log("Dev mode: integrity check skipped");
    return true;
  }
  // Real UUID + signature verification goes here later
  console.warn("Production integrity check not yet implemented");
  return true;
}

// ── Render step ── (updated to use CONFIG)
function renderStep(step) {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = '';

  const stepDiv = document.createElement('div');
  stepDiv.className = 'step';

  if (step.content) {
    const contentDiv = document.createElement('div');
    contentDiv.innerHTML = step.htmlContent || step.content;
    stepDiv.appendChild(contentDiv);
  }

  if (step.type === 'hardware_trigger') {
    const instr = document.createElement('p');
    instr.textContent = step.content || 'Perform the required action...';
    stepDiv.appendChild(instr);

    const checkThreshold = () => {
      const satisfied = evaluateThreshold(step.threshold, (varName) => {
        const map = {
          'accel.total': getSensorNumericValue('accel.magnitude'),
          'accel.magnitude': getSensorNumericValue('accel.magnitude'),
          'accel.x': getSensorNumericValue('accel.x'),
          'accel.y': getSensorNumericValue('accel.y'),
          'accel.z': getSensorNumericValue('accel.z'),
          'orientation.beta': getSensorNumericValue('orientation.beta'),
          'freefall': isInFreefall(),
        };
        return map[varName] ?? null;
      });

      if (satisfied) {
        const pattern = step.feedback?.split(':')[1] || 'short';
        vibrate(pattern);

        if (currentStepIndex < lesson.steps.length - 1) {
          currentStepIndex++;
          renderStep(lesson.steps[currentStepIndex]);
        }

        unsubscribeFromSensor('accel.magnitude', checkThreshold);
        if (step.threshold.includes('orientation')) {
          unsubscribeFromSensor('orientation.beta', checkThreshold);
        }
      }
    };

    subscribeToSensor('accel.magnitude', checkThreshold);
    if (step.threshold.includes('orientation') || step.threshold.includes('freefall')) {
      subscribeToSensor('accel.magnitude', checkThreshold);
    }
  }

  app.appendChild(stepDiv);
}

// ── Init ──
async function initPlayer() {
  lesson = LESSON_DATA;
  if (!lesson || !Array.isArray(lesson.steps)) {
    document.body.innerHTML = '<h1>Error: Invalid lesson data</h1>';
    return;
  }

  startSensorListeners();

  renderStep(lesson.steps[currentStepIndex]);

  // Waiting UI
  const waiting = document.createElement('div');
  waiting.className = 'sensor-waiting';
  waiting.innerHTML = `
    <div class="pulse"></div>
    <p>Waiting for motion sensors...<br><small>Move or tilt slightly</small></p>
  `;
  document.getElementById('app').appendChild(waiting);
}

// ── Entry ──
window.addEventListener('load', async () => {
  if (await verifyIntegrity()) {
    initPlayer();
  }

  // Debug helpers
  window.debugEval = (expr) => {
    console.log(`Eval "${expr}":`, evaluateThreshold(expr, v => {
      if (v === 'accel.total') return 3.1;
      if (v === 'accel.z') return -9.8;
      if (v === 'freefall') return 0.45;
      return null;
    }));
  };

  window.setMockAccel = magInG => publishSensorReading({
    sensorId: 'accel.magnitude',
    value: magInG * 9.80665,
    timestamp: Date.now()
  });

  window.setMockFreefall = sec => {
    freefallStartTime = performance.now() - sec * 1000;
    publishSensorReading({ sensorId: 'accel.magnitude', value: 0.1 * 9.80665 });
  };
});

// Hide loading fallback
window.addEventListener('load', () => {
  setTimeout(() => {
    const loading = document.getElementById('loading');
    if (loading) loading.style.display = 'none';
  }, 5000);
});
