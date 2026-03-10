// packages/agni-engine/rasch.js
// AGNI LMS Engine — Rasch model ability estimation
//
// Updates student ability using approximate Newton-Raphson (MAP estimate).
// The Rasch model treats each probe (lesson) as having a fixed difficulty
// on the same logit scale as student ability. The probability of a correct
// response is the logistic function of (ability − difficulty).
//
// Target: Node.js 14+. CommonJS.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

var log = require('@agni/utils/logger').createLogger('rasch');

/** Numerically stable logistic: 1/(1+e^(-x)). Avoids overflow for large |x|. */
function logistic(x) {
  if (x >= 0) return 1 / (1 + Math.exp(-x));
  var e = Math.exp(x);
  return e / (1 + e);
}

/** Max Newton step magnitude. Single-step approximation diverges on extreme inputs. */
var MAX_STEP = 1;

/**
 * Update student ability using approximate Newton-Raphson (MAP estimate).
 *
 * Iterates over probe results, accumulates gradient and Hessian of the
 * log-posterior, then takes a single Newton step. Step is capped at ±MAX_STEP
 * to avoid wild overshoot on extreme ability/difficulty. Variance is accumulated
 * across sessions (posterior precision = prior precision + data hessian).
 *
 * @param {import('../types').LMSState} state
 * @param {string} studentId
 * @param {{ probeId: string, correct: boolean }[]} probeResults
 * @returns {number}  ability delta (approximate gain proxy for the bandit)
 */
function updateAbility(state, studentId, probeResults) {
  if (!state.rasch) {
    throw new Error('[RASCH] state.rasch is required');
  }
  if (!Array.isArray(probeResults)) {
    throw new Error('[RASCH] probeResults must be an array, got: ' + typeof probeResults);
  }
  if (typeof studentId !== 'string' || studentId === '') {
    throw new Error('[RASCH] studentId must be a non-empty string, got: ' + (studentId === undefined ? 'undefined' : studentId === null ? 'null' : typeof studentId));
  }

  var student = state.rasch.students[studentId];
  if (!student) {
    student = { ability: 0, variance: 1 };
    state.rasch.students[studentId] = student;
  }
  if (!isFinite(student.ability)) {
    student.ability = 0;
  }
  if (!student.variance || student.variance === 0 || !isFinite(student.variance)) {
    log.warn('[RASCH] student variance was invalid (0, null, undefined, or non-finite), reset to 1', { studentId: studentId, variance: student.variance });
    student.variance = 1;
  }

  var grad = 0;
  var hessFromData = 0;
  var seenProbeIds = {};

  for (var i = 0; i < probeResults.length; i++) {
    var entry = probeResults[i];
    if (!entry || typeof entry !== 'object') {
      throw new Error('[RASCH] probeResults[' + i + '] must be an object, got: ' + (entry === null ? 'null' : entry === undefined ? 'undefined' : typeof entry));
    }
    var probeId = entry.probeId;
    var correct = entry.correct;
    if (seenProbeIds[probeId]) continue;
    seenProbeIds[probeId] = true;
    var probe   = state.rasch.probes && state.rasch.probes[probeId];
    if (!probe) continue;

    var diff = probe.difficulty;
    if (typeof diff !== 'number' || !isFinite(diff)) continue;

    var logit = student.ability - diff;
    var prob  = logistic(logit);
    var y     = correct ? 1 : 0;

    grad += y - prob;
    hessFromData += prob * (1 - prob);
  }

  // Bug 2: zero valid probes — skip update, do not set variance to 1e5
  if (hessFromData <= 0) {
    return 0;
  }

  var hess = hessFromData + 1e-5;

  var step = grad / hess;
  if (!isFinite(step)) step = 0;
  step = Math.max(-MAX_STEP, Math.min(MAX_STEP, step));

  var priorPrecision = 1 / student.variance;
  var posteriorPrecision = priorPrecision + hessFromData;
  var newVariance = 1 / (posteriorPrecision < 1e-8 ? 1e-8 : posteriorPrecision);
  if (!isFinite(newVariance)) newVariance = 1;

  var abilityBefore = student.ability;
  student.ability = Math.max(-10, Math.min(10, student.ability + step));
  student.variance = newVariance;

  return student.ability - abilityBefore;
}

module.exports = {
  updateAbility: updateAbility
};

