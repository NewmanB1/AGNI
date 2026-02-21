// hub-tools/theta.js
// AGNI Theta Engine  v1.7.0
//
// Computes Marginal Learning Cost (θ) for each skill:
//
//   θ = BaseCost − CohortDiscount
//
// BaseCost:      Intrinsic difficulty of a skill. Seeded from the home server's
//                IRT calibration (base_costs.json). Falls back to lesson
//                difficulty field (0–5) normalised to [0,1] if no IRT data yet.
//
// CohortDiscount: Reduction in learning cost due to skill collapses detected
//                in this hub's cohort. Derived from graph_weights.json:
//
//   CohortDiscount(skill) =
//     Σ over all prior skills P that a student has demonstrated:
//       graph_weights[P→skill].collapseProbability × MAX_DISCOUNT
//
//   MAX_DISCOUNT = 0.5  (a perfect collapse halves the cost, never eliminates it)
//
// The lesson menu sorts available lessons by θ ascending (cheapest to learn first).
// For a student with weaving background, loops appears cheap; for a student with
// farming background, modulo arithmetic appears cheap.
//
// HTTP API (served on the same port as ingest.js, or standalone):
//   GET /api/theta?pseudoId=px-7f3a
//     Returns: { lessons: [{ lessonId, theta, baseCost, cohortDiscount }] }
//     Sorted by theta ascending.
//
//   GET /api/theta/all
//     Returns full theta table for all students (teacher view).
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const fs   = require('fs');
const path = require('path');
const http = require('http');

// ── File paths (same DATA_DIR as sentry.js) ────────────────────────────────

const DATA_DIR        = process.env.AGNI_DATA_DIR   || path.join(__dirname, '../data');
const GRAPH_WEIGHTS   = path.join(DATA_DIR, 'graph_weights.json');
const MASTERY_SUMMARY = path.join(DATA_DIR, 'mastery_summary.json');
const BASE_COSTS      = path.join(DATA_DIR, 'base_costs.json');   // from home server
const LESSON_INDEX    = path.join(DATA_DIR, 'lesson_index.json'); // built by ingest.js
const PORT            = parseInt(process.env.AGNI_THETA_PORT || '8082', 10);

const MAX_DISCOUNT    = 0.5;   // maximum fractional cost reduction from any collapse


// ═══════════════════════════════════════════════════════════════════════════
// 1. Load data files (with graceful fallbacks)
// ═══════════════════════════════════════════════════════════════════════════

function loadJSON(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch (e) { console.warn('[THETA] Could not parse:', filePath, e.message); return fallback; }
}

function loadGraphWeights() {
  return loadJSON(GRAPH_WEIGHTS, { edges: [], nodes: [] });
}

function loadMasterySummary() {
  return loadJSON(MASTERY_SUMMARY, { students: {} });
}

function loadBaseCosts() {
  // { skillId: baseCost ∈ [0,1] }
  return loadJSON(BASE_COSTS, {});
}

function loadLessonIndex() {
  // [{ lessonId, slug, title, skillsProvided: [{ skill, declaredLevel }],
  //    skillsRequired: [skillId], difficulty }]
  return loadJSON(LESSON_INDEX, []);
}


// ═══════════════════════════════════════════════════════════════════════════
// 2. BaseCost for a skill
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the BaseCost for a skill.
 * Priority:
 *   1. IRT-calibrated value from base_costs.json (home server)
 *   2. Lesson difficulty normalised: difficulty / 5
 *   3. Default 0.5
 *
 * @param {string} skillId
 * @param {object} baseCosts    loaded base_costs.json
 * @param {object} lessonIndex  loaded lesson_index.json
 * @returns {number} ∈ [0, 1]
 */
function getBaseCost(skillId, baseCosts, lessonIndex) {
  if (baseCosts[skillId] !== undefined) return baseCosts[skillId];

  // Fall back to lesson difficulty
  const lesson = lessonIndex.find(l =>
    l.skillsProvided && l.skillsProvided.some(s => s.skill === skillId)
  );
  if (lesson && typeof lesson.difficulty === 'number') {
    return Math.min(1, lesson.difficulty / 5);
  }

  return 0.5;
}


// ═══════════════════════════════════════════════════════════════════════════
// 3. CohortDiscount for a student × skill pair
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute the CohortDiscount for a given student attempting to learn targetSkill.
 *
 * For each prior skill P the student has demonstrated at mastery ≥ threshold:
 *   discount += graph_weights[P→targetSkill].collapseProbability × MAX_DISCOUNT
 *
 * Discounts from multiple prior skills are additive but capped at MAX_DISCOUNT.
 *
 * @param {string}   targetSkill
 * @param {string}   pseudoId
 * @param {object}   masterySummary   from mastery_summary.json
 * @param {object}   graphWeights     from graph_weights.json
 * @returns {number} ∈ [0, MAX_DISCOUNT]
 */
function getCohortDiscount(targetSkill, pseudoId, masterySummary, graphWeights) {
  const PRIOR_THRESHOLD = 0.6;

  const studentSkills = (masterySummary.students || {})[pseudoId] || {};

  // Edges that point TO targetSkill
  const inboundEdges = (graphWeights.edges || []).filter(e => e.to === targetSkill);

  let totalDiscount = 0;

  inboundEdges.forEach(edge => {
    const priorLevel = studentSkills[edge.from] || 0;
    if (priorLevel < PRIOR_THRESHOLD) return;   // student hasn't demonstrated this prior
    // Weight the discount by how well the student knows the prior skill
    // (evidencedLevel already normalised by mastery in telemetry.js)
    const priorStrength = Math.min(1, priorLevel / PRIOR_THRESHOLD);
    totalDiscount += edge.collapseProbability * MAX_DISCOUNT * priorStrength;
  });

  return Math.min(MAX_DISCOUNT, totalDiscount);
}


// ═══════════════════════════════════════════════════════════════════════════
// 4. Theta for a student × lesson
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute θ for one lesson from a specific student's perspective.
 *
 * @param {object} lesson         from lesson_index.json
 * @param {string} pseudoId
 * @param {object} baseCosts
 * @param {object} masterySummary
 * @param {object} graphWeights
 * @returns {object} { lessonId, theta, baseCost, cohortDiscount, alreadyMastered }
 */
function computeLessonTheta(lesson, pseudoId, baseCosts, masterySummary, graphWeights) {
  const studentSkills = (masterySummary.students || {})[pseudoId] || {};

  // Check if student has already mastered all skills this lesson provides
  const alreadyMastered = (lesson.skillsProvided || []).every(s => {
    const level = studentSkills[s.skill] || 0;
    return level >= (s.declaredLevel || 1);
  });

  // Use the highest-cost skill this lesson provides as the representative skill
  // (a lesson that provides multiple skills costs what the hardest one costs)
  let maxBaseCost    = 0;
  let maxDiscount    = 0;

  (lesson.skillsProvided || []).forEach(provided => {
    const bc = getBaseCost(provided.skill, baseCosts, [lesson]);
    const cd = getCohortDiscount(provided.skill, pseudoId, masterySummary, graphWeights);
    if (bc > maxBaseCost) { maxBaseCost = bc; maxDiscount = cd; }
  });

  // If no skillsProvided in index, fall back to normalised difficulty
  if (maxBaseCost === 0) {
    maxBaseCost = Math.min(1, (lesson.difficulty || 2) / 5);
  }

  const theta = Math.max(0, maxBaseCost - maxDiscount);

  return {
    lessonId:       lesson.lessonId,
    slug:           lesson.slug,
    title:          lesson.title,
    theta:          Math.round(theta * 1000) / 1000,
    baseCost:       Math.round(maxBaseCost * 1000) / 1000,
    cohortDiscount: Math.round(maxDiscount * 1000) / 1000,
    alreadyMastered,
    skillsProvided: lesson.skillsProvided || [],
    skillsRequired: lesson.skillsRequired || []
  };
}


// ═══════════════════════════════════════════════════════════════════════════
// 5. Sorted lesson list for a student
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Return all lessons sorted by θ ascending for a given student.
 * Already-mastered lessons are moved to the end.
 *
 * @param {string} pseudoId
 * @returns {object[]}  sorted lesson theta records
 */
function getLessonsSortedByTheta(pseudoId) {
  const baseCosts      = loadBaseCosts();
  const masterySummary = loadMasterySummary();
  const graphWeights   = loadGraphWeights();
  const lessonIndex    = loadLessonIndex();

  const results = lessonIndex.map(lesson =>
    computeLessonTheta(lesson, pseudoId, baseCosts, masterySummary, graphWeights)
  );

  // Sort: unmastered lessons by theta ascending, mastered lessons at the end
  results.sort((a, b) => {
    if (a.alreadyMastered !== b.alreadyMastered) {
      return a.alreadyMastered ? 1 : -1;
    }
    return a.theta - b.theta;
  });

  return results;
}


// ═══════════════════════════════════════════════════════════════════════════
// 6. Lesson index builder
//    Called by ingest.js after compiling new lessons.
//    Reads catalog.json from the serve directory and produces lesson_index.json
//    in the data directory with the fields theta.js needs.
// ═══════════════════════════════════════════════════════════════════════════

const SERVE_DIR = process.env.AGNI_SERVE_DIR || path.join(__dirname, '../serve');

function rebuildLessonIndex() {
  const catalogPath = path.join(SERVE_DIR, 'catalog.json');
  if (!fs.existsSync(catalogPath)) return;

  const catalog = loadJSON(catalogPath, { lessons: [] });

  const index = catalog.lessons.map(entry => {
    // Parse factory list to extract skills from compiled HTML is fragile.
    // Instead, re-read the lesson HTML to get skillsProvided/Required.
    const htmlPath = path.join(SERVE_DIR, 'lessons', entry.slug, 'index.html');
    let skillsProvided = [];
    let skillsRequired = [];

    if (fs.existsSync(htmlPath)) {
      const html = fs.readFileSync(htmlPath, 'utf8');
      const m = html.match(/window\.LESSON_DATA\s*=\s*(\{[\s\S]*?\});/);
      if (m) {
        try {
          const data = JSON.parse(m[1]);
          const ont  = data.ontology || {};
          skillsProvided = (ont.provides || []).map(p => ({
            skill: p.skill, declaredLevel: p.level || 1
          }));
          skillsRequired = (ont.requires || []).map(r => r.skill);
        } catch (e) { /* skip */ }
      }
    }

    return {
      lessonId:       entry.identifier,
      slug:           entry.slug,
      title:          entry.title,
      difficulty:     entry.difficulty || 0,
      language:       entry.language || 'en',
      skillsProvided,
      skillsRequired
    };
  });

  fs.writeFileSync(LESSON_INDEX, JSON.stringify({ updatedAt: new Date().toISOString(), lessons: index }, null, 2));
  console.log('[THETA] Lesson index rebuilt:', index.length, 'lessons');

  // Rewrite as flat array for convenience
  fs.writeFileSync(LESSON_INDEX, JSON.stringify(index, null, 2));
}


// ═══════════════════════════════════════════════════════════════════════════
// 7. HTTP API
// ═══════════════════════════════════════════════════════════════════════════

function startApi() {
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    const url = req.url.split('?')[0];
    const qs  = Object.fromEntries(new URLSearchParams(req.url.split('?')[1] || ''));

    // GET /api/theta?pseudoId=px-7f3a
    // Returns sorted lesson list for one student
    if (req.method === 'GET' && url === '/api/theta') {
      const pseudoId = qs.pseudoId;
      if (!pseudoId) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'pseudoId required' }));
        return;
      }
      const lessons = getLessonsSortedByTheta(pseudoId);
      res.writeHead(200);
      res.end(JSON.stringify({ pseudoId, lessons, computedAt: new Date().toISOString() }));
      return;
    }

    // GET /api/theta/all — full theta table (teacher/admin view)
    if (req.method === 'GET' && url === '/api/theta/all') {
      const mastery = loadMasterySummary();
      const allStudents = Object.keys(mastery.students || {});
      const result = {};
      allStudents.forEach(id => {
        result[id] = getLessonsSortedByTheta(id);
      });
      res.writeHead(200);
      res.end(JSON.stringify({ students: result, computedAt: new Date().toISOString() }));
      return;
    }

    // GET /api/theta/graph — return the current graph_weights for inspection
    if (req.method === 'GET' && url === '/api/theta/graph') {
      const weights = loadGraphWeights();
      res.writeHead(200);
      res.end(JSON.stringify(weights));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log('[THETA] API listening on port', PORT);
  });

  return server;
}


// ═══════════════════════════════════════════════════════════════════════════
// 8. Exports
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  getLessonsSortedByTheta,
  computeLessonTheta,
  getCohortDiscount,
  getBaseCost,
  rebuildLessonIndex
};

if (require.main === module) {
  rebuildLessonIndex();
  startApi();
}
