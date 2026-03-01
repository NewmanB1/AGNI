'use strict';

// Aggregate cohort coverage by UTU and by skill for governance reporting.
// Consumes lesson index (sidecar-like entries) and mastery summary.

const MASTERY_THRESHOLD = 0.6;

/**
 * Aggregate coverage: how many lessons/skills in the index fall under each UTU bucket,
 * and how many students have mastered each skill (or UTU bucket).
 *
 * @param  {Array<object>} lessonIndex   Array of { lessonId, utu, teaching_mode, skillsProvided, skillsRequired, ... }
 * @param  {object}        masterySummary  { students: { [pseudoId]: { [skillId]: number } } }
 * @param  {object}        policy         Optional. { utuTargets?: Array<{ class, band }> } to filter buckets
 * @returns {{ byUtu: object, bySkill: object, studentCount: number, lessonCount: number }}
 */
function aggregateCohortCoverage(lessonIndex, masterySummary, policy) {
  policy = policy || {};
  const students = masterySummary.students || {};
  const studentIds = Object.keys(students);
  const byUtu = {};
  const bySkill = {};

  lessonIndex.forEach(function (lesson) {
    const utu = lesson.utu;
    let utuKey = '_no_utu';
    if (utu && utu.class) {
      utuKey = utu.class;
      if (typeof utu.band === 'number') utuKey += '-B' + utu.band;
      if (typeof utu.protocol === 'number') utuKey += '-P' + utu.protocol;
    }

    if (!byUtu[utuKey]) {
      byUtu[utuKey] = { lessons: 0, skills: [], studentMasteryCount: 0 };
    }
    byUtu[utuKey].lessons += 1;

    (lesson.skillsProvided || []).forEach(function (p) {
      const skillId = typeof p === 'string' ? p : p.skill;
      if (!skillId) return;
      if (!bySkill[skillId]) {
        bySkill[skillId] = { lessons: 0, studentMasteryCount: 0 };
      }
      bySkill[skillId].lessons += 1;
      byUtu[utuKey].skills.push(skillId);
    });
  });

  // Dedupe UTU skills per bucket
  Object.keys(byUtu).forEach(function (k) {
    const arr = byUtu[k].skills;
    byUtu[k].skills = arr.filter(function (s, i) { return arr.indexOf(s) === i; });
  });

  // Count students who have mastered each skill (above threshold)
  studentIds.forEach(function (pseudoId) {
    const skills = students[pseudoId] || {};
    Object.keys(skills).forEach(function (skillId) {
      if ((skills[skillId] || 0) >= MASTERY_THRESHOLD) {
        if (bySkill[skillId]) bySkill[skillId].studentMasteryCount += 1;
      }
    });
  });

  // For each UTU bucket, count students who have mastered at least one skill in that bucket
  Object.keys(byUtu).forEach(function (utuKey) {
    const skillList = byUtu[utuKey].skills;
    studentIds.forEach(function (pseudoId) {
      const skills = students[pseudoId] || {};
      const hasMastered = skillList.some(function (skillId) {
        return (skills[skillId] || 0) >= MASTERY_THRESHOLD;
      });
      if (hasMastered) byUtu[utuKey].studentMasteryCount += 1;
    });
  });

  return {
    byUtu:       byUtu,
    bySkill:     bySkill,
    studentCount: studentIds.length,
    lessonCount:  lessonIndex.length
  };
}

module.exports = {
  aggregateCohortCoverage: aggregateCohortCoverage,
  MASTERY_THRESHOLD:       MASTERY_THRESHOLD
};
