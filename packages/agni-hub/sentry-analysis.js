// packages/agni-hub/sentry-analysis.js
// Pure analysis logic for Sentry: event validation, contingency updates, cohort discovery, graph weights.
// Extracted for testability. Used by packages/agni-hub/sentry.js.

'use strict';

const crypto = require('crypto');

/**
 * Validate and normalize a raw telemetry event.
 * Accepts skillsProvided as array of objects { skill, evidencedLevel } or strings (skill ID).
 * steps is optional; if provided must be array (for schema compatibility with runtime/theta).
 */
function validateEvent(raw, opts) {
  opts = opts || {};
  const randomBytes = opts.randomBytes || (() => crypto.randomBytes(4).toString('hex'));
  const now = opts.now || Date.now;

  if (!raw || typeof raw !== 'object' || !raw.lessonId || !raw.completedAt) return null;
  if (typeof raw.mastery !== 'number' || raw.mastery < 0 || raw.mastery > 1) return null;
  if (raw.steps !== undefined && !Array.isArray(raw.steps)) return null;
  const lessonId = String(raw.lessonId);
  if (/[/\\]/.test(lessonId) || lessonId.includes('..')) return null;
  if (typeof raw.completedAt !== 'string' || isNaN(Date.parse(raw.completedAt))) return null;

  const mastery = raw.mastery;
  const skillsProvided = normalizeSkillsProvided(raw.skillsProvided, mastery);

  return {
    eventId: raw.eventId || ('ev-' + now()),
    pseudoId: raw.pseudoId || ('px-anon-' + randomBytes()),
    lessonId: lessonId,
    skillsProvided: skillsProvided,
    skillsRequired: Array.isArray(raw.skillsRequired) ? raw.skillsRequired : [],
    mastery: mastery,
    completedAt: raw.completedAt,
    steps: Array.isArray(raw.steps) ? raw.steps : []
  };
}

/**
 * Normalize skillsProvided to array of { skill, evidencedLevel }.
 * Accepts: string "skillId", { skill, evidencedLevel }, { skill, declaredLevel }.
 */
function normalizeSkillsProvided(raw, eventMastery) {
  if (!Array.isArray(raw)) return [];
  return raw.map(function (sp) {
    if (typeof sp === 'string') {
      return { skill: sp, evidencedLevel: eventMastery };
    }
    if (sp && typeof sp === 'object' && sp.skill) {
      const lev = typeof sp.evidencedLevel === 'number' ? sp.evidencedLevel
        : (sp.declaredLevel || 1) * (eventMastery || 0);
      return { skill: sp.skill, evidencedLevel: Math.max(0, Math.min(1, lev)) };
    }
    return null;
  }).filter(Boolean);
}

function jaccardSimilarity(a, centroid, opts) {
  opts = opts || {};
  const threshold = opts.jaccardThreshold !== undefined ? opts.jaccardThreshold : 0.5;
  let intersection = 0, union = 0;
  for (let i = 0; i < a.length; i++) {
    const cVal = centroid[i] >= threshold ? 1 : 0;
    if (a[i] || cVal) union++;
    if (a[i] && cVal) intersection++;
  }
  return union === 0 ? 1 : intersection / union;
}

function computeConfidence(chiSquare, n, nMin, opts) {
  opts = opts || {};
  const chi2Threshold = opts.chi2Threshold !== undefined ? opts.chi2Threshold : 3.841;
  if (chiSquare < chi2Threshold) return 0;
  const chiConf = 1 - 1 / (1 + (chiSquare - chi2Threshold) / 4);
  const nRatio = Math.min(1, n / (nMin * 2));
  return Math.round(chiConf * nRatio * 1000) / 1000;
}

/**
 * Compute edges from aggregated contingency counts. Returns array of { from, to, weight, confidence, sample_size }.
 */
function computeEdgesFromGlobalPairs(globalPairs, opts) {
  opts = opts || {};
  const chi2Threshold = opts.chi2Threshold !== undefined ? opts.chi2Threshold : 3.841;
  const minSample = opts.minSample !== undefined ? opts.minSample : 20;

  const edges = [];
  Object.keys(globalPairs).forEach(function (pair) {
    const counts = globalPairs[pair];
    const a = counts.a || 0, b = counts.b || 0, c = counts.c || 0, d = counts.d || 0;
    const n = a + b + c + d;
    if (n < minSample) return;

    const pPrior = (a + b) / n;
    if (pPrior === 0 || pPrior === 1) return;

    const nMin = Math.ceil(minSample / Math.min(pPrior, 1 - pPrior));
    const den = (a + b) * (c + d) * (a + c) * (b + d);
    const chi2 = den > 0 ? Math.pow(Math.abs(a * d - b * c) - n / 2, 2) * n / den : 0;

    const passWithPrior = (a + b) > 0 ? a / (a + b) : 0;
    const passWithoutPrior = (c + d) > 0 ? c / (c + d) : 0;
    const benefit = Math.max(0, passWithPrior - passWithoutPrior);
    const weight = Math.round((1 - benefit) * 1000) / 1000;

    const parts = pair.split('\x00');
    const prior = parts[0];
    const target = parts[1];
    edges.push({
      from: prior,
      to: target,
      weight: Math.max(0, Math.min(1, weight)),
      confidence: Math.max(0, Math.min(1, computeConfidence(chi2, n, nMin, { chi2Threshold: chi2Threshold }))),
      sample_size: n
    });
  });
  return edges;
}

/**
 * Process one event into mastery and contingencies. Mutates mastery.students and contingencies.
 */
function processOneEvent(ev, mastery, contingencies, opts) {
  opts = opts || {};
  const masteryThreshold = opts.masteryThreshold !== undefined ? opts.masteryThreshold : 0.6;
  const passThreshold = opts.passThreshold !== undefined ? opts.passThreshold : 0.6;

  const pid = ev.pseudoId;
  const passedWell = ev.mastery >= passThreshold;

  if (!mastery.students[pid]) mastery.students[pid] = {};
  if (!contingencies[pid]) contingencies[pid] = {};
  const studentSkills = mastery.students[pid];
  const studentTables = contingencies[pid];

  const skillsProvided = ev.skillsProvided || [];

  skillsProvided.forEach(function (target) {
    const targetSkill = typeof target === 'string' ? target : (target && target.skill);
    if (!targetSkill) return;
    Object.keys(studentSkills).forEach(function (prior) {
      if (prior === targetSkill) return;
      const pair = prior + '\x00' + targetSkill;
      if (!studentTables[pair]) studentTables[pair] = { a: 0, b: 0, c: 0, d: 0 };
      const hadPrior = studentSkills[prior] >= masteryThreshold;
      if (hadPrior && passedWell) studentTables[pair].a++;
      else if (hadPrior && !passedWell) studentTables[pair].b++;
      else if (!hadPrior && passedWell) studentTables[pair].c++;
      else studentTables[pair].d++;
    });
  });

  skillsProvided.forEach(function (prov) {
    const skill = typeof prov === 'string' ? prov : (prov && prov.skill);
    const lev = typeof prov === 'object' && prov && typeof prov.evidencedLevel === 'number' ? prov.evidencedLevel : 0;
    if (!skill) return;
    if (lev > (studentSkills[skill] || 0)) {
      studentSkills[skill] = lev;
    }
  });
}

/**
 * Discover cohort via Jaccard clustering. Returns { clusters, largest } or null if too small.
 */
function discoverCohort(mastery, opts) {
  opts = opts || {};
  const masteryThreshold = opts.masteryThreshold !== undefined ? opts.masteryThreshold : 0.6;
  const jaccardThreshold = opts.jaccardThreshold !== undefined ? opts.jaccardThreshold : 0.5;
  const minClusterSize = opts.minClusterSize !== undefined ? opts.minClusterSize : 20;
  const minVectors = opts.minVectors !== undefined ? opts.minVectors : 20;

  const allSkills = Array.from(new Set(Object.values(mastery.students).reduce(function (acc, s) {
    return acc.concat(Object.keys(s));
  }, []))).sort();

  const vectors = Object.entries(mastery.students).map(function (e) {
    const pid = e[0];
    const skills = e[1];
    const vec = allSkills.map(function (s) {
      return (skills[s] || 0) >= masteryThreshold ? 1 : 0;
    });
    return { pseudoId: pid, vector: vec };
  });

  if (vectors.length < minVectors) return null;

  const clusters = [];
  vectors.forEach(function (item) {
    let placed = false;
    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[i];
      if (jaccardSimilarity(item.vector, cluster.centroid, { jaccardThreshold: jaccardThreshold }) >= jaccardThreshold) {
        cluster.members.push(item.pseudoId);
        cluster.vectors.push(item.vector);
        const n = cluster.vectors.length;
        cluster.centroid = cluster.centroid.map(function (v, idx) {
          return cluster.vectors.reduce(function (s, vec) { return s + vec[idx]; }, 0) / n;
        });
        placed = true;
        break;
      }
    }
    if (!placed) {
      clusters.push({
        members: [item.pseudoId],
        vectors: [item.vector],
        centroid: item.vector.slice()
      });
    }
  });

  const largest = clusters.reduce(function (a, b) {
    return a.members.length >= b.members.length ? a : b;
  });
  if (largest.members.length < minClusterSize) return null;
  return { clusters: clusters, largest: largest };
}

/**
 * Compute deterministic cohort ID from cluster centroid. B1.1: used for per-cohort graph_weights.
 */
function cohortIdFromCentroid(centroid) {
  if (!centroid || !Array.isArray(centroid)) return 'c_default';
  var str = centroid.map(function (v) { return Number(v).toFixed(4); }).join(',');
  return 'c_' + crypto.createHash('sha256').update(str).digest('hex').slice(0, 8);
}

/**
 * Build pseudoId -> cohortId map from clusters. B1.1: theta uses this to select cohort-specific graph.
 */
function buildCohortAssignments(clustersWithIds) {
  var out = {};
  for (var i = 0; i < clustersWithIds.length; i++) {
    var c = clustersWithIds[i];
    var id = c.cohortId;
    var members = c.members;
    for (var j = 0; j < members.length; j++) {
      out[members[j]] = id;
    }
  }
  return out;
}

module.exports = {
  validateEvent: validateEvent,
  normalizeSkillsProvided: normalizeSkillsProvided,
  jaccardSimilarity: jaccardSimilarity,
  computeConfidence: computeConfidence,
  computeEdgesFromGlobalPairs: computeEdgesFromGlobalPairs,
  processOneEvent: processOneEvent,
  discoverCohort: discoverCohort,
  cohortIdFromCentroid: cohortIdFromCentroid,
  buildCohortAssignments: buildCohortAssignments
};
