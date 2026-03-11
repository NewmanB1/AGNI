// packages/agni-runtime/ui/frustration.js
// AGNI Frustration Detection Module
//
// Tracks consecutive skips, fails, and rapid retries to detect student
// frustration and show encouraging nudges. Thresholds scale with step
// difficulty so hard steps allow more attempts before triggering.
// Exposes a continuous frustrationScore (0-1) and collects events
// for telemetry reporting at lesson completion.
//
// Registers: window.AGNI_FRUSTRATION
// Depends on: nothing (standalone)
// Load order: before player.js
//
// ES5 only — targets Android 7.0+ (Chrome 51 WebView).

(function (global) {
  'use strict';

  var _state = {
    consecutiveSkips: 0,
    consecutiveFails: 0,
    lastAnswerMs: 0,
    rapidRetries: 0,
    nudgeShown: false,
    currentDifficulty: 3,
    totalFrustrationEvents: 0
  };

  var _events = [];

  /**
   * Track a step outcome. Accepts optional step metadata for
   * context-aware threshold scaling.
   */
  function trackOutcome(passed, skipped, stepDifficulty, stepType) {
    if (typeof stepDifficulty === 'number' && stepDifficulty >= 1 && stepDifficulty <= 5) {
      _state.currentDifficulty = stepDifficulty;
    }
    if (skipped) {
      _state.consecutiveSkips++;
      _state.consecutiveFails = 0;
    } else if (!passed) {
      _state.consecutiveFails++;
      _state.consecutiveSkips = 0;
    } else {
      _state.consecutiveSkips = 0;
      _state.consecutiveFails = 0;
      _state.rapidRetries = 0;
      _state.nudgeShown = false;
    }
  }

  function trackRetry() {
    var now = Date.now();
    if (_state.lastAnswerMs && (now - _state.lastAnswerMs) < 2000) {
      _state.rapidRetries++;
    } else {
      _state.rapidRetries = Math.max(0, _state.rapidRetries - 1);
    }
    _state.lastAnswerMs = now;
  }

  /**
   * Difficulty-scaled thresholds. Harder steps allow more attempts
   * before triggering frustration nudges.
   */
  function _getFailThreshold() {
    return 2 + (_state.currentDifficulty || 3);
  }

  function shouldShowNudge() {
    if (_state.nudgeShown) return false;
    return _state.consecutiveSkips >= 2 ||
           _state.consecutiveFails >= _getFailThreshold() ||
           _state.rapidRetries >= 4;
  }

  /**
   * Compute a continuous frustration score (0-1) from the three heuristics.
   * Used for telemetry and threshold-free monitoring.
   */
  function getFrustrationScore() {
    var skipSignal = Math.min(1, _state.consecutiveSkips / 3);
    var failSignal = Math.min(1, _state.consecutiveFails / Math.max(1, _getFailThreshold()));
    var retrySignal = Math.min(1, _state.rapidRetries / 5);
    return Math.min(1, Math.round((0.3 * skipSignal + 0.4 * failSignal + 0.3 * retrySignal) * 100) / 100);
  }

  /**
   * Record a frustration event for telemetry.
   * Called when shouldShowNudge() fires.
   */
  function _recordEvent(stepId, trigger) {
    _state.totalFrustrationEvents++;
    _events.push({
      stepId: stepId || 'unknown',
      score: getFrustrationScore(),
      trigger: trigger,
      timestamp: Date.now()
    });
  }

  function showNudge(container, t, stepId) {
    if (!container || !container.parentNode) return;
    _state.nudgeShown = true;

    var trigger = 'unknown';
    if (_state.consecutiveSkips >= 2) trigger = 'skips';
    else if (_state.consecutiveFails >= _getFailThreshold()) trigger = 'fails';
    else if (_state.rapidRetries >= 4) trigger = 'rapid_retries';
    _recordEvent(stepId, trigger);

    t = t || function (key) { return key; };

    var nudge = document.createElement('div');
    nudge.className = 'frustration-nudge';
    nudge.setAttribute('aria-live', 'polite');
    var messages = [
      'This is a tough section \u2014 you\u2019re doing great for sticking with it!',
      'It\u2019s okay to find this challenging. Try a different approach or take a short break.',
      'Learning takes time. Every attempt helps, even when it doesn\u2019t feel like it.'
    ];
    var msg = messages[Math.floor(Math.random() * messages.length)];

    var strong = document.createElement('strong');
    strong.textContent = '\uD83D\uDCAA';
    nudge.appendChild(strong);
    nudge.appendChild(document.createTextNode(' ' + msg));

    var dismissBtn = document.createElement('button');
    dismissBtn.className = 'btn btn-secondary';
    dismissBtn.style.cssText = 'font-size:0.8em;margin-top:0.5rem;';
    dismissBtn.textContent = 'Got it';
    dismissBtn.onclick = function () { nudge.remove(); };
    nudge.appendChild(dismissBtn);
    container.appendChild(nudge);
  }

  /**
   * Return collected frustration events for telemetry reporting.
   */
  function getEvents() {
    return _events.slice();
  }

  function getTotalEvents() {
    return _state.totalFrustrationEvents;
  }

  function reset() {
    _state.consecutiveSkips = 0;
    _state.consecutiveFails = 0;
    _state.lastAnswerMs = 0;
    _state.rapidRetries = 0;
    _state.nudgeShown = false;
    _state.currentDifficulty = 3;
    _state.totalFrustrationEvents = 0;
    _events = [];
  }

  global.AGNI_FRUSTRATION = {
    trackOutcome:       trackOutcome,
    trackRetry:         trackRetry,
    shouldShowNudge:    shouldShowNudge,
    showNudge:          showNudge,
    reset:              reset,
    getFrustrationScore: getFrustrationScore,
    getEvents:          getEvents,
    getTotalEvents:     getTotalEvents
  };

})(typeof self !== 'undefined' ? self : this);
