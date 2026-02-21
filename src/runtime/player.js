// src/runtime/player.js – lesson-specific runtime layer
// Uses shared utilities from shared-runtime.js (loaded as a separate cached asset)

// ── Dev mode: set by compiler via LESSON_DATA, never hardcoded ─────────────
// Resolved after LESSON_DATA is available; safe default is false.
var DEV_MODE = false;

var IS_OLD_ANDROID = /Android [456]\./.test(navigator.userAgent) ||
                     /Android 6\.0/.test(navigator.userAgent);

var currentStepIndex = 0;
var lesson = null;
var sensorsActive = false;
var calibrationConfirmed = false;
var freefallStartTime = null;

// Pull from shared-runtime.js
var vibrate          = window.AGNI_SHARED ? window.AGNI_SHARED.vibrate          : function(p) { console.log("[FALLBACK] vibrate:", p); };
var subscribeToSensor   = window.AGNI_SHARED ? window.AGNI_SHARED.subscribeToSensor   : function() {};
var publishSensorReading = window.AGNI_SHARED ? window.AGNI_SHARED.publishSensorReading : function() {};
var lastSensorValues = window.AGNI_SHARED ? window.AGNI_SHARED.lastSensorValues : new Map();

console.log("[PLAYER] player.js loaded – shared available:", !!window.AGNI_SHARED);

// ── Sensor unlock ───────────────────────────────────────────────────────────
function unlockAndStartSensors() {
  if (sensorsActive) return;
  if (!window.DeviceMotionEvent) {
    console.warn("[WARN] DeviceMotionEvent not available");
    showSensorWarning();
    return;
  }

  if (DEV_MODE) console.log("[DEBUG] Starting devicemotion listener");

  function handler(e) {
    var acc = e.accelerationIncludingGravity;
    if (!acc) return;
    var x = acc.x || 0;
    var y = acc.y || 0;
    var z = acc.z || 0;
    var mag = Math.sqrt(x*x + y*y + z*z);

    publishSensorReading({ sensorId: 'accel.x',         value: x });
    publishSensorReading({ sensorId: 'accel.y',         value: y });
    publishSensorReading({ sensorId: 'accel.z',         value: z });
    publishSensorReading({ sensorId: 'accel.magnitude', value: mag });

    if (DEV_MODE || IS_OLD_ANDROID) {
      console.log("[ACCEL] x:" + x.toFixed(1) + " y:" + y.toFixed(1) +
                  " z:" + z.toFixed(1) + " | mag:" + mag.toFixed(1));
    }
  }

  window.addEventListener('devicemotion', handler, { passive: true });
  sensorsActive = true;
  console.log("[SENSORS] activated" + (IS_OLD_ANDROID ? " (old mode)" : ""));
}

// ── Sensor fallback UI ──────────────────────────────────────────────────────
function showSensorWarning() {
  var p = document.createElement('p');
  p.style.color = '#ffcc00';
  p.style.textAlign = 'center';
  p.style.padding = '1rem';
  p.textContent = IS_OLD_ANDROID
    ? "Sensors not responding. Use buttons or shake device."
    : "Sensors unavailable.";
  document.getElementById('app').appendChild(p);
}

// ── Calibration monitor ─────────────────────────────────────────────────────
function monitorCalibration() {
  subscribeToSensor('accel.z', function(r) {
    var z = r.value;
    var mag = lastSensorValues.get('accel.magnitude') || 0;
    if (z > 7.0 && mag > 7.0 && mag < 11.5) {
      if (!calibrationConfirmed) {
        vibrate('short');
        calibrationConfirmed = true;
        if (DEV_MODE) console.log("[CALIBRATION] success");
        setTimeout(window.nextStep, 700);
      }
    }
  });
}

// ── Freefall monitor ────────────────────────────────────────────────────────
function monitorFreefall() {
  subscribeToSensor('accel.z', function(r) {
    var absZ = Math.abs(r.value);
    if (absZ < 3.5) {
      if (freefallStartTime === null) {
        freefallStartTime = performance.now();
        if (DEV_MODE) console.log("[FREEFALL] started");
      }
      if (performance.now() - freefallStartTime > 400) {
        vibrate('success_pattern');
        if (DEV_MODE) console.log("[FREEFALL] detected");
        freefallStartTime = null;
        if (currentStepIndex === 2) setTimeout(window.nextStep, 1000);
      }
    } else {
      freefallStartTime = null;
    }
  });
}

// ── Integrity check ─────────────────────────────────────────────────────────
async function verifyIntegrity() {
  if (DEV_MODE) {
    console.log("[DEV] Skipping integrity check");
    return true;
  }
  // TODO: real Ed25519 check against OLS_SIGNATURE and OLS_INTENDED_OWNER
  return true;
}

// ── Emulator controls (dev only) ────────────────────────────────────────────
function addEmulatorControls() {
  if (!DEV_MODE) return;
  if (DEV_MODE) console.log("[DEBUG] Adding emulator controls");

  var ctr = document.createElement('div');
  ctr.style.cssText = 'position:fixed;bottom:1rem;left:1rem;right:1rem;display:flex;gap:0.8rem;z-index:9999;';

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

// ── Render step ─────────────────────────────────────────────────────────────
function renderStep(step) {
  if (DEV_MODE) console.log("[DEBUG] Rendering step:", step.id || step.type);

  var app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = '';

  var container = document.createElement('div');
  container.className = 'step-container';

  var h2 = document.createElement('h2');
  var titleMatch = step.content ? step.content.match(/^##\s*(.+)$/m) : null;
  h2.textContent = titleMatch ? titleMatch[1] : (step.id || 'Step');
  container.appendChild(h2);

  var content = document.createElement('div');
  content.innerHTML = step.htmlContent || (step.content || '').replace(/\n/g, '<br>');
  container.appendChild(content);

  // Sensor unlock button
  if (step.type === 'hardware_trigger' && !sensorsActive) {
    var unlockBtn = document.createElement('button');
    unlockBtn.className = 'btn btn-primary';
    unlockBtn.style.marginTop = '1rem';
    unlockBtn.textContent = 'Enable Sensors (tap to start)';
    unlockBtn.onclick = function() {
      unlockAndStartSensors();
      unlockBtn.remove();
      renderStep(step);
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
    (step.answer_options || []).forEach(function(opt, idx) {
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

  var loading = document.getElementById('loading');
  if (loading) loading.style.display = 'none';
}

// ── Navigation ──────────────────────────────────────────────────────────────
window.nextStep = function() {
  if (currentStepIndex >= lesson.steps.length - 1) {
    // Use completion step content if present, otherwise generic message
    var completionStep = lesson.steps.find(function(s) { return s.type === 'completion' || s.id === 'completion'; });
    document.getElementById('app').innerHTML =
      '<div class="completion-screen">' +
      (completionStep
        ? (completionStep.htmlContent || completionStep.content || '<h1>Lesson Complete! 🎉</h1>')
        : '<h1>Lesson Complete! 🎉</h1>') +
      '</div>';
    return;
  }

  currentStepIndex++;
  renderStep(lesson.steps[currentStepIndex]);

  if (currentStepIndex === 1) monitorCalibration();
  if (currentStepIndex === 2) monitorFreefall();
};

// ── Init ────────────────────────────────────────────────────────────────────
async function initPlayer() {
  if (DEV_MODE) console.log("[DEBUG] initPlayer started");

  lesson = window.LESSON_DATA;

  // Resolve dev mode from compiled lesson data
  DEV_MODE = !!(lesson && lesson._devMode);
  if (DEV_MODE) console.log("[DEV] Developer mode active");

  if (!lesson || !Array.isArray(lesson.steps) || lesson.steps.length === 0) {
    console.error("[ERROR] Invalid lesson data");
    document.body.innerHTML = '<h1 style="color:#ff5252">Error: Invalid lesson data</h1>';
    var loading = document.getElementById('loading');
    if (loading) loading.style.display = 'none';
    return;
  }

  addEmulatorControls();
  renderStep(lesson.steps[currentStepIndex]);
}

// ── Entry point ─────────────────────────────────────────────────────────────
window.addEventListener('load', function() {
  if (DEV_MODE) console.log("[DEBUG] window.load fired");
  verifyIntegrity().then(function(passed) {
    if (passed) {
      initPlayer();
    } else {
      console.error("[ERROR] Integrity check failed");
    }
  }).catch(function(err) {
    console.error("[ERROR] verifyIntegrity threw:", err);
  });
});

// Safety net: force-hide loading spinner after 3s if init stalls
setTimeout(function() {
  var loading = document.getElementById('loading');
  if (loading) loading.style.display = 'none';
}, 3000);
