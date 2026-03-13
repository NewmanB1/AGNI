// @ts-nocheck — ES5 step-type renderers for AGNI player
// packages/agni-runtime/ui/step-renderers.js
//
// Extracted from player.js for maintainability. Each renderer receives (ctx, step).
// ctx: { recordStepOutcome, nextStep, routeStep, resolveDirective, S, _narr, _frust,
//        _a11y, _showFrustrationNudge, probeResults, t, lesson, steps, stepIndex,
//        DEV_MODE, a11y, parseDurationMs }
//
// Load order: must run before player.js (player builds ctx and calls these).
// Inlined by lesson-assembly into the lesson script.
// ─────────────────────────────────────────────────────────────────────────────

(function (global) {
  'use strict';

  function renderHardwareTriggerStep(ctx, step) {
    var S = ctx.S;
    var app = document.getElementById('app');
    app.innerHTML = '';
    S = global.AGNI_SHARED || S;

    var requiredSensorId = (S.getRequiredSensorIdForStep && S.getRequiredSensorIdForStep(step)) || 'accel.total';
    var sensorsAvailable = (S.isSensorRequiredAvailable && S.isSensorRequiredAvailable(requiredSensorId)) ||
      (S.device && S.device.hasMotionEvents && S.sensorBridge && S.sensorBridge.isActive && S.sensorBridge.isActive());
    var sensorOptional = step.sensor_optional === true || (ctx.lesson.meta && ctx.lesson.meta.sensor_optional === true);

    if (!sensorsAvailable) {
      if (sensorOptional) {
        var fallbackContainer = document.createElement('div');
        fallbackContainer.className = 'step step-hardware-trigger step-sensor-fallback';
        if (step.htmlContent) {
          var fd = document.createElement('div');
          fd.className = 'step-content';
          S.setSafeHtml(fd, step.htmlContent);
          fallbackContainer.appendChild(fd);
        }
        var fallbackMsg = document.createElement('p');
        fallbackMsg.className = 'hw-fallback-msg';
        fallbackMsg.textContent = ctx.t('sensor_unavailable') || 'Sensors unavailable on this device.';
        fallbackContainer.appendChild(fallbackMsg);
        var fallbackBtn = document.createElement('button');
        fallbackBtn.className = 'btn btn-primary';
        fallbackBtn.textContent = ctx.t('tap_to_continue') || 'Tap to continue';
        fallbackBtn.onclick = function () {
          ctx.recordStepOutcome(step, true, 1, false);
          ctx.nextStep();
        };
        fallbackContainer.appendChild(fallbackBtn);
        app.appendChild(fallbackContainer);
        return;
      }
      var msgContainer = document.createElement('div');
      msgContainer.className = 'step step-hardware-trigger step-sensor-fallback';
      if (step.htmlContent) {
        var msgContent = document.createElement('div');
        msgContent.className = 'step-content';
        S.setSafeHtml(msgContent, step.htmlContent);
        msgContainer.appendChild(msgContent);
      }
      var msgEl = document.createElement('p');
      msgEl.className = 'hw-fallback-msg';
      msgEl.textContent = (ctx.t('sensor_unavailable') || 'Sensors unavailable on this device.') +
        ' ' + (ctx.t('use_emulator') || 'Use the button below.');
      msgContainer.appendChild(msgEl);
      var emulatorBtn = document.createElement('button');
      emulatorBtn.className = 'btn btn-primary';
      emulatorBtn.textContent = ctx.t('emulator_shake') || 'Shake';
      emulatorBtn.onclick = function () {
        if (S.sensorBridge && S.sensorBridge.startSimulation) {
          S.sensorBridge.startSimulation({ pattern: 'shake', hz: 20 });
        }
      };
      msgContainer.appendChild(emulatorBtn);
      app.appendChild(msgContainer);
      return;
    }

    var container = document.createElement('div');
    container.className = 'step step-hardware-trigger';

    if (step.htmlContent) {
      var contentDiv = document.createElement('div');
      contentDiv.className = 'step-content';
      S.setSafeHtml(contentDiv, step.htmlContent);
      container.appendChild(contentDiv);
    }

    if (step.feedback) {
      var hint = document.createElement('p');
      hint.className = 'hw-hint';
      hint.textContent = step.feedback;
      container.appendChild(hint);
    }

    var gaugeContainer = document.createElement('div');
    gaugeContainer.className = 'sensor-gauge';
    ctx._a11y.addAria(gaugeContainer, 'meter', 'Sensor reading');

    var gaugeLabel = document.createElement('div');
    gaugeLabel.className = 'gauge-label';
    gaugeLabel.textContent = requiredSensorId;
    gaugeContainer.appendChild(gaugeLabel);

    var gaugeTrack = document.createElement('div');
    gaugeTrack.className = 'gauge-track';
    var gaugeFill = document.createElement('div');
    gaugeFill.className = 'gauge-fill';
    gaugeTrack.appendChild(gaugeFill);

    var thresholdMarker = document.createElement('div');
    thresholdMarker.className = 'gauge-threshold';
    gaugeTrack.appendChild(thresholdMarker);

    gaugeContainer.appendChild(gaugeTrack);

    var gaugeValue = document.createElement('div');
    gaugeValue.className = 'gauge-value';
    gaugeValue.textContent = '0.0';
    gaugeContainer.appendChild(gaugeValue);

    container.appendChild(gaugeContainer);

    var statusEl = document.createElement('p');
    statusEl.className = 'hw-status';
    statusEl.textContent = ctx.t('waiting_sensor');
    ctx._a11y.addAria(statusEl, 'status', 'Sensor status');
    statusEl.setAttribute('aria-live', 'polite');
    container.appendChild(statusEl);

    app.appendChild(container);

    ctx._narr.narrateHardwareTrigger(step.audio_description || (container.querySelector('.step-content') ? container.querySelector('.step-content').textContent : ''), step.threshold);

    var thresholdStr = step.threshold || '';
    var primarySensor = requiredSensorId;
    var targetValue = 10;
    try {
      var numMatch = thresholdStr.match(/([\d.]+)g?\b/);
      if (numMatch) {
        targetValue = parseFloat(numMatch[1]);
        if (/g/i.test(thresholdStr)) targetValue *= 9.81;
      }
    } catch (e) { if (ctx.DEV_MODE) console.warn('[PLAYER] threshold parse failed:', e); }
    var gaugeMax = targetValue * 1.5;

    var markerPct = Math.min(100, (targetValue / gaugeMax) * 100);
    thresholdMarker.style.left = markerPct + '%';

    var cancelWatch = null;
    if (S.registerStepCleanup) {
      S.registerStepCleanup(function () {
        if (cancelWatch) cancelWatch();
      });
    }
    if (S.thresholdEvaluator && thresholdStr) {
      var _triggerCancel = null;
      var SENSOR_TIMEOUT_MS = 5000;

      var unsub = S.subscribeToSensor(primarySensor, function (reading) {
        var val = reading.value;
        var pct = Math.min(100, Math.max(0, (val / gaugeMax) * 100));
        gaugeFill.style.width = pct + '%';
        gaugeFill.style.background = (val >= targetValue) ? '#1B5E20' : '#0B5FFF';
        gaugeValue.textContent = val.toFixed(1);
      });

      function showEmulatorFallback() {
        statusEl.textContent = (ctx.t('sensor_unavailable') || 'Sensors unavailable.') + ' ' + (ctx.t('use_emulator') || 'Use the button below:');
        statusEl.style.color = '#666';
        var btn = document.createElement('button');
        btn.className = 'btn btn-primary';
        btn.textContent = ctx.t('emulator_shake') || 'Shake';
        btn.style.marginTop = '0.5rem';
        btn.onclick = function () {
          if (S.sensorBridge && S.sensorBridge.startSimulation) {
            S.sensorBridge.startSimulation({ pattern: 'shake', hz: 20 });
          }
        };
        container.appendChild(btn);
      }

      _triggerCancel = S.thresholdEvaluator.watch(thresholdStr, primarySensor, function () {
        unsub();
        if (S.sensorBridge && S.sensorBridge.stopSimulation) S.sensorBridge.stopSimulation();
        statusEl.textContent = ctx.t('threshold_met');
        statusEl.style.color = '#1B5E20';
        gaugeFill.style.background = '#1B5E20';
        gaugeFill.style.width = '100%';
        ctx.recordStepOutcome(step, true, 1, false);

        if (ctx.a11y.hapticIntensity > 0 && navigator.vibrate) {
          navigator.vibrate(Math.round(200 * ctx.a11y.hapticIntensity));
        }

        setTimeout(function () {
          if (step.on_success) {
            ctx.routeStep(ctx.resolveDirective(step.on_success));
          } else {
            ctx.nextStep();
          }
        }, 1000);
      }, { timeoutMs: SENSOR_TIMEOUT_MS, onTimeout: showEmulatorFallback });

      cancelWatch = function () {
        unsub();
        if (_triggerCancel) _triggerCancel();
      };
    } else {
      statusEl.textContent = 'Sensor interaction (no threshold configured)';
      var skipBtn = document.createElement('button');
      skipBtn.className = 'btn btn-primary';
      skipBtn.textContent = 'Continue';
      skipBtn.onclick = function () {
        ctx.recordStepOutcome(step, true, 1, false);
        ctx.nextStep();
      };
      container.appendChild(skipBtn);
    }
  }

  function renderQuizStep(ctx, step) {
    var S = ctx.S;
    var app = document.getElementById('app');
    app.innerHTML = '';

    var container = document.createElement('div');
    container.className = 'step step-quiz';

    if (step.htmlContent) {
      var contentDiv = document.createElement('div');
      contentDiv.className = 'step-content';
      S.setSafeHtml(contentDiv, step.htmlContent);
      container.appendChild(contentDiv);
    }

    var options = step.answer_options || [];
    var correctIdx = typeof step.correct_index === 'number' ? step.correct_index : -1;
    var maxAtt = (step.max_attempts > 0) ? step.max_attempts : 2;
    var fb = step.feedback || {};
    var attempts = 0;

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

    var _quizText = step.audio_description || (step.htmlContent ? container.querySelector('.step-content') : null);
    ctx._narr.narrateQuiz(_quizText ? (_quizText.textContent || _quizText) : '', options);

    function handleAnswer(selectedIdx) {
      var correct = (selectedIdx === correctIdx);
      attempts++;
      ctx._frust.trackRetry();

      ctx.probeResults.push({
        probeId: step.id,
        correct: correct,
        selectedIndex: selectedIdx,
        attempt: attempts
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
        var fbCorrectText = fb.correct || 'Correct!';
        var fbCorrectP = document.createElement('p');
        fbCorrectP.className = 'fb-correct';
        fbCorrectP.textContent = fbCorrectText;
        feedbackEl.innerHTML = '';
        feedbackEl.appendChild(fbCorrectP);
        ctx._narr.narrateFeedback(fbCorrectText);
        ctx.recordStepOutcome(step, true, attempts, false);
        setTimeout(function () {
          if (step.on_success) {
            ctx.routeStep(ctx.resolveDirective(step.on_success));
          } else {
            ctx.nextStep();
          }
        }, 1200);
      } else if (attempts >= maxAtt) {
        var correctText = (correctIdx >= 0 && correctIdx < options.length)
          ? (typeof options[correctIdx] === 'string' ? options[correctIdx] : options[correctIdx].text || '')
          : '';
        var fbIncorrectText = fb.incorrect || ('The correct answer was: ' + correctText);
        var fbIncorrectP = document.createElement('p');
        fbIncorrectP.className = 'fb-incorrect';
        fbIncorrectP.textContent = fbIncorrectText;
        ctx._narr.narrateFeedback(fbIncorrectText);
        feedbackEl.innerHTML = '';
        feedbackEl.appendChild(fbIncorrectP);
        ctx.recordStepOutcome(step, false, attempts, false);

        var continueBtn = document.createElement('button');
        continueBtn.className = 'btn btn-primary';
        continueBtn.textContent = 'Continue';
        continueBtn.onclick = function () {
          if (step.on_fail) {
            ctx.routeStep(ctx.resolveDirective(step.on_fail));
          } else {
            ctx.nextStep();
          }
        };
        feedbackEl.appendChild(continueBtn);
      } else {
        var remaining = maxAtt - attempts;
        var hintTexts = Array.isArray(fb.hints) ? fb.hints : [];
        var attemptHint = hintTexts[attempts - 1] || fb.hint || '';
        var _fmt = S.formatRemainingAttempts || function (p, r) { return p + ' (' + r + ' attempt' + (r === 1 ? '' : 's') + ' remaining)'; };
        var retryMsg = _fmt(attemptHint || 'Not quite \u2014 try again.', remaining);
        var fbHintP = document.createElement('p');
        fbHintP.className = 'fb-hint';
        fbHintP.textContent = retryMsg;
        feedbackEl.innerHTML = '';
        feedbackEl.appendChild(fbHintP);
        ctx._narr.narrateFeedback(retryMsg);
        optBtns.forEach(function (btn, i) {
          if (i !== selectedIdx) {
            btn.disabled = false;
            btn.classList.remove('quiz-correct', 'quiz-incorrect');
          }
        });
        if (ctx._frust.shouldShowNudge()) ctx._showFrustrationNudge(container);
      }
    }
  }

  function renderFillBlankStep(ctx, step) {
    var S = ctx.S;
    var app = document.getElementById('app');
    app.innerHTML = '';

    var container = document.createElement('div');
    container.className = 'step step-fill-blank';

    if (step.htmlContent) {
      var contentDiv = document.createElement('div');
      contentDiv.className = 'step-content';
      var html = step.htmlContent.replace(/___/g, '<input type="text" class="fill-blank-input" autocomplete="off" autocapitalize="off">');
      S.setSafeHtml(contentDiv, html);
      container.appendChild(contentDiv);
    }

    var blanks = step.blanks || [];
    var maxAtt = (step.max_attempts > 0) ? step.max_attempts : 2;
    var fb = step.feedback || {};
    var attempts = 0;

    var feedbackEl = document.createElement('div');
    feedbackEl.className = 'quiz-feedback';
    container.appendChild(feedbackEl);

    var submitBtn = document.createElement('button');
    submitBtn.className = 'btn btn-primary';
    submitBtn.textContent = 'Check Answer';
    submitBtn.style.marginTop = '1rem';
    container.appendChild(submitBtn);

    app.appendChild(container);

    ctx._narr.narrateFillBlank(step.audio_description || (container.querySelector('.step-content') ? container.querySelector('.step-content').textContent : ''), blanks);

    submitBtn.onclick = function () {
      attempts++;
      ctx._frust.trackRetry();
      var inputs = container.querySelectorAll('.fill-blank-input');
      var correctCount = 0;
      for (var i = 0; i < inputs.length; i++) {
        var userAnswer = (inputs[i].value || '').trim().toLowerCase();
        var blankDef = blanks[i] || {};
        var accepted = [blankDef.answer || ''].concat(blankDef.accept || []);
        var isCorrect = false;
        for (var j = 0; j < accepted.length; j++) {
          if (userAnswer === String(accepted[j]).toLowerCase()) { isCorrect = true; break; }
        }
        inputs[i].style.borderColor = isCorrect ? '#1B5E20' : '#B00020';
        if (isCorrect) correctCount++;
      }

      var allCorrect = (correctCount === inputs.length);

      ctx.probeResults.push({
        probeId: step.id,
        correct: allCorrect,
        correctCount: correctCount,
        totalBlanks: inputs.length,
        attempt: attempts
      });

      if (allCorrect) {
        var fbCorrectMsg = fb.correct || 'All correct!';
        feedbackEl.innerHTML = '';
        var p = document.createElement('p');
        p.className = 'fb-correct';
        p.textContent = fbCorrectMsg;
        feedbackEl.appendChild(p);
        ctx._narr.narrateFeedback(fbCorrectMsg);
        submitBtn.disabled = true;
        ctx.recordStepOutcome(step, true, attempts, false);
        setTimeout(function () {
          if (step.on_success) ctx.routeStep(ctx.resolveDirective(step.on_success));
          else ctx.nextStep();
        }, 1200);
      } else if (attempts >= maxAtt) {
        feedbackEl.innerHTML = '';
        var pFail = document.createElement('p');
        pFail.className = 'fb-incorrect';
        var answers = blanks.map(function (b) { return b.answer || '?'; }).join(', ');
        var fbIncMsg = fb.incorrect || ('Correct answers: ' + answers);
        pFail.textContent = fbIncMsg;
        feedbackEl.appendChild(pFail);
        ctx._narr.narrateFeedback(fbIncMsg);
        submitBtn.disabled = true;
        ctx.recordStepOutcome(step, false, attempts, false);
        var continueBtn = document.createElement('button');
        continueBtn.className = 'btn btn-primary';
        continueBtn.textContent = 'Continue';
        continueBtn.style.marginTop = '0.5rem';
        continueBtn.onclick = function () {
          if (step.on_fail) ctx.routeStep(ctx.resolveDirective(step.on_fail));
          else ctx.nextStep();
        };
        feedbackEl.appendChild(continueBtn);
      } else {
        feedbackEl.innerHTML = '';
        var pHint = document.createElement('p');
        pHint.className = 'fb-hint';
        pHint.textContent = correctCount + ' of ' + inputs.length + ' correct. Try again.';
        feedbackEl.appendChild(pHint);
        if (ctx._frust.shouldShowNudge()) ctx._showFrustrationNudge(container);
      }
    };
  }

  function renderMatchingStep(ctx, step) {
    var S = ctx.S;
    var app = document.getElementById('app');
    app.innerHTML = '';

    var container = document.createElement('div');
    container.className = 'step step-matching';

    if (step.htmlContent) {
      var contentDiv = document.createElement('div');
      contentDiv.className = 'step-content';
      S.setSafeHtml(contentDiv, step.htmlContent);
      container.appendChild(contentDiv);
    }

    var pairs = step.pairs || [];
    var maxAtt = (step.max_attempts > 0) ? step.max_attempts : 2;
    var fb = step.feedback || {};
    var attempts = 0;

    var leftItems = pairs.map(function (p) { return p.left; });
    var rightItems = pairs.map(function (p) { return p.right; });
    var shuffledRight = rightItems.slice().sort(function () { return Math.random() - 0.5; });

    var matches = {};
    var selectedLeft = null;

    var matchGrid = document.createElement('div');
    matchGrid.style.cssText = 'display:flex;gap:1rem;margin:1rem 0;';

    var leftCol = document.createElement('div');
    leftCol.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:0.5rem;';
    var rightCol = document.createElement('div');
    rightCol.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:0.5rem;';

    var leftBtns = [];
    var rightBtns = [];

    leftItems.forEach(function (item, idx) {
      var btn = document.createElement('button');
      btn.className = 'quiz-option';
      btn.textContent = item;
      btn.style.minHeight = '48px';
      btn.setAttribute('data-left-idx', idx);
      btn.onclick = function () {
        for (var k = 0; k < leftBtns.length; k++) leftBtns[k].style.outline = '';
        selectedLeft = idx;
        btn.style.outline = '3px solid #0B5FFF';
      };
      leftCol.appendChild(btn);
      leftBtns.push(btn);
    });

    shuffledRight.forEach(function (item, idx) {
      var btn = document.createElement('button');
      btn.className = 'quiz-option';
      btn.textContent = item;
      btn.style.minHeight = '48px';
      btn.setAttribute('data-right-idx', idx);
      btn.onclick = function () {
        if (selectedLeft === null) return;
        matches[selectedLeft] = item;
        leftBtns[selectedLeft].style.outline = '3px solid #1B5E20';
        leftBtns[selectedLeft].textContent = leftItems[selectedLeft] + ' \u2192 ' + item;
        leftBtns[selectedLeft].disabled = true;
        btn.style.outline = '3px solid #1B5E20';
        btn.disabled = true;
        selectedLeft = null;
        for (var k = 0; k < leftBtns.length; k++) {
          if (!leftBtns[k].disabled) leftBtns[k].style.outline = '';
        }
      };
      rightCol.appendChild(btn);
      rightBtns.push(btn);
    });

    matchGrid.appendChild(leftCol);
    matchGrid.appendChild(rightCol);
    container.appendChild(matchGrid);

    var feedbackEl = document.createElement('div');
    feedbackEl.className = 'quiz-feedback';
    container.appendChild(feedbackEl);

    var submitBtn = document.createElement('button');
    submitBtn.className = 'btn btn-primary';
    submitBtn.textContent = 'Check Matches';
    submitBtn.style.marginTop = '0.5rem';
    container.appendChild(submitBtn);

    app.appendChild(container);

    ctx._narr.narrateMatching(step.audio_description || (container.querySelector('.step-content') ? container.querySelector('.step-content').textContent : ''), pairs);

    submitBtn.onclick = function () {
      attempts++;
      ctx._frust.trackRetry();
      var correctCount = 0;
      for (var i = 0; i < pairs.length; i++) {
        if (matches[i] === pairs[i].right) correctCount++;
      }
      var allCorrect = (correctCount === pairs.length);

      ctx.probeResults.push({
        probeId: step.id,
        correct: allCorrect,
        correctCount: correctCount,
        totalPairs: pairs.length,
        attempt: attempts
      });

      if (allCorrect) {
        var matchFbOk = fb.correct || 'All matched correctly!';
        feedbackEl.innerHTML = '';
        var p = document.createElement('p');
        p.className = 'fb-correct';
        p.textContent = matchFbOk;
        feedbackEl.appendChild(p);
        ctx._narr.narrateFeedback(matchFbOk);
        submitBtn.disabled = true;
        ctx.recordStepOutcome(step, true, attempts, false);
        setTimeout(function () {
          if (step.on_success) ctx.routeStep(ctx.resolveDirective(step.on_success));
          else ctx.nextStep();
        }, 1200);
      } else if (attempts >= maxAtt) {
        var matchFbFail = fb.incorrect || (correctCount + ' of ' + pairs.length + ' correct.');
        feedbackEl.innerHTML = '';
        var pFail = document.createElement('p');
        pFail.className = 'fb-incorrect';
        pFail.textContent = matchFbFail;
        feedbackEl.appendChild(pFail);
        ctx._narr.narrateFeedback(matchFbFail);
        submitBtn.disabled = true;
        ctx.recordStepOutcome(step, false, attempts, false);
        var continueBtn = document.createElement('button');
        continueBtn.className = 'btn btn-primary';
        continueBtn.textContent = 'Continue';
        continueBtn.style.marginTop = '0.5rem';
        continueBtn.onclick = function () {
          if (step.on_fail) ctx.routeStep(ctx.resolveDirective(step.on_fail));
          else ctx.nextStep();
        };
        feedbackEl.appendChild(continueBtn);
      } else {
        feedbackEl.innerHTML = '';
        var pHint = document.createElement('p');
        pHint.className = 'fb-hint';
        pHint.textContent = correctCount + ' of ' + pairs.length + ' correct. Try again.';
        feedbackEl.appendChild(pHint);
        matches = {};
        selectedLeft = null;
        for (var k = 0; k < leftBtns.length; k++) {
          leftBtns[k].disabled = false;
          leftBtns[k].textContent = leftItems[k];
          leftBtns[k].style.outline = '';
        }
        for (var m = 0; m < rightBtns.length; m++) {
          rightBtns[m].disabled = false;
          rightBtns[m].style.outline = '';
        }
        if (ctx._frust.shouldShowNudge()) ctx._showFrustrationNudge(container);
      }
    };
  }

  function renderOrderingStep(ctx, step) {
    var S = ctx.S;
    var app = document.getElementById('app');
    app.innerHTML = '';

    var container = document.createElement('div');
    container.className = 'step step-ordering';

    if (step.htmlContent) {
      var contentDiv = document.createElement('div');
      contentDiv.className = 'step-content';
      S.setSafeHtml(contentDiv, step.htmlContent);
      container.appendChild(contentDiv);
    }

    var items = (step.items || []).slice();
    var correctOrder = step.correct_order || [];
    var maxAtt = (step.max_attempts > 0) ? step.max_attempts : 2;
    var fb = step.feedback || {};
    var attempts = 0;

    var shuffled = items.slice().sort(function () { return Math.random() - 0.5; });
    var currentOrder = shuffled.slice();

    var listEl = document.createElement('div');
    listEl.className = 'ordering-list';
    listEl.style.cssText = 'margin:1rem 0;';

    function renderList() {
      listEl.innerHTML = '';
      for (var i = 0; i < currentOrder.length; i++) {
        (function (idx) {
          var row = document.createElement('div');
          row.style.cssText = 'display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;';

          var upBtn = document.createElement('button');
          upBtn.className = 'btn btn-secondary';
          upBtn.textContent = '\u25B2';
          upBtn.style.cssText = 'min-width:48px;min-height:48px;font-size:1.2rem;';
          upBtn.disabled = (idx === 0);
          upBtn.onclick = function () {
            var temp = currentOrder[idx - 1];
            currentOrder[idx - 1] = currentOrder[idx];
            currentOrder[idx] = temp;
            renderList();
          };

          var downBtn = document.createElement('button');
          downBtn.className = 'btn btn-secondary';
          downBtn.textContent = '\u25BC';
          downBtn.style.cssText = 'min-width:48px;min-height:48px;font-size:1.2rem;';
          downBtn.disabled = (idx === currentOrder.length - 1);
          downBtn.onclick = function () {
            var temp = currentOrder[idx + 1];
            currentOrder[idx + 1] = currentOrder[idx];
            currentOrder[idx] = temp;
            renderList();
          };

          var label = document.createElement('span');
          label.style.cssText = 'flex:1;padding:0.5rem;background:#f5f5f0;border-radius:2px;';
          label.textContent = currentOrder[idx];

          row.appendChild(upBtn);
          row.appendChild(downBtn);
          row.appendChild(label);
          listEl.appendChild(row);
        })(i);
      }
    }

    renderList();
    container.appendChild(listEl);

    var feedbackEl = document.createElement('div');
    feedbackEl.className = 'quiz-feedback';
    container.appendChild(feedbackEl);

    var submitBtn = document.createElement('button');
    submitBtn.className = 'btn btn-primary';
    submitBtn.textContent = 'Check Order';
    submitBtn.style.marginTop = '0.5rem';
    container.appendChild(submitBtn);

    app.appendChild(container);

    ctx._narr.narrateOrdering(step.audio_description || (container.querySelector('.step-content') ? container.querySelector('.step-content').textContent : ''), currentOrder);

    submitBtn.onclick = function () {
      attempts++;
      ctx._frust.trackRetry();

      var correctCount = 0;
      for (var i = 0; i < currentOrder.length; i++) {
        var expectedIdx = correctOrder[i] !== undefined ? correctOrder[i] : i;
        if (currentOrder[i] === items[expectedIdx]) correctCount++;
      }
      var allCorrect = (correctCount === currentOrder.length);

      ctx.probeResults.push({
        probeId: step.id,
        correct: allCorrect,
        correctCount: correctCount,
        totalItems: currentOrder.length,
        attempt: attempts
      });

      if (allCorrect) {
        var ordFbOk = fb.correct || 'Correct order!';
        feedbackEl.innerHTML = '';
        var p = document.createElement('p');
        p.className = 'fb-correct';
        p.textContent = ordFbOk;
        feedbackEl.appendChild(p);
        ctx._narr.narrateFeedback(ordFbOk);
        submitBtn.disabled = true;
        ctx.recordStepOutcome(step, true, attempts, false);
        setTimeout(function () {
          if (step.on_success) ctx.routeStep(ctx.resolveDirective(step.on_success));
          else ctx.nextStep();
        }, 1200);
      } else if (attempts >= maxAtt) {
        feedbackEl.innerHTML = '';
        var pFail = document.createElement('p');
        pFail.className = 'fb-incorrect';
        var correctItems = correctOrder.map(function (ci) { return items[ci]; }).join(' \u2192 ');
        var ordFbFail = fb.incorrect || ('Correct order: ' + correctItems);
        pFail.textContent = ordFbFail;
        feedbackEl.appendChild(pFail);
        ctx._narr.narrateFeedback(ordFbFail);
        submitBtn.disabled = true;
        ctx.recordStepOutcome(step, false, attempts, false);
        var continueBtn = document.createElement('button');
        continueBtn.className = 'btn btn-primary';
        continueBtn.textContent = 'Continue';
        continueBtn.style.marginTop = '0.5rem';
        continueBtn.onclick = function () {
          if (step.on_fail) ctx.routeStep(ctx.resolveDirective(step.on_fail));
          else ctx.nextStep();
        };
        feedbackEl.appendChild(continueBtn);
      } else {
        feedbackEl.innerHTML = '';
        var pHint = document.createElement('p');
        pHint.className = 'fb-hint';
        pHint.textContent = correctCount + ' of ' + currentOrder.length + ' in the right position. Try again.';
        feedbackEl.appendChild(pHint);
        if (ctx._frust.shouldShowNudge()) ctx._showFrustrationNudge(container);
      }
    };
  }

  global.AGNI_STEP_RENDERERS = {
    hardware_trigger: renderHardwareTriggerStep,
    quiz: renderQuizStep,
    fill_blank: renderFillBlankStep,
    matching: renderMatchingStep,
    ordering: renderOrderingStep
  };

}(window));
