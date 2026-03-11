// packages/agni-runtime/rendering/gate-renderer.js
// AGNI Gate Renderer Module
//
// Gate quiz, manual verification, and redirect rendering.
// Extracted from player.js Section 2 to deduplicate retry logic.
//
// Registers: window.AGNI_GATES
// Depends on: nothing (standalone)
// Load order: before player.js
//
// ES5 only — targets Android 7.0+ (Chrome 51 WebView).

(function (global) {
  'use strict';

  var S = global.AGNI_SHARED || {};

  function _fallbackFmt(prefix, remaining) {
    return prefix + ' (' + remaining + ' attempt' + (remaining === 1 ? '' : 's') + ' remaining)';
  }

  function parseDurationMs(str) {
    if (S.parseDurationMs) return S.parseDurationMs(str);
    if (!str || typeof str !== 'string') return 0;
    var m = str.match(/^P(?:T(?=(\d)))?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
    if (!m) return 0;
    return ((parseInt(m[2], 10) || 0) * 3600 + (parseInt(m[3], 10) || 0) * 60 + (parseInt(m[4], 10) || 0)) * 1000;
  }

  function formatRemaining(prefix, remaining) {
    return (S.formatRemainingAttempts || _fallbackFmt)(prefix, remaining);
  }

  function resolveDirective(raw) {
    if (!raw) return '';
    return raw
      .replace(/^redirect:/i, '')
      .replace(/^ols:/i, '')
      .replace(/^skip_to:/i, '')
      .trim();
  }

  // Shared retry delay logic used by both quiz and manual verification
  function applyRetryDelay(retryDelayMs, feedbackEl, submitBtn, inputEl, onDone) {
    if (retryDelayMs <= 0) { if (onDone) onDone(); return; }
    submitBtn.disabled = true;
    inputEl.disabled = true;
    var deadline = Date.now() + retryDelayMs;
    (function tick() {
      var left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      if (left <= 0) {
        submitBtn.disabled = false;
        inputEl.disabled = false;
        if (onDone) onDone();
        return;
      }
      feedbackEl.textContent = 'Please wait ' + left + 's before trying again.';
      setTimeout(tick, 500);
    })();
  }

  function renderRedirect(gate, lesson, devMode) {
    var prereqId = resolveDirective(gate.on_fail);
    var app = document.getElementById('app');

    var container = document.createElement('div');
    container.className = 'gate-redirect';

    var msg = document.createElement('p');
    msg.textContent = 'You need to complete a prerequisite lesson first:';
    container.appendChild(msg);

    var hubBase = (lesson._hubUrl || '').replace(/\/$/, '');
    if (!hubBase) {
      try { hubBase = global.location.protocol + '//' + global.location.host; } catch (e) {
        if (devMode) console.warn('[GATES] location read failed:', e);
      }
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
    backMsg.style.fontSize = '0.9rem';
    backMsg.style.color = '#555';
    backMsg.textContent = 'After completing the prerequisite, return to this lesson to continue.';
    container.appendChild(backMsg);

    app.innerHTML = '';
    app.appendChild(container);
  }

  function renderQuiz(gate, resolve) {
    var app = document.getElementById('app');
    var MAX_ATTEMPTS = (gate.max_attempts > 0) ? gate.max_attempts : 3;
    var attempts = 0;

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

    var escapeBtn = document.createElement('button');
    escapeBtn.className = 'btn btn-secondary';
    escapeBtn.style.marginTop = '0.75rem';
    escapeBtn.style.display = 'none';
    escapeBtn.textContent = "I haven\u2019t completed the prerequisite";
    escapeBtn.onclick = function () { resolve('fail'); };
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

      if (score >= passingScore) { resolve('pass'); return; }

      attempts++;
      if (attempts >= MAX_ATTEMPTS) {
        feedback.textContent = 'Maximum attempts reached.';
        submitBtn.disabled = true;
        input.disabled = true;
        escapeBtn.style.display = 'block';
        return;
      }

      var remaining = MAX_ATTEMPTS - attempts;
      var retryMsg = formatRemaining('Not quite \u2014 try again.', remaining);
      feedback.textContent = retryMsg;
      input.value = '';
      input.focus();

      if (retryDelayMs > 0) {
        waitingRetry = true;
        applyRetryDelay(retryDelayMs, feedback, submitBtn, input, function () {
          waitingRetry = false;
          feedback.textContent = formatRemaining('Not quite \u2014 try again.', remaining);
          input.focus();
        });
      }
    }

    submitBtn.onclick = checkAnswer;
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') checkAnswer(); });

    app.innerHTML = '';
    app.appendChild(container);
    input.focus();
  }

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
    input.style.cssText = 'padding:16px;font-size:1.2rem;text-align:center;letter-spacing:0.2em;text-transform:uppercase;background:#FFFFFF;color:#1A1A1A;border:2px solid #2D2D2D;border-radius:2px;flex:1;max-width:200px;';
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
        feedback.style.color = '#1B5E20';
        input.disabled = true;
        verifyBtn.disabled = true;
        setTimeout(function () { callback('pass'); }, 800);
      } else {
        attempts++;
        if (attempts >= maxAttempts) {
          feedback.textContent = 'Maximum attempts reached. Ask your teacher for help.';
          feedback.style.color = '#B00020';
          input.disabled = true;
          verifyBtn.disabled = true;
          var escapeBtn = document.createElement('button');
          escapeBtn.className = 'btn btn-secondary';
          escapeBtn.style.marginTop = '0.75rem';
          escapeBtn.textContent = 'Continue without verification';
          escapeBtn.onclick = function () { callback('fail'); };
          container.appendChild(escapeBtn);
          return;
        }
        var remaining = maxAttempts - attempts;
        feedback.textContent = formatRemaining('Code not recognized', remaining);
        feedback.style.color = '#B00020';
        input.value = '';

        if (retryDelayMs > 0) {
          waitingRetry = true;
          applyRetryDelay(retryDelayMs, feedback, verifyBtn, input, function () {
            waitingRetry = false;
            input.focus();
          });
        } else {
          input.focus();
        }
      }
    }

    verifyBtn.onclick = check;
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') check(); });
  }

  global.AGNI_GATES = {
    parseDurationMs: parseDurationMs,
    resolveDirective: resolveDirective,
    renderRedirect: renderRedirect,
    renderQuiz: renderQuiz,
    renderManualVerification: renderManualVerification
  };

})(typeof self !== 'undefined' ? self : this);
