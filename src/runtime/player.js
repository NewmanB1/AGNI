// src/runtime/player.js
// AGNI / OLS Runtime – lesson-specific logic, depends on shared-runtime.js

// Reference shared utilities (injected by builder or loaded via <script src> in two-file model)
var svgGenerators = window.AGNI_SHARED ? window.AGNI_SHARED.svgGenerators : {};
var vibrate = window.AGNI_SHARED ? window.AGNI_SHARED.vibrate : function() {};
var subscribeToSensor = window.AGNI_SHARED ? window.AGNI_SHARED.subscribeToSensor : function() {};
var publishSensorReading = window.AGNI_SHARED ? window.AGNI_SHARED.publishSensorReading : function() {};

window.DEV_MODE = true;

var IS_OLD_ANDROID = /Android [456]\./.test(navigator.userAgent) ||
                     /Android 6\.0/.test(navigator.userAgent);

var currentStepIndex = 0;
var lesson = null;
var sensorSubscriptions = new Map();
var lastSensorValues = new Map();
var freefallStartTime = null;
var calibrationConfirmed = false;
var sensorsActive = false;

// Debug log at load
console.log("[PLAYER] player.js loaded – checking shared:", !!window.AGNI_SHARED);

// Vibration fallback if shared not loaded
if (!vibrate) {
  vibrate = function(pattern) {
    if (!('vibrate' in navigator)) return;
    navigator.vibrate(pattern === 'short' ? 70 : 150);
    if (window.DEV_MODE) console.log("[FALLBACK VIBRATE]", pattern);
  };
}

// Sensor pub/sub fallback
if (!subscribeToSensor) {
  subscribeToSensor = function() { console.warn("[WARN] subscribeToSensor not available"); };
}
if (!publishSensorReading) {
  publishSensorReading = function() { console.warn("[WARN] publishSensorReading not available"); };
}

// Start sensors after gesture
function unlockAndStartSensors() {
  if (sensorsActive) return;
  if (!window.DeviceMotionEvent) {
    console.warn("[WARN] DeviceMotionEvent not available");
    showSensorWarning();
    return;
  }

  console.log("[DEBUG] Starting devicemotion listener");

  function handler(e) {
    var acc = e.accelerationIncludingGravity;
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
      console.log("[ACCEL] x:" + x.toFixed(1) + " y:" + y.toFixed(1) + " z:" + z.toFixed(1) + " | mag:" + mag.toFixed(1));
    }
  }

  window.addEventListener('devicemotion', handler, { passive: true });
  sensorsActive = true;
  console.log("[SENSORS] activated" + (IS_OLD_ANDROID ? " (old mode)" : ""));
}

// Sensor fallback UI
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

// Calibration monitor
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

// Freefall monitor
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

// Skip binding in dev
async function verifyIntegrity() {
  if (window.DEV_MODE) {
    console.log("[DEV] Skipping integrity");
    return true;
  }
  // TODO: real check
  return true;
}

// Emulator buttons
function addEmulatorControls() {
  if (!window.DEV_MODE) return;
  console.log("[DEBUG] Adding emulator controls");

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

// Render step
function renderStep(step) {
  console.log("[DEBUG] Rendering step:", step.id || step.type);

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

  if (step.type === 'hardware_trigger' && sensorsActive) {
    var waiting = document.createElement('p');
    waiting.className = 'sensor-waiting';
    waiting.innerHTML = '<div class="pulse"></div><br>Waiting for sensor action…';
    container.appendChild(waiting);
  }

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
  document.getElementById('loading').style.display = 'none'; // Hide loading after render
}

// Navigation
window.nextStep = function() {
  if (currentStepIndex >= lesson.steps.length - 1) {
    document.getElementById('app').innerHTML =
      '<div class="completion-screen"><h1>Lesson Complete! 🎉</h1><p>You felt freefall.</p></div>';
    return;
  }

  currentStepIndex++;
  renderStep(lesson.steps[currentStepIndex]);

  if (currentStepIndex === 1) monitorCalibration();
  if (currentStepIndex === 2) monitorFreefall();
};

// Init
async function initPlayer() {
  console.log("[DEBUG] initPlayer started");

  lesson = window.LESSON_DATA;

  if (!lesson || !Array.isArray(lesson.steps) || lesson.steps.length === 0) {
    console.error("[ERROR] Invalid lesson data");
    document.body.innerHTML = '<h1 style="color:#ff5252">Error: Invalid lesson data</h1>';
    document.getElementById('loading').style.display = 'none';
    return;
  }

  console.log("[DEBUG] Lesson loaded – starting sensors");

  startSensorListeners();
  renderStep(lesson.steps[currentStepIndex]);
}

// Entry point
window.addEventListener('load', function () {
  console.log("[DEBUG] window.load fired");
  verifyIntegrity().then(function(passed) {
    if (passed) {
      initPlayer();
    }
  }).catch(function(err) {
    console.error("[ERROR] verifyIntegrity failed:", err);
  });
});

// Super fallback
setTimeout(function() {
  console.log("[SAFETY] Forcing hide loading");
  var loading = document.getElementById('loading');
  if (loading) loading.style.display = 'none';
}, 3000);
