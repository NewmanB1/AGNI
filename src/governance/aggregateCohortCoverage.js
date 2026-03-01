'use strict';

// Aggregate cohort coverage by UTU and by skill for governance reporting.
// Consumes lesson index (sidecar-like entries) and mastery summary.

const envConfig = require('../utils/env-config');
const MASTERY_THRESHOLD = envConfig.masteryThreshold;

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

  // Dedupe UTU skills per bucket using Set
  Object.keys(byUtu).forEach(function (k) {
    var seen = {};
    var deduped = [];
    var arr = byUtu[k].skills;
    for (var i = 0; i < arr.length; i++) {
      if (!seen[arr[i]]) { seen[arr[i]] = true; deduped.push(arr[i]); }
    }
    byUtu[k].skills = deduped;
  });

  // Pre-compute per-student mastered skill sets (single pass)
  var studentMasteredSkills = {};
  studentIds.forEach(function (pseudoId) {
    var skills = students[pseudoId] || {};
    var mastered = {};
    Object.keys(skills).forEach(function (skillId) {
      if ((skills[skillId] || 0) >= MASTERY_THRESHOLD) {
        mastered[skillId] = true;
        if (bySkill[skillId]) bySkill[skillId].studentMasteryCount += 1;
      }
    });
    studentMasteredSkills[pseudoId] = mastered;
  });

  // For each UTU bucket, count students who have mastered at least one skill in that bucket
  Object.keys(byUtu).forEach(function (utuKey) {
    var skillList = byUtu[utuKey].skills;
    studentIds.forEach(function (pseudoId) {
      var mastered = studentMasteredSkills[pseudoId];
      for (var i = 0; i < skillList.length; i++) {
        if (mastered[skillList[i]]) {
          byUtu[utuKey].studentMasteryCount += 1;
          break;
        }
      }
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
