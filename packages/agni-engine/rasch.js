// src/engine/rasch.js
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

  var student = state.rasch.students[studentId];
  if (!student) {
    student = { ability: 0, variance: 1 };
    state.rasch.students[studentId] = student;
  }

  var grad = 0;
  var hessFromData = 0;

  for (var i = 0; i < probeResults.length; i++) {
    var probeId = probeResults[i].probeId;
    var correct = probeResults[i].correct;
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
  if (hess < 1e-8) hess = 1e-8;

  var step = grad / hess;
  if (!isFinite(step)) step = 0;
  step = Math.max(-MAX_STEP, Math.min(MAX_STEP, step));

  // Bug 3: accumulate variance (posterior update), not replace
  var priorPrecision = 1 / (student.variance || 1);
  var posteriorPrecision = priorPrecision + hessFromData;
  var newVariance = 1 / (posteriorPrecision < 1e-8 ? 1e-8 : posteriorPrecision);
  if (!isFinite(newVariance)) newVariance = 1;

  student.ability += step;
  student.variance = newVariance;

  // Clip ability to reasonable range
  student.ability = Math.max(-10, Math.min(10, student.ability));

  return step;
}

module.exports = {
  updateAbility: updateAbility
};

