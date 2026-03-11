// @ts-nocheck — runtime globals (LESSON_DATA, AGNI_*), DOM, sensors; types in index.d.ts
// packages/agni-runtime/ui/player.js
// AGNI Lesson Player  v4.0.0
//
// Runs on: Edge device (Android 7.0 Nougat, API 24, Chrome 51 WebView). ES5 only.
//
// Core state machine: step routing, sensor init, rendering.
// Delegates to extracted modules for isolated concerns:
//   AGNI_INTEGRITY   — Ed25519 signature verification (integrity.js)
//   AGNI_CHECKPOINT  — localStorage save/resume (checkpoint.js)
//   AGNI_FRUSTRATION — frustration detection + nudges (frustration.js)
//   AGNI_COMPLETION  — completion screen rendering (completion.js)
//   AGNI_GATES       — gate quiz, manual verification, redirects (gate-renderer.js)
//   AGNI_A11Y        — accessibility prefs + CSS injection (a11y.js)
//
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

  // Narration engine — auto-reads everything for blind/illiterate learners
  var _narr = global.AGNI_NARRATION || {
    isEnabled: function () { return false; }, cancel: function () {},
    narrateStepEntry: function () {}, narrateContent: function () {},
    narrateQuiz: function () {}, narrateFillBlank: function () {},
    narrateMatching: function () {}, narrateOrdering: function () {},
    narrateHardwareTrigger: function () {}, narrateFeedback: function () {},
    narrateCompletion: function () {}, narrateSvgDescription: function () {},
    setLang: function () {}
  };

  // Refreshed at each call site after loadDependencies() resolves.
  var S = global.AGNI_SHARED || {};

  var lesson    = global.LESSON_DATA;
  var steps     = lesson.steps || [];
  var history   = [];
  var stepIndex = 0;

  _narr.setLang((lesson.meta && lesson.meta.language) || 'en');
  if (lesson.meta && lesson.meta.accessibility_mode === 'audio_first') {
    _narr.setEnabled(true);
  }

  var _stepIdMap = {};
  for (var _mi = 0; _mi < steps.length; _mi++) {
    if (steps[_mi].id) _stepIdMap[steps[_mi].id] = _mi;
  }

  // ── Step outcome tracking & probe collection ──
  var stepOutcomes  = [];
  var probeResults  = [];
  var lessonStartMs = Date.now();
  var stepEntryMs   = Date.now();
  var LESSON_ID     = (lesson.meta && lesson.meta.identifier) || lesson.id || 'unknown';

  // ── Frustration detection — delegated to AGNI_FRUSTRATION module ──
  var _frust = global.AGNI_FRUSTRATION || {
    trackOutcome: function () {}, trackRetry: function () {},
    shouldShowNudge: function () { return false; },
    showNudge: function () {}, reset: function () {}
  };

  function _showFrustrationNudge(container) { _frust.showNudge(container, t); }

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
    _frust.trackOutcome(passed, skipped);
  }

  function _defaultWeight(type) {
    if (type === 'quiz' || type === 'hardware_trigger' || type === 'gate') return 1;
    if (type === 'instruction' || type === 'completion') return 0;
    return 0.5;
  }

  // ── Checkpoint save/resume — delegated to AGNI_CHECKPOINT module ──
  var _ckpt = global.AGNI_CHECKPOINT || {
    save: function () {}, load: function () { return null; }, clear: function () {}
  };

  var _hubUrl = (function () {
    try { var p = new URLSearchParams(location.search); return p.get('hub') || ''; } catch (e) { return ''; }
  })();
  var _pseudoId = (function () {
    try { var p = new URLSearchParams(location.search); return p.get('pseudoId') || ''; } catch (e) { return ''; }
  })();

  function saveCheckpoint() {
    _ckpt.save(LESSON_ID, {
      stepIndex: stepIndex,
      stepId: steps[stepIndex] ? steps[stepIndex].id : null,
      stepOutcomes: stepOutcomes,
      probeResults: probeResults
    }, DEV_MODE);
    if (_ckpt.sync) _ckpt.sync(_hubUrl, _pseudoId, LESSON_ID, DEV_MODE);
  }

  function loadCheckpoint() { return _ckpt.load(LESSON_ID, DEV_MODE); }
  function clearCheckpoint() { _ckpt.clear(LESSON_ID, DEV_MODE); }

  function parseDurationMs(str) {
    if (S.parseDurationMs) return S.parseDurationMs(str);
    if (!str || typeof str !== 'string') return 0;
    var m = str.match(/^P(?:T(?=(\d)))?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
    if (!m) return 0;
    return ((parseInt(m[2], 10) || 0) * 3600 + (parseInt(m[3], 10) || 0) * 60 + (parseInt(m[4], 10) || 0)) * 1000;
  }

  // ── Integrity verification — delegated to AGNI_INTEGRITY module ──
  // devMode is derived from URL params inside integrity.js, not passed from here [R10 P1.1]
  function verifyIntegrity() {
    if (global.AGNI_INTEGRITY) return global.AGNI_INTEGRITY.verify(lesson);
    if (S && S._urlDevMode) return Promise.resolve(true);
    console.error('[VERIFY] AGNI_INTEGRITY module not loaded');
    return Promise.resolve(false);
  }


  // ── Gate evaluation — delegated to AGNI_GATES module ──
  var _gates = global.AGNI_GATES || {};
  var resolveDirective = _gates.resolveDirective;

  function renderGateRedirect(gate) {
    if (_gates.renderRedirect) return _gates.renderRedirect(gate, lesson, DEV_MODE);
  }

  function _safeNextStepId(gate) {
    if (gate.on_pass) return gate.on_pass;
    return (stepIndex + 1 < steps.length) ? steps[stepIndex + 1].id : null;
  }

  function evaluateGate(gate) {
    return new Promise(function (resolve) {
      var nextId = _safeNextStepId(gate);
      if (!nextId) { renderCompletion(); return; }

      if (gate.type === 'quiz' && _gates.renderQuiz) {
        _gates.renderQuiz(gate, function (result) {
          if (result === 'pass') { resolve(nextId); } else { renderGateRedirect(gate); }
        });
      } else if (gate.type === 'manual_verification' && _gates.renderManualVerification) {
        _gates.renderManualVerification(gate, function (result) {
          if (result === 'pass') { resolve(nextId); } else { renderGateRedirect(gate); }
        });
      } else {
        resolve(nextId);
      }
    });
  }


  // ── Accessibility — delegated to AGNI_A11Y module ──
  var _a11y = global.AGNI_A11Y || { prefs: { fontScale: 1, highContrast: false, reducedMotion: false, hapticIntensity: 1 }, apply: function () {}, addAria: function () {} };
  var a11y = _a11y.prefs;

  // ── Step renderers from AGNI_STEP_RENDERERS (step-renderers.js) ──
  function buildRenderCtx() {
    return {
      recordStepOutcome: recordStepOutcome,
      nextStep: nextStep,
      routeStep: routeStep,
      resolveDirective: resolveDirective,
      S: global.AGNI_SHARED || S,
      _narr: _narr,
      _frust: _frust,
      _a11y: _a11y,
      _showFrustrationNudge: _showFrustrationNudge,
      probeResults: probeResults,
      t: t,
      lesson: lesson,
      steps: steps,
      stepIndex: stepIndex,
      DEV_MODE: DEV_MODE,
      a11y: a11y,
      parseDurationMs: parseDurationMs
    };
  }
  var EXT_RENDERERS = global.AGNI_STEP_RENDERERS || {};
  function extRenderer(type) {
    return function (step) {
      if (EXT_RENDERERS[type]) EXT_RENDERERS[type](buildRenderCtx(), step);
    };
  }

  // SECTION 2b–2f: step-type renderers (quiz, hardware_trigger, fill_blank, matching, ordering)
  // are in step-renderers.js; player calls via EXT_RENDERERS. Fallback removed — always loaded.

  // Extracted renderers: quiz, fill_blank, matching, ordering, hardware_trigger

  // SECTION 3 — Step rendering
  // ═══════════════════════════════════════════════════════════════════════════

  // ── expected_duration pace tracking ──
  var expectedDurationMs = 0;
  try {
    var ed = (lesson.meta && lesson.meta.expected_duration) || '';
    expectedDurationMs = parseDurationMs(ed);
  } catch (e) { if (DEV_MODE) console.warn('[PLAYER] expected_duration parse failed:', e); }

  function getPaceRatio() {
    if (expectedDurationMs <= 0) return null;
    var elapsed = Date.now() - lessonStartMs;
    return elapsed / expectedDurationMs;
  }

  /**
   * Render the lesson-complete screen — delegated to AGNI_COMPLETION module.
   */
  function renderCompletion() {
    _narr.narrateCompletion();
    if (global.AGNI_COMPLETION) {
      global.AGNI_COMPLETION.render({
        lesson: lesson,
        stepOutcomes: stepOutcomes,
        probeResults: probeResults,
        steps: steps,
        lessonStartMs: lessonStartMs,
        expectedDurationMs: expectedDurationMs,
        t: t,
        devMode: DEV_MODE,
        onRetry: function () {
          clearCheckpoint();
          stepOutcomes = [];
          probeResults = [];
          stepIndex = 0;
          lessonStartMs = Date.now();
          if (_frust.reset) _frust.reset();
          routeStep(steps[0].id);
        }
      });
      return;
    }
    var app = document.getElementById('app');
    app.innerHTML = '';
    var msg = document.createElement('div');
    msg.textContent = t('lesson_complete');
    app.appendChild(msg);
  }

  /**
   * Render a content/instruction/svg step (the default renderer).
   */
  function renderContentStep(step) {
    var app = document.getElementById('app');

    if (step.type === 'instruction' || step.type === 'svg' || (!step.type && !step.spec)) {
      recordStepOutcome(step, true, 1, false);
    }

    var container = document.createElement('div');
    container.className = 'step step-' + (step.type || 'content');
    _a11y.addAria(container, 'region', step.title || step.id);

    var progressEl = document.createElement('div');
    progressEl.className = 'step-progress';
    progressEl.textContent = t('step_of', { current: stepIndex + 1, total: steps.length });
    container.appendChild(progressEl);

    if (step.htmlContent) {
      var contentDiv = document.createElement('div');
      contentDiv.className = 'step-content';
      S.setSafeHtml(contentDiv, step.htmlContent);
      container.appendChild(contentDiv);

      var _contentText = step.audio_description || contentDiv.textContent || '';
      _narr.narrateContent(_contentText);

      if ('speechSynthesis' in global) {
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
            var text = _contentText;
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

    var svgContainer = null;
    var svgSpec = step.svg_spec || step.spec;
    if (svgSpec && svgSpec.factory) {
      svgContainer = document.createElement('div');
      svgContainer.className = 'step-visual svg-visual';
      container.appendChild(svgContainer);
    }

    var specContainer = null;
    if (step.spec && !svgSpec) {
      specContainer = document.createElement('div');
      specContainer.className = 'step-visual';
      container.appendChild(specContainer);
    }

    app.innerHTML = '';
    app.appendChild(container);

    if (svgContainer && svgSpec) {
      _narr.narrateSvgDescription(svgSpec.factory, svgSpec.description || step.audio_description);

      try {
        var SVG = global.AGNI_SVG;
        if (SVG && SVG.fromSpec) {
          var handle = SVG.fromSpec(svgSpec, svgContainer);
          if (handle && handle.stage) {
            S.currentStageHandle = handle;
          }
          if (DEV_MODE) console.log('[PLAYER] SVG factory rendered:', svgSpec.factory);
        } else {
          var warnP = document.createElement('p');
          warnP.style.cssText = 'color:#996600;font-size:0.9em;font-weight:bold;';
          warnP.textContent = 'SVG factory "' + svgSpec.factory + '" not available \u2014 check factory cache.';
          svgContainer.innerHTML = '';
          svgContainer.appendChild(warnP);
          console.warn('[PLAYER] AGNI_SVG.fromSpec not available for step:', step.id);
        }
      } catch (err) {
        console.error('[PLAYER] SVG render failed:', step.id, err);
        var errP = document.createElement('p');
        errP.style.cssText = 'color:#B00020;font-size:0.9em;font-weight:bold;';
        errP.textContent = 'SVG render error: ' + (err.message || err);
        svgContainer.innerHTML = '';
        svgContainer.appendChild(errP);
      }
    }

    if (specContainer && step.spec) {
      S.mountStepVisual(specContainer, step.spec)
        .then(function () {
          if (DEV_MODE) console.log('[PLAYER] Visual mounted for step:', step.id);
        })
        .catch(function (err) {
          console.error('[PLAYER] Visual mount failed:', step.id, err);
          var placeholder = document.createElement('p');
          placeholder.style.cssText = 'color:#996600;font-size:0.9em;';
          placeholder.textContent = 'SVG preview unavailable' + (err && err.message ? ' (' + err.message + ')' : '');
          specContainer.appendChild(placeholder);
        });
    }

    startStepHintTimer(step, container);
  }

  // ── Step-type dispatch table (extensible — plugins call registerStepRenderer) ──
  var STEP_RENDERERS = {
    completion:       function () { renderCompletion(); },
    quiz:             extRenderer('quiz'),
    hardware_trigger: extRenderer('hardware_trigger'),
    fill_blank:       extRenderer('fill_blank'),
    matching:         extRenderer('matching'),
    ordering:         extRenderer('ordering')
  };

  if (S) {
    S.registerStepRenderer = function (type, renderer) {
      if (typeof type === 'string' && typeof renderer === 'function') {
        STEP_RENDERERS[type] = renderer;
      }
    };
  }

  /**
   * Render a step into #app. Dispatches to the appropriate renderer.
   */
  function renderStep(step) {
    S = global.AGNI_SHARED;
    stepEntryMs = Date.now();

    if (S.destroyStepVisual)        S.destroyStepVisual();
    if (S.currentStageHandle && S.currentStageHandle.stage) {
      try { S.currentStageHandle.stage.destroy(); } catch (_e) { if (DEV_MODE) console.warn('[PLAYER] stage destroy failed:', _e); }
      S.currentStageHandle = null;
    }
    if (S.clearSensorSubscriptions) S.clearSensorSubscriptions();
    if (global.speechSynthesis && global.speechSynthesis.speaking) {
      global.speechSynthesis.cancel();
    }
    clearStepHintTimer();
    updatePaceIndicator();

    _narr.cancel();
    _narr.narrateStepEntry(stepIndex, steps.length);

    var renderer = STEP_RENDERERS[step.type];
    if (renderer) {
      renderer(step);
    } else {
      renderContentStep(step);
    }
  }

  // ── Per-step adaptive hint timer (multi-tier) ──
  var _stepHintTimers = [];

  function startStepHintTimer(step, container) {
    clearStepHintTimer();
    var stepExpected = step.expected_duration ? parseDurationMs(step.expected_duration) : 0;
    if (stepExpected <= 0) return;

    var hints = Array.isArray(step.hints) ? step.hints : [];
    var fallbackHint = (step.feedback && step.feedback.hint) || '';

    function _safeHintHtml(label, text) {
      var strong = document.createElement('strong');
      strong.textContent = label;
      var span = document.createElement('span');
      span.textContent = ' ' + text;
      var frag = document.createDocumentFragment();
      frag.appendChild(strong);
      frag.appendChild(span);
      return frag;
    }

    // Tier 1 — gentle nudge at 1.5x
    _stepHintTimers.push(setTimeout(function () {
      if (!container || !container.parentNode) return;
      if (container.querySelector('.hint-tier-1')) return;
      var el = document.createElement('div');
      el.className = 'step-hint-nudge hint-tier-1';
      el.setAttribute('aria-live', 'polite');
      el.appendChild(_safeHintHtml(t('hint_nudge'),
        hints[0] || (step.type === 'quiz'
          ? 'Take your time \u2014 try eliminating options you know are wrong.'
          : 'Need help? Try re-reading the content above.')));
      container.appendChild(el);
    }, stepExpected * 1.5));

    // Tier 2 — specific hint at 2.5x
    _stepHintTimers.push(setTimeout(function () {
      if (!container || !container.parentNode) return;
      if (container.querySelector('.hint-tier-2')) return;
      var prev = container.querySelector('.hint-tier-1');
      if (prev) prev.style.display = 'none';
      var el = document.createElement('div');
      el.className = 'step-hint-nudge hint-tier-2';
      el.setAttribute('aria-live', 'polite');
      el.appendChild(_safeHintHtml(t('hint_label'),
        hints[1] || fallbackHint || 'Look carefully at the question \u2014 what information narrows down the answer?'));
      container.appendChild(el);
    }, stepExpected * 2.5));

    // Tier 3 — strong hint + skip at 4x
    _stepHintTimers.push(setTimeout(function () {
      if (!container || !container.parentNode) return;
      if (container.querySelector('.hint-tier-3')) return;
      var prev2 = container.querySelector('.hint-tier-2');
      if (prev2) prev2.style.display = 'none';
      var el = document.createElement('div');
      el.className = 'step-hint-nudge hint-tier-3';
      _a11y.addAria(el, 'alert', 'Hint');
      el.setAttribute('aria-live', 'polite');
      el.appendChild(_safeHintHtml(t('hint_strong'),
        hints[2] || fallbackHint || 'This is a tough one. You can skip ahead if you\u2019re stuck.'));
      var skipBtn = document.createElement('button');
      skipBtn.className = 'btn btn-secondary hint-skip';
      skipBtn.textContent = t('skip_step');
      skipBtn.style.marginTop = '0.5rem';
      skipBtn.onclick = function () {
        recordStepOutcome(step, false, 0, true);
        if (step.on_fail) {
          routeStep(resolveDirective(step.on_fail));
        } else {
          nextStep();
        }
      };
      el.appendChild(skipBtn);
      container.appendChild(el);
    }, stepExpected * 4));
  }

  function clearStepHintTimer() {
    _stepHintTimers.forEach(function (t) { clearTimeout(t); });
    _stepHintTimers = [];
  }

  function updatePaceIndicator() {
    if (expectedDurationMs <= 0) return;
    var el = document.getElementById('agni-pace-bar');
    if (!el) {
      el = document.createElement('div');
      el.id = 'agni-pace-bar';
      el.style.cssText = 'position:fixed;top:0;left:0;height:4px;z-index:9999;';
      document.body.appendChild(el);
    }
    var pct = Math.min(100, (stepIndex / steps.length) * 100);
    var pace = getPaceRatio();
    el.style.width = pct + '%';
    el.style.background = (pace !== null && pace > 1.2) ? '#996600' : '#1B5E20';
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 4 — Routing
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Route to a step by id.
   * @param {string} targetId
   */
  function routeStep(targetId) {
    var idx = _stepIdMap[targetId] !== undefined ? _stepIdMap[targetId] : -1;

    if (idx === -1) {
      console.error('[PLAYER] routeStep: unknown step id:', targetId);
      if (stepIndex + 1 < steps.length) {
        console.warn('[PLAYER] Falling back to next sequential step');
        idx = stepIndex + 1;
      } else {
        renderCompletion();
        return;
      }
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
    _a11y.apply();
    if (_a11y.injectSettingsButton) _a11y.injectSettingsButton();
    if (DEV_MODE) console.log('[PLAYER] initPlayer()', lesson.meta && lesson.meta.title);

    var loader = global.AGNI_LOADER;
    var depPromise = (loader && typeof loader.loadDependencies === 'function')
      ? loader.loadDependencies(lesson)
      : Promise.resolve();

    depPromise
      .then(function () {
        S = global.AGNI_SHARED;
        var loading = document.getElementById('loading');
        if (loading) loading.textContent = (t('verifying') || 'Verifying\u2026');
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
          var ckptIdx = _stepIdMap[checkpoint.stepId] !== undefined ? _stepIdMap[checkpoint.stepId] : -1;
          if (ckptIdx > 0) {
            stepOutcomes = checkpoint.stepOutcomes || [];
            probeResults = checkpoint.probeResults || [];
            showResumePrompt(checkpoint.stepId, ckptIdx);
            return;
          }
        }

        if (!checkpoint && _ckpt.loadRemote && _hubUrl && _pseudoId) {
          _ckpt.loadRemote(_hubUrl, _pseudoId, LESSON_ID, DEV_MODE).then(function (remote) {
            if (remote && remote.stepId) {
              var rIdx = _stepIdMap[remote.stepId] !== undefined ? _stepIdMap[remote.stepId] : -1;
              if (rIdx > 0) {
                stepOutcomes = remote.stepOutcomes || [];
                probeResults = remote.probeResults || [];
                showResumePrompt(remote.stepId, rIdx);
                return;
              }
            }
            routeStep(steps[0].id);
          });
          return;
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
