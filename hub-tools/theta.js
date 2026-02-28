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

// -- Hub config bootstrap (A1) ------------------------------------------------
// Load data/hub_config.json if present; apply to process.env before any module reads paths/ports.
(function loadHubConfig() {
  const cfgPath = path.join(__dirname, '../data/hub_config.json');
  if (fs.existsSync(cfgPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      if (cfg.dataDir) process.env.AGNI_DATA_DIR = cfg.dataDir;
      if (cfg.serveDir) process.env.AGNI_SERVE_DIR = cfg.serveDir;
      if (cfg.thetaPort != null) process.env.AGNI_THETA_PORT = String(cfg.thetaPort);
      if (cfg.approvedCatalog) process.env.AGNI_APPROVED_CATALOG = cfg.approvedCatalog;
      if (cfg.minLocalSample != null) process.env.AGNI_MIN_LOCAL_SAMPLE = String(cfg.minLocalSample);
      if (cfg.minLocalEdges != null) process.env.AGNI_MIN_LOCAL_EDGES = String(cfg.minLocalEdges);
      if (cfg.yamlDir) process.env.AGNI_YAML_DIR = cfg.yamlDir;
      if (cfg.factoryDir) process.env.AGNI_FACTORY_DIR = cfg.factoryDir;
      if (cfg.katexDir) process.env.AGNI_KATEX_DIR = cfg.katexDir;
      if (cfg.servePort != null) process.env.AGNI_SERVE_PORT = String(cfg.servePort);
      if (cfg.cacheMax != null) process.env.AGNI_CACHE_MAX = String(cfg.cacheMax);
      if (cfg.hubId) process.env.AGNI_HUB_ID = cfg.hubId;
      if (cfg.homeUrl) process.env.AGNI_HOME_URL = cfg.homeUrl;
      if (cfg.usbPath) process.env.AGNI_USB_PATH = cfg.usbPath;
      if (cfg.sentryPort != null) process.env.AGNI_SENTRY_PORT = String(cfg.sentryPort);
      if (cfg.syncTransport) process.env.AGNI_SYNC_TRANSPORT = cfg.syncTransport;
    } catch (e) { /* ignore */ }
  }
})();

const lmsService = require('../src/services/lms');
const governanceService = require('../src/services/governance');
const authorService = require('../src/services/author');
const accountsService = require('../src/services/accounts');
const lessonChain = require('../src/services/lessonChain');

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
const GROUPS_PATH          = path.join(DATA_DIR, 'groups.json');
const PARENT_LINKS_PATH    = path.join(DATA_DIR, 'parent-links.json');
const REVIEW_SCHEDULE_PATH = path.join(DATA_DIR, 'review_schedule.json');
const LEARNING_PATHS_PATH  = path.join(DATA_DIR, 'learning_paths.json');
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
    difficulty:     lesson.difficulty || 2,
    description:    lesson.description || '',
    is_group:       !!lesson.is_group,
    teaching_mode:  lesson.teaching_mode || null,
    subject:        (lesson.utu && lesson.utu.class) || '',
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

// -- Student groups (data/groups.json) ---------------------------------------
function loadGroups() {
  if (!fs.existsSync(GROUPS_PATH)) return { groups: [] };
  try {
    const data = JSON.parse(fs.readFileSync(GROUPS_PATH, 'utf8'));
    return Array.isArray(data.groups) ? data : { groups: [] };
  } catch (e) {
    return { groups: [] };
  }
}

function saveGroups(data) {
  try {
    fs.mkdirSync(path.dirname(GROUPS_PATH), { recursive: true });
    const payload = { groups: Array.isArray(data.groups) ? data.groups : [] };
    fs.writeFileSync(GROUPS_PATH, JSON.stringify(payload, null, 2));
  } catch (e) {
    console.warn('[THETA] Failed to save groups:', e.message);
  }
}

function generateGroupId() {
  return 'group-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

// -- Parent link helpers (P1) ------------------------------------------------
function loadParentLinks() {
  if (!fs.existsSync(PARENT_LINKS_PATH)) return { links: [], invites: [] };
  try {
    const data = JSON.parse(fs.readFileSync(PARENT_LINKS_PATH, 'utf8'));
    return {
      links: Array.isArray(data.links) ? data.links : [],
      invites: Array.isArray(data.invites) ? data.invites : []
    };
  } catch (e) { return { links: [], invites: [] }; }
}

function saveParentLinks(data) {
  try {
    fs.mkdirSync(path.dirname(PARENT_LINKS_PATH), { recursive: true });
    fs.writeFileSync(PARENT_LINKS_PATH, JSON.stringify(data, null, 2));
  } catch (e) { /* best-effort */ }
}

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
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
          description:      sidecar.description  || entry.description || '',
          difficulty:       sidecar.difficulty   || entry.difficulty || 2,
          language:         sidecar.language     || entry.language  || 'en',
          compiledAt:       sidecar.compiledAt   || null,
          metadata_source:  sidecar.metadata_source || 'inferred',
          utu:              sidecar.utu || null,
          teaching_mode:    sidecar.teaching_mode || null,
          is_group:         !!(sidecar.is_group || entry.is_group),
          subject:          (sidecar.utu && sidecar.utu.class) || entry.subject || '',
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
      is_group:         !!(entry.is_group),
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

/**
 * Parse JSON body from request and pass the result to a handler.
 * Eliminates the repeated readBody → JSON.parse → try/catch boilerplate.
 * The handler receives (payload, sendResponse) and can throw freely.
 */
function handleJsonBody(req, sendResponse, handler) {
  readBody(req).then(body => {
    try {
      const payload = JSON.parse(body || '{}');
      handler(payload);
    } catch (err) {
      sendResponse(500, { error: err.message || 'Internal error' });
    }
  }).catch(err => sendResponse(500, { error: err.message }));
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

    // ── Method guard: GET for most routes; POST for /api/lms/*, /api/theta/override, /api/groups, governance/*, author/*; PUT for governance/policy, /api/admin/config, /api/groups ──
    const isPostRoute = urlPath.startsWith('/api/lms') || urlPath === '/api/theta/override' ||
      urlPath === '/api/groups' ||
      (urlPath.startsWith('/api/groups/') && urlPath.endsWith('/assign')) ||
      urlPath === '/api/governance/compliance' || urlPath === '/api/governance/catalog' ||
      urlPath === '/api/governance/catalog/import' ||
      urlPath === '/api/author/validate' || urlPath === '/api/author/preview' || urlPath === '/api/author/save' ||
      urlPath === '/api/parent/invite' || urlPath === '/api/parent/link' ||
      urlPath === '/api/admin/sync-test' || urlPath === '/api/telemetry' ||
      urlPath === '/api/diagnostic' || urlPath === '/api/learning-paths' ||
      urlPath === '/api/auth/register' || urlPath === '/api/auth/login' || urlPath === '/api/auth/logout' ||
      urlPath === '/api/accounts/student' || urlPath === '/api/accounts/students/bulk' ||
      urlPath === '/api/accounts/student/transfer-token' || urlPath === '/api/accounts/student/claim' ||
      urlPath === '/api/accounts/student/verify-pin' ||
      urlPath === '/api/chain/verify';
    const isPutRoute = urlPath === '/api/governance/policy' || urlPath === '/api/admin/config' || urlPath === '/api/groups' || urlPath === '/api/learning-paths' ||
      urlPath === '/api/accounts/student' || urlPath === '/api/accounts/creator/approve';
    const isDeleteRoute = urlPath.startsWith('/api/author/delete/');
    if (req.method !== 'GET' && !(req.method === 'POST' && isPostRoute) && !(req.method === 'PUT' && isPutRoute) && !(req.method === 'DELETE' && isDeleteRoute)) {
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

    // GET /api/lessons — lesson index with optional ?utu=, ?spine=, ?teaching_mode= filters (S2)
    if (req.method === 'GET' && urlPath === '/api/lessons') {
      let index = loadLessonIndex();
      const savedSlugs = authorService.listSavedLessons(process.env.AGNI_YAML_DIR || path.join(DATA_DIR, 'yaml'));
      if (qs.utu) {
        const utuFilter = qs.utu.toLowerCase();
        index = index.filter(l => l.utu && typeof l.utu === 'object' && String(l.utu.class || '').toLowerCase() === utuFilter);
      }
      if (qs.spine) {
        const spineFilter = qs.spine.toUpperCase();
        index = index.filter(l => {
          const cls = l.utu && typeof l.utu === 'object' ? String(l.utu.class || '') : '';
          return cls.toUpperCase().startsWith(spineFilter);
        });
      }
      if (qs.teaching_mode) {
        const modeFilter = qs.teaching_mode.toLowerCase();
        index = index.filter(l => String(l.teaching_mode || '').toLowerCase() === modeFilter);
      }
      if (qs.is_group !== undefined) {
        const wantGroup = qs.is_group === 'true' || qs.is_group === '1';
        index = index.filter(l => !!l.is_group === wantGroup);
      }
      return sendResponse(200, { lessons: index, savedSlugs, total: index.length });
    }

    // POST /api/theta/override — set or clear teacher recommendation override (Phase 3 / Sprint G)
    if (req.method === 'POST' && urlPath === '/api/theta/override') {
      handleJsonBody(req, sendResponse, (payload) => {
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
      });
      return;
    }

    // ── Student groups (GET/POST/PUT /api/groups) ────────────────────────────
    if (urlPath === '/api/groups') {
      if (req.method === 'GET') {
        const data = loadGroups();
        return sendResponse(200, data);
      }
      if (req.method === 'POST') {
        handleJsonBody(req, sendResponse, (payload) => {
          const name = payload.name && String(payload.name).trim();
          if (!name) return sendResponse(400, { error: 'name required' });
          const studentIds = Array.isArray(payload.studentIds) ? payload.studentIds.filter(s => typeof s === 'string') : [];
          const data = loadGroups();
          const id = generateGroupId();
          const group = { id, name, studentIds };
          data.groups.push(group);
          saveGroups(data);
          return sendResponse(200, { ok: true, group });
        });
        return;
      }
      if (req.method === 'PUT') {
        handleJsonBody(req, sendResponse, (payload) => {
          const id = payload.id && String(payload.id);
          if (!id) return sendResponse(400, { error: 'id required' });
          const data = loadGroups();
          const idx = data.groups.findIndex(g => g.id === id);
          if (idx < 0) return sendResponse(404, { error: 'group not found', id });
          const existing = data.groups[idx];
          if (payload.name !== undefined) existing.name = String(payload.name).trim() || existing.name;
          if (payload.studentIds !== undefined) existing.studentIds = Array.isArray(payload.studentIds) ? payload.studentIds.filter(s => typeof s === 'string') : existing.studentIds;
          saveGroups(data);
          return sendResponse(200, { ok: true, group: existing });
        });
        return;
      }
    }

    // POST /api/groups/:id/assign — assign lesson to group (T3: applies override to all members)
    const assignMatch = urlPath.match(/^\/api\/groups\/(.+)\/assign$/);
    if (req.method === 'POST' && assignMatch) {
      const groupId = assignMatch[1];
      handleJsonBody(req, sendResponse, (payload) => {
        const lessonId = payload.lessonId && String(payload.lessonId);
        if (!lessonId) return sendResponse(400, { error: 'lessonId required' });
        const data = loadGroups();
        const group = data.groups.find(g => g.id === groupId);
        if (!group) return sendResponse(404, { error: 'group not found', id: groupId });
        const studentIds = group.studentIds || [];
        const overrides = loadOverrides();
        const assigned = [];
        const skipped = [];
        for (const pseudoId of studentIds) {
          const eligible = getLessonsSortedByTheta(pseudoId);
          const inList = eligible.some(l => l.lessonId === lessonId);
          if (inList) {
            overrides[pseudoId] = { lessonId };
            assigned.push(pseudoId);
          } else {
            skipped.push(pseudoId);
          }
        }
        saveOverrides(overrides);
        return sendResponse(200, { ok: true, lessonId, assigned: assigned.length, skipped: skipped.length, assignedIds: assigned, skippedIds: skipped });
      });
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
      handleJsonBody(req, sendResponse, (payload) => {
        if (!payload.studentId || !payload.lessonId || !Array.isArray(payload.probeResults)) {
          return sendResponse(400, { error: 'studentId, lessonId, probeResults required' });
        }
        lmsEngine.recordObservation(payload.studentId, payload.lessonId, payload.probeResults);
        sendResponse(200, { ok: true });
      });
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
      handleJsonBody(req, sendResponse, (remote) => {
        if (!remote.mean || !remote.precision || typeof remote.sampleSize !== 'number') {
          return sendResponse(400, { error: 'mean, precision, sampleSize required' });
        }
        lmsEngine.mergeRemoteSummary(remote);
        sendResponse(200, { ok: true, status: lmsEngine.getStatus() });
      });
      return;
    }

    // GET /api/lms/transitions?pseudoId=<id>
    // Returns the Markov transition table and student's recent history for
    // client-side enhanced lesson sorting (sortLessonsEnhanced).
    if (req.method === 'GET' && urlPath === '/api/lms/transitions') {
      if (!lmsEngine.isAvailable || !lmsEngine.isAvailable()) {
        return sendResponse(503, { error: 'LMS engine not available' });
      }
      try {
        const table = lmsEngine.exportTransitionTable();
        const history = qs.pseudoId
          ? lmsEngine.getStudentLessonHistory(qs.pseudoId)
          : [];
        return sendResponse(200, {
          transitionTable: table,
          recentLessons: history
        });
      } catch (err) {
        return sendResponse(500, { error: err.message });
      }
    }

    // GET /api/lms/bottlenecks?topK=10&minSample=5
    // Returns curriculum bottleneck analysis: flow bottlenecks (stationary
    // distribution) and dropout bottlenecks (high-dropout lessons).
    if (req.method === 'GET' && urlPath === '/api/lms/bottlenecks') {
      if (!lmsEngine.isAvailable || !lmsEngine.isAvailable()) {
        return sendResponse(503, { error: 'LMS engine not available' });
      }
      try {
        const topK = parseInt(qs.topK || '10', 10);
        const minSample = parseInt(qs.minSample || '5', 10);
        return sendResponse(200, {
          flowBottlenecks: lmsEngine.getFlowBottlenecks(topK),
          dropoutBottlenecks: lmsEngine.getDropoutBottlenecks(minSample)
        });
      } catch (err) {
        return sendResponse(500, { error: err.message });
      }
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

    // GET /api/governance/utu-constants — canonical UTU reference for policy wizard (U4)
    if (req.method === 'GET' && urlPath === '/api/governance/utu-constants') {
      try {
        const utuPath = path.join(DATA_DIR, 'utu-constants.json');
        const utu = loadJSON(utuPath, { protocols: [], spineIds: [], spines: {}, bands: [] });
        return sendResponse(200, utu);
      } catch (err) {
        return sendResponse(500, { error: err.message });
      }
    }

    if (req.method === 'POST' && urlPath === '/api/governance/compliance') {
      handleJsonBody(req, sendResponse, (sidecar) => {
        const policy = governanceService.loadPolicy();
        const result = governanceService.evaluateLessonCompliance(sidecar, policy);
        sendResponse(200, result);
      });
      return;
    }

    // PUT /api/governance/policy — save policy (configuration wizard G1)
    if (req.method === 'PUT' && urlPath === '/api/governance/policy') {
      handleJsonBody(req, sendResponse, (policy) => {
        const result = governanceService.savePolicy(policy);
        if (result.ok) sendResponse(200, { ok: true });
        else sendResponse(400, { error: result.error });
      });
      return;
    }

    // GET /api/admin/onboarding-status — first-run detection (A3)
    if (req.method === 'GET' && urlPath === '/api/admin/onboarding-status') {
      try {
        const cfgPath = path.join(__dirname, '../data/hub_config.json');
        const isFirstRun = !fs.existsSync(cfgPath);
        return sendResponse(200, { isFirstRun });
      } catch (err) {
        return sendResponse(500, { error: err.message });
      }
    }

    // GET /api/admin/config — read hub config (A1)
    if (req.method === 'GET' && urlPath === '/api/admin/config') {
      try {
        const cfgPath = path.join(__dirname, '../data/hub_config.json');
        const cfg = loadJSON(cfgPath, {});
        const effective = {
          dataDir: DATA_DIR,
          serveDir: SERVE_DIR,
          thetaPort: PORT,
          approvedCatalog: APPROVED_CATALOG,
          minLocalSample: MIN_LOCAL_SAMPLE_SIZE,
          minLocalEdges: MIN_LOCAL_EDGE_COUNT,
          ...cfg
        };
        return sendResponse(200, effective);
      } catch (err) {
        return sendResponse(500, { error: err.message });
      }
    }

    // POST /api/admin/sync-test — test sync transport connection (F2)
    if (req.method === 'POST' && urlPath === '/api/admin/sync-test') {
      handleJsonBody(req, sendResponse, (payload) => {
          const { transport, homeUrl, usbPath } = payload;
          const t = transport || 'starlink';
          if (t === 'usb') {
            const p = usbPath || '/mnt/usb/agni-sync';
            if (!fs.existsSync(p)) {
              try {
                fs.mkdirSync(p, { recursive: true });
                return sendResponse(200, { ok: true, message: 'USB path created and writable.' });
              } catch (e) {
                return sendResponse(200, { ok: false, message: 'USB path not accessible: ' + e.message });
              }
            }
            try {
              fs.writeFileSync(path.join(p, '.agni-test'), 'ok');
              fs.unlinkSync(path.join(p, '.agni-test'));
              return sendResponse(200, { ok: true, message: 'USB path writable.' });
            } catch (e) {
              return sendResponse(200, { ok: false, message: 'USB path not writable: ' + e.message });
            }
          }
          const url = (homeUrl || '').replace(/\/$/, '');
          if (!url) return sendResponse(200, { ok: false, message: 'Home URL required for Starlink test.' });
          const target = url + (url.endsWith('/api/hub-sync') ? '' : '/api/hub-sync');
          const parsed = new URL(target);
          const client = parsed.protocol === 'https:' ? require('https') : require('http');
          const reqOpt = { hostname: parsed.hostname, port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80), path: parsed.pathname || '/api/hub-sync', method: 'OPTIONS', timeout: 5000 };
          const r = client.request(reqOpt, (res) => {
            return sendResponse(200, { ok: res.statusCode < 400, message: 'Home server responded: ' + res.statusCode });
          });
          r.on('error', (e) => sendResponse(200, { ok: false, message: 'Connection failed: ' + e.message }));
          r.on('timeout', () => { r.destroy(); sendResponse(200, { ok: false, message: 'Connection timeout.' }); });
          r.end();
      });
      return;
    }

    // PUT /api/admin/config — write hub config (A1). Restart hub for changes to take effect.
    if (req.method === 'PUT' && urlPath === '/api/admin/config') {
      handleJsonBody(req, sendResponse, (cfg) => {
        const cfgPath = path.join(__dirname, '../data/hub_config.json');
        const dir = path.dirname(cfgPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
        return sendResponse(200, { ok: true, message: 'Config saved. Restart hub for changes to take effect.' });
      });
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
      handleJsonBody(req, sendResponse, (payload) => {
        const result = governanceService.updateCatalog(payload);
        if (result.ok) {
          thetaCache.clear();
          sendResponse(200, { ok: true, catalog: result.catalog });
        } else {
          sendResponse(400, { error: result.error });
        }
      });
      return;
    }

    // POST /api/governance/catalog/import — import from another authority (strategy: replace | merge | add-only)
    if (req.method === 'POST' && urlPath === '/api/governance/catalog/import') {
      handleJsonBody(req, sendResponse, (payload) => {
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
      });
      return;
    }

    // ── Parent portal routes (P1) ───────────────────────────────────────────

    // POST /api/parent/invite — teacher creates invite code for a student
    if (req.method === 'POST' && urlPath === '/api/parent/invite') {
      handleJsonBody(req, sendResponse, (payload) => {
        const pseudoId = payload.pseudoId && String(payload.pseudoId);
        if (!pseudoId) return sendResponse(400, { error: 'pseudoId required' });
        const mastery = loadMasterySummary();
        if (!mastery.students || !mastery.students[pseudoId]) {
          return sendResponse(404, { error: 'Student not found', pseudoId });
        }
        const data = loadParentLinks();
        const existing = data.invites.find(inv => inv.pseudoId === pseudoId && !inv.used);
        if (existing) {
          return sendResponse(200, { code: existing.code, pseudoId, existing: true });
        }
        const code = generateInviteCode();
        data.invites.push({
          code,
          pseudoId,
          createdAt: new Date().toISOString(),
          used: false
        });
        saveParentLinks(data);
        return sendResponse(200, { code, pseudoId, existing: false });
      });
      return;
    }

    // POST /api/parent/link — parent redeems invite code to link to child
    if (req.method === 'POST' && urlPath === '/api/parent/link') {
      handleJsonBody(req, sendResponse, (payload) => {
        const code = payload.code && String(payload.code).trim().toUpperCase();
        const parentId = payload.parentId && String(payload.parentId).trim();
        if (!code) return sendResponse(400, { error: 'code required' });
        if (!parentId) return sendResponse(400, { error: 'parentId required' });
        const data = loadParentLinks();
        const invite = data.invites.find(inv => inv.code === code && !inv.used);
        if (!invite) return sendResponse(404, { error: 'Invalid or expired invite code' });
        const alreadyLinked = data.links.find(l => l.parentId === parentId && l.pseudoId === invite.pseudoId);
        if (alreadyLinked) {
          return sendResponse(200, { ok: true, pseudoId: invite.pseudoId, alreadyLinked: true });
        }
        invite.used = true;
        invite.usedAt = new Date().toISOString();
        invite.usedBy = parentId;
        data.links.push({
          parentId,
          pseudoId: invite.pseudoId,
          linkedAt: new Date().toISOString()
        });
        saveParentLinks(data);
        return sendResponse(200, { ok: true, pseudoId: invite.pseudoId, alreadyLinked: false });
      });
      return;
    }

    // GET /api/parent/child/:pseudoId/progress — parent views child's progress
    const parentProgressMatch = urlPath.match(/^\/api\/parent\/child\/(.+)\/progress$/);
    if (req.method === 'GET' && parentProgressMatch) {
      const pseudoId = decodeURIComponent(parentProgressMatch[1]);
      const parentId = qs.parentId;
      if (!parentId) return sendResponse(400, { error: 'parentId query param required' });
      const data = loadParentLinks();
      const link = data.links.find(l => l.parentId === parentId && l.pseudoId === pseudoId);
      if (!link) return sendResponse(403, { error: 'Not linked to this student' });
      const mastery = loadMasterySummary();
      const studentMastery = mastery.students?.[pseudoId] || {};
      const lessons = getLessonsSortedByTheta(pseudoId);
      const overrides = loadOverrides();
      const override = overrides[pseudoId]?.lessonId || null;
      const completedCount = Object.values(studentMastery).filter(v => typeof v === 'number' && v >= 1.0).length;
      const totalSkills = Object.keys(studentMastery).length;
      return sendResponse(200, {
        pseudoId,
        linkedAt: link.linkedAt,
        mastery: studentMastery,
        completedSkills: completedCount,
        totalSkills,
        recommendedLessons: lessons.slice(0, 5),
        currentOverride: override
      });
    }

    // GET /api/parent/children — list all children linked to a parent
    if (req.method === 'GET' && urlPath === '/api/parent/children') {
      const parentId = qs.parentId;
      if (!parentId) return sendResponse(400, { error: 'parentId query param required' });
      const data = loadParentLinks();
      const children = data.links
        .filter(l => l.parentId === parentId)
        .map(l => ({ pseudoId: l.pseudoId, linkedAt: l.linkedAt }));
      return sendResponse(200, { parentId, children });
    }

    // ── Authoring routes (Sprint C) ─────────────────────────────────────────

    // GET /api/author/load/:slug — load saved YAML lesson for round-trip editing (E9)
    const authorLoadMatch = urlPath.match(/^\/api\/author\/load\/(.+)$/);
    if (req.method === 'GET' && authorLoadMatch) {
      const slug = decodeURIComponent(authorLoadMatch[1]);
      const yamlDir = process.env.AGNI_YAML_DIR || path.join(DATA_DIR, 'yaml');
      const result = authorService.loadLesson(slug, yamlDir);
      if (result.error) return sendResponse(404, { error: result.error });
      return sendResponse(200, { slug, lessonData: result.lessonData });
    }

    if (req.method === 'POST' && urlPath === '/api/author/validate') {
      readBody(req).then(body => {
        try {
          const parsed = authorService.parseAuthorBody(body);
          if (parsed.error) return sendResponse(400, { error: parsed.error });
          const result = authorService.validateForAuthor(parsed.lessonData);
          sendResponse(200, { valid: result.valid, errors: result.errors || [], warnings: result.warnings || [] });
        } catch (err) { sendResponse(500, { error: err.message }); }
      }).catch(err => sendResponse(500, { error: err.message }));
      return;
    }

    // POST /api/author/save — validate + write YAML to data/yaml/<slug>.yaml (S1)
    if (req.method === 'POST' && urlPath === '/api/author/save') {
      readBody(req).then(async (body) => {
        try {
          const parsed = authorService.parseAuthorBody(body);
          if (parsed.error) return sendResponse(400, { error: parsed.error });
          const yamlDir = process.env.AGNI_YAML_DIR || path.join(DATA_DIR, 'yaml');
          const compileFlag = parsed.lessonData && parsed.lessonData._compile;
          if (parsed.lessonData) delete parsed.lessonData._compile;
          const result = await authorService.saveLesson(parsed.lessonData, yamlDir, { compile: !!compileFlag });
          if (result.error) return sendResponse(400, { error: result.error });

          // Record lesson authorship for accountability
          const creatorId = parsed.lessonData?.meta?.creator_id;
          if (creatorId && result.slug) {
            accountsService.recordLessonAuthored(creatorId, result.slug);
          }

          const resp = { ok: true, slug: result.slug, path: result.path, warnings: result.warnings || [] };
          if (result.compiled != null) resp.compiled = result.compiled;
          sendResponse(200, resp);
        } catch (err) {
          sendResponse(500, { error: err.message });
        }
      }).catch(err => sendResponse(500, { error: err.message }));
      return;
    }

    // DELETE /api/author/delete/:slug — remove saved lesson and compiled artifacts
    if (req.method === 'DELETE' && urlPath.startsWith('/api/author/delete/')) {
      const deleteSlug = decodeURIComponent(urlPath.replace('/api/author/delete/', ''));
      const yamlDir = process.env.AGNI_YAML_DIR || path.join(DATA_DIR, 'yaml');
      const result = authorService.deleteLesson(deleteSlug, yamlDir);
      if (result.error) return sendResponse(404, { error: result.error });
      sendResponse(200, { ok: true, deleted: result.deleted });
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

    // ── GET /api/step-analytics — per-step breakdown across students for a lesson ──
    if (req.method === 'GET' && urlPath === '/api/step-analytics') {
      const lessonId = qs.lessonId;
      if (!lessonId) return sendResponse(400, { error: 'lessonId required' });
      try {
        // Aggregate step-level data from telemetry events stored in mastery summary
        const telPath = path.join(DATA_DIR, 'telemetry_events.json');
        const telData = loadJSON(telPath, { events: [] });
        const events = (telData.events || []).filter(e => e.lessonId === lessonId);

        const stepMap = {};
        for (const ev of events) {
          for (const s of (ev.steps || [])) {
            if (!stepMap[s.stepId]) {
              stepMap[s.stepId] = { stepId: s.stepId, type: s.type, weight: s.weight, totalScore: 0, totalDurationMs: 0, totalAttempts: 0, passCount: 0, skipCount: 0, count: 0 };
            }
            const sm = stepMap[s.stepId];
            sm.totalScore += s.score || 0;
            sm.totalDurationMs += s.durationMs || 0;
            sm.totalAttempts += s.attempts || 0;
            sm.passCount += s.passed ? 1 : 0;
            sm.skipCount += s.skipped ? 1 : 0;
            sm.count++;
          }
        }

        const analytics = Object.values(stepMap).map(sm => ({
          stepId: sm.stepId, type: sm.type, weight: sm.weight,
          avgScore: sm.count > 0 ? Math.round((sm.totalScore / sm.count) * 100) / 100 : 0,
          avgDurationMs: sm.count > 0 ? Math.round(sm.totalDurationMs / sm.count) : 0,
          avgAttempts: sm.count > 0 ? Math.round((sm.totalAttempts / sm.count) * 10) / 10 : 0,
          passRate: sm.count > 0 ? Math.round((sm.passCount / sm.count) * 100) : 0,
          skipRate: sm.count > 0 ? Math.round((sm.skipCount / sm.count) * 100) : 0,
          sampleSize: sm.count
        }));

        return sendResponse(200, { lessonId, steps: analytics, totalEvents: events.length });
      } catch (err) {
        return sendResponse(500, { error: err.message });
      }
    }

    // ── GET /api/mastery-history — mastery snapshots over time for a student ──
    if (req.method === 'GET' && urlPath === '/api/mastery-history') {
      const pseudoId = qs.pseudoId;
      if (!pseudoId) return sendResponse(400, { error: 'pseudoId required' });
      try {
        const telPath = path.join(DATA_DIR, 'telemetry_events.json');
        const telData = loadJSON(telPath, { events: [] });
        const events = (telData.events || []).filter(e => e.pseudoId === pseudoId)
          .sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt));

        const snapshots = [];
        let runningMastery = 0;
        let lessonCount = 0;
        const mastered = new Set();
        const index = loadLessonIndex();
        const totalLessons = index.length || 1;

        for (const ev of events) {
          lessonCount++;
          runningMastery += ev.mastery || 0;
          if ((ev.mastery || 0) >= 0.6) mastered.add(ev.lessonId);

          snapshots.push({
            date: ev.completedAt,
            lessonId: ev.lessonId,
            mastery: ev.mastery || 0,
            runningAvgMastery: Math.round((runningMastery / lessonCount) * 100) / 100,
            masteredCount: mastered.size,
            masteryPct: Math.round((mastered.size / totalLessons) * 100)
          });
        }

        return sendResponse(200, { pseudoId, snapshots, totalLessons });
      } catch (err) {
        return sendResponse(500, { error: err.message });
      }
    }

    // ── GET /api/skill-graph — skill prerequisite graph for visualization ──
    if (req.method === 'GET' && urlPath === '/api/skill-graph') {
      try {
        const index = loadLessonIndex();
        const mastery = loadMasterySummary();
        const pseudoId = qs.pseudoId || '';
        const studentSkills = (mastery.students && mastery.students[pseudoId]) || {};

        const nodes = new Map();
        const edges = [];

        for (const lesson of index) {
          const ont = lesson.ontology || {};
          const provides = ont.provides || [];
          const requires = ont.requires || [];

          for (const p of provides) {
            if (!nodes.has(p.skill)) {
              nodes.set(p.skill, { id: p.skill, level: p.level || 1, mastery: studentSkills[p.skill] || 0, lessonIds: [] });
            }
            nodes.get(p.skill).lessonIds.push(lesson.identifier || lesson.slug);
          }

          for (const r of requires) {
            if (!nodes.has(r.skill)) {
              nodes.set(r.skill, { id: r.skill, level: r.level || 1, mastery: studentSkills[r.skill] || 0, lessonIds: [] });
            }
            for (const p of provides) {
              edges.push({ from: r.skill, to: p.skill, lessonId: lesson.identifier || lesson.slug });
            }
          }
        }

        return sendResponse(200, { nodes: [...nodes.values()], edges, totalSkills: nodes.size });
      } catch (err) {
        return sendResponse(500, { error: err.message });
      }
    }

    // ── GET /api/reviews — spaced repetition review schedule for a student ──
    if (req.method === 'GET' && urlPath === '/api/reviews') {
      const pseudoId = qs.pseudoId;
      if (!pseudoId) return sendResponse(400, { error: 'pseudoId required' });
      try {
        const schedule = loadJSON(REVIEW_SCHEDULE_PATH, { students: {} });
        const studentReviews = schedule.students[pseudoId] || {};
        const now = Date.now();
        const due = [];
        const upcoming = [];
        for (const lessonId of Object.keys(studentReviews)) {
          const entry = studentReviews[lessonId];
          if (entry.nextReviewAt <= now) {
            due.push({ lessonId, ...entry, overdue: true });
          } else {
            upcoming.push({ lessonId, ...entry, overdue: false });
          }
        }
        due.sort((a, b) => a.nextReviewAt - b.nextReviewAt);
        upcoming.sort((a, b) => a.nextReviewAt - b.nextReviewAt);
        return sendResponse(200, { pseudoId, due, upcoming, total: due.length + upcoming.length });
      } catch (err) {
        return sendResponse(500, { error: err.message });
      }
    }

    // ── GET /api/streaks — learning streak data for gamification ──
    if (req.method === 'GET' && urlPath === '/api/streaks') {
      const pseudoId = qs.pseudoId;
      if (!pseudoId) return sendResponse(400, { error: 'pseudoId required' });
      try {
        const schedule = loadJSON(REVIEW_SCHEDULE_PATH, { students: {} });
        const mastery = loadMasterySummary();
        const studentSkills = mastery.students && mastery.students[pseudoId] ? mastery.students[pseudoId] : {};
        const studentReviews = schedule.students && schedule.students[pseudoId] ? schedule.students[pseudoId] : {};

        // Collect all unique completion dates from review schedule
        const dates = new Set();
        for (const lid of Object.keys(studentReviews)) {
          const entry = studentReviews[lid];
          if (entry.lastReviewAt) {
            dates.add(new Date(entry.lastReviewAt).toISOString().slice(0, 10));
          }
        }
        const sortedDates = [...dates].sort();
        const today = new Date().toISOString().slice(0, 10);
        const todayCount = sortedDates.filter(d => d === today).length || (Object.keys(studentReviews).length > 0 ? 0 : 0);

        // Calculate streak
        let currentStreak = 0;
        let longestStreak = 0;
        let tempStreak = 0;
        const dateSet = new Set(sortedDates);
        const checkDate = new Date();
        // Walk backwards from today
        for (let i = 0; i < 365; i++) {
          const d = checkDate.toISOString().slice(0, 10);
          if (dateSet.has(d)) {
            tempStreak++;
            if (i === 0 || currentStreak > 0) currentStreak = tempStreak;
          } else {
            if (tempStreak > longestStreak) longestStreak = tempStreak;
            if (i > 0 && currentStreak > 0) break;
            tempStreak = 0;
          }
          checkDate.setDate(checkDate.getDate() - 1);
        }
        if (tempStreak > longestStreak) longestStreak = tempStreak;

        const dailyGoal = 1;
        const completionsToday = sortedDates.filter(d => d === today).length;
        return sendResponse(200, {
          currentStreak,
          longestStreak,
          totalSessions: sortedDates.length,
          todayCount: completionsToday,
          dailyGoal,
          goalMet: completionsToday >= dailyGoal,
          dates: sortedDates
        });
      } catch (err) {
        return sendResponse(500, { error: err.message });
      }
    }

    // ── GET /api/badges — achievement badges computed from telemetry ──
    if (req.method === 'GET' && urlPath === '/api/badges') {
      const pseudoId = qs.pseudoId;
      if (!pseudoId) return sendResponse(400, { error: 'pseudoId required' });
      try {
        const mastery = loadMasterySummary();
        const studentSkills = (mastery.students && mastery.students[pseudoId]) || {};
        const skillCount = Object.keys(studentSkills).filter(k => studentSkills[k] >= 0.6).length;
        const totalSkills = new Set();
        const index = loadLessonIndex();
        for (const l of index) {
          for (const p of (l.skillsProvided || [])) totalSkills.add(p.skill);
        }

        // Count lessons mastered
        const schedule = loadJSON(REVIEW_SCHEDULE_PATH, { students: {} });
        const studentReviews = (schedule.students && schedule.students[pseudoId]) || {};
        const lessonCount = Object.keys(studentReviews).length;

        // Streak data
        const dates = new Set();
        for (const lid of Object.keys(studentReviews)) {
          if (studentReviews[lid].lastReviewAt) dates.add(new Date(studentReviews[lid].lastReviewAt).toISOString().slice(0, 10));
        }
        const sortedDates = [...dates].sort();
        let longestStreak = 0;
        let tempStreak = 0;
        const dateSet = new Set(sortedDates);
        const checkDate = new Date();
        for (let i = 0; i < 365; i++) {
          const d = checkDate.toISOString().slice(0, 10);
          if (dateSet.has(d)) { tempStreak++; }
          else { if (tempStreak > longestStreak) longestStreak = tempStreak; tempStreak = 0; }
          checkDate.setDate(checkDate.getDate() - 1);
        }
        if (tempStreak > longestStreak) longestStreak = tempStreak;

        const badges = [];
        const defs = [
          { id: 'first_lesson', name: 'First Step', desc: 'Complete your first lesson', icon: '\u{1F31F}', check: () => lessonCount >= 1 },
          { id: 'five_lessons', name: 'Getting Started', desc: 'Complete 5 lessons', icon: '\u{1F4DA}', check: () => lessonCount >= 5 },
          { id: 'ten_lessons', name: 'Dedicated Learner', desc: 'Complete 10 lessons', icon: '\u{1F3C6}', check: () => lessonCount >= 10 },
          { id: 'twentyfive_lessons', name: 'Knowledge Seeker', desc: 'Complete 25 lessons', icon: '\u{1F48E}', check: () => lessonCount >= 25 },
          { id: 'first_skill', name: 'Skill Unlocked', desc: 'Master your first skill', icon: '\u{1F511}', check: () => skillCount >= 1 },
          { id: 'five_skills', name: 'Multi-Skilled', desc: 'Master 5 skills', icon: '\u{2B50}', check: () => skillCount >= 5 },
          { id: 'ten_skills', name: 'Skill Master', desc: 'Master 10 skills', icon: '\u{1F451}', check: () => skillCount >= 10 },
          { id: 'streak_3', name: 'On a Roll', desc: '3-day learning streak', icon: '\u{1F525}', check: () => longestStreak >= 3 },
          { id: 'streak_7', name: 'Week Warrior', desc: '7-day learning streak', icon: '\u{26A1}', check: () => longestStreak >= 7 },
          { id: 'streak_30', name: 'Unstoppable', desc: '30-day learning streak', icon: '\u{1F680}', check: () => longestStreak >= 30 },
          { id: 'all_skills', name: 'Completionist', desc: 'Master every skill', icon: '\u{1F396}', check: () => totalSkills.size > 0 && skillCount >= totalSkills.size }
        ];
        for (const def of defs) {
          badges.push({ id: def.id, name: def.name, description: def.desc, icon: def.icon, earned: def.check() });
        }
        return sendResponse(200, { pseudoId, badges, stats: { lessons: lessonCount, skills: skillCount, longestStreak, totalSkills: totalSkills.size } });
      } catch (err) {
        return sendResponse(500, { error: err.message });
      }
    }

    // ── GET /api/diagnostic — placement assessment probes ──
    if (req.method === 'GET' && urlPath === '/api/diagnostic') {
      try {
        const index = loadLessonIndex();
        // Select 8 probe-style questions spanning difficulty levels 1-5.
        // Each probe is derived from a lesson's primary skill at its difficulty.
        const probes = [];
        const seen = new Set();
        const sorted = [...index]
          .filter(l => l.skillsProvided && l.skillsProvided.length > 0)
          .sort((a, b) => (a.difficulty || 2) - (b.difficulty || 2));

        for (const diff of [1, 2, 2, 3, 3, 4, 4, 5]) {
          const candidates = sorted.filter(l =>
            Math.round(l.difficulty || 2) === diff && !seen.has(l.skillsProvided[0].skill)
          );
          if (candidates.length > 0) {
            const pick = candidates[Math.floor(Math.random() * candidates.length)];
            seen.add(pick.skillsProvided[0].skill);
            probes.push({
              probeId: pick.lessonId + '_diag',
              skill: pick.skillsProvided[0].skill,
              difficulty: pick.difficulty || 2,
              question: 'Do you already know: ' + pick.skillsProvided[0].skill + '?',
              type: 'self_assess',
              options: ['No experience', 'Some experience', 'Confident']
            });
          }
        }
        return sendResponse(200, { probes });
      } catch (err) {
        return sendResponse(500, { error: err.message });
      }
    }

    // ── POST /api/diagnostic — submit placement results, bootstrap ability ──
    if (req.method === 'POST' && urlPath === '/api/diagnostic') {
      handleJsonBody(req, sendResponse, (payload) => {
        const pseudoId = payload.pseudoId;
        const responses = payload.responses || [];
        if (!pseudoId) return sendResponse(400, { error: 'pseudoId required' });

        const mastery = loadMasterySummary();
        if (!mastery.students) mastery.students = {};
        if (!mastery.students[pseudoId]) mastery.students[pseudoId] = {};
        const studentSkills = mastery.students[pseudoId];

        let totalDifficulty = 0;
        let correctCount = 0;
        for (const r of responses) {
          // self_assess: 0=no, 1=some, 2=confident → maps to mastery 0, 0.4, 0.8
          const selfLevel = typeof r.answer === 'number' ? r.answer : 0;
          const evidenced = selfLevel === 2 ? 0.8 : (selfLevel === 1 ? 0.4 : 0);
          if (r.skill && evidenced > 0) {
            studentSkills[r.skill] = Math.max(studentSkills[r.skill] || 0, evidenced);
            correctCount++;
          }
          totalDifficulty += r.difficulty || 2;
        }

        // Bootstrap ability from difficulty-weighted average
        const bootstrapAbility = responses.length > 0
          ? Math.round(((correctCount / responses.length) * (totalDifficulty / responses.length)) * 100) / 100
          : 0;

        fs.writeFileSync(MASTERY_SUMMARY, JSON.stringify(mastery, null, 2));

        // Feed into LMS engine if available
        if (lmsEngine.isAvailable && lmsEngine.isAvailable()) {
          try {
            const probeResults = responses
              .filter(r => r.skill)
              .map(r => ({ probeId: r.probeId || r.skill, correct: (r.answer || 0) >= 1 }));
            if (probeResults.length > 0) {
              lmsEngine.recordObservation(pseudoId, 'diagnostic', probeResults);
            }
          } catch (e) { /* non-critical */ }
        }

        // Mark diagnostic as completed
        try {
          const diagPath = path.join(DATA_DIR, 'diagnostic_status.json');
          const status = loadJSON(diagPath, {});
          status[pseudoId] = { completedAt: new Date().toISOString(), ability: bootstrapAbility };
          fs.writeFileSync(diagPath, JSON.stringify(status, null, 2));
        } catch (e) { /* non-critical */ }

        return sendResponse(200, { ok: true, ability: bootstrapAbility, skillsBootstrapped: Object.keys(studentSkills).length });
      });
      return;
    }

    // ── GET /api/learning-paths — list all skill-based learning paths ──
    if (req.method === 'GET' && urlPath === '/api/learning-paths') {
      try {
        const data = loadJSON(LEARNING_PATHS_PATH, { paths: [] });
        const pseudoId = qs.pseudoId || '';

        // Enrich with student progress if pseudoId provided
        if (pseudoId) {
          const mastery = loadMasterySummary();
          const studentSkills = (mastery.students && mastery.students[pseudoId]) || {};
          for (const p of data.paths) {
            let completed = 0;
            for (const skill of (p.skills || [])) {
              if ((studentSkills[skill] || 0) >= MASTERY_THRESHOLD) completed++;
            }
            p.progress = { completed, total: (p.skills || []).length, pct: (p.skills || []).length > 0 ? Math.round((completed / p.skills.length) * 100) : 0 };
          }
        }
        return sendResponse(200, data);
      } catch (err) {
        return sendResponse(500, { error: err.message });
      }
    }

    // ── GET /api/learning-paths/:id — single path with per-skill lesson suggestions ──
    if (req.method === 'GET' && urlPath.startsWith('/api/learning-paths/') && urlPath.split('/').length === 4) {
      const pathId = decodeURIComponent(urlPath.split('/')[3]);
      try {
        const data = loadJSON(LEARNING_PATHS_PATH, { paths: [] });
        const lp = data.paths.find(p => p.id === pathId);
        if (!lp) return sendResponse(404, { error: 'Path not found' });

        const pseudoId = qs.pseudoId || '';
        const index = loadLessonIndex();
        const mastery = loadMasterySummary();
        const studentSkills = (mastery.students && mastery.students[pseudoId]) || {};

        const steps = (lp.skills || []).map(skill => {
          const mastered = (studentSkills[skill] || 0) >= MASTERY_THRESHOLD;
          // Find best lesson for this skill
          const candidates = index.filter(l =>
            (l.skillsProvided || []).some(sp => sp.skill === skill)
          );
          const bestLesson = candidates.length > 0
            ? candidates.sort((a, b) => (a.difficulty || 2) - (b.difficulty || 2))[0]
            : null;
          return {
            skill,
            mastered,
            masteryLevel: studentSkills[skill] || 0,
            suggestedLesson: bestLesson ? { lessonId: bestLesson.lessonId, slug: bestLesson.slug, title: bestLesson.title, difficulty: bestLesson.difficulty || 2 } : null
          };
        });

        const completed = steps.filter(s => s.mastered).length;
        return sendResponse(200, { ...lp, steps, progress: { completed, total: steps.length, pct: steps.length > 0 ? Math.round((completed / steps.length) * 100) : 0 } });
      } catch (err) {
        return sendResponse(500, { error: err.message });
      }
    }

    // ── POST /api/learning-paths — create a new learning path ──
    if (req.method === 'POST' && urlPath === '/api/learning-paths') {
      handleJsonBody(req, sendResponse, (payload) => {
        const data = loadJSON(LEARNING_PATHS_PATH, { paths: [] });
        const id = payload.id || 'path-' + Date.now();
        const newPath = {
          id,
          name: payload.name || 'Untitled Path',
          description: payload.description || '',
          skills: Array.isArray(payload.skills) ? payload.skills : [],
          createdAt: new Date().toISOString(),
          createdBy: payload.createdBy || 'teacher'
        };
        data.paths.push(newPath);
        fs.writeFileSync(LEARNING_PATHS_PATH, JSON.stringify(data, null, 2));
        return sendResponse(200, { ok: true, path: newPath });
      });
      return;
    }

    // ── PUT /api/learning-paths — update a learning path ──
    if (req.method === 'PUT' && urlPath === '/api/learning-paths') {
      handleJsonBody(req, sendResponse, (payload) => {
        const data = loadJSON(LEARNING_PATHS_PATH, { paths: [] });
        const idx = data.paths.findIndex(p => p.id === payload.id);
        if (idx === -1) return sendResponse(404, { error: 'Path not found' });
        if (payload.name) data.paths[idx].name = payload.name;
        if (payload.description !== undefined) data.paths[idx].description = payload.description;
        if (Array.isArray(payload.skills)) data.paths[idx].skills = payload.skills;
        fs.writeFileSync(LEARNING_PATHS_PATH, JSON.stringify(data, null, 2));
        return sendResponse(200, { ok: true, path: data.paths[idx] });
      });
      return;
    }

    // ── GET /api/collab/stats — collaborative learning awareness ──
    if (req.method === 'GET' && urlPath === '/api/collab/stats') {
      try {
        const lessonIds = (qs.lessonIds || '').split(',').filter(Boolean);
        const mastery = loadMasterySummary();
        const students = mastery.students || {};
        const stats = {};

        for (const lid of lessonIds) {
          let completedCount = 0;
          let activeCount = 0;
          for (const pid of Object.keys(students)) {
            const skills = students[pid] || {};
            const index = loadLessonIndex();
            const lesson = index.find(l => l.identifier === lid || l.slug === lid);
            if (!lesson) continue;
            const provides = (lesson.ontology && lesson.ontology.provides) || [];
            const hasAllSkills = provides.length > 0 && provides.every(p => (skills[p.skill] || 0) >= 0.6);
            if (hasAllSkills) completedCount++;
            else if (provides.some(p => (skills[p.skill] || 0) > 0)) activeCount++;
          }
          stats[lid] = { activeCount, completedCount };
        }

        return sendResponse(200, { stats });
      } catch (err) {
        return sendResponse(500, { error: err.message });
      }
    }

    // ── POST /api/telemetry — receive completion events, update mastery, feed LMS engine ──
    if (req.method === 'POST' && urlPath === '/api/telemetry') {
      handleJsonBody(req, sendResponse, (payload) => {
          const events = Array.isArray(payload.events) ? payload.events : [];
          if (events.length === 0) return sendResponse(200, { accepted: [] });

          const mastery = loadMasterySummary();
          if (!mastery.students) mastery.students = {};
          const accepted = [];

          for (const event of events) {
            const pseudoId = event.pseudoId;
            const lessonId = event.lessonId;
            if (!pseudoId || !lessonId) continue;

            if (!mastery.students[pseudoId]) mastery.students[pseudoId] = {};
            const studentSkills = mastery.students[pseudoId];

            // Update skill mastery levels from evidenced skill levels
            const provided = event.skillsProvided || [];
            for (const sp of provided) {
              if (!sp.skill) continue;
              const evidenced = typeof sp.evidencedLevel === 'number' ? sp.evidencedLevel : (sp.declaredLevel || 1) * (event.mastery || 0);
              studentSkills[sp.skill] = Math.max(studentSkills[sp.skill] || 0, Math.round(evidenced * 1000) / 1000);
            }

            // Feed probe results into LMS engine for Rasch + bandit updates
            if (lmsEngine.isAvailable && lmsEngine.isAvailable()) {
              let probeResults = event.probeResults;
              if (!probeResults || probeResults.length === 0) {
                // Convert step outcomes to implicit probes
                probeResults = (event.steps || [])
                  .filter(s => s.type !== 'instruction' && s.type !== 'completion')
                  .map(s => ({ probeId: s.stepId || lessonId + '_' + s.type, correct: !!s.passed }));
              }
              if (probeResults.length > 0) {
                try {
                  lmsEngine.recordObservation(pseudoId, lessonId, probeResults);
                } catch (e) {
                  console.warn('[THETA] LMS observation failed for', pseudoId, ':', e.message);
                }
              }
            }

            accepted.push(event.eventId || lessonId);
          }

          // Update spaced repetition review schedule (SM-2 variant)
          try {
            const schedule = loadJSON(REVIEW_SCHEDULE_PATH, { students: {} });
            for (const event of events) {
              const pid = event.pseudoId;
              const lid = event.lessonId;
              if (!pid || !lid) continue;
              if (!schedule.students[pid]) schedule.students[pid] = {};
              const existing = schedule.students[pid][lid] || { interval: 1, easeFactor: 2.5, repetition: 0 };
              const quality = Math.round((event.mastery || 0) * 5); // 0-5 quality rating
              let ef = existing.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
              if (ef < 1.3) ef = 1.3;
              let interval, rep;
              if (quality < 3) {
                rep = 0;
                interval = 1;
              } else {
                rep = existing.repetition + 1;
                if (rep === 1) interval = 1;
                else if (rep === 2) interval = 6;
                else interval = Math.round(existing.interval * ef);
              }
              schedule.students[pid][lid] = {
                interval,
                easeFactor: Math.round(ef * 100) / 100,
                repetition: rep,
                lastReviewAt: Date.now(),
                nextReviewAt: Date.now() + interval * 86400000,
                quality
              };
            }
            fs.mkdirSync(path.dirname(REVIEW_SCHEDULE_PATH), { recursive: true });
            fs.writeFileSync(REVIEW_SCHEDULE_PATH, JSON.stringify(schedule, null, 2));
          } catch (e) {
            console.warn('[THETA] Review schedule update failed:', e.message);
          }

          // Persist updated mastery summary
          try {
            fs.mkdirSync(path.dirname(MASTERY_SUMMARY), { recursive: true });
            fs.writeFileSync(MASTERY_SUMMARY, JSON.stringify(mastery, null, 2));
            thetaCache.clear();
          } catch (e) {
            console.warn('[THETA] Failed to write mastery summary:', e.message);
          }

          // Persist telemetry events for step-analytics and mastery-history
          try {
            const telPath = path.join(DATA_DIR, 'telemetry_events.json');
            const telData = loadJSON(telPath, { events: [] });
            for (const event of events) {
              telData.events.push({
                eventId: event.eventId, pseudoId: event.pseudoId, lessonId: event.lessonId,
                mastery: event.mastery, steps: event.steps || [], completedAt: event.completedAt,
                durationMs: event.durationMs, skillsProvided: event.skillsProvided
              });
            }
            // Cap at 10000 events to avoid unbounded growth
            if (telData.events.length > 10000) telData.events = telData.events.slice(-10000);
            fs.writeFileSync(telPath, JSON.stringify(telData, null, 2));
          } catch (e) {
            console.warn('[THETA] Telemetry event persistence failed:', e.message);
          }

          return sendResponse(200, { accepted, processed: events.length });
      });
      return;
    }

    // ── Account management routes ───────────────────────────────────────────

    function extractCreatorToken() {
      const authHeader = req.headers['authorization'] || '';
      if (authHeader.startsWith('Bearer ')) return authHeader.slice(7);
      return qs.token || null;
    }

    // POST /api/auth/register — creator registration
    if (req.method === 'POST' && urlPath === '/api/auth/register') {
      readBody(req).then(async body => {
        try {
          const result = await accountsService.registerCreator(body);
          if (result.error) return sendResponse(400, result);
          return sendResponse(201, result);
        } catch (e) { return sendResponse(500, { error: e.message }); }
      });
      return;
    }

    // POST /api/auth/login — creator login
    if (req.method === 'POST' && urlPath === '/api/auth/login') {
      readBody(req).then(async body => {
        try {
          const result = await accountsService.loginCreator(body);
          if (result.error) return sendResponse(401, result);
          return sendResponse(200, result);
        } catch (e) { return sendResponse(500, { error: e.message }); }
      });
      return;
    }

    // GET /api/auth/me — validate session, return creator profile
    if (req.method === 'GET' && urlPath === '/api/auth/me') {
      const creator = accountsService.validateSession(extractCreatorToken());
      if (!creator) return sendResponse(401, { error: 'Not authenticated' });
      return sendResponse(200, { creator });
    }

    // POST /api/auth/logout — destroy session
    if (req.method === 'POST' && urlPath === '/api/auth/logout') {
      accountsService.destroySession(extractCreatorToken());
      return sendResponse(200, { ok: true });
    }

    // GET /api/accounts/creators — admin: list all creator accounts
    if (req.method === 'GET' && urlPath === '/api/accounts/creators') {
      return sendResponse(200, { creators: accountsService.listCreators() });
    }

    // PUT /api/accounts/creator/approve — admin: approve or revoke a creator
    if (req.method === 'PUT' && urlPath === '/api/accounts/creator/approve') {
      readBody(req).then(body => {
        const result = accountsService.setCreatorApproval(body.creatorId, body.approved);
        if (result.error) return sendResponse(404, result);
        return sendResponse(200, result);
      });
      return;
    }

    // POST /api/accounts/student — create a single student account
    if (req.method === 'POST' && urlPath === '/api/accounts/student') {
      readBody(req).then(body => {
        const creator = accountsService.validateSession(extractCreatorToken());
        const result = accountsService.createStudent({
          displayName: body.displayName,
          pin: body.pin,
          createdBy: creator ? creator.id : body.createdBy || null
        });
        return sendResponse(201, result);
      });
      return;
    }

    // POST /api/accounts/students/bulk — bulk-create student accounts
    if (req.method === 'POST' && urlPath === '/api/accounts/students/bulk') {
      readBody(req).then(body => {
        const creator = accountsService.validateSession(extractCreatorToken());
        const result = accountsService.createStudentsBulk({
          names: body.names,
          pin: body.pin,
          createdBy: creator ? creator.id : body.createdBy || null
        });
        if (result.error) return sendResponse(400, result);
        return sendResponse(201, result);
      });
      return;
    }

    // GET /api/accounts/students — list all student accounts
    if (req.method === 'GET' && urlPath === '/api/accounts/students') {
      return sendResponse(200, { students: accountsService.listStudents() });
    }

    // PUT /api/accounts/student — update student name/pin/active
    if (req.method === 'PUT' && urlPath === '/api/accounts/student') {
      readBody(req).then(body => {
        if (!body.pseudoId) return sendResponse(400, { error: 'pseudoId required' });
        const result = accountsService.updateStudent(body.pseudoId, body);
        if (result.error) return sendResponse(404, result);
        return sendResponse(200, result);
      });
      return;
    }

    // POST /api/accounts/student/transfer-token — generate transfer code
    if (req.method === 'POST' && urlPath === '/api/accounts/student/transfer-token') {
      readBody(req).then(body => {
        if (!body.pseudoId) return sendResponse(400, { error: 'pseudoId required' });
        const result = accountsService.generateTransferToken(body.pseudoId);
        if (result.error) return sendResponse(404, result);
        return sendResponse(200, result);
      });
      return;
    }

    // POST /api/accounts/student/claim — claim transfer token on new device
    if (req.method === 'POST' && urlPath === '/api/accounts/student/claim') {
      readBody(req).then(body => {
        if (!body.token) return sendResponse(400, { error: 'token required' });
        const result = accountsService.claimTransferToken(body.token);
        if (result.error) return sendResponse(400, result);
        return sendResponse(200, result);
      });
      return;
    }

    // POST /api/accounts/student/verify-pin — verify student PIN
    if (req.method === 'POST' && urlPath === '/api/accounts/student/verify-pin') {
      readBody(req).then(body => {
        if (!body.pseudoId) return sendResponse(400, { error: 'pseudoId required' });
        const result = accountsService.verifyStudentPin(body.pseudoId, body.pin);
        if (result.error) return sendResponse(404, result);
        return sendResponse(200, result);
      });
      return;
    }

    // ── Lesson chain / immutability routes ─────────────────────────────────

    // GET /api/chain/:slug — get the hash chain for a lesson
    const chainMatch = urlPath.match(/^\/api\/chain\/(.+)$/);
    if (req.method === 'GET' && chainMatch && !urlPath.includes('/verify')) {
      const chainSlug = decodeURIComponent(chainMatch[1]);
      const chain = lessonChain.loadChain(chainSlug);
      return sendResponse(200, chain);
    }

    // POST /api/chain/verify — verify a lesson's chain integrity
    if (req.method === 'POST' && urlPath === '/api/chain/verify') {
      readBody(req).then(body => {
        if (!body.slug) return sendResponse(400, { error: 'slug required' });
        const chainResult = lessonChain.verifyChain(body.slug);
        if (body.lessonData) {
          const contentResult = lessonChain.verifyContentHash(body.lessonData);
          return sendResponse(200, { chain: chainResult, content: contentResult });
        }
        return sendResponse(200, { chain: chainResult });
      });
      return;
    }

    // GET /api/fork-check?slug=<slug> — check if a lesson's license permits forking
    if (req.method === 'GET' && urlPath === '/api/fork-check') {
      if (!qs.slug) return sendResponse(400, { error: 'slug query param required' });
      const yamlDir = process.env.AGNI_YAML_DIR || path.join(DATA_DIR, 'yaml');
      const loaded = authorService.loadLesson(qs.slug, yamlDir);
      if (loaded.error) return sendResponse(404, { error: loaded.error });
      const meta = loaded.lessonData.meta || loaded.lessonData;
      const license = meta.license || '';
      const permission = lessonChain.checkForkPermission(license);
      const inherited = lessonChain.inheritedForkLicense(license);
      return sendResponse(200, {
        slug: qs.slug,
        license,
        ...permission,
        inheritedLicense: inherited,
        sourceUri: meta.uri || null,
        sourceHash: meta.content_hash || null
      });
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
