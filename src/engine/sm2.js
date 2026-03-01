'use strict';

/**
 * SM-2 Spaced Repetition Algorithm [R10 P4.1]
 *
 * Pure function extracted from hub-tools/routes/telemetry.js.
 * Implements the SuperMemo SM-2 algorithm for scheduling lesson reviews.
 *
 * Reference: https://www.supermemo.com/en/archives1990-2015/english/ol/sm2
 *
 * @param {{ interval: number, easeFactor: number, repetition: number }} existing
 *   Current schedule state for a student-lesson pair.
 *   Defaults: { interval: 1, easeFactor: 2.5, repetition: 0 }
 * @param {number} quality  Response quality 0-5 (mapped from mastery * 5)
 * @returns {{ interval: number, easeFactor: number, repetition: number }}
 */
function updateSchedule(existing, quality) {
  if (!existing) existing = { interval: 1, easeFactor: 2.5, repetition: 0 };
  if (typeof quality !== 'number') quality = 0;

  quality = Math.max(0, Math.min(5, Math.round(quality)));

  // Ease factor adjustment per SM-2 formula
  var ef = existing.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (ef < 1.3) ef = 1.3;

  var interval;
  var rep;

  if (quality < 3) {
    // Failed: reset repetition count, restart at 1-day interval
    rep = 0;
    interval = 1;
  } else {
    rep = existing.repetition + 1;
    if (rep === 1) {
      interval = 1;
    } else if (rep === 2) {
      interval = 6;
    } else {
      interval = Math.round(existing.interval * ef);
    }
  }

  return {
    interval: interval,
    easeFactor: Math.round(ef * 100) / 100,
    repetition: rep
  };
}

module.exports = { updateSchedule };
