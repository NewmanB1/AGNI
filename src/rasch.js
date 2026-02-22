// src/rasch.js
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

/**
 * Update student ability using approximate Newton-Raphson (MAP estimate).
 *
 * Iterates over probe results, accumulates gradient and Hessian of the
 * log-posterior, then takes a single Newton step. A small prior
 * regularization term (1e-5) is added to the Hessian to prevent
 * instability when very few probes are available.
 *
 * @param {import('./types').LMSState} state
 * @param {string} studentId
 * @param {{ probeId: string, correct: boolean }[]} probeResults
 * @returns {number}  ability delta (approximate gain proxy for the bandit)
 */
function updateAbility(state, studentId, probeResults) {
  var student = state.rasch.students[studentId];
  if (!student) {
    student = { ability: 0, variance: 1 };
    state.rasch.students[studentId] = student;
  }

  var grad = 0;
  var hess = 0;

  for (var i = 0; i < probeResults.length; i++) {
    var probeId = probeResults[i].probeId;
    var correct = probeResults[i].correct;
    var probe   = state.rasch.probes[probeId];
    if (!probe) continue;

    var logit = student.ability - probe.difficulty;
    var prob  = 1 / (1 + Math.exp(-logit));
    var y     = correct ? 1 : 0;

    grad += y - prob;
    hess += prob * (1 - prob);
  }

  // Small prior regularization to prevent instability with few probes
  hess += 1e-5;
  if (hess < 1e-8) hess = 1e-8;

  var step = grad / hess;
  student.ability  += step;
  student.variance  = 1 / hess;

  // Clip ability to reasonable range
  student.ability = Math.max(-10, Math.min(10, student.ability));

  // Return step as gain proxy (positive = improved, negative = regressed)
  return step;
}

module.exports = {
  updateAbility
};
