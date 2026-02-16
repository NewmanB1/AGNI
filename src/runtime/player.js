// src/runtime/player.js
// Final consolidated version – should work with current gravity.yaml build

const CONFIG = {
  isDevMode: true,
  skipIntegrityCheck: true,
  fakeDeviceUUID: "emulator-test-uuid-1234-5678",
  freefallThresholdG: 0.5,
  vibrationPatterns: {
    short: 50,
    success: [50, 30, 50, 30, 100],
  },
  debugLevel: 2,
};

function log(...args) {
  if (CONFIG.debugLevel >= 1) console.log(...args);
}

let currentStepIndex = 0;
let lesson = null;
let sensorSubscriptions = new Map();
let lastSensorValues = new Map();
let freefallStartTime = null;

function vibrate(patternName = 'short') {
  if (!('vibrate' in navigator)) return;
  const pattern = CONFIG.vibrationPatterns[patternName] || 100;
  navigator.vibrate(pattern);
  log(`Vibration: ${patternName}`);
}

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

function normalizeSensorValue(reading) {
  let value = reading.value;
  if (typeof value === 'number' && Math.abs(value) < 20) value *= 9.80665;
  return value;
}

function getSensorNumericValue(sensorId) {
  const reading = lastSensorValues.get(sensorId);
  return reading ? normalizeSensorValue(reading) : null;
}

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

function evaluateThreshold(expression, getValueFn) {
  if (!expression || typeof expression !== 'string') return false;

  const tokens = [];
  let i = 0;
  const len = expression.length;

  while (i < len) {
    const c = expression[i];
    if (/\s/.test(c)) { i++; continue; }

    if (/[a-zA-Z.]/.test(c)) {
      let varName = '';
      while (i < len && /[a-zA-Z0-9._]/.test(expression[i])) varName += expression[i++];
      tokens.push({ type: 'var', value: varName.trim() });
      continue;
    }

    if (/[0-9.]/.test(c) || (c === '-' && /[0-9.]/.test(expression[i+1] || ''))) {
      let numStr = '';
      while (i < len && /[-0-9.eE]/.test(expression[i])) numStr += expression[i++];
      numStr = numStr.replace(/[a-zA-Z]+$/, '').trim();
      const num = parseFloat(numStr);
      if (isNaN(num)) return false;
      tokens.push({ type: 'num', value: num });
      continue;
    }

    if ('><=!&|()'.includes(c)) {
      let op = c;
      i++;
      if (i < len && '=>'.includes(expression[i])) op += expression[i++];
      if (['&&','||','>=','<=','==','!='].includes(op) || ['>','<','(',')'].includes(op)) {
        tokens.push({ type: 'op', value: op });
      }
      continue;
    }

    console.warn(`Unknown char: ${c} at ${i}`);
    return false;
  }

  const output = [];
  const opStack = [];
  for (const t of tokens) {
    if (t.type === 'num' || t.type === 'var') output.push(t);
    else if (t.type === 'op') {
      while (opStack.length && opStack[opStack.length-1] !== '(' &&
             precedence(opStack[opStack.length-1]) >= precedence(t.value)) {
        output.push({ type: 'op', value: opStack.pop() });
      }
      opStack.push(t.value);
    } else if (t.value === '(') opStack.push('(');
    else if (t.value === ')') {
      while (opStack.length && opStack[opStack.length-1] !== '(') output.push({ type: 'op', value: opStack.pop() });
      if (opStack.length) opStack.pop();
    }
  }
  while (opStack.length) output.push({ type: 'op', value: opStack.pop() });

  const stack = [];
  for (const t of output) {
    if (t.type === 'num') stack.push(t.value);
    else if (t.type === 'var') {
      const val = getValueFn(t.value);
      if (val === null) return false;
      stack.push(val);
    } else if (t.type === 'op') {
      if (stack.length < 2) return false;
      const b = stack.pop();
      const a = stack.pop();
      switch (t.value) {
        case '>': stack.push(a > b); break;
        case '>=': stack.push(a >= b); break;
        case '<': stack.push(a < b); break;
        case '<=': stack.push(a <= b); break;
        case '==': stack.push(Math.abs(a - b) < 0.0001); break;
        case '!=': stack.push(Math.abs(a - b) >= 0.0001); break;
        case '&&': stack.push(!!a && !!b); break;
        case '||': stack.push(!!a || !!b); break;
        default: return false;
      }
    }
  }
  return stack.length === 1 ? !!stack[0] : false;
}

function precedence(op) {
  if (op === '&&' || op === '||') return 1;
  if (['>','<','>=','<=','==','!='].includes(op)) return 2;
  return 0;
}

function startSensorListeners() {
  if (window.DeviceMotionEvent) {
    window.addEventListener('devicemotion', e => {
      const acc = e.accelerationIncludingGravity;
      if (acc) {
        const mag = Math.hypot(acc.x||0, acc.y||0, acc.z||0);
        publishSensorReading({sensorId:'accel.x', value:acc.x||0, timestamp:e.timeStamp});
        publishSensorReading({sensorId:'accel.y', value:acc.y||0, timestamp:e.timeStamp});
        publishSensorReading({sensorId:'accel.z', value:acc.z||0, timestamp:e.timeStamp});
        publishSensorReading({sensorId:'accel.magnitude', value:mag, timestamp:e.timeStamp});
      }
    });
  }
  if (window.DeviceOrientationEvent) {
    window.addEventListener('deviceorientation', e => {
      publishSensorReading({sensorId:'orientation.alpha', value:e.alpha||0, timestamp:e.timeStamp});
      publishSensorReading({sensorId:'orientation.beta', value:e.beta||0, timestamp:e.timeStamp});
      publishSensorReading({sensorId:'orientation.gamma', value:e.gamma||0, timestamp:e.timeStamp});
    });
  }
}

async function getDeviceUUID() {
  if (CONFIG.isDevMode) return CONFIG.fakeDeviceUUID;
  throw new Error("Real UUID not implemented");
}

async function verifyIntegrity() {
  if (CONFIG.isDevMode && CONFIG.skipIntegrityCheck) {
    log("Dev mode: integrity check skipped");
    return true;
  }
  console.warn("Production integrity not implemented");
  return true;
}

function renderStep(step) {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = '';

  const stepDiv = document.createElement('div');
  stepDiv.className = 'step';

  if (step.content) {
    const div = document.createElement('div');
    div.innerHTML = step.htmlContent || step.content;
    stepDiv.appendChild(div);
  }

  if (step.type === 'hardware_trigger') {
    const p = document.createElement('p');
    p.textContent = step.content || 'Perform action...';
    stepDiv.appendChild(p);

    const check = () => {
      const ok = evaluateThreshold(step.threshold, v => {
        const m = {
          'accel.total': getSensorNumericValue('accel.magnitude'),
          'accel.magnitude': getSensorNumericValue('accel.magnitude'),
          'accel.x': getSensorNumericValue('accel.x'),
          'accel.y': getSensorNumericValue('accel.y'),
          'accel.z': getSensorNumericValue('accel.z'),
          'freefall': isInFreefall(),
        };
        return m[v] ?? null;
      });

      if (ok) {
        vibrate(step.feedback?.split(':')[1] || 'short');
        if (currentStepIndex < lesson.steps.length - 1) {
          currentStepIndex++;
          renderStep(lesson.steps[currentStepIndex]);
        }
        unsubscribeFromSensor('accel.magnitude', check);
      }
    };

    subscribeToSensor('accel.magnitude', check);
  }

  app.appendChild(stepDiv);
}

async function initPlayer() {
  lesson = LESSON_DATA;
  if (!lesson || !Array.isArray(lesson.steps)) {
    document.body.innerHTML = '<h1>Invalid lesson</h1>';
    return;
  }

  startSensorListeners();
  renderStep(lesson.steps[currentStepIndex]);

  const w = document.createElement('div');
  w.className = 'sensor-waiting';
  w.innerHTML = `<div class="pulse"></div><p>Waiting for sensors...<br><small>Move/tilt phone</small></p>`;
  document.getElementById('app').appendChild(w);
}

window.addEventListener('load', async () => {
  if (await verifyIntegrity()) initPlayer();

  window.debugEval = expr => console.log(`Eval "${expr}":`, evaluateThreshold(expr, v => {
    if (v === 'accel.z') return -9.8;
    if (v === 'freefall') return 0.45;
    return null;
  }));

  window.setMockFreefall = s => {
    freefallStartTime = performance.now() - s * 1000;
    publishSensorReading({ sensorId: 'accel.magnitude', value: 0.1 * 9.80665 });
  };
});

window.addEventListener('load', () => setTimeout(() => {
  const l = document.getElementById('loading');
  if (l) l.style.display = 'none';
}, 5000));
