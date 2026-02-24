// src/runtime/player.js
// AGNI Lesson Player  v1.9.3
//
// Lesson state machine. Evaluates gates, renders steps, routes navigation.
// Depends on: shared-runtime.js (AGNI_SHARED), sensor-bridge.js,
//             threshold-evaluator.js
// Loaded inline by html.js after factory-loader.js and LESSON_DATA.
//
// Changes from v1.9.2:
//   [Phase 4] verifyIntegrity() implemented. Replaces always-true placeholder.
//     Reads OLS_SIGNATURE, OLS_PUBLIC_KEY, OLS_INTENDED_OWNER from window
//     globals embedded by html.js at build time. Verifies using SubtleCrypto
//     (Ed25519, iOS 15+, all modern browsers) with automatic fallback to
//     TweetNaCl pure-JS for iOS 9–14 and legacy WebKit. See Section 1.
//
//   [Fix] renderGateQuiz() now resolves 'fail'. Previously wrong answers looped
//     forever with no way out — gate.on_fail was unreachable. Now honours
//     gate.max_attempts (default 3) and shows an escape button once exhausted.
//
//   [Fix] initSensors() non-gesture path now has a .catch() on sensorBridge.start().
//     Previously a hardware error or OS permission denial would silently stall
//     the init chain and the lesson would never start.
//
//   [Fix] renderStep() appends container to app *before* calling mountStepVisual().
//     Previously specContainer was detached at mount time, causing
//     getBoundingClientRect() calls inside svg-stage.js to return zeroes.
//
//   [Fix] completion-type steps no longer call app.appendChild(container) before
//     renderCompletion(), which immediately overwrites app.innerHTML anyway.
//
//   [Fix] routeStep() now normalises external gate redirect directives through
//     resolveDirective() so skip_to: prefixes are stripped, matching all other
//     routing paths.
// ─────────────────────────────────────────────────────────────────────────────

(function (global) {
  'use strict';

  if (!global.LESSON_DATA) {
    console.error('[PLAYER] LESSON_DATA not found \u2014 aborting');
    return;
  }

  var DEV_MODE = !!(global.LESSON_DATA._devMode);

  // Refreshed at each call site after loadDependencies() resolves.
  var S = global.AGNI_SHARED || {};

  var lesson    = global.LESSON_DATA;
  var steps     = lesson.steps || [];
  var history   = [];
  var stepIndex = 0;


  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 1 — Integrity Verification (Phase 4)
  //
  // Verifies the Ed25519 signature embedded by the Hub at build time.
  //
  // What was signed (crypto.js, server-side):
  //   SHA-256(JSON.stringify(lessonIR) + '\x00' + deviceUUID)
  //   → crypto.sign(null, bindingHash, ed25519PrivateKey)
  //
  // What we verify here:
  //   Reconstruct the same binding hash from embedded content + OLS_INTENDED_OWNER.
  //   Import OLS_PUBLIC_KEY (base64 SPKI DER) and verify the signature against it.
  //
  // Embedded globals (written by html.js at build time):
  //   window.OLS_SIGNATURE       base64 Ed25519 signature (64 bytes decoded)
  //   window.OLS_PUBLIC_KEY      base64 SPKI DER Ed25519 public key (44 bytes decoded)
  //   window.OLS_INTENDED_OWNER  UUID of the intended device
  //
  // Verification paths:
  //   1. SubtleCrypto  — preferred, native, iOS 15+, all modern browsers
  //   2. TweetNaCl     — pure-JS fallback, iOS 9–14, legacy WebKit
  //   3. DEV_MODE      — skip, always pass
  // ═══════════════════════════════════════════════════════════════════════════

  // Use shared binary helpers (AGNI_SHARED from shared-runtime; refreshed after loadDependencies).
  function getBase64ToBytes() {
    return (global.AGNI_SHARED && global.AGNI_SHARED.base64ToBytes) || function (b64) {
      var binary = atob(b64);
      var bytes  = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes;
    };
  }
  function getConcatBytes() {
    return (global.AGNI_SHARED && global.AGNI_SHARED.concatBytes) || function () {
      var arrays = Array.prototype.slice.call(arguments);
      var total  = arrays.reduce(function (n, a) { return n + a.length; }, 0);
      var result = new Uint8Array(total);
      var offset = 0;
      arrays.forEach(function (a) { result.set(a, offset); offset += a.length; });
      return result;
    };
  }

  /**
   * Reconstruct the canonical binding that was signed by the Hub.
   * Must exactly mirror crypto.js: SHA-256(content + NUL + deviceId).
   *
   * @param  {string}  contentString  JSON.stringify(lesson)
   * @param  {string}  deviceId       OLS_INTENDED_OWNER
   * @returns {Promise<ArrayBuffer>}
   */
  function buildBindingHash(contentString, deviceId) {
    var enc          = new TextEncoder();
    var contentBytes = enc.encode(contentString);
    var sepBytes     = new Uint8Array([0x00]);    // NUL separator
    var deviceBytes  = enc.encode(deviceId);
    var combined     = getConcatBytes()(contentBytes, sepBytes, deviceBytes);
    return crypto.subtle.digest('SHA-256', combined);
  }

  /**
   * Verify via SubtleCrypto (Ed25519, native).
   * Rejects if Ed25519 is unsupported — caller catches and tries TweetNaCl.
   * @returns {Promise<boolean>}
   */
  function verifyWithSubtleCrypto() {
    var base64ToBytes = getBase64ToBytes();
    var sigBytes    = base64ToBytes(global.OLS_SIGNATURE);
    var pubKeyBytes = base64ToBytes(global.OLS_PUBLIC_KEY);
    var owner       = global.OLS_INTENDED_OWNER;
    var content     = JSON.stringify(lesson);

    // OLS_PUBLIC_KEY is SPKI DER — import with format: 'spki'.
    // Do NOT strip the DER header and import raw bytes; you'll get the wrong key.
    return crypto.subtle.importKey(
      'spki',
      pubKeyBytes,
      { name: 'Ed25519' },
      false,
      ['verify']
    ).then(function (publicKey) {
      return buildBindingHash(content, owner).then(function (bindingHash) {
        return crypto.subtle.verify(
          { name: 'Ed25519' },
          publicKey,
          sigBytes,         // ArrayBuffer / Uint8Array — not base64
          bindingHash       // same binding reconstructed above
        );
      });
    });
  }

  /**
   * Verify via TweetNaCl (pure-JS fallback for iOS < 15 and legacy WebKit).
   *
   * TweetNaCl expects the raw 32-byte Ed25519 public key, not SPKI.
   * Ed25519 SPKI = 12-byte DER header + 32-byte raw key; we slice off the header.
   *
   * SHA-256 digest (used to reconstruct the binding) is available even on
   * iOS 9 — SubtleCrypto's digest() is supported well before sign/verify.
   *
   * Requires window.nacl (TweetNaCl.js, ~3KB gzipped), loaded as a cached
   * asset by factory-loader.js when inferredFeatures.requiresTweetNacl is true.
   *
   * @returns {Promise<boolean>}
   */
  function verifyWithTweetNaCl() {
    if (!global.nacl || !global.nacl.sign) {
      if (DEV_MODE) console.warn('[VERIFY] TweetNaCl not loaded \u2014 cannot verify');
      return Promise.resolve(DEV_MODE);  // fail closed in production
    }

    try {
      var base64ToBytes = getBase64ToBytes();
      var concatBytes   = getConcatBytes();
      var sigBytes  = base64ToBytes(global.OLS_SIGNATURE);
      var spkiBytes = base64ToBytes(global.OLS_PUBLIC_KEY);
      // SPKI DER for Ed25519 is always 44 bytes: 12-byte header + 32-byte key.
      var rawPubKey = spkiBytes.slice(spkiBytes.length - 32);
      var owner     = global.OLS_INTENDED_OWNER;
      var content   = JSON.stringify(lesson);

      // Reconstruct the same binding bytes as the signing side.
      var enc          = new TextEncoder();
      var contentBytes = enc.encode(content);
      var sepBytes     = new Uint8Array([0x00]);
      var deviceBytes  = enc.encode(owner);
      var combined     = concatBytes(contentBytes, sepBytes, deviceBytes);

      // SHA-256 digest is available on iOS 9+ even when Ed25519 sign/verify is not.
      return crypto.subtle.digest('SHA-256', combined).then(function (bindingHash) {
        var bindingBytes = new Uint8Array(bindingHash);
        var valid = global.nacl.sign.detached.verify(bindingBytes, sigBytes, rawPubKey);
        if (DEV_MODE) console.log('[VERIFY] TweetNaCl result:', valid);
        return valid;
      });

    } catch (err) {
      if (DEV_MODE) console.warn('[VERIFY] TweetNaCl error:', err.message);
      return Promise.resolve(false);
    }
  }

  /**
   * Top-level integrity check. Returns Promise<boolean>.
   *
   * DEV_MODE: always passes.
   * Production: SubtleCrypto → TweetNaCl fallback on failure.
   * Missing globals: fails closed immediately.
   *
   * @returns {Promise<boolean>}
   */
  function verifyIntegrity() {
    if (DEV_MODE) return Promise.resolve(true);

    if (!global.OLS_SIGNATURE || !global.OLS_PUBLIC_KEY || !global.OLS_INTENDED_OWNER) {
      console.error('[VERIFY] Missing signature globals \u2014 lesson will not play');
      return Promise.resolve(false);
    }

    var canUseSubtle = global.crypto &&
                       global.crypto.subtle &&
                       typeof global.crypto.subtle.verify === 'function';

    if (!canUseSubtle) {
      if (DEV_MODE) console.log('[VERIFY] SubtleCrypto unavailable, using TweetNaCl');
      return verifyWithTweetNaCl();
    }

    return verifyWithSubtleCrypto().then(function (result) {
      if (DEV_MODE) console.log('[VERIFY] SubtleCrypto result:', result);
      return result;
    }).catch(function (err) {
      // SubtleCrypto present but Ed25519 not supported (iOS 9–14)
      if (DEV_MODE) console.warn('[VERIFY] SubtleCrypto failed, falling back:', err.message);
      return verifyWithTweetNaCl();
    });
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 2 — Gate evaluation
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Strip directive prefixes consistently across all routing paths.
   * Handles: 'redirect:', 'ols:', 'skip_to:'
   * @param  {string} raw
   * @returns {string}
   */
  function resolveDirective(raw) {
    if (!raw) return '';
    return raw
      .replace(/^redirect:/i, '')
      .replace(/^ols:/i, '')
      .replace(/^skip_to:/i, '')
      .trim();
  }

  /**
   * Render a gate redirect notice pointing the student to a prerequisite lesson.
   * @param {object} gate  must have gate.on_fail
   */
  function renderGateRedirect(gate) {
    var prereqId = resolveDirective(gate.on_fail);
    var app      = document.getElementById('app');

    var container = document.createElement('div');
    container.className = 'gate-redirect';

    var msg = document.createElement('p');
    msg.textContent = 'Please complete the prerequisite lesson first: ' + prereqId;
    container.appendChild(msg);

    app.innerHTML = '';
    app.appendChild(container);
  }

  /**
   * Render a gate quiz and resolve its Promise once the student passes or fails.
   *
   * FIX (v1.9.3): Previously never resolved 'fail' — gate.on_fail was
   * permanently unreachable and a student lacking the prerequisite was trapped
   * forever. Now honours gate.max_attempts (default 3) and reveals an escape
   * button once exhausted, resolving 'fail' so routing can proceed normally.
   *
   * @param {object}   gate
   * @param {Function} resolve  resolver from evaluateGate()'s Promise
   */
  function renderGateQuiz(gate, resolve) {
    var app         = document.getElementById('app');
    var MAX_ATTEMPTS = (gate.max_attempts > 0) ? gate.max_attempts : 3;
    var attempts    = 0;

    var container = document.createElement('div');
    container.className = 'gate-quiz';

    var prompt = document.createElement('p');
    prompt.textContent = gate.question || 'Answer to continue:';
    container.appendChild(prompt);

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'gate-input';
    container.appendChild(input);

    var submitBtn = document.createElement('button');
    submitBtn.className = 'btn btn-primary';
    submitBtn.textContent = 'Submit';
    container.appendChild(submitBtn);

    var feedback = document.createElement('p');
    feedback.className = 'gate-feedback';
    container.appendChild(feedback);

    // Escape button — hidden until max_attempts is reached, then shown.
    // Resolves 'fail' so gate.on_fail routing fires normally.
    var escapeBtn = document.createElement('button');
    escapeBtn.className = 'btn btn-secondary';
    escapeBtn.style.marginTop = '0.75rem';
    escapeBtn.style.display   = 'none';
    escapeBtn.textContent     = "I haven\u2019t completed the prerequisite";
    escapeBtn.onclick         = function () { resolve('fail'); };
    container.appendChild(escapeBtn);

    function checkAnswer() {
      var answer  = input.value.trim().toLowerCase();
      var correct = (gate.answer || '').trim().toLowerCase();

      if (answer === correct) {
        resolve('pass');
        return;
      }

      attempts++;

      if (attempts >= MAX_ATTEMPTS) {
        feedback.textContent    = 'Maximum attempts reached.';
        submitBtn.disabled      = true;
        input.disabled          = true;
        escapeBtn.style.display = 'block';
        return;
      }

      var remaining = MAX_ATTEMPTS - attempts;
      feedback.textContent = 'Not quite \u2014 try again. ('
        + remaining + ' attempt' + (remaining === 1 ? '' : 's') + ' remaining)';
      input.value = '';
      input.focus();
    }

    submitBtn.onclick = checkAnswer;
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') checkAnswer();
    });

    app.innerHTML = '';
    app.appendChild(container);
    input.focus();
  }

  /**
   * Evaluate a gate step.
   * @param  {object}          gate
   * @returns {Promise<string>}     id of the next step to route to
   */
  function evaluateGate(gate) {
    return new Promise(function (resolve) {
      if (gate.type === 'quiz') {
        renderGateQuiz(gate, function (result) {
          if (result === 'pass') {
            resolve(gate.on_pass || steps[stepIndex + 1].id);
          } else {
            renderGateRedirect(gate);
            // Promise is intentionally left pending — the redirect is terminal
            // for this session. The student must navigate away.
          }
        });
      } else {
        resolve(gate.on_pass || steps[stepIndex + 1].id);
      }
    });
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 3 — Step rendering
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Render the lesson-complete screen.
   */
  function renderCompletion() {
    var app = document.getElementById('app');
    app.innerHTML = '';

    var container = document.createElement('div');
    container.className = 'completion-screen';

    var msg = document.createElement('p');
    msg.textContent = (lesson.meta && lesson.meta.completion_message) || 'Lesson complete!';
    container.appendChild(msg);

    app.appendChild(container);
  }

  /**
   * Render a step into #app.
   *
   * FIX (v1.9.3): container is appended to app *before* mountStepVisual() so
   * the SVG factory receives a live DOM node. Previously specContainer was
   * detached at mount time, causing getBoundingClientRect() to return zeroes.
   *
   * FIX (v1.9.3): completion-type steps delegate entirely to renderCompletion()
   * and skip the app.appendChild() that was immediately discarded anyway.
   *
   * @param {object} step
   */
  function renderStep(step) {
    S = global.AGNI_SHARED;
    var app = document.getElementById('app');

    if (S.destroyStepVisual)      S.destroyStepVisual();
    if (S.clearSensorSubscriptions) S.clearSensorSubscriptions();

    // completion steps delegate entirely — no container needed
    if (step.type === 'completion') {
      renderCompletion();
      return;
    }

    var container = document.createElement('div');
    container.className = 'step step-' + (step.type || 'content');

    if (step.htmlContent) {
      var contentDiv = document.createElement('div');
      contentDiv.className = 'step-content';
      contentDiv.innerHTML = step.htmlContent;
      container.appendChild(contentDiv);
    }

    var specContainer = null;
    if (step.spec) {
      specContainer = document.createElement('div');
      specContainer.className = 'step-visual';
      container.appendChild(specContainer);
    }

    // FIX: append to live DOM before mounting so factories can query layout.
    app.innerHTML = '';
    app.appendChild(container);

    if (specContainer && step.spec) {
      S.mountStepVisual(specContainer, step.spec)
        .then(function () {
          if (DEV_MODE) console.log('[PLAYER] Visual mounted for step:', step.id);
        })
        .catch(function (err) {
          console.error('[PLAYER] Visual mount failed:', step.id, err);
        });
    }
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 4 — Routing
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Route to a step by id.
   * @param {string} targetId
   */
  function routeStep(targetId) {
    var idx = -1;
    for (var i = 0; i < steps.length; i++) {
      if (steps[i].id === targetId) { idx = i; break; }
    }

    if (idx === -1) {
      console.error('[PLAYER] routeStep: unknown step id:', targetId);
      return;
    }

    var step = steps[idx];

    if (step.type === 'redirect') {
      // FIX (v1.9.3): normalise through resolveDirective() so skip_to: and
      // other prefixes are stripped, matching all other routing paths.
      var directive = resolveDirective(step.directive);
      renderGateRedirect({ on_fail: directive });
      return;
    }

    stepIndex = idx;
    history.push(targetId);
    renderStep(step);

    if (step.type === 'gate') {
      evaluateGate(step).then(function (nextId) {
        routeStep(nextId);
      });
    }
  }

  function nextStep() {
    if (stepIndex + 1 < steps.length) {
      routeStep(steps[stepIndex + 1].id);
    }
  }

  global.OLS_NEXT  = nextStep;
  global.OLS_ROUTE = routeStep;


  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 5 — Sensor and UI helpers
  // ═══════════════════════════════════════════════════════════════════════════

  function showSensorWarning() {
    var el = document.getElementById('sensor-warning');
    if (!el) {
      el = document.createElement('div');
      el.id        = 'sensor-warning';
      el.className = 'sensor-warning';
      el.textContent = 'Motion sensor unavailable \u2014 some interactions may not work.';
      document.body.insertBefore(el, document.getElementById('app'));
    }
    el.style.display = 'block';
  }

  function showPermissionPrompt() {
    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'permission-overlay';

      var btn = document.createElement('button');
      btn.className  = 'btn btn-primary';
      btn.textContent = 'Enable Motion Sensors';
      btn.onclick    = function () {
        document.body.removeChild(overlay);
        resolve();
      };

      overlay.appendChild(btn);
      document.body.appendChild(overlay);
    });
  }

  function showIntegrityError() {
    var loading = document.getElementById('loading');
    var app     = document.getElementById('app');
    if (loading) loading.style.display = 'none';
    app.innerHTML = '';
    var msg = document.createElement('div');
    msg.className  = 'integrity-error';
    msg.textContent = 'This lesson file could not be verified for your device. '
      + 'Please re-download from your learning hub.';
    app.appendChild(msg);
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 6 — Sensor initialisation
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Initialise sensors. Never rejects — hardware failures degrade gracefully
   * to a warning and allow the lesson to continue without sensor input.
   *
   * FIX (v1.9.3): non-gesture path now has .catch() on sensorBridge.start().
   * Previously an OS-level permission denial or hardware error would reject
   * sensorPromise silently and the init chain would stall indefinitely.
   *
   * @returns {Promise<void>}
   */
  function initSensors() {
    S = global.AGNI_SHARED;

    var hasSensors = lesson.inferredFeatures &&
                     lesson.inferredFeatures.flags &&
                     lesson.inferredFeatures.flags.has_sensors;

    if (!hasSensors || !S.sensorBridge) return Promise.resolve();

    var needsGesture = typeof DeviceMotionEvent !== 'undefined' &&
                       typeof DeviceMotionEvent.requestPermission === 'function';

    if (needsGesture) {
      return showPermissionPrompt()
        .then(function () {
          return DeviceMotionEvent.requestPermission();
        })
        .then(function (state) {
          if (state !== 'granted') { showSensorWarning(); return; }
          return S.sensorBridge.start().then(function (available) {
            if (!available) showSensorWarning();
          }).catch(function (err) {
            if (DEV_MODE) console.warn('[PLAYER] sensorBridge.start() rejected:', err);
            showSensorWarning();
          });
        })
        .catch(function () { showSensorWarning(); });
    }

    // Non-gesture path — FIX: .catch() added
    return S.sensorBridge.start().then(function (available) {
      if (!available) showSensorWarning();
    }).catch(function (err) {
      if (DEV_MODE) console.warn('[PLAYER] sensorBridge.start() rejected:', err);
      showSensorWarning();
    });
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 7 — Main init
  // ═══════════════════════════════════════════════════════════════════════════

  function initPlayer() {
    if (DEV_MODE) console.log('[PLAYER] initPlayer()', lesson.meta && lesson.meta.title);

    var loader = global.AGNI_LOADER;
    var depPromise = (loader && typeof loader.loadDependencies === 'function')
      ? loader.loadDependencies(lesson)
      : Promise.resolve();

    depPromise
      .then(function () {
        S = global.AGNI_SHARED;
        return verifyIntegrity();
      })
      .then(function (valid) {
        if (!valid) {
          showIntegrityError();
          return Promise.reject(new Error('__integrity_fail__'));
        }
        return initSensors();
      })
      .then(function () {
        S = global.AGNI_SHARED;
        if (S.loadLessonVibrationPatterns) S.loadLessonVibrationPatterns(lesson);

        var loading = document.getElementById('loading');
        if (loading) loading.style.display = 'none';

        if (steps.length > 0) {
          routeStep(steps[0].id);
        } else {
          console.error('[PLAYER] Lesson has no steps');
        }
      })
      .catch(function (err) {
        if (err && err.message !== '__integrity_fail__') {
          console.error('[PLAYER] Init failed:', err);
          var loading = document.getElementById('loading');
          if (loading) loading.textContent = 'Failed to load lesson. Please try again.';
        }
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPlayer);
  } else {
    initPlayer();
  }

}(window));
