// src/runtime/player.js
// Updated with dynamic threshold evaluation for hardware_trigger steps

// ── Imports ── (these will be bundled/inlined by build process)
// import { svgGenerators } from './svgLibrary.js'; // All generator functions live here
// import { SUPPORTED_SENSORS } from './sensorTypes.js'; // Uncomment when ready

// ── Global State ──
let currentStepIndex = 0;
let lesson = null; // Populated from LESSON_DATA
let sensorSubscriptions = new Map(); // sensorId → Set<callback>
let lastSensorValues = new Map(); // sensorId → latest reading object

// ── Constants ──
const G = 9.80665;  // m/s² per g

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

// ── Sensor Manager (pub/sub) ──
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
  if (subs) {
    subs.forEach(cb => cb(reading));
  }
}

// ── Normalize sensor values (handle g vs m/s²) ──
function normalizeSensorValue(reading) {
  let value = reading.value;

  // Heuristic: most DeviceMotionEvent.accelerationIncludingGravity is in m/s²
  // but some old/cheap devices report in g → detect and convert
  if (typeof value === 'number' && Math.abs(value) < 20) {
    value *= G;
  }

  // For vectors we could compute magnitude here if needed, but we do it per-sensor
  return value;
}

function getSensorNumericValue(sensorId) {
  const reading = lastSensorValues.get(sensorId);
  if (!reading) return null;
  return normalizeSensorValue(reading);
}

// ── Safe Threshold Expression Evaluator ──
// Supports: variables (accel.total, orientation.beta, etc.), numbers, > < >= <= == != && || ()
// No functions, no unsafe eval()
function evaluateThreshold(expression, getValueFn) {
  if (!expression || typeof expression !== 'string') return false;

  // 1. Tokenize
  const tokens = [];
  let i = 0;
  const len = expression.length;

  while (i < len) {
    const c = expression[i];

    if (/\s/.test(c)) { i++; continue; } // skip whitespace

    // Variable names: accel.total, orientation.beta, etc.
    if (/[a-zA-Z.]/.test(c)) {
      let varName = '';
      while (i < len && /[a-zA-Z0-9._]/.test(expression[i])) {
        varName += expression[i++];
      }
      tokens.push({ type: 'var', value: varName.trim() });
      continue;
    }

    // Number (with optional - and decimal, no unit yet — we strip later)
    if (/[0-9.]/.test(c) || (c === '-' && /[0-9.]/.test(expression[i + 1 || len]))) {
      let numStr = '';
      while (i < len && /[-0-9.eE]/.test(expression[i])) {
        numStr += expression[i++];
      }
      // Remove unit suffix if present (g, deg, etc.)
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

    console.warn(`Unknown character in threshold: ${c} at position ${i}`);
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
        case '==':  stack.push(Math.abs(a - b) < 0.0001); break; // approx equal
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

// ── Device UUID & Integrity (existing code kept brief) ──
async function getDeviceUUID() { /* ... existing implementation ... */ }
async function verifyIntegrity() { /* ... existing implementation ... */ }

// ── Render a single step ──
function renderStep(step) {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = ''; // Clear previous

  const stepDiv = document.createElement('div');
  stepDiv.className = 'step';

  // Text content
  if (step.content) {
    const contentDiv = document.createElement('div');
    contentDiv.innerHTML = step.htmlContent || step.content;
    stepDiv.appendChild(contentDiv);
  }

  // Hardware trigger with dynamic threshold checking
  if (step.type === 'hardware_trigger') {
    const instr = document.createElement('p');
    instr.textContent = step.content || 'Perform the required action...';
    stepDiv.appendChild(instr);

    // Create check function for this specific trigger
    const checkThreshold = () => {
      const satisfied = evaluateThreshold(step.threshold, (varName) => {
        const sensorMap = {
          'accel.total':      getSensorNumericValue('accel.magnitude'),
          'accel.magnitude':  getSensorNumericValue('accel.magnitude'),
          'accel.x':          getSensorNumericValue('accel.x'),
          'accel.y':          getSensorNumericValue('accel.y'),
          'accel.z':          getSensorNumericValue('accel.z'),
          'orientation.beta': getSensorNumericValue('orientation.beta'),
          // Add more sensor aliases as needed
        };
        return sensorMap[varName] ?? null;
      });

      if (satisfied) {
        const pattern = step.feedback?.split(':')[1] || 'short';
        vibrate(pattern);

        // Advance to next step
        if (currentStepIndex < lesson.steps.length - 1) {
          currentStepIndex++;
          renderStep(lesson.steps[currentStepIndex]);
        }

        // Clean up this listener
        unsubscribeFromSensor('accel.magnitude', checkThreshold);
        // You can unsubscribe others if you track which sensors the expression used
      }
    };

    // Subscribe to the main accel sensor (you can make this smarter later)
    subscribeToSensor('accel.magnitude', checkThreshold);
    // If expression uses orientation, also subscribe:
    if (step.threshold.includes('orientation')) {
      subscribeToSensor('orientation.beta', checkThreshold);
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

  // Start with first step
  renderStep(lesson.steps[currentStepIndex]);
}

// ── Entry point ──
window.addEventListener('load', async () => {
  if (await verifyIntegrity()) {
    initPlayer();
  }

  // Debug helpers (remove in production)
  window.debugEval = (expr) => {
    console.log(`Eval "${expr}":`, evaluateThreshold(expr, (v) => {
      // Mock values for browser console testing
      if (v === 'accel.total') return 3.1;
      if (v === 'accel.z') return -8.5;
      if (v === 'orientation.beta') return 45;
      return null;
    }));
  };

  window.setMockAccel = (mag) => {
    publishSensorReading({
      sensorId: 'accel.magnitude',
      value: mag * G,
      timestamp: Date.now()
    });
  };
});
