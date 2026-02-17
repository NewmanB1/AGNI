// src/runtime/player.js
// AGNI / OLS Runtime Layer – Android 6.0 Marshmallow compatible + emulator support

import { svgGenerators } from './svgLibrary.js';  // Proper import – shared & cached

window.DEV_MODE = true;  // TODO: make configurable via build flag / env

const IS_OLD_ANDROID = /Android [456]\./.test(navigator.userAgent) ||
                       /Android 6\.0/.test(navigator.userAgent);

let currentStepIndex = 0;
let lesson = null; // Populated from LESSON_DATA
let sensorSubscriptions = new Map();
let lastSensorValues = new Map();
let freefallStartTime = null;
let calibrationConfirmed = false;
let sensorsActive = false;

// ── Vibration helper (can be moved to shared.js later) ──────────────────────
function vibrate(pattern = 'short') {
  if (!('vibrate' in navigator)) return;
  const patterns = {
    short: 70,
    success_pattern: [100, 50, 100, 50, 150],
    error: 250
  };
  navigator.vibrate(patterns[pattern] || 120);
  if (window.DEV_MODE) console.log("[VIBRATE]", pattern);
}

// ── Sensor pub/sub ──────────────────────────────────────────────────────────
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

// ── Gesture-unlocked sensor start (required on old Android) ─────────────────
function unlockAndStartSensors() {
  if (sensorsActive) return;

  if (!window.DeviceMotionEvent) {
    console.warn("DeviceMotionEvent not available");
    showSensorWarning();
    return;
  }

  console.log("[DEBUG] Starting devicemotion listener after gesture");

  const handler = function(e) {
    const acc = e.accelerationIncludingGravity;
    if (!acc) return;

    var x = acc.x || 0;
    var y = acc.y || 0;
    var z = acc.z || 0;
    var mag = Math.sqrt(x*x + y*y + z*z);

    publishSensorReading({ sensorId: 'accel.x', value: x });
    publishSensorReading({ sensorId: 'accel.y', value: y });
    publishSensorReading({ sensorId: 'accel.z', value: z });
    publishSensorReading({ sensorId: 'accel.magnitude', value: mag });

    if (window.DEV_MODE || IS_OLD_ANDROID) {
      console.log("[ACCEL] x:" + x.toFixed(1) + " y:" + y.toFixed(1) +
                  " z:" + z.toFixed(1) + " | mag:" + mag.toFixed(1));
    }
  };

  window.addEventListener('devicemotion', handler, { passive: true });
  sensorsActive = true;
  console.log("[SENSORS] activated after gesture" +
              (IS_OLD_ANDROID ? " (old Android mode)" : ""));
}

// ── Fallback UI if sensors never activate ───────────────────────────────────
function showSensorWarning() {
  var p = document.createElement('p');
  p.style.color = '#ffcc00';
  p.style.textAlign = 'center';
  p.style.padding = '1rem';
  p.textContent = IS_OLD_ANDROID
    ? "Sensors not responding. Use simulation buttons or shake device gently."
    : "Sensors unavailable on this device.";
  document.getElementById('app').appendChild(p);
}

// ── Calibration monitor (relaxed for old hardware) ──────────────────────────
function monitorCalibration() {
  subscribeToSensor('accel.z', function(r) {
    var z = r.value;
    var mag = lastSensorValues.get('accel.magnitude') || 0;
    if (z > 7.0 && mag > 7.0 && mag < 11.5) {
      if (!calibrationConfirmed) {
        vibrate('short');
        calibrationConfirmed = true;
        console.log("[CALIBRATION] success");
        setTimeout(window.nextStep, 700);
      }
    }
  });
}

// ── Freefall monitor (relaxed) ──────────────────────────────────────────────
function monitorFreefall() {
  subscribeToSensor('accel.z', function(r) {
    var absZ = Math.abs(r.value);
    if (absZ < 3.5) {
      if (freefallStartTime === null) {
        freefallStartTime = performance.now();
        console.log("[FREEFALL] started");
      }
      if (performance.now() - freefallStartTime > 400) {
        vibrate('success_pattern');
        console.log("[FREEFALL] detected");
        freefallStartTime = null;
        if (currentStepIndex === 2) setTimeout(window.nextStep, 1000);
      }
    } else {
      freefallStartTime = null;
    }
  });
}

// ── Skip binding check during development ───────────────────────────────────
async function verifyIntegrity() {
  if (window.DEV_MODE) {
    console.log("[DEV MODE] Skipping device binding & signature check");
    return true;
  }
  // TODO: implement real Ed25519 signature + UUID check here
  return true;
}

// ── Emulator-only simulation buttons ────────────────────────────────────────
function addEmulatorControls() {
  if (!window.DEV_MODE) return;

  var ctr = document.createElement('div');
  ctr.style.position = 'fixed';
  ctr.style.bottom = '1rem';
  ctr.style.left = '1rem';
  ctr.style.right = '1rem';
  ctr.style.display = 'flex';
  ctr.style.gap = '0.8rem';
  ctr.style.zIndex = '9999';

  var btnCalib = document.createElement('button');
  btnCalib.className = 'btn btn-primary';
  btnCalib.textContent = 'Simulate Calibration';
  btnCalib.onclick = function() {
    vibrate('short');
    calibrationConfirmed = true;
    window.nextStep();
  };

  var btnDrop = document.createElement('button');
  btnDrop.className = 'btn btn-primary';
  btnDrop.textContent = 'Simulate Freefall';
  btnDrop.onclick = function() {
    vibrate('success_pattern');
    if (currentStepIndex === 2) window.nextStep();
  };

  ctr.appendChild(btnCalib);
  ctr.appendChild(btnDrop);
  document.body.appendChild(ctr);
}

// ── Render current step ─────────────────────────────────────────────────────
function renderStep(step) {
  console.log("[DEBUG] Rendering step:", step.id);

  var app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = '';

  var container = document.createElement('div');
  container.className = 'step-container';

  var h2 = document.createElement('h2');
  var titleMatch = step.content.match(/^##\s*(.+)$/m);
  h2.textContent = titleMatch ? titleMatch[1] : (step.id || 'Step');
  container.appendChild(h2);

  var content = document.createElement('div');
  content.innerHTML = step.htmlContent || step.content.replace(/\n/g, '<br>');
  container.appendChild(content);

  // Gesture unlock for hardware steps on old devices
  if (step.type === 'hardware_trigger' && !sensorsActive) {
    var unlockBtn = document.createElement('button');
    unlockBtn.className = 'btn btn-primary';
    unlockBtn.style.marginTop = '1rem';
    unlockBtn.textContent = 'Enable Sensors (tap to start)';
    unlockBtn.onclick = function() {
      unlockAndStartSensors();
      unlockBtn.remove();
      renderStep(step);  // refresh to show waiting indicator
    };
    container.appendChild(unlockBtn);
  }

  // Waiting indicator
  if (step.type === 'hardware_trigger' && sensorsActive) {
    var waiting = document.createElement('p');
    waiting.className = 'sensor-waiting';
    waiting.innerHTML = '<div class="pulse"></div><br>Waiting for sensor action…';
    container.appendChild(waiting);
  }

  // Quiz options
  if (step.type === 'quiz') {
    step.answer_options.forEach(function(opt, idx) {
      var btn = document.createElement('button');
      btn.className = 'btn btn-option';
      btn.textContent = opt;
      btn.onclick = function() {
        var correct = (idx === step.correct_index);
        btn.classList.add(correct ? 'correct' : 'incorrect');
        vibrate(correct ? 'short' : 'error');
        if (correct) setTimeout(window.nextStep, 1400);
      };
      container.appendChild(btn);
    });
  }

  app.appendChild(container);
}

// ── Navigation helper ───────────────────────────────────────────────────────
window.nextStep = function() {
  if (currentStepIndex >= lesson.steps.length - 1) {
    document.getElementById('app').innerHTML =
      '<div class="completion-screen"><h1>Lesson Complete! 🎉</h1>' +
      '<p>You felt what freefall really is.</p></div>';
    return;
  }

  currentStepIndex++;
  renderStep(lesson.steps[currentStepIndex]);

  if (currentStepIndex === 1) monitorCalibration();
  if (currentStepIndex === 2) monitorFreefall();
};

// ── Main initialization ─────────────────────────────────────────────────────
async function initPlayer() {
  console.log("[DEBUG] initPlayer started – LESSON_DATA exists:", !!window.LESSON_DATA);

  lesson = window.LESSON_DATA;

  if (!lesson || !Array.isArray(lesson.steps) || lesson.steps.length === 0) {
    console.error("[ERROR] Invalid or empty lesson data");
    document.body.innerHTML = '<h1 style="color:#ff5252">Error: Invalid lesson data</h1>';
    document.getElementById('loading').style.display = 'none';
    return;
  }

  console.log("[DEBUG] Lesson loaded – starting sensors & rendering first step");

  startSensorListeners();
  renderStep(lesson.steps[currentStepIndex]);

  // Hide loading explicitly after first render
  const loading = document.getElementById('loading');
  if (loading) loading.style.display = 'none';
}

// ── Entry point ─────────────────────────────────────────────────────────────
window.addEventListener('load', async () => {
  console.log("[DEBUG] window.load fired – starting integrity check");

  if (await verifyIntegrity()) {
    console.log("[DEBUG] Integrity passed – calling initPlayer");
    await initPlayer();
  } else {
    console.log("[DEBUG] Integrity failed – not initializing player");
  }

  // Optional: global nextStep for manual debug
  window.nextStep = function() {
    if (currentStepIndex < lesson?.steps?.length - 1) {
      currentStepIndex++;
      renderStep(lesson.steps[currentStepIndex]);
    }
  };
});

// Extra strong loading fallback (runs even if script crashes early)
setTimeout(function() {
  console.log("[SAFETY] 5-second fallback hiding loading");
  const loading = document.getElementById('loading');
  if (loading) loading.style.display = 'none';
}, 5000);
