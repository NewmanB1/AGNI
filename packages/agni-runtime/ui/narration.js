// packages/agni-runtime/ui/narration.js
// AGNI Audio Narration Engine
//
// Provides auto-narration for blind and illiterate learners using the
// browser's speechSynthesis API. When enabled, every step — content,
// quiz options, feedback, navigation — is spoken aloud automatically.
//
// Registers: window.AGNI_NARRATION
// Depends on: AGNI_A11Y (prefs), AGNI_SHARED (lesson meta)
// Load order: after a11y.js, before player.js
//
// ES5 only — targets Android 6.0+ (Chrome 44 WebView).

(function (global) {
  'use strict';

  var _enabled = false;
  var _lang = 'en';
  var _rate = 1;
  var _queue = [];
  var _speaking = false;
  var _paused = false;
  var _currentUtt = null;

  var synth = global.speechSynthesis || null;

  function _loadPrefs() {
    try {
      var an = localStorage.getItem('agni_auto_narrate');
      _enabled = an === 'true';
      _rate = parseFloat(localStorage.getItem('agni_speech_rate') || '1');
      if (isNaN(_rate) || _rate < 0.5) _rate = 0.5;
      if (_rate > 3) _rate = 3;
    } catch (e) { /* localStorage unavailable */ }
  }

  function _savePrefs() {
    try {
      localStorage.setItem('agni_auto_narrate', String(_enabled));
      localStorage.setItem('agni_speech_rate', String(_rate));
    } catch (e) { /* quota exceeded */ }
  }

  // ── Core speech engine ────────────────────────────────────────────────────

  function _processQueue() {
    if (!synth || _paused || _queue.length === 0) {
      _speaking = false;
      return;
    }

    _speaking = true;
    var item = _queue.shift();
    var utt = new SpeechSynthesisUtterance(item.text);
    utt.lang = _lang;
    utt.rate = _rate;
    _currentUtt = utt;

    utt.onend = function () {
      _currentUtt = null;
      if (item.delay > 0) {
        setTimeout(_processQueue, item.delay);
      } else {
        _processQueue();
      }
    };

    utt.onerror = function () {
      _currentUtt = null;
      _processQueue();
    };

    synth.speak(utt);
  }

  function speak(text, opts) {
    if (!synth || !text) return;
    opts = opts || {};
    _queue.push({ text: String(text), delay: opts.delay || 150 });
    if (!_speaking && !_paused) _processQueue();
  }

  function speakNow(text) {
    cancel();
    speak(text, { delay: 0 });
  }

  function cancel() {
    _queue = [];
    _speaking = false;
    _currentUtt = null;
    if (synth) {
      try { synth.cancel(); } catch (e) { /* */ }
    }
  }

  function pause() {
    _paused = true;
    if (synth) {
      try { synth.pause(); } catch (e) { /* */ }
    }
  }

  function resume() {
    _paused = false;
    if (synth) {
      try { synth.resume(); } catch (e) { /* */ }
    }
    if (_queue.length > 0 && !_speaking) _processQueue();
  }

  function togglePause() {
    if (_paused) resume();
    else pause();
  }

  // ── Auto-narration mode ───────────────────────────────────────────────────

  function isEnabled() { return _enabled && !!synth; }

  function setEnabled(val) {
    _enabled = !!val;
    _savePrefs();
    if (!_enabled) cancel();
  }

  function setLang(lang) { _lang = lang || 'en'; }
  function setRate(rate) { _rate = Math.max(0.5, Math.min(3, rate || 1)); _savePrefs(); }
  function getRate() { return _rate; }

  // ── High-level narration helpers for the player ───────────────────────────

  function narrateStepEntry(stepIndex, totalSteps) {
    if (!isEnabled()) return;
    speak('Step ' + (stepIndex + 1) + ' of ' + totalSteps, { delay: 400 });
  }

  function narrateContent(text) {
    if (!isEnabled() || !text) return;
    speak(text, { delay: 300 });
  }

  function narrateQuiz(questionText, options) {
    if (!isEnabled()) return;
    if (questionText) speak(questionText, { delay: 500 });
    for (var i = 0; i < options.length; i++) {
      var label = (typeof options[i] === 'string') ? options[i] : (options[i].text || options[i].label || '');
      speak('Option ' + (i + 1) + ': ' + label, { delay: 300 });
    }
  }

  function narrateFillBlank(questionText, blanks) {
    if (!isEnabled()) return;
    if (questionText) speak(questionText, { delay: 500 });
    if (blanks && blanks.length > 0) {
      speak('Fill in ' + blanks.length + ' blank' + (blanks.length > 1 ? 's' : '') + '.', { delay: 300 });
    }
  }

  function narrateMatching(questionText, pairs) {
    if (!isEnabled()) return;
    if (questionText) speak(questionText, { delay: 500 });
    speak('Match the following pairs.', { delay: 300 });
    for (var i = 0; i < pairs.length; i++) {
      var p = pairs[i];
      var left = p.left || p[0] || '';
      var right = p.right || p[1] || '';
      speak((i + 1) + ': ' + left + ' goes with ' + right, { delay: 250 });
    }
  }

  function narrateOrdering(questionText, items) {
    if (!isEnabled()) return;
    if (questionText) speak(questionText, { delay: 500 });
    speak('Put the following ' + items.length + ' items in order.', { delay: 300 });
    for (var i = 0; i < items.length; i++) {
      speak('Item: ' + (typeof items[i] === 'string' ? items[i] : items[i].text || items[i].label || ''), { delay: 250 });
    }
  }

  function narrateHardwareTrigger(questionText, threshold) {
    if (!isEnabled()) return;
    if (questionText) speak(questionText, { delay: 500 });
    if (threshold) {
      speak('Waiting for sensor reading: ' + threshold, { delay: 300 });
    }
  }

  function narrateFeedback(text) {
    if (!isEnabled() || !text) return;
    speakNow(text);
  }

  function narrateCompletion(message) {
    if (!isEnabled()) return;
    speak(message || 'Lesson complete. Well done!', { delay: 0 });
  }

  function narrateSvgDescription(factoryId, description) {
    if (!isEnabled()) return;
    if (description) {
      speak('Visual: ' + description, { delay: 300 });
    } else if (factoryId) {
      speak('Visual element: ' + factoryId, { delay: 300 });
    }
  }

  // ── Initialization ────────────────────────────────────────────────────────

  _loadPrefs();

  global.AGNI_NARRATION = {
    speak:             speak,
    speakNow:          speakNow,
    cancel:            cancel,
    pause:             pause,
    resume:            resume,
    togglePause:       togglePause,

    isEnabled:         isEnabled,
    setEnabled:        setEnabled,
    setLang:           setLang,
    setRate:           setRate,
    getRate:           getRate,

    narrateStepEntry:       narrateStepEntry,
    narrateContent:         narrateContent,
    narrateQuiz:            narrateQuiz,
    narrateFillBlank:       narrateFillBlank,
    narrateMatching:        narrateMatching,
    narrateOrdering:        narrateOrdering,
    narrateHardwareTrigger: narrateHardwareTrigger,
    narrateFeedback:        narrateFeedback,
    narrateCompletion:      narrateCompletion,
    narrateSvgDescription:  narrateSvgDescription
  };

})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : this);
