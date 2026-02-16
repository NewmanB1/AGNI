// src/runtime/player.js
// Updated: February 2025 — dynamic thresholds + freefall duration + CONFIG separation

// ── CONFIG ── All tunable values in one place
const CONFIG = {
  isDevMode: true,
  skipIntegrityCheck: true,
  fakeDeviceUUID: "emulator-test-uuid-1234-5678",
  hubPublicKeyBase64: "", // ← paste real Ed25519 public key here later
  freefallThresholdG: 0.5,
  calibrationZThreshold: 9.0,
  freefallMinDurationSec: 0.3,
  vibrationPatterns: {
    short: 50,
    medium: 150,
    long: 400,
    success: [50, 30, 50, 30, 100],
  },
  debugLevel: 2, // 0 = silent, 1 = important logs, 2 = verbose
};

// ── Helper: conditional logging ──
function log(...args) {
  if (CONFIG.debugLevel >= 1) console.log(...args);
}

// ── Global State ──
let currentStepIndex = 0;
let lesson = null;
let sensorSubscriptions = new Map(); // sensorId → Set<callback>
let lastSensorValues = new Map();    // sensorId → latest reading
let freefallStartTime = null;

// ── Vibration ──
function vibrate(patternName = 'short') {
  if (!('vibrate' in navigator)) return;
  const pattern = CONFIG.vibrationPatterns[patternName] || 100;
  navigator.vibrate(pattern);
  log(`Vibration triggered: ${patternName} (${pattern})`);
}

// ── Sensor pub/sub ──
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
  lastSensorValues.set(reading.sensorId, reading);
  const subs = sensorSubscriptions.get(reading.sensorId);
  if (subs) subs.forEach(cb => cb(reading));
}

// ── Normalize sensor values ──
function normalizeSensorValue(reading) {
  let value = reading.value;
  if (typeof value === 'number' && Math.abs(value) < 20) {
    value *= 9.80665; // convert g to m/s²
  }
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
    const durationMs = performance.now() - freefallStartTime;
    return durationMs / 1000; // seconds
  } else {
    freefallStartTime = null;
    return 0;
  }
}

// ── Safe threshold expression evaluator ──
function evaluateThreshold(expression, getValueFn) {
  if (!expression || typeof expression !== 'string') return false;

  // 1. Tokenize
  const tokens = [];
  let i = 0;
  const len = expression.length;

  while (i < len) {
    const c = expression[i];

    if (/\s/.test(c)) { i++; continue; }

    // Variable (accel.total, freefall, etc.)
    if (/[a-zA-Z.]/.test(c)) {
      let varName = '';
      while (i < len && /[a-zA-Z0-9._]/.test(expression[i])) {
        varName += expression[i++];
      }
      tokens.push({ type: 'var', value: varName.trim() });
      continue;
    }

    // Number (with optional negative sign and decimal)
    if (/[0-9.]/.test(c) || (c === '-' && /[0-9.]/.test(expression[i + 1] || ''))) {
      let numStr = '';
      while (i < len && /[-0-9.eE]/.test(expression[i])) {
        numStr += expression[i++];
      }
      // Strip optional unit suffix (g, s, deg, etc.)
      numStr = numStr.replace(/[a-zA-Z]+$/, '').trim();
      const num = parseFloat(numStr);
      if (isNaN(num)) return false;
      tokens.push({ type: 'num', value: num });
      continue;
    }

    // Operators and parentheses
    if ('><=!&|()'.includes(c)) {
      let op = c;
      i++;
      if (i < len && '=>'.includes(expression[i])) {
        op += expression[i++];
      }
      if (['&&', '||', '>=', '<=', '==', '!='].includes(op) ||
          ['>', '<', '(', ')'].includes(op)) {
        tokens.push({ type: 'op', value: op });
      }
      continue;
    }

    console.warn(`Unknown character in threshold: '${c}' at position ${i}`);
    return false;
  }

  // 2. Shunting-yard algorithm → Reverse Polish Notation (RPN)
  const output = [];
  const opStack = [];

  for (const token of tokens) {
    if (token.type === 'num' || token.type === 'var') {
      output.push(token);
    } else if (token.type === 'op') {
      while (
        opStack.length &&
        opStack[opStack.length - 1] !== '(' &&
        precedence(opStack[opStack.length - 1]) >= precedence(token.value)
      ) {
        output.push({ type: 'op', value: opStack.pop() });
      }
      opStack.push(token.value);
    } else if (token.value === '(') {
      opStack.push('(');
    } else if (token.value === ')') {
      while (opStack.length && opStack[opStack.length - 1] !== '(') {
        output.push({ type: 'op', value: opStack.pop() });
      }
      if (opStack.length) opStack.pop(); // discard '('
    }
  }

  while (opStack.length) {
    output.push({ type: 'op', value: opStack.pop() });
  }

  // 3. Evaluate RPN
  const stack = [];

  for (const token of output) {
    if (token.type === 'num') {
      stack.push(token.value);
    } else if (token.type === 'var') {
      const val = getValueFn(token.value);
      if (val === null) return false;
      stack.push(val);
    } else if (token.type === 'op') {
      if (stack.length < 2) return false;
      const b = stack.pop();
      const a = stack.pop();

      switch (token.value) {
        case '>':   stack.push(a > b);   break;
        case '>=':  stack.push(a >= b);  break;
        case '<':   stack.push(a < b);   break;
        case '<=':  stack.push(a <= b);  break;
        case '==':  stack.push(Math.abs(a - b) < 0.0001); break;
        case '!=':  stack.push(Math.abs(a - b) >= 0.0001); break;
        case '&&':  stack.push(!!a && !!b); break;
        case '||':  stack.push(!!a || !!b); break;
        default: return false;
      }
    }
  }

  return stack.length === 1 ? !!stack[0] : false;
}

function precedence(op) {
  if (op === '&&' || op === '||') return 1;
  if (['>', '<', '>=', '<=', '==', '!='].includes(op)) return 2;
  return 0;
}

// ── Real sensor listeners ──
function startSensorListeners() {
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

  if (window.DeviceOrientationEvent) {
    window.addEventListener('deviceorientation', (e) => {
      publishSensorReading({ sensorId: 'orientation.alpha', value: e.alpha || 0, timestamp: e.timeStamp });
      publishSensorReading({ sensorId: 'orientation.beta', value: e.beta || 0, timestamp: e.timeStamp });
      publishSensorReading({ sensorId: 'orientation.gamma', value: e.gamma || 0, timestamp: e.timeStamp });
    });
  }
}

// ── Device UUID & Integrity (dev mode controlled by CONFIG) ──
async function getDeviceUUID() {
  if (CONFIG.isDevMode) {
    log("Using fake UUID for development");
    return CONFIG.fakeDeviceUUID;
  }
  // Real IndexedDB + fingerprint logic goes here later
  throw new Error("Real UUID implementation not active");
}

async function verifyIntegrity() {
  if (CONFIG.isDevMode && CONFIG.skipIntegrityCheck) {
    log("Dev mode: skipping integrity check");
    return true;
  }
  // Real signature + UUID check goes here later
  console.warn("Production integrity check not yet implemented");
  return true;
}

// ── Render a single step ──
function renderStep(step) {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = ''; // Clear previous content

  const stepDiv = document.createElement('div');
  stepDiv.className = 'step';

  // Text / instruction content
  if (step.content) {
    const contentDiv = document.createElement('div');
    contentDiv.innerHTML = step.htmlContent || step.content;
    stepDiv.appendChild(contentDiv);
  }

  // Hardware trigger handling
  if (step.type === 'hardware_trigger') {
    const instr = document.createElement('p');
    instr.textContent = step.content || 'Perform the required action...';
    stepDiv.appendChild(instr);

    const checkThreshold = () => {
      const satisfied = evaluateThreshold(step.threshold, (varName) => {
        const sensorMap = {
          'accel.total':      getSensorNumericValue('accel.magnitude'),
          'accel.magnitude':  getSensorNumericValue('accel.magnitude'),
          'accel.x':          getSensorNumericValue('accel.x'),
          'accel.y':          getSensorNumericValue('accel.y'),
          'accel.z':          getSensorNumericValue('accel.z'),
          'orientation.beta': getSensorNumericValue('orientation.beta'),
          'freefall':         isInFreefall(),
        };
        return sensorMap[varName] ?? null;
      });

      if (satisfied) {
        const pattern = step.feedback?.split(':')[1] || 'short';
        vibrate(pattern);

        // Advance
        if (currentStepIndex < lesson.steps.length - 1) {
          currentStepIndex++;
          renderStep(lesson.steps[currentStepIndex]);
        }

        // Cleanup
        unsubscribeFromSensor('accel.magnitude', checkThreshold);
        if (step.threshold.includes('orientation') || step.threshold.includes('freefall')) {
          unsubscribeFromSensor('accel.magnitude', checkThreshold);
        }
      }
    };

    subscribeToSensor('accel.magnitude', checkThreshold);
    if (step.threshold.includes('orientation') || step.threshold.includes('freefall')) {
      subscribeToSensor('accel.magnitude', checkThreshold);
    }
  }

  // TODO: SVG / visual rendering placeholder
  // if (step.type === 'svg' || step.type === 'visual') { ... }

  app.appendChild(stepDiv);
}

// ── Main player initialization ──
async function initPlayer() {
  lesson = LESSON_DATA;
  if (!lesson || !Array.isArray(lesson.steps) || lesson.steps.length === 0) {
    document.body.innerHTML = '<h1>Error: Invalid or empty lesson data.</h1>';
    return;
  }

  startSensorListeners();

  renderStep(lesson.steps[currentStepIndex]);

  // Sensor waiting feedback
  const waiting = document.createElement('div');
  waiting.className = 'sensor-waiting';
  waiting.innerHTML = `
    <div class="pulse"></div>
    <p>Waiting for motion sensors...<br><small>Move or tilt the phone slightly</small></p>
  `;
  document.getElementById('app').appendChild(waiting);
}

// ── Entry point ──
window.addEventListener('load', async () => {
  if (await verifyIntegrity()) {
    initPlayer();
  }

  // Debug helpers (safe to leave during development)
  window.debugEval = (expr) => {
    console.log(`Eval "${expr}":`, evaluateThreshold(expr, (v) => {
      if (v === 'accel.total') return 3.1;
      if (v === 'accel.z') return -9.8;
      if (v === 'freefall') return 0.45;
      if (v === 'orientation.beta') return 45;
      return null;
    }));
  };

  window.setMockAccel = (magInG) => {
    publishSensorReading({
      sensorId: 'accel.magnitude',
      value: magInG * 9.80665,
      timestamp: Date.now()
    });
  };

  window.setMockFreefall = (seconds) => {
    freefallStartTime = performance.now() - (seconds * 1000);
    publishSensorReading({
      sensorId: 'accel.magnitude',
      value: 0.1 * 9.80665,
      timestamp: Date.now()
    });
  };
});

// Safety net: hide loading indicator
window.addEventListener('load', () => {
  setTimeout(() => {
    const loading = document.getElementById('loading');
    if (loading) loading.style.display = 'none';
  }, 5000);
});
