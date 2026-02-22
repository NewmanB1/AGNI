// hub-tools/theta.js
// AGNI Theta Engine v1.8.0 – with shared skill-graph cache, pre-filtered lessons & BFS cycle guard
//
// Computes Marginal Learning Cost (theta) for lessons, sorted by ascending theta.
// Applies Governance scheduling, jurisdictional curriculum graphs, and
// dynamically queues unmastered prerequisites. Includes Gzip for edge APIs.
//
// Changes from v1.7.4:
//   - rebuildLessonIndex() now reads lesson-ir.json sidecar files written by
//     the compiler (html.js v1.8.0) instead of scraping window.LESSON_DATA
//     from compiled HTML with a regex. The regex approach was fragile
//     (broke on any whitespace variation in the HTML) and lossy (only
//     ontology fields were extracted; inferredFeatures were discarded).
//   - Sidecar fields used: identifier, slug, title, difficulty, language,
//     ontology.requires, ontology.provides, inferredFeatures.
//   - Falls back to HTML scraping if no sidecar exists, so lessons compiled
//     before v1.8.0 continue to work without recompilation. The fallback
//     path logs a notice so operators know which lessons need rebuilding.
//   - Version bumped to 1.8.0.
// -----------------------------------------------------------------------------

'use strict';
const fs   = require('fs');
const path = require('path');
const http = require('http');
const zlib = require('zlib');

// -- Paths -------------------------------------------------------------------
const DATA_DIR              = process.env.AGNI_DATA_DIR  || path.join(__dirname, '../data');
const SERVE_DIR             = process.env.AGNI_SERVE_DIR || path.join(__dirname, '../serve');
const GRAPH_WEIGHTS_LOCAL   = path.join(DATA_DIR, 'graph_weights.json');
const GRAPH_WEIGHTS_REGIONAL = path.join(DATA_DIR, 'graph_weights_regional.json');
const MASTERY_SUMMARY       = path.join(DATA_DIR, 'mastery_summary.json');
const BASE_COSTS            = path.join(DATA_DIR, 'base_costs.json');
const LESSON_INDEX          = path.join(DATA_DIR, 'lesson_index.json');
const SCHEDULES             = path.join(DATA_DIR, 'schedules.json');
const CURRICULUM_GRAPH      = path.join(DATA_DIR, 'curriculum.json');

const PORT = parseInt(process.env.AGNI_THETA_PORT || '8082', 10);

// -- Constants ---------------------------------------------------------------
const MIN_RESIDUAL         = 0.15;
const MASTERY_THRESHOLD    = 0.6;
const MIN_CONFIDENCE       = 0.5;
const MIN_LOCAL_SAMPLE_SIZE = parseInt(process.env.AGNI_MIN_LOCAL_SAMPLE || '40');
const MIN_LOCAL_EDGE_COUNT  = parseInt(process.env.AGNI_MIN_LOCAL_EDGES  || '5');

// -- Per-student cache -------------------------------------------------------
const thetaCache = new Map(); // pseudoId -> { lessons, computedAt, masteryMtime }

// -- Shared cache for graph & pre-filtered lessons --------------------------
const sharedCache = {
  skillGraph:      null,
  graphMtime:      0,
  eligibleLessons: null,
  eligibleMtime:   0
};

// -- Helpers -----------------------------------------------------------------
function getFileMtime(filePath) {
  try { if (fs.existsSync(filePath)) return fs.statSync(filePath).mtimeMs; } catch {}
  return 0;
}

function loadJSON(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) return fallback;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (e) { return fallback; }
}

// -- Effective Graph Selection -----------------------------------------------
function getEffectiveGraphWeights() {
  const local    = loadJSON(GRAPH_WEIGHTS_LOCAL, { edges: [], sample_size: 0, default_weight: 1.0 });
  const useLocal = local.sample_size >= MIN_LOCAL_SAMPLE_SIZE && local.edges.length >= MIN_LOCAL_EDGE_COUNT;
  if (useLocal) return local;
  const regional = loadJSON(GRAPH_WEIGHTS_REGIONAL, null);
  if (regional && regional.edges && regional.edges.length > 0) return regional;
  return local;
}

// -- Data loaders ------------------------------------------------------------
const loadMasterySummary = () => loadJSON(MASTERY_SUMMARY, { students: {} });
const loadBaseCosts      = () => loadJSON(BASE_COSTS, {});
const loadLessonIndex    = () => loadJSON(LESSON_INDEX, []);
const loadSchedules      = () => loadJSON(SCHEDULES, { students: {} });
const loadCurriculum     = () => loadJSON(CURRICULUM_GRAPH, { graph: {} });

// -- Shared skill graph construction -----------------------------------------
function buildSkillGraph(lessonIndex, curriculum) {
  const graph = {};

  if (curriculum?.graph && Object.keys(curriculum.graph).length > 0) {
    for (const [skill, reqs] of Object.entries(curriculum.graph)) {
      graph[skill] = new Set(Array.isArray(reqs) ? reqs : []);
    }
    return graph;
  }

  lessonIndex.forEach(lesson => {
    (lesson.skillsProvided || []).forEach(p => {
      if (!graph[p.skill]) graph[p.skill] = new Set();
      (lesson.skillsRequired || []).forEach(r => graph[p.skill].add(r));
    });
  });

  return graph;
}

// -- Refresh shared cache when curriculum, lessons or schedules change -------
function updateSharedCacheIfNeeded() {
  const mtimes = [
    getFileMtime(CURRICULUM_GRAPH),
    getFileMtime(LESSON_INDEX),
    getFileMtime(SCHEDULES)
  ];
  const maxMtime = Math.max(...mtimes);
  if (maxMtime <= sharedCache.graphMtime) return;

  const lessonIndex = loadLessonIndex();
  const curriculum  = loadCurriculum();
  const schedules   = loadSchedules();

  sharedCache.skillGraph = buildSkillGraph(lessonIndex, curriculum);

  const allScheduled = new Set();
  Object.values(schedules.students || {}).flat().forEach(s => allScheduled.add(s));

  sharedCache.eligibleLessons = lessonIndex.filter(lesson => {
    if (allScheduled.size > 0) {
      const providesAnyScheduled = lesson.skillsProvided.some(p => allScheduled.has(p.skill));
      if (!providesAnyScheduled) return false;
    }
    return true;
  });

  sharedCache.graphMtime   = maxMtime;
  sharedCache.eligibleMtime = maxMtime;

  console.log('[THETA] Shared cache updated:',
    `skills: ${Object.keys(sharedCache.skillGraph).length},`,
    `pre-filtered lessons: ${sharedCache.eligibleLessons.length}`);
}

// -- BFS with cycle guard & depth limit -------------------------------------
function expandScheduledSkills(initialSkills, studentSkills, skillGraph) {
  const expanded = new Set(initialSkills);
  const queue    = [...initialSkills];
  const visited  = new Set(initialSkills);
  let depth = 0;
  const MAX_DEPTH = 50;

  while (queue.length > 0 && depth < MAX_DEPTH) {
    const current = queue.shift();
    const reqs    = skillGraph[current] || new Set();
    for (const req of reqs) {
      if (!visited.has(req)) {
        visited.add(req);
        if ((studentSkills[req] || 0) < MASTERY_THRESHOLD) {
          expanded.add(req);
          queue.push(req);
        }
      }
    }
    depth++;
  }

  if (depth >= MAX_DEPTH) {
    console.warn('[THETA] BFS depth limit reached – possible cycle in skill graph');
  }

  return expanded;
}

// -- Cost functions (unchanged) ----------------------------------------------
function getBaseCost(skillId, baseCosts, lessonIndex) {
  if (typeof baseCosts[skillId] === 'number') return baseCosts[skillId];
  const lesson = lessonIndex.find(l => (l.skillsProvided || []).some(s => s.skill === skillId));
  if (lesson && typeof lesson.difficulty === 'number') return Math.min(1, lesson.difficulty / 5);
  return 0.5;
}

function getResidualCostFactor(targetSkill, pseudoId, masterySummary, graphWeights) {
  const studentSkills  = (masterySummary.students || {})[pseudoId] || {};
  const inboundEdges   = (graphWeights.edges || []).filter(e => e.to === targetSkill && e.confidence >= MIN_CONFIDENCE);
  let totalBenefit = 0;
  inboundEdges.forEach(edge => {
    const evidenced = studentSkills[edge.from] || 0;
    if (evidenced < MASTERY_THRESHOLD) return;
    const priorStrength = Math.min(1, evidenced / MASTERY_THRESHOLD);
    totalBenefit += (1 - edge.weight) * priorStrength;
  });
  return Math.max(MIN_RESIDUAL, 1 - totalBenefit);
}

function computeLessonTheta(lesson, pseudoId, baseCosts, masterySummary, graphWeights) {
  const studentSkills  = (masterySummary.students || {})[pseudoId] || {};
  const alreadyMastered = (lesson.skillsProvided || []).length > 0 &&
    (lesson.skillsProvided || []).every(s => (studentSkills[s.skill] || 0) >= (s.declaredLevel || MASTERY_THRESHOLD));

  let repBaseCost = 0;
  let repResidual = 1.0;

  (lesson.skillsProvided || []).forEach(provided => {
    const bc = getBaseCost(provided.skill, baseCosts, [lesson]);
    if (bc > repBaseCost) {
      repBaseCost = bc;
      repResidual = getResidualCostFactor(provided.skill, pseudoId, masterySummary, graphWeights);
    }
  });

  if (repBaseCost === 0) {
    repBaseCost = Math.min(1, (lesson.difficulty || 2) / 5);
    repResidual = 1.0;
  }

  const theta = Math.round(repBaseCost * repResidual * 1000) / 1000;
  return {
    lessonId: lesson.lessonId, slug: lesson.slug, title: lesson.title, theta,
    baseCost:        Math.round(repBaseCost * 1000) / 1000,
    residualFactor:  Math.round(repResidual * 1000) / 1000,
    transferBenefit: Math.round((1 - repResidual) * 1000) / 1000,
    alreadyMastered,
    skillsProvided: lesson.skillsProvided || [],
    skillsRequired: lesson.skillsRequired || []
  };
}

// -- Main function – uses shared cache --------------------------------------
function getLessonsSortedByTheta(pseudoId) {
  const currentMasteryMtime    = getFileMtime(MASTERY_SUMMARY);
  const currentScheduleMtime   = getFileMtime(SCHEDULES);
  const currentCurriculumMtime = getFileMtime(CURRICULUM_GRAPH);

  if (currentMasteryMtime   > (thetaCache._lastMasteryMtime   || 0) ||
      currentScheduleMtime  > (thetaCache._lastScheduleMtime  || 0) ||
      currentCurriculumMtime > (thetaCache._lastCurriculumMtime || 0)) {
    thetaCache.clear();
    thetaCache._lastMasteryMtime    = currentMasteryMtime;
    thetaCache._lastScheduleMtime   = currentScheduleMtime;
    thetaCache._lastCurriculumMtime = currentCurriculumMtime;
  }

  updateSharedCacheIfNeeded();

  const cached = thetaCache.get(pseudoId);
  if (cached && cached.masteryMtime === currentMasteryMtime) {
    return cached.lessons;
  }

  const baseCosts      = loadBaseCosts();
  const masterySummary = loadMasterySummary();
  const graphWeights   = getEffectiveGraphWeights();
  const studentSkills  = masterySummary.students?.[pseudoId] || {};
  const schedules      = loadSchedules();
  const scheduledSkills = schedules.students?.[pseudoId] || [];
  const skillGraph     = sharedCache.skillGraph || {};

  const effectiveScheduledSkills = expandScheduledSkills(
    scheduledSkills, studentSkills, skillGraph
  );

  let candidates = sharedCache.eligibleLessons || loadLessonIndex();

  const eligibleLessons = candidates.filter(lesson => {
    if (effectiveScheduledSkills.size > 0) {
      const providesNeeded = lesson.skillsProvided.some(p => effectiveScheduledSkills.has(p.skill));
      if (!providesNeeded) return false;
    }
    return lesson.skillsProvided.every(provided => {
      const reqs = skillGraph[provided.skill] || new Set();
      for (const req of reqs) {
        if ((studentSkills[req] || 0) < MASTERY_THRESHOLD) return false;
      }
      return true;
    });
  });

  const results = eligibleLessons.map(lesson =>
    computeLessonTheta(lesson, pseudoId, baseCosts, masterySummary, graphWeights)
  );

  results.sort((a, b) => {
    if (a.alreadyMastered !== b.alreadyMastered) return a.alreadyMastered ? 1 : -1;
    return a.theta - b.theta;
  });

  thetaCache.set(pseudoId, {
    lessons: results,
    computedAt: new Date().toISOString(),
    masteryMtime: currentMasteryMtime
  });

  return results;
}


// ============================================================================
// Lesson index builder
// ============================================================================

/**
 * Builds the lesson index from lesson-ir.json sidecar files.
 *
 * Previously scraped window.LESSON_DATA from compiled HTML with a regex.
 * That approach was fragile (whitespace sensitivity, broke on minification)
 * and lossy (inferredFeatures were entirely discarded — only ontology fields
 * survived). Sidecar files are written by html.js v1.8.0 and contain the
 * full structured metadata theta needs for scheduling and adaptive sequencing.
 *
 * Sidecar lookup strategy:
 *   For each lesson slug, look for <slug>-ir.json alongside index.html.
 *   If found, read it directly — no HTML parsing required.
 *   If not found (lesson compiled before v1.8.0), fall back to the legacy
 *   HTML scrape path and log a notice so operators know which lessons need
 *   rebuilding.
 *
 * The fallback path preserves backward compatibility for contributors who
 * have lessons compiled against an older version of the builder. It extracts
 * the same fields as before (ontology only) so theta continues to work, but
 * inferredFeatures will be absent for those lessons.
 *
 * @returns {void}  writes LESSON_INDEX (lesson_index.json) to DATA_DIR
 */
function rebuildLessonIndex() {
  const catalogPath = path.join(SERVE_DIR, 'catalog.json');
  if (!fs.existsSync(catalogPath)) {
    console.log('[THETA] No catalog.json found — skipping index rebuild');
    return;
  }

  const catalog = loadJSON(catalogPath, { lessons: [] });
  let sidecarCount = 0;
  let fallbackCount = 0;

  const index = catalog.lessons.map(entry => {
    const lessonDir  = path.join(SERVE_DIR, 'lessons', entry.slug);
    const sidecarPath = path.join(lessonDir, 'index-ir.json');
    const htmlPath    = path.join(lessonDir, 'index.html');

    // ── Primary path: read lesson-ir.json sidecar ────────────────────────────
    if (fs.existsSync(sidecarPath)) {
      sidecarCount++;
      const sidecar = loadJSON(sidecarPath, null);
      if (sidecar) {
        return {
          lessonId:         sidecar.identifier  || entry.identifier || entry.slug,
          slug:             sidecar.slug         || entry.slug,
          title:            sidecar.title        || entry.title || '',
          difficulty:       sidecar.difficulty   || entry.difficulty || 2,
          language:         sidecar.language     || entry.language  || 'en',
          compiledAt:       sidecar.compiledAt   || null,
          metadata_source:  sidecar.metadata_source || 'inferred',
          skillsProvided:   (sidecar.ontology && sidecar.ontology.provides) || [],
          skillsRequired:   (sidecar.ontology && sidecar.ontology.requires
            ? sidecar.ontology.requires.map(r => typeof r === 'string' ? r : r.skill)
            : []),
          inferredFeatures: sidecar.inferredFeatures || null,
          katexAssets:      sidecar.katexAssets      || [],
          factoryManifest:  sidecar.factoryManifest   || []
        };
      }
    }

    // ── Fallback path: scrape window.LESSON_DATA from compiled HTML ───────────
    // Preserved for backward compatibility with lessons compiled before v1.8.0.
    // Logs a notice so operators can identify which lessons need rebuilding.
    fallbackCount++;
    console.log('[THETA] No sidecar for', entry.slug,
      '— falling back to HTML scrape (rebuild to get full inferredFeatures)');

    let skillsProvided = [];
    let skillsRequired = [];

    if (fs.existsSync(htmlPath)) {
      const html = fs.readFileSync(htmlPath, 'utf8');
      const m    = html.match(/window\.LESSON_DATA\s*=\s*(\{[\s\S]*?\});/);
      if (m) {
        try {
          const data = JSON.parse(m[1]);
          skillsProvided = (data.ontology?.provides || []).map(p => ({
            skill:         p.skill,
            declaredLevel: p.level || 1
          }));
          skillsRequired = (data.ontology?.requires || []).map(r => r.skill || r);
        } catch (e) {
          console.warn('[THETA] HTML scrape parse error for', entry.slug, ':', e.message);
        }
      }
    }

    return {
      lessonId:         entry.identifier || entry.slug,
      slug:             entry.slug,
      title:            entry.title || '',
      difficulty:       entry.difficulty || 2,
      language:         entry.language   || 'en',
      compiledAt:       null,
      metadata_source:  'unknown',
      skillsProvided:   skillsProvided,
      skillsRequired:   skillsRequired,
      inferredFeatures: null,   // not available via HTML scrape
      katexAssets:      [],
      factoryManifest:  []
    };
  });

  fs.writeFileSync(LESSON_INDEX, JSON.stringify(index, null, 2));
  console.log('[THETA] Lesson index rebuilt:', index.length, 'lesson(s)',
    '(' + sidecarCount + ' from sidecar, ' + fallbackCount + ' from HTML fallback)');
}


// -- HTTP API with Gzip -------------------------------------------------------
function startApi() {
  const server = http.createServer((req, res) => {
    const sendResponse = (statusCode, payload) => {
      const jsonStr = JSON.stringify(payload);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'application/json');

      if (req.headers['accept-encoding']?.includes('gzip') && jsonStr.length > 1000) {
        res.setHeader('Content-Encoding', 'gzip');
        res.writeHead(statusCode);
        res.end(zlib.gzipSync(Buffer.from(jsonStr)));
      } else {
        res.writeHead(statusCode);
        res.end(jsonStr);
      }
    };

    const [urlPath, queryStr] = req.url.split('?');
    const qs = Object.fromEntries(new URLSearchParams(queryStr || ''));

    if (req.method !== 'GET') return sendResponse(405, { error: 'Method not allowed' });

    if (urlPath === '/api/theta') {
      if (!qs.pseudoId) return sendResponse(400, { error: 'pseudoId required' });
      return sendResponse(200, {
        pseudoId:    qs.pseudoId,
        lessons:     getLessonsSortedByTheta(qs.pseudoId),
        computedAt:  new Date().toISOString(),
        cached:      thetaCache.has(qs.pseudoId),
        graphSource: getEffectiveGraphWeights().level || 'village'
      });
    }

    if (urlPath === '/api/theta/all') {
      const mastery = loadMasterySummary();
      const result  = {};
      Object.keys(mastery.students || {}).forEach(id => result[id] = getLessonsSortedByTheta(id));
      return sendResponse(200, { students: result, computedAt: new Date().toISOString() });
    }

    if (urlPath === '/api/theta/graph') return sendResponse(200, getEffectiveGraphWeights());

    sendResponse(404, { error: 'Not found' });
  });

  server.listen(PORT, '0.0.0.0', () => console.log('[THETA] API listening on port', PORT));
  return server;
}

// -- Startup -----------------------------------------------------------------
if (require.main === module) {
  rebuildLessonIndex();
  startApi();
}

module.exports = {
  getLessonsSortedByTheta,
  computeLessonTheta,
  getResidualCostFactor,
  getBaseCost,
  rebuildLessonIndex,
  getEffectiveGraphWeights
};
