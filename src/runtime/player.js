// src/runtime/player.js
// AGNI Lesson Player  v1.8.0
//
// The lesson-specific runtime layer. Orchestrates the lesson lifecycle:
//   gate evaluation → sensor init → step rendering → routing → completion
//
// Architecture: strict separation between business logic and view layer.
//
//   Business layer (owns state and decisions):
//     initPlayer()               — lesson lifecycle entry point
//     evaluateGate()             — prerequisite check before lesson starts
//     evaluateHardwareTrigger()  — threshold watching for sensor steps
//     routeStep()                — all step navigation flows through here
//     buildStepIndex()           — O(1) step lookup by id
//
//   View layer (renders only, owns no state or decisions):
//     renderStep()               — renders a step's content
//     renderGateQuiz()           — renders the gate prerequisite quiz
//     renderGateRedirect()       — renders the gate failure halt screen
//     showPermissionPrompt()     — renders the sensor permission button
//     showSensorWarning()        — renders sensor unavailable notice
//     renderCompletion()         — renders lesson complete screen
//     addEmulatorControls()      — dev-only sensor simulation controls
//
// Dependencies (loaded by html.js or factory-loader.js before player.js):
//   shared-runtime.js  — AGNI_SHARED: pub/sub, vibration, device detection
//   sensor-bridge.js   — AGNI_SHARED.sensorBridge: hardware sensor access
//   threshold-evaluator.js — AGNI_SHARED.thresholdEvaluator: threshold parsing
//
// Target platform: iOS 9+, Android 4+. No ES6+, no arrow functions,
// no const/let, no async/await — use explicit Promise chains throughout.
// ─────────────────────────────────────────────────────────────────────────────

// ── DEV_MODE ────────────────────────────────────────────────────────────────
// Single source of truth: window.LESSON_DATA._devMode, set by the compiler
// when --dev flag is passed. Resolved in initPlayer() after LESSON_DATA is
// guaranteed available. Default false is safe — never hardcode true here.
var DEV_MODE = false;

// ── Lesson state ─────────────────────────────────────────────────────────────
var lesson           = null;   // full LESSON_DATA object
var currentStepIndex = 0;      // index of the currently displayed step
var stepIndex        = null;   // Map<step_id, index> — built once in initPlayer()

// ── Active threshold cancel handle ───────────────────────────────────────────
// Holds the cancel function returned by thresholdEvaluator.watch() for the
// currently active hardware_trigger step. Null when no hardware_trigger is
// active. Must be called and nulled before any step transition so that stale
// sensor subscriptions do not fire into the next step's evaluator.
var _activeCancel = null;

// ── Shared runtime references ─────────────────────────────────────────────────
// Accessed via AGNI_SHARED at call time — never cached at parse time.
// sensor-bridge.js may not be loaded yet when this script is parsed.
function _vibrate(pattern) {
  if (window.AGNI_SHARED && window.AGNI_SHARED.vibrate) {
    window.AGNI_SHARED.vibrate(pattern);
  }
}

console.log('[PLAYER] player.js v1.8.0 loaded – shared available:', !!window.AGNI_SHARED);


// ═══════════════════════════════════════════════════════════════════════════
// BUSINESS LAYER
// ═══════════════════════════════════════════════════════════════════════════

// ── Step index ───────────────────────────────────────────────────────────────

/**
 * Builds a plain-object lookup table { step_id: index } from the lesson steps array.
 * Allows O(1) step lookup by id throughout the lesson lifecycle.
 * Steps without an id are omitted — they can only be reached by index.
 * Called once in initPlayer() before any navigation occurs.
 *
 * Plain object is used instead of Map for compatibility with Android 4.0–4.3
 * (Chrome < 38), which is within the target hardware range for this project.
 * Map is available from Chrome 38 / Android 4.4+ and Safari 7.1 / iOS 9+,
 * but Android 4.0–4.3 devices are common in the target deployment environment.
 *
 * @param  {Array} steps
 * @returns {object}  { step_id: index }
 */
function buildStepIndex(steps) {
  var index = {};
  (steps || []).forEach(function (step, i) {
    if (step.id) index[step.id] = i;
  });
  return index;
}


// ── Directive resolution ─────────────────────────────────────────────────────

/**
 * Parses a branching directive string into a target step id.
 *
 * Supported formats:
 *   'skip_to:<step_id>'      — skip forward to a named step
 *   'redirect:<step_id>'     — same as skip_to within this lesson
 *   'redirect:ols:<uri>'     — external lesson URI; returns null
 *   '<step_id>'              — bare step id (on_success shorthand)
 *
 * External redirects (ols: URIs) return null because the player has no
 * cross-lesson navigation capability — that is the village hub's responsibility.
 * The caller (routeStep) treats null as lesson completion and shows the
 * redirect halt screen.
 *
 * @param  {string} directive
 * @returns {string|null}   step id, or null for external redirects
 */
function resolveDirective(directive) {
  if (!directive) return null;
  var str = String(directive).trim();

  // External OLS URI — player cannot follow
  if (/^redirect:ols:/i.test(str)) return null;

  // skip_to:<id> or redirect:<id>
  var prefixMatch = str.match(/^(?:skip_to|redirect):(.+)$/i);
  if (prefixMatch) return prefixMatch[1].trim();

  // Bare step id
  return str;
}


// ── Step routing ─────────────────────────────────────────────────────────────

/**
 * Resolves a step outcome to a target step and advances the lesson.
 *
 * This is the single point of navigation control. Nothing else should
 * directly manipulate currentStepIndex — all transitions flow here.
 *
 * Routing resolution order:
 *   1. Outcome-specific directive on the step (on_success / on_fail)
 *   2. Next step by index
 *   3. Lesson complete (no next step)
 *
 * Supported outcome values: 'success', 'fail', 'skip'
 *
 * External redirects (ols: URIs) are treated as lesson completion — the
 * player logs the intended redirect but cannot follow it. Cross-lesson
 * routing is the village hub's responsibility.
 *
 * @param {object} step     the step that just completed
 * @param {string} outcome  'success' | 'fail' | 'skip'
 */
function routeStep(step, outcome) {
  // Cancel any active threshold watcher before navigating away.
  // This prevents stale sensor subscriptions from firing into the next step.
  if (_activeCancel) {
    _activeCancel();
    _activeCancel = null;
  }

  // Stop simulation if running in dev mode
  if (DEV_MODE && window.AGNI_SHARED && window.AGNI_SHARED.sensorBridge) {
    window.AGNI_SHARED.sensorBridge.stopSimulation();
  }

  // Clear sensor subscriptions set up by the current step
  if (window.AGNI_SHARED && window.AGNI_SHARED.clearSensorSubscriptions) {
    window.AGNI_SHARED.clearSensorSubscriptions();
  }

  // Tear down any active visual (SVG factory etc.) before re-rendering
  if (window.AGNI_SHARED && window.AGNI_SHARED.destroyStepVisual) {
    window.AGNI_SHARED.destroyStepVisual();
  }

  if (DEV_MODE) console.log('[ROUTER] step:', (step && step.id) || '?', 'outcome:', outcome);

  // ── Resolve directive ──────────────────────────────────────────────────────
  var directive = null;
  if (outcome === 'fail'    && step && step.on_fail)    directive = step.on_fail;
  if (outcome === 'success' && step && step.on_success) directive = step.on_success;

  var targetId = directive ? resolveDirective(directive) : null;

  // External redirect — halt with information screen
  if (directive && targetId === null) {
    if (DEV_MODE) console.log('[ROUTER] external redirect:', directive);
    renderGateRedirect({ on_fail: directive });
    return;
  }

  // Named target — look up by id
  if (targetId) {
    var targetIndex = (stepIndex && stepIndex[targetId] !== undefined) ? stepIndex[targetId] : undefined;
    if (targetIndex !== undefined) {
      currentStepIndex = targetIndex;
      renderStep(lesson.steps[currentStepIndex]);
      return;
    }
    console.warn('[ROUTER] unknown step id:', targetId, '— advancing by index');
  }

  // Default: advance to next step by index
  if (currentStepIndex >= lesson.steps.length - 1) {
    renderCompletion();
    return;
  }

  currentStepIndex++;
  renderStep(lesson.steps[currentStepIndex]);
}


// ── Hardware trigger evaluation ───────────────────────────────────────────────

/**
 * Activates threshold evaluation for a hardware_trigger step.
 *
 * Reads step.threshold, step.sensor, and step.feedback from the lesson YAML.
 * Uses AGNI_SHARED.thresholdEvaluator.watch() to subscribe to the step's
 * primary sensor and evaluate the threshold expression on every reading.
 * Fires once when the threshold is met, then unsubscribes automatically.
 *
 * The cancel function is stored in _activeCancel so that routeStep() can
 * abort an in-progress evaluation cleanly on any step transition.
 * Always cancel before navigating away from a hardware_trigger step —
 * routeStep() does this automatically.
 *
 * Feedback (vibration) is read from step.feedback in the format:
 *   'vibration:<pattern_name>'  e.g. 'vibration:success_pattern'
 *
 * If threshold-evaluator.js is not loaded (factory not yet cached on device),
 * this logs a warning and does not set up evaluation — the step will display
 * its content but sensor triggering will not work. This is a graceful
 * degradation, not a crash.
 *
 * max_attempts tracking is not yet implemented — noted for Phase 5.
 *
 * @param {object} step   a hardware_trigger step from the lesson
 */
function evaluateHardwareTrigger(step) {
  var S = window.AGNI_SHARED;
  if (!S || !S.thresholdEvaluator) {
    console.warn('[PLAYER] threshold-evaluator not loaded — sensor step will not trigger');
    return;
  }

  if (!step.threshold) {
    console.warn('[PLAYER] hardware_trigger step has no threshold:', step.id);
    return;
  }

  // Infer primary sensor from threshold string if step.sensor is generic
  // ('accelerometer') or absent. threshold-evaluator.watch() needs a specific
  // sensor id to subscribe to (e.g. 'accel.total', 'accel.z').
  var primarySensor = inferPrimarySensor(step.threshold, step.sensor);

  if (DEV_MODE) {
    console.log('[PLAYER] evaluateHardwareTrigger — step:', step.id,
      'threshold:', step.threshold, 'sensor:', primarySensor);
  }

  _activeCancel = S.thresholdEvaluator.watch(
    step.threshold,
    primarySensor,
    function onMet() {
      _activeCancel = null;

      // Parse and trigger feedback before routing
      if (step.feedback) {
        var fbMatch = step.feedback.match(/^vibration:(.+)$/i);
        if (fbMatch) _vibrate(fbMatch[1]);
      }

      // Small delay so the student feels the feedback before the UI changes
      setTimeout(function () {
        routeStep(step, 'success');
      }, 600);
    }
  );
}

/**
 * Infers the specific sensor id to subscribe to from a threshold string.
 *
 * threshold-evaluator.watch() needs a concrete sensor id (e.g. 'accel.total')
 * to know which sensor stream drives evaluation cadence. Lesson YAML often
 * specifies step.sensor as a generic category ('accelerometer') rather than
 * a stream id, so we read the threshold string itself to find the primary
 * sensor reference.
 *
 * Falls back to 'accel.total' as the most common AGNI sensor for motion steps.
 *
 * @param  {string} thresholdStr   e.g. 'freefall > 0.35s' or 'accel.z > 7.5'
 * @param  {string} [stepSensor]   step.sensor from YAML (may be generic)
 * @returns {string}               specific sensor id
 */
function inferPrimarySensor(thresholdStr, stepSensor) {
  // Named keywords map to their driving sensor
  if (/\bfreefall\b/i.test(thresholdStr)) return 'accel.total';
  if (/\bsteady\b/i.test(thresholdStr))   return 'accel.total';

  // Extract first sensorId-looking token (word chars and dots, not a keyword)
  var match = thresholdStr.match(/\b([a-z_][a-z0-9_.]*)\s*(?:>=|<=|==|!=|>|<)/i);
  if (match && match[1]) return match[1];

  // Fall back to generic category mapping
  if (stepSensor === 'accelerometer') return 'accel.total';
  if (stepSensor === 'gyroscope')     return 'gyro.magnitude';
  if (stepSensor === 'orientation')   return 'rotation.gamma';

  return 'accel.total';
}


// ── Gate evaluation ───────────────────────────────────────────────────────────

/**
 * Evaluates the lesson-level gate block before the lesson begins.
 *
 * The gate is an entry condition, not a step. It runs once at lesson start
 * and either clears the path for the lesson or halts with a redirect screen.
 * The step flow never begins if the gate fails.
 *
 * Currently supports gate.type === 'quiz' only. Other gate types are logged
 * as unsupported and treated as passing so the lesson is not blocked by
 * unrecognised gate types introduced in future schema versions.
 *
 * retry_delay (ISO 8601 duration) is parsed but not enforced in this
 * implementation — noted for Phase 5 alongside max_attempts.
 *
 * Cross-lesson redirects (ols: URIs) cannot be followed by the player —
 * that is the village hub's responsibility. renderGateRedirect() informs
 * the student which prerequisite to complete.
 *
 * @param  {object} lesson   full lesson data object
 * @returns {Promise<boolean>}  true if gate passes or absent, false if halted
 */
function evaluateGate(lesson) {
  if (!lesson.gate) return Promise.resolve(true);

  var gate = lesson.gate;

  if (gate.type !== 'quiz') {
    console.warn('[GATE] unsupported gate type:', gate.type, '— treating as pass');
    return Promise.resolve(true);
  }

  return renderGateQuiz(gate).then(function (outcome) {
    if (outcome === 'pass') return true;
    renderGateRedirect(gate);
    return false;
  });
}


// ── Emulator controls (dev only) ─────────────────────────────────────────────

/**
 * Adds developer emulator controls to the bottom of the screen.
 * Only active when DEV_MODE is true. Called after each step render so
 * the controls reflect the current step type and threshold.
 *
 * Emulator buttons publish synthetic sensor readings through
 * AGNI_SHARED.sensorBridge.startSimulation() rather than calling
 * routeStep() directly. This exercises the full evaluation path:
 *   synthetic reading → threshold-evaluator → routeStep()
 *
 * On hardware_trigger steps: shows a 'Simulate: <pattern>' button that
 * starts the matching simulation, plus a clearly-labelled dev skip button.
 *
 * On all other step types: shows only the dev skip button, since there
 * is no sensor path to exercise.
 *
 * The 'Skip step (dev)' button calls routeStep() directly and is explicitly
 * labelled as a dev shortcut — not a simulated sensor path — so contributors
 * reading the UI understand what it bypasses.
 */
function addEmulatorControls() {
  if (!DEV_MODE) return;

  // Remove any previous emulator controls
  var existing = document.getElementById('agni-emulator-controls');
  if (existing) existing.parentNode.removeChild(existing);

  var step = lesson && lesson.steps && lesson.steps[currentStepIndex];

  var ctr = document.createElement('div');
  ctr.id = 'agni-emulator-controls';
  ctr.style.cssText = [
    'position:fixed',
    'bottom:1rem',
    'left:1rem',
    'right:1rem',
    'display:flex',
    'gap:0.6rem',
    'z-index:9999',
    'flex-wrap:wrap'
  ].join(';');

  // Label so it's obvious in the UI this is a dev overlay
  var label = document.createElement('div');
  label.style.cssText = 'width:100%;font-size:0.7rem;color:#ffcc00;opacity:0.8;';
  label.textContent = '⚙ DEV MODE';
  ctr.appendChild(label);

  // hardware_trigger: simulate button drives the full evaluation path
  if (step && step.type === 'hardware_trigger' && step.threshold) {
    var pattern = inferSimulationPattern(step.threshold);

    var btnSim = document.createElement('button');
    btnSim.className = 'btn btn-primary';
    btnSim.textContent = 'Simulate: ' + pattern;
    btnSim.onclick = function () {
      var S = window.AGNI_SHARED;
      if (S && S.sensorBridge) {
        S.sensorBridge.startSimulation({ pattern: pattern });
      }
    };
    ctr.appendChild(btnSim);

    var btnStop = document.createElement('button');
    btnStop.className = 'btn btn-primary';
    btnStop.textContent = 'Stop simulation';
    btnStop.onclick = function () {
      var S = window.AGNI_SHARED;
      if (S && S.sensorBridge) S.sensorBridge.stopSimulation();
    };
    ctr.appendChild(btnStop);
  }

  // All step types: explicit dev skip — labelled so contributors know what it bypasses
  var btnSkip = document.createElement('button');
  btnSkip.className = 'btn btn-primary';
  btnSkip.textContent = 'Skip step (dev)';
  btnSkip.title = 'Dev shortcut: bypasses sensor evaluation and routes as success';
  btnSkip.onclick = function () {
    routeStep(step, 'success');
  };
  ctr.appendChild(btnSkip);

  document.body.appendChild(ctr);
}

/**
 * Infers the most appropriate simulation pattern for a given threshold string.
 * Used by the emulator to select a synthetic sensor pattern that will satisfy
 * the threshold and exercise the full evaluation path in dev mode.
 *
 * Falls back to 'shake' for unrecognised threshold expressions.
 *
 * @param  {string} thresholdStr   e.g. 'freefall > 0.35s' or 'accel.z > 7.5'
 * @returns {string}               pattern name for sensorBridge.startSimulation()
 */
function inferSimulationPattern(thresholdStr) {
  if (!thresholdStr) return 'shake';
  if (/\bfreefall\b/i.test(thresholdStr))   return 'freefall';
  if (/\baccel\.z\b/i.test(thresholdStr))   return 'still';   // phone held flat: accel.z ≈ 9.8
  if (/\brotation\b/i.test(thresholdStr))   return 'tilt';
  if (/\bsteady\b/i.test(thresholdStr))     return 'still';
  return 'shake';
}


// ── Integrity check ───────────────────────────────────────────────────────────

/**
 * Verifies lesson data integrity against OLS_SIGNATURE and OLS_INTENDED_OWNER.
 *
 * TODO (Phase 4): implement Ed25519 verification using the Web Crypto
 * SubtleCrypto API. On iOS 9 SubtleCrypto is available under the
 * window.crypto.subtle prefix but Ed25519 support is limited — a polyfill
 * or pure-JS fallback will be needed. Track at:
 * https://github.com/NewmanB1/AGNI/issues/XXX
 *
 * In dev mode, verification is skipped entirely to avoid blocking development.
 *
 * @returns {Promise<boolean>}
 */
function verifyIntegrity() {
  if (DEV_MODE) {
    console.log('[DEV] Skipping integrity check');
    return Promise.resolve(true);
  }
  // Placeholder: always passes until Phase 4 implements real verification
  return Promise.resolve(true);
}


// ── Sensor permission prompt ─────────────────────────────────────────────────

/**
 * Renders a pre-lesson sensor activation screen with an explicit labeled button.
 *
 * Two distinct platform constraints make an explicit button tap necessary
 * before AGNI_SHARED.sensorBridge.start() can be called:
 *
 *   iOS 9–12:  DeviceMotion events are silently suppressed until the page
 *              has received a real user touch interaction. There is no API
 *              to detect or request this — events just never fire without
 *              a prior gesture. Without this button, sensor steps on a
 *              freshly loaded lesson will wait forever.
 *
 *   iOS 13+:   DeviceMotionEvent.requestPermission() must be called from
 *              within a user gesture event handler. Calling it programmatically
 *              (e.g. in initPlayer()) silently fails and the permission dialog
 *              never appears.
 *
 *   Android / desktop: neither constraint applies, but showing the button
 *   provides consistent UX and sets student expectation before sensor steps.
 *
 * The button is a discrete labeled element — not a full-screen tap target —
 * so that other UI elements on the same screen cannot accidentally satisfy
 * the iOS gesture requirement.
 *
 * Resolves after the user taps and sensorBridge.start() completes.
 * Called by initPlayer() only when sensorBridge.needsPermissionGesture is
 * true. Never called from renderStep() — sensor lifecycle is the business
 * layer's responsibility, not the view layer's.
 *
 * @returns {Promise<void>}
 */
function showPermissionPrompt() {
  return new Promise(function (resolve) {
    var app = document.getElementById('app');
    if (!app) { resolve(); return; }
    app.innerHTML = '';

    var container = document.createElement('div');
    container.className = 'step-container';

    var h2 = document.createElement('h2');
    h2.textContent = 'Motion sensor needed';
    container.appendChild(h2);

    var msg = document.createElement('p');
    msg.textContent = 'This lesson uses your phone\'s motion sensor to detect movement.';
    container.appendChild(msg);

    var btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.textContent = 'Allow motion sensor';
    btn.onclick = function () {
      var S = window.AGNI_SHARED;
      if (S && S.sensorBridge) {
        S.sensorBridge.start().then(function (available) {
          if (!available) showSensorWarning();
          resolve();
        });
      } else {
        resolve();
      }
    };
    container.appendChild(btn);

    app.appendChild(container);
    var loading = document.getElementById('loading');
    if (loading) loading.style.display = 'none';
  });
}


// ═══════════════════════════════════════════════════════════════════════════
// VIEW LAYER
// All functions below render UI only. They own no state and make no
// routing decisions. If a view function needs to trigger navigation it
// does so by resolving a Promise (gate quiz) or calling routeStep() via
// a user interaction handler — never by manipulating currentStepIndex directly.
// ═══════════════════════════════════════════════════════════════════════════

// ── Sensor warning ────────────────────────────────────────────────────────────

/**
 * Appends a sensor unavailable notice to the app container.
 * Called when sensorBridge.start() resolves false (hardware not available).
 * Does not block the lesson — sensor steps will simply not trigger.
 */
function showSensorWarning() {
  var S = window.AGNI_SHARED;
  var isOldAndroid = S && S.device && S.device.isOldAndroid;

  var p = document.createElement('p');
  p.style.cssText = 'color:#ffcc00;text-align:center;padding:1rem;';
  p.textContent = isOldAndroid
    ? 'Sensors not responding. Use the skip button or shake the device.'
    : 'Motion sensor unavailable on this device.';

  var app = document.getElementById('app');
  if (app) app.appendChild(p);
}


// ── Step rendering ────────────────────────────────────────────────────────────

/**
 * Renders a lesson step into the #app container.
 *
 * Pure view function: renders content only, dispatches to the business layer
 * for any step type that requires active evaluation (hardware_trigger).
 * Does not own sensor state, does not call sensorBridge, does not route.
 *
 * Step types handled:
 *   instruction      — display content, 'Continue' button → routeStep success
 *   hardware_trigger — display content + waiting indicator, calls evaluateHardwareTrigger()
 *   quiz             — display answer options, routes on correct/incorrect
 *   completion       — handed off to renderCompletion()
 *   (unknown)        — renders content with a continue button as fallback
 *
 * @param {object} step   a step object from lesson.steps
 */
function renderStep(step) {
  if (DEV_MODE) console.log('[PLAYER] renderStep:', step.id || step.type);

  var app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = '';

  var container = document.createElement('div');
  container.className = 'step-container';

  // ── Title ──────────────────────────────────────────────────────────────────
  var h2 = document.createElement('h2');
  var titleMatch = step.content ? step.content.match(/^##\s*(.+)$/m) : null;
  h2.textContent = titleMatch ? titleMatch[1] : (step.id || 'Step');
  container.appendChild(h2);

  // ── Content ────────────────────────────────────────────────────────────────
  var content = document.createElement('div');
  content.className = 'step-content';
  content.innerHTML = step.htmlContent || (step.content || '').replace(/\n/g, '<br>');
  container.appendChild(content);

  // ── Step-type-specific UI ──────────────────────────────────────────────────
  if (step.type === 'completion') {
    app.appendChild(container);
    renderCompletion();
    return;
  }

  if (step.type === 'hardware_trigger') {
    // Waiting indicator — shown when sensors are active
    var S = window.AGNI_SHARED;
    var bridgeActive = S && S.sensorBridge && S.sensorBridge.isActive();

    if (bridgeActive) {
      var waiting = document.createElement('p');
      waiting.className = 'sensor-waiting';
      waiting.innerHTML = '<div class="pulse"></div><br>Waiting for sensor action\u2026';
      container.appendChild(waiting);

      // Start threshold evaluation (business layer)
      evaluateHardwareTrigger(step);
    } else {
      // Sensor bridge is not active — show a warning
      showSensorWarning();
    }
  }

  if (step.type === 'quiz') {
    (step.answer_options || []).forEach(function (opt, idx) {
      var btn = document.createElement('button');
      btn.className = 'btn btn-option';
      btn.textContent = opt;
      btn.onclick = function () {
        var correct = (idx === step.correct_index);
        btn.classList.add(correct ? 'correct' : 'incorrect');
        _vibrate(correct ? 'short' : 'error');
        if (correct) {
          setTimeout(function () { routeStep(step, 'success'); }, 1400);
        } else {
          // Incorrect: stay on step (max_attempts tracking — Phase 5)
          // If on_fail directive exists, it will be followed on next incorrect
          if (step.on_fail) {
            setTimeout(function () { routeStep(step, 'fail'); }, 1400);
          }
        }
      };
      container.appendChild(btn);
    });
  }

  if (step.type === 'instruction') {
    var continueBtn = document.createElement('button');
    continueBtn.className = 'btn btn-primary';
    continueBtn.textContent = 'Continue';
    continueBtn.style.marginTop = '1.5rem';
    continueBtn.onclick = function () { routeStep(step, 'success'); };
    container.appendChild(continueBtn);
  }

  app.appendChild(container);

  var loading = document.getElementById('loading');
  if (loading) loading.style.display = 'none';

  // Re-render emulator controls for the new step (dev only)
  addEmulatorControls();
}


// ── Completion screen ─────────────────────────────────────────────────────────

/**
 * Renders the lesson completion screen.
 * Uses the completion step's content if present in the lesson, otherwise
 * renders a generic completion message.
 */
function renderCompletion() {
  var app = document.getElementById('app');
  if (!app) return;

  var completionStep = lesson.steps
    ? lesson.steps.find(function (s) { return s.type === 'completion' || s.id === 'completion'; })
    : null;

  app.innerHTML = '<div class="completion-screen">' +
    (completionStep
      ? (completionStep.htmlContent || completionStep.content || '<h1>Lesson Complete! \uD83C\uDF89</h1>')
      : '<h1>Lesson Complete! \uD83C\uDF89</h1>') +
    '</div>';
}


// ── Gate quiz ─────────────────────────────────────────────────────────────────

/**
 * Renders the gate prerequisite quiz and returns a Promise<'pass'|'fail'>.
 *
 * The gate quiz uses free-text input matched case-insensitively against
 * gate.expected_answer. This differs from step quizzes which use indexed
 * answer_options — the gate schema tests recall (open answer) while step
 * quizzes test recognition (multiple choice). Do not merge these render paths.
 *
 * @param  {object} gate   the lesson gate block
 * @returns {Promise<'pass'|'fail'>}
 */
function renderGateQuiz(gate) {
  return new Promise(function (resolve) {
    var app = document.getElementById('app');
    if (!app) { resolve('pass'); return; }
    app.innerHTML = '';

    var container = document.createElement('div');
    container.className = 'step-container';

    var h2 = document.createElement('h2');
    h2.textContent = 'Quick check before we start';
    container.appendChild(h2);

    var q = document.createElement('p');
    q.textContent = gate.question || '';
    container.appendChild(q);

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'gate-input';
    input.placeholder = 'Type your answer\u2026';
    input.style.cssText = 'width:100%;padding:0.75rem;font-size:1rem;margin:1rem 0;box-sizing:border-box;';
    container.appendChild(input);

    var feedback = document.createElement('p');
    feedback.style.cssText = 'min-height:1.5rem;color:#ffcc00;';
    container.appendChild(feedback);

    var btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.textContent = 'Check answer';
    btn.onclick = function () {
      var answer = input.value.trim().toLowerCase();
      var expected = (gate.expected_answer || '').toString().trim().toLowerCase();
      if (answer === expected) {
        _vibrate('short');
        resolve('pass');
      } else {
        _vibrate('error');
        feedback.textContent = 'Not quite — try again.';
        input.value = '';
        input.focus();
        // on_fail routing handled by evaluateGate() — renderGateQuiz resolves 'fail'
        // only if we decide to stop retrying. For now, keep prompting.
        // Phase 5: enforce gate.retry_delay and gate.passing_score.
      }
    };
    container.appendChild(btn);

    app.appendChild(container);
    var loading = document.getElementById('loading');
    if (loading) loading.style.display = 'none';
    input.focus();
  });
}


// ── Gate redirect halt screen ─────────────────────────────────────────────────

/**
 * Renders a halt screen when the gate prerequisite is not met.
 *
 * The player cannot follow external OLS URIs — cross-lesson navigation is
 * the village hub's responsibility. This screen informs the student which
 * prerequisite lesson to complete and does not advance.
 *
 * This is intentionally a dead end in the player.
 *
 * @param {object} gate   the lesson gate block (or a step with on_fail directive)
 */
function renderGateRedirect(gate) {
  var app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = '';

  var container = document.createElement('div');
  container.className = 'step-container';

  var h2 = document.createElement('h2');
  h2.textContent = 'Prerequisite needed';
  container.appendChild(h2);

  var msg = document.createElement('p');
  var directive = (gate && gate.on_fail) || '';
  var prereqId  = directive.replace(/^redirect:/i, '').replace(/^ols:/i, '');
  msg.textContent = prereqId
    ? 'Please complete "' + prereqId + '" before starting this lesson.'
    : 'Please complete the prerequisite lesson before starting this one.';
  container.appendChild(msg);

  var note = document.createElement('p');
  note.style.cssText = 'font-size:0.85rem;opacity:0.7;margin-top:1rem;';
  note.textContent = 'Ask your teacher or find the lesson on the village hub.';
  container.appendChild(note);

  app.appendChild(container);
  var loading = document.getElementById('loading');
  if (loading) loading.style.display = 'none';
}


// ═══════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Lesson lifecycle entry point. Called once after integrity check passes.
 *
 * Order of operations:
 *   1. Resolve DEV_MODE from lesson data (single source of truth)
 *   2. Build step id lookup map
 *   3. Load lesson-defined vibration patterns into shared runtime
 *   4. Evaluate gate (prerequisite check) — halts if failed
 *   5. Initialise sensors if the lesson requires them
 *   6. Render first step
 *
 * Sensor init (step 5) happens in the business layer before any step
 * renders. renderStep() is a pure view function and must never own
 * sensor state or call sensorBridge directly.
 */
function initPlayer() {
  lesson = window.LESSON_DATA;

  // ── 1. Resolve DEV_MODE — single source of truth ───────────────────────────
  // DEV_MODE is set by the compiler via LESSON_DATA._devMode (--dev flag).
  // It is never hardcoded. All other runtime files read from LESSON_DATA
  // or from AGNI_SHARED.log which respects the same flag.
  DEV_MODE = !!(lesson && lesson._devMode);
  if (DEV_MODE) console.log('[DEV] Developer mode active');

  if (!lesson || !Array.isArray(lesson.steps) || lesson.steps.length === 0) {
    console.error('[ERROR] Invalid lesson data');
    var body = document.getElementById('app') || document.body;
    body.innerHTML = '<h1 style="color:#ff5252">Error: Invalid lesson data</h1>';
    var loading = document.getElementById('loading');
    if (loading) loading.style.display = 'none';
    return;
  }

  // ── 2. Build step id lookup map ────────────────────────────────────────────
  // Built once here — all navigation uses this map, never scans steps array.
  stepIndex = buildStepIndex(lesson.steps);

  // ── 3. Load lesson vibration patterns ──────────────────────────────────────
  var S = window.AGNI_SHARED;
  if (S && S.loadLessonVibrationPatterns) {
    S.loadLessonVibrationPatterns(lesson);
  }

  // ── 4. Gate evaluation ─────────────────────────────────────────────────────
  // Must complete before sensor init and step rendering.
  // Returns a Promise — use .then() chain, not async/await (iOS 9 target).
  var gatePromise = lesson.gate
    ? evaluateGate(lesson)
    : Promise.resolve(true);

  gatePromise.then(function (gatePassed) {
    if (!gatePassed) return;   // renderGateRedirect() already shown

    // ── 5. Sensor init ─────────────────────────────────────────────────────
    // Sensor initialisation happens here, in the business layer, before any
    // step renders. renderStep() must never own sensor state or call
    // sensorBridge directly.
    //
    // On iOS (any version) we cannot call sensorBridge.start() programmatically
    // — it must be triggered by an explicit labeled user gesture. On all other
    // platforms start() can be called directly.
    //
    // We check lesson.inferredFeatures.flags.has_sensors if available;
    // otherwise we check step types directly as a fallback for lessons
    // compiled without feature inference.
    var hasSensors = (
      (lesson.inferredFeatures && lesson.inferredFeatures.flags && lesson.inferredFeatures.flags.has_sensors) ||
      (lesson.steps || []).some(function (s) { return s.type === 'hardware_trigger'; })
    );

    var sensorPromise;
    if (hasSensors && S && S.sensorBridge) {
      if (S.sensorBridge.needsPermissionGesture) {
        sensorPromise = showPermissionPrompt();
      } else {
        sensorPromise = S.sensorBridge.start().then(function (available) {
          if (!available) showSensorWarning();
        });
      }
    } else {
      sensorPromise = Promise.resolve();
    }

    sensorPromise.then(function () {
      // ── 6. Render first step ─────────────────────────────────────────────
      currentStepIndex = 0;
      renderStep(lesson.steps[currentStepIndex]);
    });
  });
}


// ═══════════════════════════════════════════════════════════════════════════
// ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════

window.addEventListener('load', function () {
  verifyIntegrity().then(function (passed) {
    if (passed) {
      initPlayer();
    } else {
      console.error('[ERROR] Integrity check failed');
      var app = document.getElementById('app') || document.body;
      app.innerHTML = '<h1 style="color:#ff5252">Lesson integrity check failed.</h1>';
    }
  }).catch(function (err) {
    console.error('[ERROR] verifyIntegrity threw:', err);
  });
});

// Safety net: force-hide loading spinner after 5s if init stalls.
// The html.js builder also sets a 5s timeout as an additional safety layer.
setTimeout(function () {
  var loading = document.getElementById('loading');
  if (loading) loading.style.display = 'none';
}, 5000);
