<script>
// ────────────────────────────────────────────────
//          AGNI / OLS Runtime Player (Updated)
// ────────────────────────────────────────────────

window.DEV_MODE = true;  // ← Set to false for production / real devices

// ── Global State ─────────────────────────────────
let currentStepIndex = 0;
let lesson = window.LESSON_DATA;
let sensorSubscriptions = new Map();
let lastSensorValues = new Map();
let freefallStartTime = null;
let calibrationConfirmed = false;

// ── Haptic Feedback ──────────────────────────────
function vibrate(pattern = 'short') {
  if (!('vibrate' in navigator)) return;
  const patterns = {
    short: 60,
    success_pattern: [80, 40, 80, 40, 120],
    error: 200
  };
  navigator.vibrate(patterns[pattern] || 100);
  if (window.DEV_MODE) console.log("[VIBRATE]", pattern);
}

// ── Sensor Pub/Sub ───────────────────────────────
function subscribeToSensor(sensorId, callback) {
  if (!sensorSubscriptions.has(sensorId)) {
    sensorSubscriptions.set(sensorId, new Set());
  }
  sensorSubscriptions.get(sensorId).add(callback);
}

function publishSensorReading(reading) {
  lastSensorValues.set(reading.sensorId, reading.value);
  const subs = sensorSubscriptions.get(reading.sensorId);
  if (subs) subs.forEach(cb => cb(reading));
}

// ── Start real device motion listeners ───────────
function startSensorListeners() {
  if (!window.DeviceMotionEvent) {
    console.warn("DeviceMotionEvent not available – emulator simulation mode active");
    return;
  }

  window.addEventListener('devicemotion', e => {
    const acc = e.accelerationIncludingGravity;
    if (!acc) return;

    const x = acc.x ?? 0;
    const y = acc.y ?? 0;
    const z = acc.z ?? 0;
    const magnitude = Math.hypot(x, y, z);

    publishSensorReading({ sensorId: 'accel.x', value: x });
    publishSensorReading({ sensorId: 'accel.y', value: y });
    publishSensorReading({ sensorId: 'accel.z', value: z });
    publishSensorReading({ sensorId: 'accel.magnitude', value: magnitude });

    if (window.DEV_MODE) {
      console.log(`[ACCEL] x:${x.toFixed(2)} y:${y.toFixed(2)} z:${z.toFixed(2)} | mag:${magnitude.toFixed(2)}`);
    }
  });
}

// ── Freefall detection (for step "freefall") ─────
function monitorFreefall() {
  subscribeToSensor('accel.z', reading => {
    const zAbs = Math.abs(reading.value);

    if (zAbs < 2.0) {  // near weightless
      if (freefallStartTime === null) {
        freefallStartTime = performance.now();
        console.log("[FREEFALL] started");
      }

      const durationMs = performance.now() - freefallStartTime;
      if (durationMs > 300) {  // "freefall > 0.3s"
        vibrate('success_pattern');
        console.log("[FREEFALL] DETECTED ≥ 0.3s → success");
        freefallStartTime = null;
        // Auto-advance from freefall step
        if (currentStepIndex === 2) {
          setTimeout(() => window.nextStep?.(), 800);
        }
      }
    } else {
      if (freefallStartTime !== null) {
        console.log("[FREEFALL] interrupted");
      }
      freefallStartTime = null;
    }
  });
}

// ── Calibration detection (for step "calibration") ─
function monitorCalibration() {
  subscribeToSensor('accel.z', reading => {
    const z = reading.value;
    const mag = lastSensorValues.get('accel.magnitude') || 0;

    // Roughly flat, screen-up, ~1g upward
    if (z > 8.5 && mag > 8.5 && mag < 11.0) {
      if (!calibrationConfirmed) {
        vibrate('short');
        calibrationConfirmed = true;
        console.log("[CALIBRATION] success");
        setTimeout(() => window.nextStep?.(), 600);
      }
    }
  });
}

// ── Skip device binding & signature check in dev mode ─
async function verifyIntegrity() {
  if (window.DEV_MODE) {
    console.log("[DEV MODE] Skipping UUID & signature verification");
    return true;
  }

  // ── Original / production binding logic goes here ──
  // (you can paste your full UUID + signature check back in)
  console.warn("Production integrity check not implemented in this snippet");
  return true;
}

// ── Emulator-only control buttons ────────────────
function addEmulatorControls() {
  if (!window.DEV_MODE) return;

  const container = document.createElement('div');
  container.style.cssText = `
    position: fixed;
    bottom: 16px;
    left: 16px;
    right: 16px;
    display: flex;
    gap: 12px;
    z-index: 9999;
  `;

  const btnCalib = document.createElement('button');
  btnCalib.textContent = "Simulate Calibration (flat)";
  btnCalib.className = 'btn btn-primary';
  btnCalib.onclick = () => {
    vibrate('short');
    calibrationConfirmed = true;
    window.nextStep?.();
  };

  const btnDrop = document.createElement('button');
  btnDrop.textContent = "Simulate Freefall Drop";
  btnDrop.className = 'btn btn-primary';
  btnDrop.onclick = () => {
    vibrate('success_pattern');
    if (currentStepIndex === 2) window.nextStep?.();
  };

  container.append(btnCalib, btnDrop);
  document.body.appendChild(container);
}

// ── Render current step ──────────────────────────
function renderStep(step) {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = '';

  const stepDiv = document.createElement('div');
  stepDiv.className = 'step-container';

  // Title from first line or fallback to id
  const title = document.createElement('h2');
  const firstLine = step.content.split('\n')[0].replace(/^#+\s*/, '').trim();
  title.textContent = firstLine || step.id;
  stepDiv.appendChild(title);

  // Main content (already has some HTML from compiler)
  const contentDiv = document.createElement('div');
  contentDiv.innerHTML = step.htmlContent || step.content.replace(/\n/g, '<br>');
  stepDiv.appendChild(contentDiv);

  // Sensor waiting indicator for hardware steps
  if (step.type === 'hardware_trigger') {
    const waiting = document.createElement('p');
    waiting.className = 'sensor-waiting';
    waiting.innerHTML = '<div class="pulse"></div><br>Waiting for sensor action...';
    stepDiv.appendChild(waiting);
  }

  app.appendChild(stepDiv);
}

// ── Simple navigation helper (also exposed for buttons) ──
window.nextStep = () => {
  if (currentStepIndex < lesson?.steps?.length - 1) {
    currentStepIndex++;
    renderStep(lesson.steps[currentStepIndex]);

    // Start monitoring when we reach relevant steps
    if (currentStepIndex === 1) monitorCalibration();
    if (currentStepIndex === 2) monitorFreefall();
  }
};

// ── Main initialization ──────────────────────────
async function initPlayer() {
  if (!lesson?.steps?.length) {
    document.getElementById('app').innerHTML = '<h1 style="color:#ff5252">Error: No valid lesson data</h1>';
    return;
  }

  if (await verifyIntegrity()) {
    renderStep(lesson.steps[0]);
    startSensorListeners();
    addEmulatorControls();

    // Optional: auto-start monitoring for first hardware step if needed
    // (we do it on navigation instead)
  }
}

window.addEventListener('load', initPlayer);
</script>
