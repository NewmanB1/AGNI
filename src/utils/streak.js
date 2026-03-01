'use strict';

/**
 * Shared streak calculation logic.
 * Used by both /api/streaks and /api/badges handlers.
 */

/**
 * Compute streak stats from a set of ISO date strings.
 * @param {string[]} sortedDates  Sorted array of 'YYYY-MM-DD' date strings
 * @returns {{ currentStreak: number, longestStreak: number }}
 */
function computeStreaks(sortedDates) {
  if (!sortedDates || sortedDates.length === 0) {
    return { currentStreak: 0, longestStreak: 0 };
  }

  const dateSet = new Set(sortedDates);
  const checkDate = new Date();
  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;

  for (let i = 0; i < 365; i++) {
    const d = checkDate.toISOString().slice(0, 10);
    if (dateSet.has(d)) {
      tempStreak++;
      if (i === 0 || currentStreak > 0) currentStreak = tempStreak;
    } else {
      if (tempStreak > longestStreak) longestStreak = tempStreak;
      tempStreak = 0;
      if (currentStreak > 0) break;
    }
    checkDate.setDate(checkDate.getDate() - 1);
  }
  if (tempStreak > longestStreak) longestStreak = tempStreak;

  return { currentStreak, longestStreak };
}

/**
 * Collect unique completion dates from a student's review schedule entries.
 * @param {Record<string, { lastReviewAt?: number }>} studentReviews
 * @returns {string[]} Sorted array of 'YYYY-MM-DD' date strings
 */
function collectReviewDates(studentReviews) {
  const dates = new Set();
  for (const lid of Object.keys(studentReviews)) {
    const entry = studentReviews[lid];
    if (entry.lastReviewAt) {
      dates.add(new Date(entry.lastReviewAt).toISOString().slice(0, 10));
    }
  }
  return [...dates].sort();
}

module.exports = { computeStreaks, collectReviewDates };
