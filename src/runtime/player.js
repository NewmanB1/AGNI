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
//
//   [Phase 5] Gate: use expected_answer (schema), passing_score (default 1.0),
//     retry_delay (ISO 8601 duration before allowing next attempt after wrong answer).
// ─────────────────────────────────────────────────────────────────────────────

(function (global) {
  'use strict';

  if (!global.LESSON_DATA) {
    console.error('[PLAYER] LESSON_DATA not found \u2014 aborting');
    return;
  }

  var DEV_MODE = !!(global.LESSON_DATA._devMode);

  // i18n — use global.AGNI_I18N.t() if the i18n module is loaded, else identity
  var t = (global.AGNI_I18N && global.AGNI_I18N.t) ? global.AGNI_I18N.t : function (key) { return key; };

  // Refreshed at each call site after loadDependencies() resolves.
  var S = global.AGNI_SHARED || {};

  var lesson    = global.LESSON_DATA;
  var steps     = lesson.steps || [];
  var history   = [];
  var stepIndex = 0;

  // ── Step outcome tracking & probe collection ──
  var stepOutcomes  = [];
  var probeResults  = [];
  var lessonStartMs = Date.now();
  var stepEntryMs   = Date.now();
  var LESSON_ID     = (lesson.meta && lesson.meta.identifier) || lesson.id || 'unknown';
  var CHECKPOINT_KEY = 'agni_ckpt_' + LESSON_ID;

  function recordStepOutcome(step, passed, attempts, skipped) {
    var w = typeof step.weight === 'number' ? step.weight : _defaultWeight(step.type);
    stepOutcomes.push({
      stepId:      step.id,
      type:        step.type || 'content',
      weight:      w,
      passed:      !!passed,
      skipped:     !!skipped,
      attempts:    attempts || 1,
      maxAttempts: step.max_attempts || 1,
      durationMs:  Date.now() - stepEntryMs
    });
  }

  function _defaultWeight(type) {
    if (type === 'quiz' || type === 'hardware_trigger' || type === 'gate') return 1;
    if (type === 'instruction' || type === 'completion') return 0;
    return 0.5;
  }

  // ── Checkpoint save/resume (localStorage) ──
  function saveCheckpoint() {
    try {
      var data = {
        stepIndex: stepIndex,
        stepId: steps[stepIndex] ? steps[stepIndex].id : null,
        stepOutcomes: stepOutcomes,
        probeResults: probeResults,
        savedAt: Date.now()
      };
      localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(data));
    } catch (e) { /* localStorage may be unavailable */ }
  }

  function loadCheckpoint() {
    try {
      var raw = localStorage.getItem(CHECKPOINT_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      // Expire checkpoints older than 24 hours
      if (data.savedAt && (Date.now() - data.savedAt) > 86400000) {
        clearCheckpoint();
        return null;
      }
      return data;
    } catch (e) { return null; }
  }

  function clearCheckpoint() {
    try { localStorage.removeItem(CHECKPOINT_KEY); } catch (e) {}
  }

  /** Parse ISO 8601 duration (e.g. PT2M, PT30S) to milliseconds. Phase 5 retry_delay. */
  function parseDurationMs(str) {
    if (!str || typeof str !== 'string') return 0;
    var m = str.match(/^P(?:T(?=(\d)))?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
    if (!m) return 0;
    var h = parseInt(m[2], 10) || 0;
    var min = parseInt(m[3], 10) || 0;
    var s = parseInt(m[4], 10) || 0;
    return (h * 3600 + min * 60 + s) * 1000;
  }

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
   * Now includes a clickable link to the prerequisite lesson on the hub.
   * @param {object} gate  must have gate.on_fail
   */
  function renderGateRedirect(gate) {
    var prereqId = resolveDirective(gate.on_fail);
    var app      = document.getElementById('app');

    var container = document.createElement('div');
    container.className = 'gate-redirect';

    var msg = document.createElement('p');
    msg.textContent = 'You need to complete a prerequisite lesson first:';
    container.appendChild(msg);

    // Build a link to the prerequisite lesson on the same hub
    var hubBase = (lesson._hubUrl || '').replace(/\/$/, '');
    if (!hubBase) {
      try { hubBase = global.location.protocol + '//' + global.location.host; } catch (e) {}
    }

    if (hubBase && prereqId) {
      var link = document.createElement('a');
      link.href = hubBase + '/lessons/' + encodeURIComponent(prereqId);
      link.className = 'btn btn-primary';
      link.style.display = 'inline-block';
      link.style.marginTop = '1rem';
      link.textContent = 'Go to: ' + prereqId;
      container.appendChild(link);
    } else {
      var idEl = document.createElement('p');
      idEl.style.fontWeight = 'bold';
      idEl.textContent = prereqId;
      container.appendChild(idEl);
    }

    var backMsg = document.createElement('p');
    backMsg.style.marginTop = '1rem';
    backMsg.style.opacity = '0.8';
    backMsg.style.fontSize = '0.9rem';
    backMsg.textContent = 'After completing the prerequisite, return to this lesson to continue.';
    container.appendChild(backMsg);

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

    var retryDelayMs = parseDurationMs(gate.retry_delay);
    var passingScore = (typeof gate.passing_score === 'number' && gate.passing_score >= 0 && gate.passing_score <= 1)
      ? gate.passing_score : 1;
    var expectedAnswer = (gate.expected_answer != null ? gate.expected_answer : gate.answer || '').trim().toLowerCase();
    var waitingRetry = false;

    function checkAnswer() {
      if (waitingRetry) return;
      var answer = input.value.trim().toLowerCase();
      var score = (answer === expectedAnswer) ? 1 : 0;

      if (score >= passingScore) {
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

      if (retryDelayMs > 0) {
        waitingRetry = true;
        submitBtn.disabled = true;
        input.disabled = true;
        var deadline = Date.now() + retryDelayMs;
        function updateWait() {
          var left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
          if (left <= 0) {
            waitingRetry = false;
            submitBtn.disabled = false;
            input.disabled = false;
            feedback.textContent = 'Not quite \u2014 try again. ('
              + remaining + ' attempt' + (remaining === 1 ? '' : 's') + ' remaining)';
            input.focus();
            return;
          }
          feedback.textContent = 'Please wait ' + left + 's before trying again. ('
            + remaining + ' attempt' + (remaining === 1 ? '' : 's') + ' remaining)';
          setTimeout(updateWait, 500);
        }
        updateWait();
      }
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
  /**
   * Render a manual verification gate: the student enters a teacher-provided
   * verification code to proceed. Teachers can generate codes from the hub.
   */
  function renderManualVerification(gate, callback) {
    var app = document.getElementById('app');
    app.innerHTML = '';

    var container = document.createElement('div');
    container.className = 'step step-gate gate-manual';

    var title = document.createElement('h2');
    title.textContent = gate.question || 'Teacher Verification Required';
    container.appendChild(title);

    var desc = document.createElement('p');
    desc.textContent = 'Ask your teacher to verify your work. Enter the verification code they give you.';
    container.appendChild(desc);

    var inputRow = document.createElement('div');
    inputRow.style.cssText = 'display:flex;gap:0.5rem;margin:1rem 0;';

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'gate-input';
    input.placeholder = 'Enter code\u2026';
    input.style.cssText = 'padding:0.6rem;font-size:1.2rem;text-align:center;letter-spacing:0.2em;text-transform:uppercase;background:#1f2b4e;color:#fff;border:1px solid var(--border,#3a3a5a);border-radius:6px;flex:1;max-width:200px;';
    inputRow.appendChild(input);

    var verifyBtn = document.createElement('button');
    verifyBtn.className = 'btn btn-primary';
    verifyBtn.textContent = 'Verify';
    inputRow.appendChild(verifyBtn);

    container.appendChild(inputRow);

    var feedback = document.createElement('p');
    feedback.className = 'gate-feedback';
    container.appendChild(feedback);

    app.appendChild(container);
    input.focus();

    var expected = (gate.expected_answer || '').toUpperCase().trim();
    var retryDelayMs = parseDurationMs(gate.retry_delay);
    var maxAttempts = (gate.max_attempts > 0) ? gate.max_attempts : 5;
    var attempts = 0;
    var waitingRetry = false;

    function check() {
      if (waitingRetry) return;
      var val = input.value.toUpperCase().trim();
      if (!val) return;
      if (val === expected || (!expected && val.length >= 4)) {
        feedback.textContent = 'Verified!';
        feedback.style.color = '#4ade80';
        input.disabled = true;
        verifyBtn.disabled = true;
        setTimeout(function () { callback('pass'); }, 800);
      } else {
        attempts++;
        if (attempts >= maxAttempts) {
          feedback.textContent = 'Maximum attempts reached. Ask your teacher for help.';
          feedback.style.color = '#ff5252';
          input.disabled = true;
          verifyBtn.disabled = true;
          return;
        }
        var remaining = maxAttempts - attempts;
        feedback.textContent = 'Code not recognized (' + remaining + ' attempt' + (remaining === 1 ? '' : 's') + ' remaining)';
        feedback.style.color = '#ff5252';
        input.value = '';

        if (retryDelayMs > 0) {
          waitingRetry = true;
          verifyBtn.disabled = true;
          input.disabled = true;
          var deadline = Date.now() + retryDelayMs;
          (function updateWait() {
            var left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
            if (left <= 0) {
              waitingRetry = false;
              verifyBtn.disabled = false;
              input.disabled = false;
              input.focus();
              return;
            }
            feedback.textContent = 'Wait ' + left + 's before trying again.';
            setTimeout(updateWait, 500);
          })();
        } else {
          input.focus();
        }
      }
    }

    verifyBtn.onclick = check;
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') check();
    });
  }

  function evaluateGate(gate) {
    return new Promise(function (resolve) {
      if (gate.type === 'quiz') {
        renderGateQuiz(gate, function (result) {
          if (result === 'pass') {
            resolve(gate.on_pass || steps[stepIndex + 1].id);
          } else {
            renderGateRedirect(gate);
          }
        });
      } else if (gate.type === 'manual_verification') {
        renderManualVerification(gate, function (result) {
          if (result === 'pass') {
            resolve(gate.on_pass || steps[stepIndex + 1].id);
          } else {
            renderGateRedirect(gate);
          }
        });
      } else {
        resolve(gate.on_pass || steps[stepIndex + 1].id);
      }
    });
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 2a — Accessibility preferences (read from localStorage)
  // ═══════════════════════════════════════════════════════════════════════════

  var a11y = (function loadA11y() {
    var defaults = { fontScale: 1, highContrast: false, reducedMotion: false, hapticIntensity: 1 };
    try {
      var fs = localStorage.getItem('agni_font_scale');
      var hc = localStorage.getItem('agni_high_contrast');
      var rm = localStorage.getItem('agni_reduced_motion');
      var hi = localStorage.getItem('agni_haptic_intensity');
      return {
        fontScale:       fs !== null ? Math.max(0.8, Math.min(1.5, parseFloat(fs))) : 1,
        highContrast:    hc === 'true',
        reducedMotion:   rm === 'true',
        hapticIntensity: hi !== null ? Math.max(0, Math.min(1, parseFloat(hi))) : 1
      };
    } catch (e) { return defaults; }
  })();

  function applyAccessibility() {
    var root = document.documentElement;
    if (a11y.fontScale !== 1) {
      root.style.fontSize = (a11y.fontScale * 100) + '%';
    }
    if (a11y.highContrast) {
      root.classList.add('agni-high-contrast');
    }
    if (a11y.reducedMotion) {
      root.classList.add('agni-reduced-motion');
    }

    if (!document.getElementById('agni-a11y-style')) {
      var style = document.createElement('style');
      style.id = 'agni-a11y-style';
      style.textContent =
        '.agni-high-contrast { --bg: #000; --text: #fff; --accent: #ffff00; }' +
        '.agni-high-contrast .step-content { color: #fff !important; }' +
        '.agni-high-contrast .quiz-option { border: 2px solid #fff !important; color: #fff !important; }' +
        '.agni-high-contrast .btn { border: 2px solid #fff !important; }' +
        '.agni-reduced-motion * { transition: none !important; animation: none !important; }' +
        /* Sensor gauge */
        '.sensor-gauge { margin: 1.5rem 0; text-align: center; }' +
        '.gauge-label { font-size: 0.85em; opacity: 0.7; margin-bottom: 0.3rem; }' +
        '.gauge-track { position: relative; height: 1.5rem; background: #1e293b; border-radius: 0.75rem; overflow: visible; }' +
        '.gauge-fill { height: 100%; width: 0%; border-radius: 0.75rem; background: var(--accent, #00e676); transition: width 0.1s; }' +
        '.gauge-threshold { position: absolute; top: -2px; bottom: -2px; width: 3px; background: #fff; border-radius: 1px; }' +
        '.gauge-value { font-size: 1.25rem; font-weight: bold; margin-top: 0.25rem; }' +
        '.hw-hint { opacity: 0.7; font-style: italic; }' +
        '.hw-status { font-size: 0.9em; margin-top: 1rem; }' +
        /* Completion screen */
        '.completion-icon { font-size: 3rem; color: #4ade80; margin-bottom: 0.5rem; }' +
        '.completion-title { margin-bottom: 0.5rem; }' +
        '.skills-earned { margin: 1rem 0; text-align: left; }' +
        '.skills-earned h3 { font-size: 0.95em; opacity: 0.7; }' +
        '.skills-earned ul { padding-left: 1.2em; }' +
        '.skills-earned li { margin: 0.25rem 0; }' +
        '.score-breakdown { margin-top: 0.5rem; opacity: 0.8; }' +
        '.pace-summary { margin: 0.5rem 0; font-size: 0.9em; }' +
        '.next-lesson-actions { display: flex; justify-content: center; gap: 0.75rem; flex-wrap: wrap; }' +
        '.step-progress { font-size: 0.8em; opacity: 0.6; margin-bottom: 0.5rem; }' +
        '.step-hint-nudge { margin-top: 1rem; padding: 0.75rem; background: rgba(251,191,36,0.1); border: 1px solid #fbbf24; border-radius: 8px; font-size: 0.9em; }' +
        '.hint-skip { font-size: 0.8em; padding: 0.3rem 0.6rem; }';
      document.head.appendChild(style);
    }
  }

  function addAriaToElement(el, role, label) {
    if (role) el.setAttribute('role', role);
    if (label) el.setAttribute('aria-label', label);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 2b — Hardware trigger step rendering (sensor + threshold + gauge)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Render a hardware_trigger step: show content, display a live sensor gauge,
   * subscribe to sensor data, and evaluate the threshold expression.
   */
  function renderHardwareTriggerStep(step) {
    var app = document.getElementById('app');
    app.innerHTML = '';
    S = global.AGNI_SHARED;

    var container = document.createElement('div');
    container.className = 'step step-hardware-trigger';

    if (step.htmlContent) {
      var contentDiv = document.createElement('div');
      contentDiv.className = 'step-content';
      contentDiv.innerHTML = step.htmlContent;
      container.appendChild(contentDiv);
    }

    if (step.feedback) {
      var hint = document.createElement('p');
      hint.className = 'hw-hint';
      hint.textContent = step.feedback;
      container.appendChild(hint);
    }

    // Sensor gauge visualization
    var gaugeContainer = document.createElement('div');
    gaugeContainer.className = 'sensor-gauge';
    addAriaToElement(gaugeContainer, 'meter', 'Sensor reading');

    var gaugeLabel = document.createElement('div');
    gaugeLabel.className = 'gauge-label';
    gaugeLabel.textContent = step.sensor || 'accel.total';
    gaugeContainer.appendChild(gaugeLabel);

    var gaugeTrack = document.createElement('div');
    gaugeTrack.className = 'gauge-track';
    var gaugeFill = document.createElement('div');
    gaugeFill.className = 'gauge-fill';
    gaugeTrack.appendChild(gaugeFill);

    // Threshold marker on the gauge
    var thresholdMarker = document.createElement('div');
    thresholdMarker.className = 'gauge-threshold';
    gaugeTrack.appendChild(thresholdMarker);

    gaugeContainer.appendChild(gaugeTrack);

    var gaugeValue = document.createElement('div');
    gaugeValue.className = 'gauge-value';
    gaugeValue.textContent = '0.0';
    gaugeContainer.appendChild(gaugeValue);

    container.appendChild(gaugeContainer);

    // Status message
    var statusEl = document.createElement('p');
    statusEl.className = 'hw-status';
    statusEl.textContent = t('waiting_sensor');
    addAriaToElement(statusEl, 'status', 'Sensor status');
    statusEl.setAttribute('aria-live', 'polite');
    container.appendChild(statusEl);

    app.appendChild(container);

    // Parse the threshold to extract target value for the gauge
    var thresholdStr = step.threshold || '';
    var primarySensor = step.sensor || 'accel.total';
    var targetValue = 10; // default max for gauge
    try {
      var numMatch = thresholdStr.match(/([\d.]+)g?\b/);
      if (numMatch) {
        targetValue = parseFloat(numMatch[1]);
        if (/g/i.test(thresholdStr)) targetValue *= 9.81;
      }
    } catch (e) {}
    var gaugeMax = targetValue * 1.5;

    // Position threshold marker
    var markerPct = Math.min(100, (targetValue / gaugeMax) * 100);
    thresholdMarker.style.left = markerPct + '%';

    // Subscribe to sensor updates for live gauge
    var cancelWatch = null;
    if (S.thresholdEvaluator && thresholdStr) {
      var _triggerCancel = null;

      var unsub = S.subscribeToSensor(primarySensor, function (reading) {
        var val = reading.value;
        var pct = Math.min(100, Math.max(0, (val / gaugeMax) * 100));
        gaugeFill.style.width = pct + '%';
        gaugeFill.style.background = (val >= targetValue) ? '#4ade80' : 'var(--accent, #00e676)';
        gaugeValue.textContent = val.toFixed(1);
      });

      _triggerCancel = S.thresholdEvaluator.watch(thresholdStr, primarySensor, function () {
        unsub();
        statusEl.textContent = t('threshold_met');
        statusEl.style.color = '#4ade80';
        gaugeFill.style.background = '#4ade80';
        gaugeFill.style.width = '100%';
        recordStepOutcome(step, true, 1, false);

        // Haptic feedback
        if (a11y.hapticIntensity > 0 && navigator.vibrate) {
          navigator.vibrate(Math.round(200 * a11y.hapticIntensity));
        }

        setTimeout(function () {
          if (step.on_success) {
            routeStep(resolveDirective(step.on_success));
          } else {
            nextStep();
          }
        }, 1000);
      });

      cancelWatch = function () {
        unsub();
        if (_triggerCancel) _triggerCancel();
      };
    } else {
      // No threshold — just show content and a Next button
      statusEl.textContent = 'Sensor interaction (no threshold configured)';
      var skipBtn = document.createElement('button');
      skipBtn.className = 'btn btn-primary';
      skipBtn.textContent = 'Continue';
      skipBtn.onclick = function () {
        recordStepOutcome(step, true, 1, false);
        nextStep();
      };
      container.appendChild(skipBtn);
    }
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 2c — Quiz step rendering (multiple choice with formative feedback)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Render a quiz step with multiple-choice answers, formative feedback,
   * and probe result collection for the LMS engine.
   *
   * @param {object} step  Must have answer_options (string[]) and correct_index (number).
   *                       Optional: feedback.correct, feedback.incorrect, feedback.hint
   */
  function renderQuizStep(step) {
    var app = document.getElementById('app');
    app.innerHTML = '';

    var container = document.createElement('div');
    container.className = 'step step-quiz';

    if (step.htmlContent) {
      var contentDiv = document.createElement('div');
      contentDiv.className = 'step-content';
      contentDiv.innerHTML = step.htmlContent;
      container.appendChild(contentDiv);
    }

    var options    = step.answer_options || [];
    var correctIdx = typeof step.correct_index === 'number' ? step.correct_index : -1;
    var maxAtt     = (step.max_attempts > 0) ? step.max_attempts : 2;
    var fb         = step.feedback || {};
    var attempts   = 0;

    var optionsDiv = document.createElement('div');
    optionsDiv.className = 'quiz-options';

    options.forEach(function (opt, idx) {
      var btn = document.createElement('button');
      btn.className = 'quiz-option';
      btn.textContent = (typeof opt === 'string') ? opt : (opt.text || opt.label || '');
      btn.setAttribute('data-idx', idx);
      btn.onclick = function () { handleAnswer(idx); };
      optionsDiv.appendChild(btn);
    });

    container.appendChild(optionsDiv);

    var feedbackEl = document.createElement('div');
    feedbackEl.className = 'quiz-feedback';
    container.appendChild(feedbackEl);

    app.appendChild(container);

    function handleAnswer(selectedIdx) {
      var correct = (selectedIdx === correctIdx);
      attempts++;

      probeResults.push({
        probeId:       step.id,
        correct:       correct,
        selectedIndex: selectedIdx,
        attempt:       attempts
      });

      var optBtns = optionsDiv.querySelectorAll('.quiz-option');
      optBtns.forEach(function (btn) { btn.disabled = true; });
      if (correctIdx >= 0 && correctIdx < optBtns.length) {
        optBtns[correctIdx].classList.add('quiz-correct');
      }
      if (!correct && selectedIdx >= 0 && selectedIdx < optBtns.length) {
        optBtns[selectedIdx].classList.add('quiz-incorrect');
      }

      if (correct) {
        feedbackEl.innerHTML = '<p class="fb-correct">' +
          (fb.correct || 'Correct!') + '</p>';
        recordStepOutcome(step, true, attempts, false);
        setTimeout(function () {
          if (step.on_success) {
            routeStep(resolveDirective(step.on_success));
          } else {
            nextStep();
          }
        }, 1200);
      } else if (attempts >= maxAtt) {
        var correctText = (correctIdx >= 0 && correctIdx < options.length)
          ? (typeof options[correctIdx] === 'string' ? options[correctIdx] : options[correctIdx].text || '')
          : '';
        feedbackEl.innerHTML = '<p class="fb-incorrect">' +
          (fb.incorrect || ('The correct answer was: ' + correctText)) + '</p>';
        recordStepOutcome(step, false, attempts, false);

        var continueBtn = document.createElement('button');
        continueBtn.className = 'btn btn-primary';
        continueBtn.textContent = 'Continue';
        continueBtn.onclick = function () {
          if (step.on_fail) {
            routeStep(resolveDirective(step.on_fail));
          } else {
            nextStep();
          }
        };
        feedbackEl.appendChild(continueBtn);
      } else {
        var remaining = maxAtt - attempts;
        feedbackEl.innerHTML = '<p class="fb-hint">' +
          (fb.hint || ('Not quite \u2014 try again. (' + remaining + ' attempt' + (remaining === 1 ? '' : 's') + ' remaining)')) + '</p>';
        // Re-enable unselected options for retry
        optBtns.forEach(function (btn, i) {
          if (i !== selectedIdx) {
            btn.disabled = false;
            btn.classList.remove('quiz-correct', 'quiz-incorrect');
          }
        });
      }
    }
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 3 — Step rendering
  // ═══════════════════════════════════════════════════════════════════════════

  // ── expected_duration pace tracking ──
  var expectedDurationMs = 0;
  try {
    var ed = (lesson.meta && lesson.meta.expected_duration) || '';
    expectedDurationMs = parseDurationMs(ed);
  } catch (e) {}

  function getPaceRatio() {
    if (expectedDurationMs <= 0) return null;
    var elapsed = Date.now() - lessonStartMs;
    return elapsed / expectedDurationMs;
  }

  /**
   * Render the lesson-complete screen with skill summary, pace, and next-lesson flow.
   */
  function renderCompletion() {
    var app = document.getElementById('app');
    app.innerHTML = '';

    var container = document.createElement('div');
    container.className = 'completion-screen';
    addAriaToElement(container, 'main', 'Lesson completion');

    var checkmark = document.createElement('div');
    checkmark.className = 'completion-icon';
    checkmark.textContent = '\u2714';
    container.appendChild(checkmark);

    var msg = document.createElement('h2');
    msg.className = 'completion-title';
    msg.textContent = (lesson.meta && lesson.meta.completion_message) || t('lesson_complete');
    container.appendChild(msg);

    app.appendChild(container);

    clearCheckpoint();

    // Pace summary
    var pace = getPaceRatio();
    if (pace !== null) {
      var paceEl = document.createElement('p');
      paceEl.className = 'pace-summary';
      if (pace < 0.8) {
        paceEl.textContent = t('pace_fast');
        paceEl.style.color = '#4ade80';
      } else if (pace <= 1.2) {
        paceEl.textContent = t('pace_ontime');
        paceEl.style.color = '#60a5fa';
      } else {
        paceEl.textContent = t('pace_slow');
        paceEl.style.color = '#fbbf24';
      }
      container.appendChild(paceEl);
    }

    // Skills provided summary
    var provides = (lesson.ontology && lesson.ontology.provides) || [];
    if (provides.length > 0) {
      var skillsDiv = document.createElement('div');
      skillsDiv.className = 'skills-earned';
      var skillTitle = document.createElement('h3');
      skillTitle.textContent = t('skills_practised');
      skillsDiv.appendChild(skillTitle);
      var skillList = document.createElement('ul');
      provides.forEach(function (p) {
        var li = document.createElement('li');
        li.textContent = p.skill + (p.declaredLevel ? ' (level ' + p.declaredLevel + ')' : '');
        skillList.appendChild(li);
      });
      skillsDiv.appendChild(skillList);
      container.appendChild(skillsDiv);
    }

    // Step score breakdown
    var passed = 0;
    var total  = 0;
    stepOutcomes.forEach(function (o) {
      if (o.type !== 'instruction' && o.type !== 'completion') {
        total++;
        if (o.passed) passed++;
      }
    });
    if (total > 0) {
      var scoreDiv = document.createElement('p');
      scoreDiv.className = 'score-breakdown';
      scoreDiv.textContent = t('steps_passed', { passed: passed, total: total });
      container.appendChild(scoreDiv);
    }

    // Record completion via telemetry
    var totalDuration = Date.now() - lessonStartMs;
    if (global.AGNI_TELEMETRY && global.AGNI_TELEMETRY.record) {
      global.AGNI_TELEMETRY.record(lesson, stepOutcomes, totalDuration, probeResults)
        .then(function (result) {
          if (DEV_MODE) console.log('[PLAYER] Telemetry recorded, mastery:', result.mastery);
          var masteryEl = document.createElement('p');
          masteryEl.className = 'mastery-score';
          masteryEl.textContent = 'Score: ' + Math.round(result.mastery * 100) + '%';
          container.appendChild(masteryEl);
        })
        .catch(function (err) {
          if (DEV_MODE) console.warn('[PLAYER] Telemetry record failed:', err);
        });
    }

    // Next-lesson link (if pseudoId available, redirect back to portal launcher)
    try {
      var params = new URLSearchParams(global.location.search || '');
      var pseudoId = params.get('pseudoId');
      var hubBase  = params.get('hub') || '';
      if (pseudoId) {
        var nextDiv = document.createElement('div');
        nextDiv.className = 'next-lesson-actions';
        nextDiv.style.marginTop = '1.5rem';

        var nextBtn = document.createElement('button');
        nextBtn.className = 'btn btn-primary';
        nextBtn.textContent = t('next_lesson');
        nextBtn.onclick = function () {
          var portalUrl = hubBase
            ? hubBase.replace(/\/$/, '') + '/learn?pseudoId=' + encodeURIComponent(pseudoId)
            : '/learn?pseudoId=' + encodeURIComponent(pseudoId);
          global.location.href = portalUrl;
        };
        nextDiv.appendChild(nextBtn);

        var homeBtn = document.createElement('button');
        homeBtn.className = 'btn btn-secondary';
        homeBtn.style.marginLeft = '0.75rem';
        homeBtn.textContent = t('back_dashboard');
        homeBtn.onclick = function () {
          var portalUrl = hubBase
            ? hubBase.replace(/\/$/, '') + '/learn/progress?pseudoId=' + encodeURIComponent(pseudoId)
            : '/learn/progress?pseudoId=' + encodeURIComponent(pseudoId);
          global.location.href = portalUrl;
        };
        nextDiv.appendChild(homeBtn);

        container.appendChild(nextDiv);
      }
    } catch (e) {}
  }

  /**
   * Render a step into #app.
   *
   * @param {object} step
   */
  function renderStep(step) {
    S = global.AGNI_SHARED;
    var app = document.getElementById('app');

    stepEntryMs = Date.now();

    if (S.destroyStepVisual)        S.destroyStepVisual();
    if (S.clearSensorSubscriptions) S.clearSensorSubscriptions();
    clearStepHintTimer();

    // Pace indicator (non-intrusive top bar)
    updatePaceIndicator();

    // completion steps delegate entirely
    if (step.type === 'completion') {
      renderCompletion();
      return;
    }

    // quiz steps use the dedicated multiple-choice renderer
    if (step.type === 'quiz' && step.answer_options) {
      renderQuizStep(step);
      return;
    }

    // hardware_trigger steps use the sensor + gauge renderer
    if (step.type === 'hardware_trigger') {
      renderHardwareTriggerStep(step);
      return;
    }

    // Record instruction/content steps as auto-passed
    if (step.type === 'instruction' || (!step.type && !step.spec)) {
      recordStepOutcome(step, true, 1, false);
    }

    var container = document.createElement('div');
    container.className = 'step step-' + (step.type || 'content');
    addAriaToElement(container, 'region', step.title || step.id);

    // Step progress counter
    var progressEl = document.createElement('div');
    progressEl.className = 'step-progress';
    progressEl.textContent = t('step_of', { current: stepIndex + 1, total: steps.length });
    container.appendChild(progressEl);

    if (step.htmlContent) {
      var contentDiv = document.createElement('div');
      contentDiv.className = 'step-content';
      contentDiv.innerHTML = step.htmlContent;
      container.appendChild(contentDiv);

      // Multi-modal: offer TTS for text-heavy instruction steps
      if ('speechSynthesis' in global && step.htmlContent.length > 80) {
        var readAloudBtn = document.createElement('button');
        readAloudBtn.className = 'btn btn-secondary multimodal-btn';
        readAloudBtn.textContent = '\u{1F50A} Read Aloud';
        readAloudBtn.style.cssText = 'font-size:0.8em;margin-top:0.3rem;';
        var speaking = false;
        readAloudBtn.onclick = function () {
          if (speaking) {
            global.speechSynthesis.cancel();
            readAloudBtn.textContent = '\u{1F50A} Read Aloud';
            speaking = false;
          } else {
            var text = contentDiv.textContent || '';
            var utt = new SpeechSynthesisUtterance(text);
            utt.lang = (lesson.meta && lesson.meta.language) || 'en';
            utt.rate = parseFloat(localStorage.getItem('agni_speech_rate') || '1');
            utt.onend = function () { readAloudBtn.textContent = '\u{1F50A} Read Aloud'; speaking = false; };
            global.speechSynthesis.speak(utt);
            readAloudBtn.textContent = '\u23F9 Stop Reading';
            speaking = true;
          }
        };
        container.appendChild(readAloudBtn);
      }
    }

    var specContainer = null;
    if (step.spec) {
      specContainer = document.createElement('div');
      specContainer.className = 'step-visual';
      container.appendChild(specContainer);
    }

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

    startStepHintTimer(step, container);
  }

  // ── Per-step adaptive hint timer ──
  var _stepHintTimer = null;

  function startStepHintTimer(step, container) {
    clearStepHintTimer();
    var stepExpected = step.expected_duration ? parseDurationMs(step.expected_duration) : 0;
    if (stepExpected <= 0) return;
    var threshold = stepExpected * 2.5;

    _stepHintTimer = setTimeout(function () {
      if (!container || !container.parentNode) return;
      var existing = container.querySelector('.step-hint-nudge');
      if (existing) return;
      var hintEl = document.createElement('div');
      hintEl.className = 'step-hint-nudge';
      addAriaToElement(hintEl, 'alert', 'Hint');
      hintEl.setAttribute('aria-live', 'polite');

      var hintText = step.feedback && step.feedback.hint
        ? step.feedback.hint
        : (step.type === 'quiz' ? 'Take your time \u2014 try eliminating options you know are wrong.'
          : 'Need help? Try re-reading the content above, or skip ahead if you\'re stuck.');
      hintEl.innerHTML = '<strong>Hint:</strong> ' + hintText;

      var skipBtn = document.createElement('button');
      skipBtn.className = 'btn btn-secondary hint-skip';
      skipBtn.textContent = 'Skip this step';
      skipBtn.style.marginTop = '0.5rem';
      skipBtn.onclick = function () {
        recordStepOutcome(step, false, 0, true);
        if (step.on_fail) {
          routeStep(resolveDirective(step.on_fail));
        } else {
          nextStep();
        }
      };
      hintEl.appendChild(skipBtn);
      container.appendChild(hintEl);
    }, threshold);
  }

  function clearStepHintTimer() {
    if (_stepHintTimer) { clearTimeout(_stepHintTimer); _stepHintTimer = null; }
  }

  function updatePaceIndicator() {
    if (expectedDurationMs <= 0) return;
    var el = document.getElementById('agni-pace-bar');
    if (!el) {
      el = document.createElement('div');
      el.id = 'agni-pace-bar';
      el.style.cssText = 'position:fixed;top:0;left:0;height:3px;z-index:9999;transition:width 0.3s;';
      document.body.appendChild(el);
    }
    var pct = Math.min(100, (stepIndex / steps.length) * 100);
    var pace = getPaceRatio();
    el.style.width = pct + '%';
    el.style.background = (pace !== null && pace > 1.2) ? '#fbbf24' : '#4ade80';
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
      var directive = resolveDirective(step.directive);
      renderGateRedirect({ on_fail: directive });
      return;
    }

    stepIndex = idx;
    history.push(targetId);
    saveCheckpoint();
    renderStep(step);

    if (step.type === 'gate') {
      evaluateGate(step).then(function (nextId) {
        routeStep(nextId);
      });
    }
  }

  /**
   * Evaluate a step's condition/next_if for adaptive intra-lesson branching.
   * Schema: condition (string expression), next_if { pass: stepId, fail: stepId }
   *
   * Condition format: "score >= 0.8", "attempts < 3", "probes_correct > 2"
   * Built-in variables: score, attempts, probes_correct, probes_total, pace, step_time_s
   */
  function evaluateCondition(step) {
    if (!step.condition || !step.next_if) return null;

    var passed = 0; var total = 0;
    stepOutcomes.forEach(function (o) {
      if (o.type !== 'instruction' && o.type !== 'completion') {
        total++;
        if (o.passed) passed++;
      }
    });
    var probesCorrect = 0; var probesTotal = 0;
    probeResults.forEach(function (p) {
      probesTotal++;
      if (p.correct) probesCorrect++;
    });
    var pace = getPaceRatio() || 1;
    var stepTimeS = (Date.now() - stepEntryMs) / 1000;
    var score = total > 0 ? passed / total : 0;

    var vars = {
      score: score,
      attempts: total,
      probes_correct: probesCorrect,
      probes_total: probesTotal,
      pace: pace,
      step_time_s: stepTimeS
    };

    try {
      var condStr = step.condition;
      var match = condStr.match(/^(\w+)\s*(>=|<=|==|!=|>|<)\s*([\d.]+)$/);
      if (!match) return null;
      var varName = match[1];
      var op = match[2];
      var threshold = parseFloat(match[3]);
      var val = vars[varName];
      if (val === undefined) return null;

      var result = false;
      switch (op) {
        case '>':  result = val > threshold;  break;
        case '<':  result = val < threshold;  break;
        case '>=': result = val >= threshold; break;
        case '<=': result = val <= threshold; break;
        case '==': result = val === threshold; break;
        case '!=': result = val !== threshold; break;
      }

      return result ? (step.next_if.pass || null) : (step.next_if.fail || null);
    } catch (e) {
      if (DEV_MODE) console.warn('[PLAYER] condition evaluation failed:', e);
      return null;
    }
  }

  function nextStep() {
    var currentStep = steps[stepIndex];
    if (currentStep) {
      // Condition/next_if adaptive branching (expression-based)
      var branchTarget = evaluateCondition(currentStep);
      if (branchTarget) {
        routeStep(branchTarget);
        return;
      }

      // on_success routing: instruction and content steps always "pass",
      // so on_success acts as a non-linear "next" override.
      if (currentStep.on_success) {
        routeStep(resolveDirective(currentStep.on_success));
        return;
      }
    }
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
      el.textContent = t('sensor_unavailable');
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
      btn.textContent = t('enable_sensors');
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
    msg.textContent = t('integrity_error');
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
    applyAccessibility();
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

        if (steps.length === 0) {
          console.error('[PLAYER] Lesson has no steps');
          return;
        }

        // Check for a saved checkpoint and offer resume
        var checkpoint = loadCheckpoint();
        if (checkpoint && checkpoint.stepId) {
          var ckptIdx = -1;
          for (var i = 0; i < steps.length; i++) {
            if (steps[i].id === checkpoint.stepId) { ckptIdx = i; break; }
          }
          if (ckptIdx > 0) {
            stepOutcomes = checkpoint.stepOutcomes || [];
            probeResults = checkpoint.probeResults || [];
            showResumePrompt(checkpoint.stepId, ckptIdx);
            return;
          }
        }

        routeStep(steps[0].id);
      })
      .catch(function (err) {
        if (err && err.message !== '__integrity_fail__') {
          console.error('[PLAYER] Init failed:', err);
          var loading = document.getElementById('loading');
          if (loading) loading.textContent = t('loading_failed');
        }
      });
  }

  /**
   * Show a prompt letting the student resume from a checkpoint or start over.
   */
  function showResumePrompt(stepId, ckptIdx) {
    var app = document.getElementById('app');
    app.innerHTML = '';

    var container = document.createElement('div');
    container.className = 'resume-prompt';

    var title = document.createElement('h2');
    title.textContent = t('resume_title');
    container.appendChild(title);

    var msg = document.createElement('p');
    msg.textContent = t('resume_msg', { step: ckptIdx + 1, total: steps.length });
    container.appendChild(msg);

    var resumeBtn = document.createElement('button');
    resumeBtn.className = 'btn btn-primary';
    resumeBtn.textContent = t('resume_btn');
    resumeBtn.onclick = function () { routeStep(stepId); };
    container.appendChild(resumeBtn);

    var restartBtn = document.createElement('button');
    restartBtn.className = 'btn btn-secondary';
    restartBtn.style.marginLeft = '0.75rem';
    restartBtn.textContent = t('restart_btn');
    restartBtn.onclick = function () {
      clearCheckpoint();
      stepOutcomes = [];
      probeResults = [];
      routeStep(steps[0].id);
    };
    container.appendChild(restartBtn);

    app.appendChild(container);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPlayer);
  } else {
    initPlayer();
  }

}(window));
