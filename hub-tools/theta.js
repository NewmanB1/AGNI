// hub-tools/theta.js
// AGNI Theta Engine v1.8.0 – with shared skill-graph cache, pre-filtered lessons & BFS cycle guard
//
// Computes Marginal Learning Cost (theta) for lessons, sorted by ascending theta.
// Applies Governance scheduling, jurisdictional curriculum graphs, and
// dynamically queues unmastered prerequisites. Includes Gzip for edge APIs.
//
// Changes from v1.8.0 (Phase 2.5 integration):
//   - require() LMS engine from src/engine/index.js at startup (graceful
//     degradation if engine files are missing — theta scheduling continues)
//   - rebuildLessonIndex() seeds all lessons into the LMS engine after index build
//   - Added HTTP routes:
//       GET  /api/lms/select          — bandit lesson selection from theta candidates
//       POST /api/lms/observation     — record completed lesson, update all models
//       GET  /api/lms/status          — engine diagnostic snapshot
//       POST /api/lms/federation/merge — merge remote bandit summary
// -----------------------------------------------------------------------------

'use strict';
const fs   = require('fs');
const path = require('path');
const http = require('http');
const zlib = require('zlib');

const lmsService = require('../src/services/lms');
const governanceService = require('../src/services/governance');
const authorService = require('../src/services/author');

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
const OVERRIDES_PATH       = path.join(DATA_DIR, 'recommendation_overrides.json');
const APPROVED_CATALOG     = process.env.AGNI_APPROVED_CATALOG || path.join(DATA_DIR, 'approved_catalog.json');

const PORT = parseInt(process.env.AGNI_THETA_PORT || '8082', 10);

// -- Constants ---------------------------------------------------------------
const MIN_RESIDUAL         = 0.15;
const MASTERY_THRESHOLD    = 0.6;
const MIN_CONFIDENCE       = 0.5;
const MIN_LOCAL_SAMPLE_SIZE = parseInt(process.env.AGNI_MIN_LOCAL_SAMPLE || '40');
const MIN_LOCAL_EDGE_COUNT  = parseInt(process.env.AGNI_MIN_LOCAL_EDGES  || '5');

// -- LMS engine (Phase 2.5) --------------------------------------------------
// Wrapped by src/services/lms so callers do not depend on engine internals.
const lmsEngine = lmsService;

if (lmsEngine.isAvailable()) {
  try {
    console.log('[THETA] LMS engine loaded:', JSON.stringify(lmsEngine.getStatus()));
  } catch (err) {
    console.log('[THETA] LMS engine loaded (status unavailable):', err.message);
  }
} else {
  console.warn(
    '[THETA] LMS engine not available.',
    '\n[THETA] Degraded mode: theta scheduling active, bandit selection disabled'
  );
}

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
const loadMasterySummary  = () => loadJSON(MASTERY_SUMMARY, { students: {} });
const loadBaseCosts       = () => loadJSON(BASE_COSTS, {});
const loadLessonIndex     = () => loadJSON(LESSON_INDEX, []);
const loadSchedules       = () => loadJSON(SCHEDULES, { students: {} });
const loadCurriculum      = () => loadJSON(CURRICULUM_GRAPH, { graph: {} });
const loadApprovedCatalog = () => governanceService.loadCatalog ? governanceService.loadCatalog() : loadJSON(APPROVED_CATALOG, { lessonIds: [] });

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

// -- Pure ordering (Phase 2 / Sprint M) ---------------------------------------
// (index, graph, weights, mastery, pseudoId, scheduledSkills) → sorted lesson[].
// No I/O; used by getLessonsSortedByTheta and tests.

/**
 * Compute lesson order by theta for one student. Pure: no file or cache access.
 *
 * @param  {object[]} lessonIndex      full lesson list (with skillsProvided, skillsRequired)
 * @param  {object}  skillGraph       skill -> Set of prerequisite skill ids
 * @param  {object}  baseCosts        skillId -> number
 * @param  {object}  graphWeights     { edges: Array<{from,to,weight,confidence}> }
 * @param  {object}  masterySummary   { students: { [pseudoId]: { [skillId]: number } } }
 * @param  {string}  pseudoId
 * @param  {string[]} scheduledSkills  skills the student is scheduled for (from schedules)
 * @returns {object[]}                sorted array of { lessonId, slug, title, theta, ... }
 */
function computeLessonOrder(lessonIndex, skillGraph, baseCosts, graphWeights, masterySummary, pseudoId, scheduledSkills) {
  const studentSkills   = (masterySummary.students || {})[pseudoId] || {};
  const effectiveScheduledSkills = expandScheduledSkills(
    Array.isArray(scheduledSkills) ? scheduledSkills : [],
    studentSkills,
    skillGraph
  );

  const eligibleLessons = (lessonIndex || []).filter(lesson => {
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

  return results;
}

// -- Recommendation override (Phase 3 / Sprint G) -----------------------------
// Pure: (orderedLessons, overrideLessonId) → reordered list (override first if in list).
// Persistence at edge: load/save in API layer.

/**
 * Apply teacher override to theta-ordered list. Pure.
 * If overrideLessonId is in the list, move it to first position; else return list unchanged.
 *
 * @param  {object[]} orderedLessons  sorted lesson objects (each has lessonId)
 * @param  {string|null} overrideLessonId
 * @returns {object[]}
 */
function applyRecommendationOverride(orderedLessons, overrideLessonId) {
  if (!overrideLessonId || !Array.isArray(orderedLessons) || orderedLessons.length === 0) {
    return orderedLessons;
  }
  const idx = orderedLessons.findIndex(l => l.lessonId === overrideLessonId);
  if (idx <= 0) return orderedLessons;
  const out = orderedLessons.slice();
  const [over] = out.splice(idx, 1);
  out.unshift(over);
  return out;
}

function loadOverrides() {
  if (!fs.existsSync(OVERRIDES_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(OVERRIDES_PATH, 'utf8'));
  } catch (e) {
    return {};
  }
}

function saveOverrides(overrides) {
  try {
    fs.mkdirSync(path.dirname(OVERRIDES_PATH), { recursive: true });
    fs.writeFileSync(OVERRIDES_PATH, JSON.stringify(overrides, null, 2));
  } catch (e) {
    console.warn('[THETA] Failed to save recommendation overrides:', e.message);
  }
}

// -- Main function – uses shared cache --------------------------------------
function getLessonsSortedByTheta(pseudoId) {
  const currentMasteryMtime    = getFileMtime(MASTERY_SUMMARY);
  const currentScheduleMtime   = getFileMtime(SCHEDULES);
  const currentCurriculumMtime = getFileMtime(CURRICULUM_GRAPH);
  const currentCatalogMtime    = fs.existsSync(APPROVED_CATALOG) ? getFileMtime(APPROVED_CATALOG) : 0;

  if (currentMasteryMtime   > (thetaCache._lastMasteryMtime   || 0) ||
      currentScheduleMtime  > (thetaCache._lastScheduleMtime  || 0) ||
      currentCurriculumMtime > (thetaCache._lastCurriculumMtime || 0) ||
      currentCatalogMtime   > (thetaCache._lastCatalogMtime   || 0)) {
    thetaCache.clear();
    thetaCache._lastMasteryMtime    = currentMasteryMtime;
    thetaCache._lastScheduleMtime   = currentScheduleMtime;
    thetaCache._lastCurriculumMtime = currentCurriculumMtime;
    thetaCache._lastCatalogMtime    = currentCatalogMtime;
  }

  updateSharedCacheIfNeeded();

  const cached = thetaCache.get(pseudoId);
  if (cached && cached.masteryMtime === currentMasteryMtime) {
    return cached.lessons;
  }

  const baseCosts      = loadBaseCosts();
  const masterySummary = loadMasterySummary();
  const graphWeights   = getEffectiveGraphWeights();
  const schedules      = loadSchedules();
  const scheduledSkills = schedules.students?.[pseudoId] || [];
  let candidates       = sharedCache.eligibleLessons || loadLessonIndex();
  const catalog        = loadApprovedCatalog();
  if (catalog.lessonIds && catalog.lessonIds.length > 0) {
    const approvedSet = new Set(catalog.lessonIds);
    candidates = candidates.filter(l => approvedSet.has(l.lessonId));
  }
  const skillGraph    = sharedCache.skillGraph || {};

  const results = computeLessonOrder(
    candidates, skillGraph, baseCosts, graphWeights, masterySummary, pseudoId, scheduledSkills
  );

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
 * Phase 2.5: after the index is written to disk, seeds all lessons into
 * the LMS engine so the bandit knows about every theta-eligible lesson.
 * Seeding is idempotent — safe to call on every full rebuild.
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
          utu:              sidecar.utu || null,
          teaching_mode:    sidecar.teaching_mode || null,
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

  // ── Phase 2.5: seed lesson index into LMS engine ───────────────────────────
  // Every lesson with at least one provided skill is registered in the bandit.
  // difficulty: prefers inferredFeatures value (more accurate than the top-level
  // field which may come from the HTML scrape fallback). Falls back to entry
  // difficulty, then to 2 (middle of the 1–5 scale) if neither is present.
  // skill: primary skill from skillsProvided[0] — used as the Rasch probe id.
  // Seeding is idempotent; lessons already known to the engine are skipped.
  if (lmsEngine.isAvailable && lmsEngine.isAvailable()) {
    const seedEntries = index
      .filter(entry => entry.skillsProvided.length > 0)
      .map(entry => ({
        lessonId:   entry.lessonId,
        difficulty: (entry.inferredFeatures && typeof entry.inferredFeatures.difficulty === 'number')
          ? entry.inferredFeatures.difficulty
          : (typeof entry.difficulty === 'number' ? entry.difficulty : 2),
        skill: entry.skillsProvided[0].skill
      }));

    try {
      lmsEngine.seedLessons(seedEntries);
    } catch (err) {
      // Seeding failure must not abort the index write — theta scheduling
      // is more critical than bandit seeding for continued hub operation.
      console.error('[THETA] LMS engine seeding failed:', err.message);
    }
  }
}


// -- HTTP API with Gzip -------------------------------------------------------

/**
 * Read the full request body as a string. Returns a Promise<string>.
 * Used by POST routes that need a JSON body.
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end',  () => resolve(body));
    req.on('error', reject);
  });
}

function startApi(port) {
  const listenPort = (typeof port === 'number' && port >= 0) ? port : PORT;
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

    // ── Method guard: GET for most routes; POST for /api/lms/*, /api/theta/override, governance/compliance, governance/catalog, author/*; PUT for governance/policy ──
    const isPostRoute = urlPath.startsWith('/api/lms') || urlPath === '/api/theta/override' ||
      urlPath === '/api/governance/compliance' || urlPath === '/api/governance/catalog' ||
      urlPath === '/api/governance/catalog/import' ||
      urlPath === '/api/author/validate' || urlPath === '/api/author/preview';
    const isPutRoute = urlPath === '/api/governance/policy';
    if (req.method !== 'GET' && !(req.method === 'POST' && isPostRoute) && !(req.method === 'PUT' && isPutRoute)) {
      return sendResponse(405, { error: 'Method not allowed' });
    }

    if (urlPath === '/api/theta') {
      if (!qs.pseudoId) return sendResponse(400, { error: 'pseudoId required' });
      const lessons = getLessonsSortedByTheta(qs.pseudoId);
      const overrides = loadOverrides();
      const overrideLessonId = overrides[qs.pseudoId]?.lessonId || null;
      const effectiveLessons = applyRecommendationOverride(lessons, overrideLessonId);
      return sendResponse(200, {
        pseudoId:    qs.pseudoId,
        lessons:     effectiveLessons,
        computedAt:  new Date().toISOString(),
        cached:      thetaCache.has(qs.pseudoId),
        graphSource: getEffectiveGraphWeights().level || 'village',
        override:    overrideLessonId || undefined
      });
    }

    if (urlPath === '/api/theta/all') {
      const mastery = loadMasterySummary();
      const result  = {};
      Object.keys(mastery.students || {}).forEach(id => result[id] = getLessonsSortedByTheta(id));
      return sendResponse(200, { students: result, computedAt: new Date().toISOString() });
    }

    if (urlPath === '/api/theta/graph') return sendResponse(200, getEffectiveGraphWeights());

    // POST /api/theta/override — set or clear teacher recommendation override (Phase 3 / Sprint G)
    if (req.method === 'POST' && urlPath === '/api/theta/override') {
      readBody(req).then(body => {
        try {
          const payload = JSON.parse(body || '{}');
          const pseudoId = payload.pseudoId;
          const lessonId = payload.lessonId !== undefined ? payload.lessonId : null;
          if (!pseudoId || typeof pseudoId !== 'string') {
            return sendResponse(400, { error: 'pseudoId required' });
          }
          const overrides = loadOverrides();
          if (lessonId === null || lessonId === '') {
            delete overrides[pseudoId];
            saveOverrides(overrides);
            return sendResponse(200, { ok: true, override: null });
          }
          const eligible = getLessonsSortedByTheta(pseudoId);
          const inList = eligible.some(l => l.lessonId === lessonId);
          if (!inList) {
            return sendResponse(400, { error: 'lessonId not in eligible list for this student', lessonId });
          }
          overrides[pseudoId] = { lessonId: String(lessonId) };
          saveOverrides(overrides);
          return sendResponse(200, { ok: true, override: lessonId });
        } catch (err) {
          return sendResponse(500, { error: err.message });
        }
      }).catch(err => sendResponse(500, { error: err.message }));
      return;
    }

    // ── LMS routes (Phase 2.5) ───────────────────────────────────────────────

    // GET /api/lms/select?pseudoId=<id>&candidates=<id1>,<id2>,...
    //
    // Called after /api/theta to ask the bandit which of the theta-eligible
    // lessons to serve next. `candidates` must be a comma-separated list of
    // lessonIds already filtered by theta's BFS prerequisite check — the
    // bandit scores only within that set and never overrides prerequisite rules.
    //
    // Response includes the selected lessonId and the student's current Rasch
    // ability estimate (useful for logging and adaptive UI).
    if (req.method === 'GET' && urlPath === '/api/lms/select') {
      if (!lmsEngine.isAvailable || !lmsEngine.isAvailable()) {
        return sendResponse(503, { error: 'LMS engine not available' });
      }
      if (!qs.pseudoId) return sendResponse(400, { error: 'pseudoId required' });
      const candidates = qs.candidates
        ? qs.candidates.split(',').map(s => s.trim()).filter(Boolean)
        : [];
      if (candidates.length === 0) return sendResponse(400, { error: 'candidates required' });
      try {
        const selected = lmsEngine.selectBestLesson(qs.pseudoId, candidates);
        const ability  = lmsEngine.getStudentAbility(qs.pseudoId);
        return sendResponse(200, {
          pseudoId:   qs.pseudoId,
          selected:   selected,
          ability:    ability,
          candidates: candidates.length
        });
      } catch (err) {
        return sendResponse(500, { error: err.message });
      }
    }

    // POST /api/lms/observation
    // Body: { studentId, lessonId, probeResults: [{ probeId, correct }] }
    //
    // Called after a student completes a lesson and post-lesson probe results
    // are available. Updates Rasch ability, embeddings, and the bandit posterior
    // in one atomic operation, then persists state to lms_state.json.
      if (req.method === 'POST' && urlPath === '/api/lms/observation') {
      if (!lmsEngine.isAvailable || !lmsEngine.isAvailable()) {
        return sendResponse(503, { error: 'LMS engine not available' });
      }
      readBody(req).then(body => {
        try {
          const payload = JSON.parse(body);
          if (!payload.studentId || !payload.lessonId || !Array.isArray(payload.probeResults)) {
            return sendResponse(400, { error: 'studentId, lessonId, probeResults required' });
          }
          lmsEngine.recordObservation(payload.studentId, payload.lessonId, payload.probeResults);
          sendResponse(200, { ok: true });
        } catch (err) {
          sendResponse(500, { error: err.message });
        }
      }).catch(err => sendResponse(500, { error: err.message }));
      return;
    }

    // GET /api/lms/status
    //
    // Returns an engine diagnostic snapshot: student count, lesson count,
    // observation count, embedding dim, state file path. Safe to expose on
    // an internal admin endpoint.
    if (req.method === 'GET' && urlPath === '/api/lms/status') {
      if (!lmsEngine.isAvailable || !lmsEngine.isAvailable()) {
        return sendResponse(503, { error: 'LMS engine not available' });
      }
      return sendResponse(200, lmsEngine.getStatus());
    }

    // POST /api/lms/federation/merge
    // Body: BanditSummary { mean, precision, sampleSize }
    //
    // Called by a regional hub to push a merged bandit summary down to the
    // village hub. Uses precision-weighted combination so both local and remote
    // posteriors contribute proportionally to their observation counts.
    // See federation.ts mergeBanditSummaries() for the full derivation.
    if (req.method === 'POST' && urlPath === '/api/lms/federation/merge') {
      if (!lmsEngine.isAvailable || !lmsEngine.isAvailable()) {
        return sendResponse(503, { error: 'LMS engine not available' });
      }
      readBody(req).then(body => {
        try {
          const remote = JSON.parse(body);
          if (!remote.mean || !remote.precision || typeof remote.sampleSize !== 'number') {
            return sendResponse(400, { error: 'mean, precision, sampleSize required' });
          }
          lmsEngine.mergeRemoteSummary(remote);
          sendResponse(200, { ok: true, status: lmsEngine.getStatus() });
        } catch (err) {
          sendResponse(500, { error: err.message });
        }
      }).catch(err => sendResponse(500, { error: err.message }));
      return;
    }

    // ── Governance routes (Phase 7) ─────────────────────────────────────────
    if (req.method === 'GET' && urlPath === '/api/governance/report') {
      try {
        const lessonIndex = loadLessonIndex();
        const masterySummary = loadMasterySummary();
        const report = governanceService.aggregateCohortCoverage(lessonIndex, masterySummary);
        return sendResponse(200, report);
      } catch (err) {
        return sendResponse(500, { error: err.message });
      }
    }

    if (req.method === 'GET' && urlPath === '/api/governance/policy') {
      try {
        const policy = governanceService.loadPolicy();
        return sendResponse(200, policy || {});
      } catch (err) {
        return sendResponse(500, { error: err.message });
      }
    }

    if (req.method === 'POST' && urlPath === '/api/governance/compliance') {
      readBody(req).then(body => {
        try {
          const sidecar = JSON.parse(body);
          const result = governanceService.evaluateLessonCompliance(sidecar);
          sendResponse(200, result);
        } catch (err) {
          sendResponse(500, { error: err.message });
        }
      }).catch(err => sendResponse(500, { error: err.message }));
      return;
    }

    // PUT /api/governance/policy — save policy (configuration wizard G1)
    if (req.method === 'PUT' && urlPath === '/api/governance/policy') {
      readBody(req).then(body => {
        try {
          const policy = JSON.parse(body || '{}');
          const result = governanceService.savePolicy(policy);
          if (result.ok) sendResponse(200, { ok: true });
          else sendResponse(400, { error: result.error });
        } catch (err) {
          sendResponse(500, { error: err.message });
        }
      }).catch(err => sendResponse(500, { error: err.message }));
      return;
    }

    // GET /api/governance/catalog — return approved lesson catalog
    if (req.method === 'GET' && urlPath === '/api/governance/catalog') {
      try {
        const catalog = governanceService.loadCatalog();
        return sendResponse(200, catalog || { lessonIds: [] });
      } catch (err) {
        return sendResponse(500, { error: err.message });
      }
    }

    // POST /api/governance/catalog — add/remove lesson IDs
    if (req.method === 'POST' && urlPath === '/api/governance/catalog') {
      readBody(req).then(body => {
        try {
          const payload = JSON.parse(body || '{}');
          const result = governanceService.updateCatalog(payload);
          if (result.ok) {
            thetaCache.clear();
            sendResponse(200, { ok: true, catalog: result.catalog });
          } else {
            sendResponse(400, { error: result.error });
          }
        } catch (err) {
          sendResponse(500, { error: err.message });
        }
      }).catch(err => sendResponse(500, { error: err.message }));
      return;
    }

    // POST /api/governance/catalog/import — import from another authority (strategy: replace | merge | add-only)
    if (req.method === 'POST' && urlPath === '/api/governance/catalog/import') {
      readBody(req).then(body => {
        try {
          const payload = JSON.parse(body || '{}');
          const { catalog: imported, strategy } = payload;
          if (!imported || !strategy) {
            return sendResponse(400, { error: 'catalog and strategy required' });
          }
          const result = governanceService.importCatalog(imported, strategy);
          if (result.ok) {
            thetaCache.clear();
            sendResponse(200, { ok: true, catalog: result.catalog });
          } else {
            sendResponse(400, { error: result.error });
          }
        } catch (err) {
          sendResponse(500, { error: err.message });
        }
      }).catch(err => sendResponse(500, { error: err.message }));
      return;
    }

    // ── Authoring routes (Sprint C) ─────────────────────────────────────────
    if (req.method === 'POST' && urlPath === '/api/author/validate') {
      readBody(req).then(body => {
        try {
          const parsed = authorService.parseAuthorBody(body);
          if (parsed.error) return sendResponse(400, { error: parsed.error });
          const result = authorService.validateForAuthor(parsed.lessonData);
          sendResponse(200, { valid: result.valid, errors: result.errors || [], warnings: result.warnings || [] });
        } catch (err) {
          sendResponse(500, { error: err.message });
        }
      }).catch(err => sendResponse(500, { error: err.message }));
      return;
    }

    if (req.method === 'POST' && urlPath === '/api/author/preview') {
      readBody(req).then(body => {
        const parsed = authorService.parseAuthorBody(body);
        if (parsed.error) return sendResponse(400, { error: parsed.error });
        authorService.previewForAuthor(parsed.lessonData)
          .then(result => {
            if (result.error) return sendResponse(400, { error: result.error });
            sendResponse(200, { ir: result.ir, sidecar: result.sidecar });
          })
          .catch(err => sendResponse(500, { error: err.message }));
      }).catch(err => sendResponse(500, { error: err.message }));
      return;
    }

    sendResponse(404, { error: 'Not found' });
  });

  server.listen(listenPort, '0.0.0.0', () => console.log('[THETA] API listening on port', server.address().port));
  return server;
}

// -- Startup -----------------------------------------------------------------
if (require.main === module) {
  rebuildLessonIndex();
  const server = startApi(PORT);

  // Attach hub-transform lesson delivery routes (Phase 3).
  // Provides GET /lessons/:slug, GET /factories/:file, GET /katex/:file,
  // GET /manifest.json, GET /sw.js on the same port as the theta API.
  // Gracefully skips if hub-transform.js is missing.
  const HUB_TRANSFORM_PATH = path.join(__dirname, '../server/hub-transform.js');
  try {
    const hubTransform = require(HUB_TRANSFORM_PATH);
    hubTransform.attachRoutes(server, {
      dev:        process.env.NODE_ENV !== 'production',
      deviceId:   null,
      privateKey: null
    });
  } catch (err) {
    console.warn('[THETA] hub-transform not available:', err.message,
      '\n[THETA] /lessons/, /factories/, /katex/ routes disabled');
  }
}

module.exports = {
  startApi,
  getLessonsSortedByTheta,
  computeLessonOrder,
  computeLessonTheta,
  getResidualCostFactor,
  getBaseCost,
  rebuildLessonIndex,
  getEffectiveGraphWeights,
  applyRecommendationOverride
};
