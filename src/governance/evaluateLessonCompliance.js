'use strict';

// Evaluate a single lesson (sidecar) against a governance policy.
// Returns status and a list of issues for authoring tools and hub APIs.
// Pure: (sidecar, policy) → { status, issues }; no I/O or hidden state.

/**
 * Evaluate lesson compliance against policy.
 * Pure function: same inputs always yield the same output.
 *
 * @param  {object} sidecar  Lesson sidecar (identifier, utu, teaching_mode, difficulty, ontology, ...)
 * @param  {object} policy   Optional. { allowedTeachingModes?, requireUtu?, requireTeachingMode?, minDifficulty?, maxDifficulty? }
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

  var difficulty = sidecar.difficulty;
  if (typeof difficulty === 'number') {
    if (typeof policy.minDifficulty === 'number' && difficulty < policy.minDifficulty) {
      issues.push('Lesson difficulty ' + difficulty + ' is below policy minimum ' + policy.minDifficulty);
    }
    if (typeof policy.maxDifficulty === 'number' && difficulty > policy.maxDifficulty) {
      issues.push('Lesson difficulty ' + difficulty + ' exceeds policy maximum ' + policy.maxDifficulty);
    }
  }

  var status = issues.length === 0 ? 'ok' : (issues.some(function (i) { return i.indexOf('required') !== -1 || i.indexOf('not in allowed') !== -1; }) ? 'fail' : 'warning');
  return { status: status, issues: issues };
}

module.exports = {
  evaluateLessonCompliance: evaluateLessonCompliance
};
