'use strict';

// Evaluate a single lesson (sidecar) against a governance policy.
// Returns status and a list of issues for authoring tools and hub APIs.
// Pure: (sidecar, policy) → { status, issues }; no I/O or hidden state.

var path = require('path');
var fs = require('fs');

var utuConstants = null;
function getUtuConstants() {
  if (!utuConstants) {
    try {
      var p = path.join(__dirname, '../../data/utu-constants.json');
      if (fs.existsSync(p)) {
        utuConstants = JSON.parse(fs.readFileSync(p, 'utf8'));
      }
    } catch (e) { utuConstants = {}; }
  }
  return utuConstants || {};
}

function getFailureModeForProtocol(protocol) {
  var protocols = (getUtuConstants().protocols || []);
  var p = protocols.find(function (x) { return x.id === protocol; });
  return p ? p.failureMode : null;
}

/**
 * Evaluate lesson compliance against policy.
 * Pure function: same inputs always yield the same output.
 *
 * @param  {object} sidecar  Lesson sidecar (identifier, utu, teaching_mode, difficulty, ontology, ...)
 * @param  {object} policy   Optional. { allowedTeachingModes?, requireUtu?, requireTeachingMode?, allowedProtocols?, minProtocol?, maxProtocol?, failureModeHints?, minDifficulty?, maxDifficulty? }
 * @returns {{ status: 'ok'|'warning'|'fail', issues: string[] }}
 */
function evaluateLessonCompliance(sidecar, policy) {
  policy = policy || {};
  var issues = [];

  if (policy.requireUtu && (!sidecar.utu || !sidecar.utu.class)) {
    issues.push('Lesson has no UTU label; policy requires meta.utu.class.');
  }

  if (policy.requireTeachingMode && !sidecar.teaching_mode) {
    issues.push('Lesson has no teaching_mode; policy requires meta.teaching_mode.');
  }

  var allowedModes = policy.allowedTeachingModes;
  if (Array.isArray(allowedModes) && allowedModes.length > 0 && sidecar.teaching_mode) {
    if (allowedModes.indexOf(sidecar.teaching_mode) === -1) {
      issues.push('teaching_mode "' + sidecar.teaching_mode + '" is not in allowed list: ' + allowedModes.join(', '));
    }
  }

  // Protocol progression (P1–P5): allowedProtocols or minProtocol/maxProtocol
  var lessonProtocol = sidecar.utu && typeof sidecar.utu.protocol === 'number' ? sidecar.utu.protocol : null;
  var allowedProtocols = policy.allowedProtocols;
  var minP = policy.minProtocol;
  var maxP = policy.maxProtocol;
  var addFailureHint = !!policy.failureModeHints;

  if (typeof lessonProtocol === 'number') {
    var protocolFail = false;
    if (Array.isArray(allowedProtocols) && allowedProtocols.length > 0) {
      if (allowedProtocols.indexOf(lessonProtocol) === -1) {
        protocolFail = true;
        issues.push('Lesson protocol P' + lessonProtocol + ' is not in allowed protocols: ' + allowedProtocols.map(function (n) { return 'P' + n; }).join(', '));
      }
    } else if (typeof minP === 'number' || typeof maxP === 'number') {
      if (typeof minP === 'number' && lessonProtocol < minP) {
        protocolFail = true;
        issues.push('Lesson protocol P' + lessonProtocol + ' is below policy minimum P' + minP);
      }
      if (typeof maxP === 'number' && lessonProtocol > maxP) {
        protocolFail = true;
        issues.push('Lesson protocol P' + lessonProtocol + ' exceeds policy maximum P' + maxP);
      }
    }
    if (protocolFail && addFailureHint) {
      var hint = getFailureModeForProtocol(lessonProtocol);
      if (hint) issues.push('Failure-mode hint (P' + lessonProtocol + '): ' + hint);
    }
  } else if (((allowedProtocols && allowedProtocols.length > 0) || typeof minP === 'number' || typeof maxP === 'number') && policy.requireUtu) {
    issues.push('Lesson has no meta.utu.protocol; policy enforces protocol bounds.');
  }

  var difficulty = sidecar.difficulty;
  if (typeof difficulty === 'number') {
    if (typeof policy.minDifficulty === 'number' && difficulty < policy.minDifficulty) {
      issues.push('Lesson difficulty ' + difficulty + ' is below policy minimum ' + policy.minDifficulty);
    }
    if (typeof policy.maxDifficulty === 'number' && difficulty > policy.maxDifficulty) {
      issues.push('Lesson difficulty ' + difficulty + ' exceeds policy maximum ' + policy.maxDifficulty);
    }
  }

  var status = issues.length === 0 ? 'ok' : (issues.some(function (i) { return i.indexOf('required') !== -1 || i.indexOf('not in allowed') !== -1 || i.indexOf('is not in allowed') !== -1 || i.indexOf('exceeds policy') !== -1 || i.indexOf('below policy') !== -1 || i.indexOf('enforces protocol') !== -1; }) ? 'fail' : 'warning');
  return { status: status, issues: issues };
}

module.exports = {
  evaluateLessonCompliance: evaluateLessonCompliance
};
