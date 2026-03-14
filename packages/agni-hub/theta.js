// @ts-nocheck — dynamic ctx shape, lmsEngine, thetaCache, log from shared
'use strict';
// packages/agni-hub/theta.js â€” AGNI Hub API entry point
// Runs on: Village Hub (Raspberry Pi, Node 14+).
// Business logic for theta scheduling + router wiring to route modules.

const path = require('path');
const http = require('http');

const { loadHubConfig } = require('@agni/utils/hub-config');
loadHubConfig(path.join(__dirname, '../../data'));
const { validateEnv } = require('@agni/utils/env-validate');
validateEnv();
const envConfig = require('@agni/utils/env-config');
const { ensureDataDirExists } = require('@agni/utils/ensure-paths');
ensureDataDirExists(envConfig);

const { Router } = require('@agni/utils/router');
const ctx = require('./shared');

const {
  loadJSONAsync, saveJSONAsync, getFileMtimeAsync,
  loadMasterySummaryAsync, loadBaseCostsAsync, loadLessonIndexAsync, loadSchedulesAsync,
  loadCurriculumAsync, loadApprovedCatalogAsync,
  lmsService: lmsEngine, governanceService, log,
  GRAPH_WEIGHTS_LOCAL, GRAPH_WEIGHTS_REGIONAL, GRAPH_WEIGHTS_MESH, COHORT_ASSIGNMENTS,
  SKILL_GRAPH_CYCLES, MASTERY_SUMMARY, SCHEDULES, CURRICULUM_GRAPH, APPROVED_CATALOG,
  SERVE_DIR, LESSON_INDEX, PORT, DATA_DIR,
  MIN_RESIDUAL, MIN_MLC, MASTERY_THRESHOLD, MIN_CONFIDENCE,
  MIN_LOCAL_SAMPLE_SIZE, MIN_LOCAL_EDGE_COUNT,
  thetaCache, accountsService, authorService
} = ctx;
const { pruneOrphanLessons } = require('./gc-disk-lessons');

// â”€â”€ LMS engine status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
if (lmsEngine.isAvailable()) {
  try {
    log.info('LMS engine loaded', lmsEngine.getStatus());
  } catch (err) {
    log.info('LMS engine loaded (status unavailable)', { error: err.message });
  }
} else {
  log.warn('LMS engine not available â€” degraded mode: theta scheduling active, bandit selection disabled');
}

// â”€â”€ Shared cache â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const sharedCache = {
  skillGraph: null, graphMtime: 0,
  eligibleLessons: null, eligibleMtime: 0
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Theta business logic (pure computation + caching)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

async function getEffectiveGraphWeights(pseudoId) {
  if (pseudoId) {
    var assignments = await loadJSONAsync(COHORT_ASSIGNMENTS, { assignments: {} });
    var cohortId = assignments.assignments && assignments.assignments[pseudoId];
    if (cohortId) {
      var cohortPath = path.join(DATA_DIR, 'graph-weights-' + cohortId + '.json');
      var cohortGw = await loadJSONAsync(cohortPath, null);
      if (cohortGw && Array.isArray(cohortGw.edges) && cohortGw.edges.length >= MIN_LOCAL_EDGE_COUNT) {
        return cohortGw;
      }
    }
  }
  var local = await loadJSONAsync(GRAPH_WEIGHTS_LOCAL, { edges: [], sample_size: 0, default_weight: 1.0 });
  var useLocal = local.sample_size >= MIN_LOCAL_SAMPLE_SIZE && local.edges.length >= MIN_LOCAL_EDGE_COUNT;
  if (useLocal) return local;
  var regional = await loadJSONAsync(GRAPH_WEIGHTS_REGIONAL, null);
  if (regional && regional.edges && regional.edges.length > 0) return regional;
  var mesh = await loadJSONAsync(GRAPH_WEIGHTS_MESH, null);
  if (mesh && mesh.edges && mesh.edges.length > 0) return mesh;
  return local;
}

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

/**
 * Detect cycles in the skill graph. Returns the first cycle found (array of skill IDs) or null.
 * Uses DFS. A back edge to a gray node indicates a cycle.
 */
function detectSkillGraphCycles(graph) {
  const visited = new Set();
  const gray = new Set();
  let cycle = null;

  function dfs(skill, path) {
    if (gray.has(skill)) {
      cycle = path.slice(path.indexOf(skill)).concat(skill);
      return true;
    }
    if (visited.has(skill)) return false;
    visited.add(skill);
    gray.add(skill);
    path.push(skill);
    const reqs = graph[skill];
    if (reqs) {
      for (const r of reqs) {
        if (dfs(r, path)) return true;
      }
    }
    gray.delete(skill);
    path.pop();
    return false;
  }

  for (const skill of Object.keys(graph)) {
    if (visited.has(skill)) continue;
    if (dfs(skill, [])) return cycle;
  }
  return null;
}

async function updateSharedCacheIfNeeded() {
  const mtimes = await Promise.all([
    getFileMtimeAsync(CURRICULUM_GRAPH),
    getFileMtimeAsync(LESSON_INDEX),
    getFileMtimeAsync(SCHEDULES)
  ]);
  const maxMtime = Math.max(...mtimes);
  if (maxMtime <= sharedCache.graphMtime) return;
  const [lessonIndex, curriculum, schedules] = await Promise.all([
    loadLessonIndexAsync(),
    loadCurriculumAsync(),
    loadSchedulesAsync()
  ]);
  const skillGraph = buildSkillGraph(lessonIndex, curriculum);
  const cycle = detectSkillGraphCycles(skillGraph);
  const cycleSet = cycle && cycle.length > 0 ? new Set(cycle) : null;

  if (cycleSet && cycleSet.size > 0) {
    if (envConfig.strictSkillGraph) {
      const err = new Error(
        'Fatal: skill graph contains a cycle (AGNI_STRICT_SKILL_GRAPH=1). Cycle: ' + cycle.join(' → ')
      );
      /** @type {Error & { code?: string; cycle?: string[] }} */ (err).code = 'SKILL_GRAPH_CYCLE';
      /** @type {Error & { code?: string; cycle?: string[] }} */ (err).cycle = cycle;
      throw err;
    }
    log.error('Skill graph cycle detected; pruning affected lessons (graceful degradation)', {
      cycle: cycle,
      message: 'Lessons that provide these skills are excluded until cycle is fixed.'
    });
    saveJSONAsync(SKILL_GRAPH_CYCLES, {
      cycle: cycle,
      detectedAt: new Date().toISOString(),
      message: 'Lessons that provide these skills are excluded until cycle is fixed.'
    }).catch(function (e) {
      log.warn('Could not write skill-graph-cycles.json', { error: e.message });
    });
    for (let ci = 0; ci < cycle.length; ci++) delete skillGraph[cycle[ci]];
  } else {
    saveJSONAsync(SKILL_GRAPH_CYCLES, { cycle: null, lastChecked: new Date().toISOString() }).catch(function () {});
  }

  sharedCache.skillGraph = skillGraph;
  const allScheduled = new Set();
  Object.values(schedules.students || {}).flat().forEach(s => allScheduled.add(s));
  sharedCache.eligibleLessons = lessonIndex.filter(function (lesson) {
    if (cycleSet && cycleSet.size > 0) {
      const providesCycleSkill = (lesson.skillsProvided || []).some(function (p) {
        return cycleSet.has(typeof p === 'string' ? p : p.skill);
      });
      if (providesCycleSkill) return false;
    }
    if (allScheduled.size > 0) {
      const providesAnyScheduled = (lesson.skillsProvided || []).some(function (p) {
        return allScheduled.has(typeof p === 'string' ? p : p.skill);
      });
      if (!providesAnyScheduled) return false;
    }
    return true;
  });
  sharedCache.graphMtime = maxMtime;
  sharedCache.eligibleMtime = maxMtime;
  log.info('Shared cache updated', { skills: Object.keys(sharedCache.skillGraph).length, eligibleLessons: sharedCache.eligibleLessons.length });
}

function expandScheduledSkills(initialSkills, studentSkills, skillGraph) {
  const expanded = new Set(initialSkills);
  const queue    = [...initialSkills];
  const visited  = new Set(initialSkills);
  let depth = 0;
  const MAX_DEPTH = 50;
  while (queue.length > 0 && depth < MAX_DEPTH) {
    const current = queue.shift();
    const reqs = skillGraph[current] || new Set();
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
  if (depth >= MAX_DEPTH) log.warn('BFS depth limit reached â€” possible cycle in skill graph');
  return expanded;
}

function getBaseCost(skillId, baseCosts, lessonIndex) {
  if (typeof baseCosts[skillId] === 'number') return baseCosts[skillId];
  const lesson = lessonIndex.find(l => (l.skillsProvided || []).some(s => s.skill === skillId));
  if (lesson && typeof lesson.difficulty === 'number') return Math.min(1, lesson.difficulty / 5);
  return 0.5;
}

function getResidualCostFactor(targetSkill, pseudoId, masterySummary, graphWeights) {
  const studentSkills = (masterySummary.students || {})[pseudoId] || {};
  const inboundEdges = (graphWeights.edges || []).filter(e => e.to === targetSkill && e.confidence >= MIN_CONFIDENCE);
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
  const studentSkills = (masterySummary.students || {})[pseudoId] || {};
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
  if (repBaseCost === 0) { repBaseCost = Math.min(1, (lesson.difficulty || 2) / 5); repResidual = 1.0; }
  const inf = lesson.inferredFeatures || {};
  const coherence = typeof inf.coherence === 'number' ? inf.coherence : 0;
  const COHERENCE_WEIGHT = 0.08;
  const coherenceBonus = Math.round(coherence * COHERENCE_WEIGHT * 1000) / 1000;

  const rawTheta = repBaseCost * repResidual - coherenceBonus;
  const theta = Math.round(Math.max(MIN_MLC, rawTheta) * 1000) / 1000;
  if (rawTheta < MIN_MLC) {
    log.warn('MLC anomaly: raw theta below MIN_MLC (clamped). May indicate invalid model or graph weights.',
      { lessonId: lesson.lessonId, rawTheta, MIN_MLC, baseCost: repBaseCost, residualFactor: repResidual, coherenceBonus });
  }
  return {
    lessonId: lesson.lessonId, slug: lesson.slug, title: lesson.title, theta,
    baseCost: Math.round(repBaseCost * 1000) / 1000,
    residualFactor: Math.round(repResidual * 1000) / 1000,
    transferBenefit: Math.round((1 - repResidual) * 1000) / 1000,
    coherenceBonus: coherenceBonus,
    archetypeId: inf.archetypeId || null,
    alreadyMastered, difficulty: lesson.difficulty || 2,
    description: lesson.description || '', is_group: !!lesson.is_group,
    teaching_mode: lesson.teaching_mode || null,
    subject: (lesson.utu && lesson.utu.class) || '',
    skillsProvided: lesson.skillsProvided || [],
    skillsRequired: lesson.skillsRequired || []
  };
}

function computeLessonOrder(lessonIndex, skillGraph, baseCosts, graphWeights, masterySummary, pseudoId, scheduledSkills) {
  const studentSkills = (masterySummary.students || {})[pseudoId] || {};
  const effectiveScheduledSkills = expandScheduledSkills(
    Array.isArray(scheduledSkills) ? scheduledSkills : [], studentSkills, skillGraph
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

function applyRecommendationOverride(orderedLessons, overrideLessonId) {
  if (!overrideLessonId || !Array.isArray(orderedLessons) || orderedLessons.length === 0) return orderedLessons;
  const idx = orderedLessons.findIndex(l => l.lessonId === overrideLessonId);
  if (idx <= 0) return orderedLessons;
  const out = orderedLessons.slice();
  const [over] = out.splice(idx, 1);
  out.unshift(over);
  return out;
}

async function getLessonsSortedByTheta(pseudoId) {
  const [currentMasteryMtime, currentScheduleMtime, currentCurriculumMtime, currentCatalogMtime] =
    await Promise.all([
      getFileMtimeAsync(MASTERY_SUMMARY),
      getFileMtimeAsync(SCHEDULES),
      getFileMtimeAsync(CURRICULUM_GRAPH),
      getFileMtimeAsync(APPROVED_CATALOG)
    ]);
  if (currentMasteryMtime   > (thetaCache._lastMasteryMtime    || 0) ||
      currentScheduleMtime  > (thetaCache._lastScheduleMtime   || 0) ||
      currentCurriculumMtime > (thetaCache._lastCurriculumMtime || 0) ||
      currentCatalogMtime   > (thetaCache._lastCatalogMtime    || 0)) {
    thetaCache.clear();
    thetaCache._lastMasteryMtime    = currentMasteryMtime;
    thetaCache._lastScheduleMtime   = currentScheduleMtime;
    thetaCache._lastCurriculumMtime = currentCurriculumMtime;
    thetaCache._lastCatalogMtime    = currentCatalogMtime;
  }
  await updateSharedCacheIfNeeded();
  const cached = thetaCache.get(pseudoId);
  if (cached && cached.masteryMtime === currentMasteryMtime) return cached.lessons;
  const [baseCosts, masterySummary, graphWeights, schedules, catalog] = await Promise.all([
    loadBaseCostsAsync(),
    loadMasterySummaryAsync(),
    getEffectiveGraphWeights(pseudoId),
    loadSchedulesAsync(),
    loadApprovedCatalogAsync()
  ]);
  const scheduledSkills = schedules.students?.[pseudoId] || [];
  let candidates = sharedCache.eligibleLessons || await loadLessonIndexAsync();
  if (catalog.lessonIds && catalog.lessonIds.length > 0) {
    const approvedSet = new Set(catalog.lessonIds);
    candidates = candidates.filter(l => approvedSet.has(l.lessonId));
  }
  const policy = governanceService.loadPolicy();
  if (policy && policy.enforceUtuTargets && Array.isArray(policy.utuTargets) && policy.utuTargets.length > 0) {
    const overrideIds = catalog.utuBandOverrides && typeof catalog.utuBandOverrides === 'object'
      ? Object.keys(catalog.utuBandOverrides)
      : [];
    candidates = candidates.filter(function (l) {
      return governanceService.lessonPassesUtuTargets(l, policy, { utuBandOverrideLessonIds: overrideIds });
    });
  }
  const skillGraph = sharedCache.skillGraph || {};
  let results = computeLessonOrder(candidates, skillGraph, baseCosts, graphWeights, masterySummary, pseudoId, scheduledSkills);

  // Frustration-to-theta feedback loop: penalize lessons with historically frustrating steps
  // Indexed by pseudoId to avoid O(n) scan on every request [R10 P4.4]
  const FRUSTRATION_PENALTY_WEIGHT = 0.10;
  try {
    const telData = await ctx.loadTelemetryEventsAsync();
    if (!telData._indexByPseudoId) {
      const idx = {};
      const evts = telData.events || [];
      for (let ti = 0; ti < evts.length; ti++) {
        const pid = evts[ti].pseudoId;
        if (pid) {
          if (!idx[pid]) idx[pid] = [];
          idx[pid].push(evts[ti]);
        }
      }
      telData._indexByPseudoId = idx;
    }
    const studentEvents = telData._indexByPseudoId[pseudoId] || [];
    if (studentEvents.length > 0) {
      const frustrationByLesson = {};
      for (const ev of studentEvents) {
        if (ev.frustrationTotal > 0 || (ev.frustrationEvents && ev.frustrationEvents.length > 0)) {
          const lid = ev.lessonId;
          if (!frustrationByLesson[lid]) frustrationByLesson[lid] = { total: 0, count: 0 };
          frustrationByLesson[lid].total += (ev.frustrationTotal || ev.frustrationEvents.length);
          frustrationByLesson[lid].count++;
        }
      }
      for (const r of results) {
        const fData = frustrationByLesson[r.lessonId];
        if (fData && fData.count > 0) {
          const avgFrustration = fData.total / fData.count;
          const penalty = Math.min(0.5, avgFrustration * 0.1) * FRUSTRATION_PENALTY_WEIGHT;
          r.theta = Math.round((r.theta + penalty) * 1000) / 1000;
          r.frustrationPenalty = Math.round(penalty * 1000) / 1000;
        }
      }
      results.sort((a, b) => {
        if (a.alreadyMastered !== b.alreadyMastered) return a.alreadyMastered ? 1 : -1;
        return a.theta - b.theta;
      });
    }
  } catch (e) {
    log.warn('Frustration feedback loop failed (non-critical)', { error: e.message });
  }

  const topK = envConfig.topKCandidates || 500;
  if (results.length > topK) {
    results = results.slice(0, topK);
  }

  thetaCache.set(pseudoId, { lessons: results, computedAt: new Date().toISOString(), masteryMtime: currentMasteryMtime });
  return results;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Lesson index builder
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

async function rebuildLessonIndex() {
  const fsp = require('fs').promises;
  const catalogPath = path.join(SERVE_DIR, 'catalog.json');
  let catalogExists = false;
  try { await fsp.access(catalogPath); catalogExists = true; } catch (e) { void e; }
  if (!catalogExists) {
    const lessonsRoot = path.join(SERVE_DIR, 'lessons');
    try {
      const subs = await fsp.readdir(lessonsRoot);
      const index = [];
      let sidecarCount = 0;
      for (let s = 0; s < subs.length; s++) {
        const slug = subs[s];
        const sidecarPath = path.join(lessonsRoot, slug, 'index-ir.json');
        try {
          await fsp.access(sidecarPath);
          const sidecar = await loadJSONAsync(sidecarPath, null);
          if (sidecar) {
            sidecarCount++;
            index.push({
              lessonId: sidecar.identifier || slug,
              slug: sidecar.slug || slug,
              title: sidecar.title || '',
              description: sidecar.description || '',
              difficulty: sidecar.difficulty || 2,
              language: sidecar.language || 'en',
              compiledAt: sidecar.compiledAt || null,
              metadata_source: sidecar.metadata_source || 'inferred',
              utu: sidecar.utu || null,
              teaching_mode: sidecar.teaching_mode || null,
              is_group: !!(sidecar.is_group),
              subject: (sidecar.utu && sidecar.utu.class) || '',
              skillsProvided: (sidecar.ontology && sidecar.ontology.provides) || [],
              skillsRequired: (sidecar.ontology && sidecar.ontology.requires
                ? sidecar.ontology.requires.map((r) => typeof r === 'string' ? r : r.skill) : []),
              inferredFeatures: sidecar.inferredFeatures || null,
              katexAssets: sidecar.katexAssets || [],
              factoryManifest: sidecar.factoryManifest || []
            });
          }
        } catch (e2) { void e2; }
      }
      await saveJSONAsync(LESSON_INDEX, index);
      log.info('Catalog-free mode: derived lesson set from IR sidecars', { total: index.length, sidecar: sidecarCount });
      const gcFree = await pruneOrphanLessons({ serveDir: SERVE_DIR, catalogSlugs: [] });
      if (gcFree.pruned.length > 0) log.info('P2-20: pruned orphans (catalog-free)', { count: gcFree.pruned.length });
      if (lmsEngine.isAvailable && lmsEngine.isAvailable()) {
        const seedEntries = index
          .filter((ent) => ent.skillsProvided && ent.skillsProvided.length > 0)
          .map((ent) => {
            const raw = (ent.inferredFeatures && typeof ent.inferredFeatures.difficulty === 'number' && Number.isFinite(ent.inferredFeatures.difficulty))
              ? ent.inferredFeatures.difficulty : (typeof ent.difficulty === 'number' && Number.isFinite(ent.difficulty) ? ent.difficulty : 2);
            const difficulty = Math.max(1, Math.min(5, raw));
            return { lessonId: ent.lessonId, difficulty, skill: ent.skillsProvided[0].skill };
          });
        try { lmsEngine.seedLessons(seedEntries); }
        catch (err) { log.error('LMS engine seeding failed', { error: err.message }); }
      }
    } catch (e) {
      log.info('No catalog.json and no lessons dir; skipping index rebuild');
    }
    return;
  }

  const catalog = await loadJSONAsync(catalogPath, { lessons: [] });
  let sidecarCount = 0;
  let fallbackCount = 0;
  const index = [];
  const catalogOrphans = [];
  for (const entry of catalog.lessons) {
    const lessonDir   = path.join(SERVE_DIR, 'lessons', entry.slug);
    const sidecarPath = path.join(lessonDir, 'index-ir.json');

    let hasSidecar = false;
    try { await fsp.access(sidecarPath); hasSidecar = true; } catch { /* no sidecar */ }

    if (hasSidecar) {
      const sidecar = await loadJSONAsync(sidecarPath, null);
      if (sidecar) {
        sidecarCount++;
        index.push({
          lessonId: sidecar.identifier || entry.identifier || entry.slug,
          slug: sidecar.slug || entry.slug,
          title: sidecar.title || entry.title || '',
          description: sidecar.description || entry.description || '',
          difficulty: sidecar.difficulty || entry.difficulty || 2,
          language: sidecar.language || entry.language || 'en',
          compiledAt: sidecar.compiledAt || null,
          metadata_source: sidecar.metadata_source || 'inferred',
          utu: sidecar.utu || null, teaching_mode: sidecar.teaching_mode || null,
          is_group: !!(sidecar.is_group || entry.is_group),
          subject: (sidecar.utu && sidecar.utu.class) || entry.subject || '',
          skillsProvided: (sidecar.ontology && sidecar.ontology.provides) || [],
          skillsRequired: (sidecar.ontology && sidecar.ontology.requires
            ? sidecar.ontology.requires.map(r => typeof r === 'string' ? r : r.skill) : []),
          inferredFeatures: sidecar.inferredFeatures || null,
          katexAssets: sidecar.katexAssets || [], factoryManifest: sidecar.factoryManifest || []
        });
        continue;
      }
    }

    fallbackCount++;
    catalogOrphans.push(entry.slug);
    log.warn('Catalog/IR drift: catalog lists slug but IR missing; lesson not indexed', { slug: entry.slug });
  }

  const catalogSlugSet = new Set((catalog.lessons || []).map((e) => e.slug).filter(Boolean));
  const lessonsRoot = path.join(SERVE_DIR, 'lessons');
  const irOnly = [];
  try {
    const dirs = await fsp.readdir(lessonsRoot);
    for (let d = 0; d < dirs.length; d++) {
      const slug = dirs[d];
      if (catalogSlugSet.has(slug)) continue;
      try {
        await fsp.access(path.join(lessonsRoot, slug, 'index-ir.json'));
        irOnly.push(slug);
      } catch (e) { void e; }
    }
  } catch (e) { /* lessons dir may not exist */ }
  const yamlSlugs = (authorService && authorService.listSavedLessons)
    ? authorService.listSavedLessons(envConfig.yamlDir) : [];
  const yamlOnly = [];
  for (let y = 0; y < yamlSlugs.length; y++) {
    const ys = yamlSlugs[y];
    if (!catalogSlugSet.has(ys)) {
      try {
        await fsp.access(path.join(lessonsRoot, ys, 'index-ir.json'));
      } catch (e) { yamlOnly.push(ys); }
    }
  }
  if (catalogOrphans.length > 0 || irOnly.length > 0 || yamlOnly.length > 0) {
    log.warn('Catalog/IR drift (P2-22 validation)', {
      catalogOrphans: catalogOrphans.length,
      irOnly: irOnly.length,
      yamlOnly: yamlOnly.length,
      catalogOrphanSlugs: catalogOrphans.slice(0, 5),
      irOnlySlugs: irOnly.slice(0, 5),
      yamlOnlySlugs: yamlOnly.slice(0, 5)
    });
  }

  const validSlugs = new Set([].concat(Array.from(catalogSlugSet), yamlSlugs));
  const gcResult = await pruneOrphanLessons({ serveDir: SERVE_DIR, validSlugs: validSlugs });
  if (gcResult.pruned.length > 0) log.info('P2-20: pruned orphans', { count: gcResult.pruned.length, slugs: gcResult.pruned.slice(0, 5) });

  await saveJSONAsync(LESSON_INDEX, index);
  log.info('Lesson index rebuilt', { total: index.length, sidecar: sidecarCount, skippedNoIR: fallbackCount });
  if (lmsEngine.isAvailable && lmsEngine.isAvailable()) {
    const seedEntries = index
      .filter(entry => entry.skillsProvided.length > 0)
      .map(entry => {
        const raw = (entry.inferredFeatures && typeof entry.inferredFeatures.difficulty === 'number' && Number.isFinite(entry.inferredFeatures.difficulty))
          ? entry.inferredFeatures.difficulty : (typeof entry.difficulty === 'number' && Number.isFinite(entry.difficulty) ? entry.difficulty : 2);
        const difficulty = Math.max(1, Math.min(5, raw));
        return { lessonId: entry.lessonId, difficulty, skill: entry.skillsProvided[0].skill };
      });
    try { lmsEngine.seedLessons(seedEntries); }
    catch (err) { log.error('LMS engine seeding failed', { error: err.message }); }
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// HTTP server with Router
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// Inject business logic into shared context so route modules can use them
ctx.getLessonsSortedByTheta = getLessonsSortedByTheta;
ctx.getEffectiveGraphWeights = getEffectiveGraphWeights;
ctx.applyRecommendationOverride = applyRecommendationOverride;

function startApi(port) {
  const listenPort = (typeof port === 'number' && port >= 0) ? port : PORT;
  const router = new Router();

  const startedAt = Date.now();
  router.get('/health', (req, res, { sendResponse }) => {
    sendResponse(200, {
      status: 'ok',
      uptime: Math.round((Date.now() - startedAt) / 1000),
      version: require('../../package.json').version || '0.0.0'
    });
  });

  // Register all route modules
  require('./routes/theta').register(router, ctx);
  require('./routes/lms').register(router, ctx);
  require('./routes/governance').register(router, ctx);
  require('./routes/author').register(router, ctx);
  require('./routes/accounts').register(router, ctx);
  require('./routes/groups').register(router, ctx);
  require('./routes/parent').register(router, ctx);
  require('./routes/student').register(router, ctx);
  require('./routes/admin').register(router, ctx);
  require('./routes/chain').register(router, ctx);
  require('./routes/telemetry').register(router, ctx);
  require('./routes/lti').register(router, ctx);
  require('@agni/utils/feature-flags').registerRoutes(router, ctx);

  const server = http.createServer((req, res) => {
    const requestId = ctx.generateRequestId();
    const startTime = process.hrtime.bigint();
    const sendResponse = ctx.createResponseSender(req, res, { requestId });
    const [urlPath, queryStr] = req.url.split('?');
    const qs = Object.fromEntries(new URLSearchParams(queryStr || ''));

    // CORS preflight: allow portal (and other configured origins) to call API
    if (req.method === 'OPTIONS') {
      const corsOrigin = envConfig.corsOrigin || '*';
      res.setHeader('Access-Control-Allow-Origin', corsOrigin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
      res.setHeader('Access-Control-Max-Age', '86400');
      res.writeHead(204);
      res.end();
      return;
    }

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startTime) / 1e6;
      log.info('request', {
        method: req.method, path: urlPath, status: res.statusCode,
        durationMs: Math.round(durationMs * 10) / 10, requestId
      });
    });

    const match = router.match(req.method, urlPath);
    if (match) {
      const result = match.handler(req, res, { qs, sendResponse, params: match.params });
      if (result && typeof result.catch === 'function') {
        result.catch(err => {
          log.error('Unhandled route error', { error: err.message || String(err), stack: err.stack });
          if (!res.headersSent) sendResponse(500, { error: 'Internal server error' });
        });
      }
      return;
    }

    if (router.hasPath(urlPath)) {
      return sendResponse(405, { error: 'Method not allowed' });
    }

    sendResponse(404, { error: 'Not found' });
  });

  server.timeout = 30000;
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  server.keepAliveTimeout = 5000;

  // Attach hub-transform routes (lesson serving, factories, PWA assets) to
  // the same server so that tests calling startApi() get the same routing as
  // production. Wrapped in try/catch for graceful degradation if the compiler
  // or its dependencies are unavailable.
  const HUB_TRANSFORM_PATH = path.join(__dirname, 'hub-transform.js');
  try {
    const hubTransform = require(HUB_TRANSFORM_PATH);
    const privateKeyPath = envConfig.privateKeyPath || null;
    hubTransform.attachRoutes(server, { dev: process.env.NODE_ENV !== 'production', deviceId: null, privateKey: privateKeyPath });
  } catch (err) {
    log.warn('hub-transform not available â€” /lessons/, /factories/, /katex/ routes disabled', { error: err.message });
  }

  server.listen(listenPort, '0.0.0.0', () => {
    const addr = server.address();
    const port = addr && typeof addr === 'object' ? addr.port : listenPort;
    log.info('API listening', { port });
  });
  return server;
}

// â”€â”€ Startup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
if (require.main === module) {
  (async () => {
    const pinResult = await accountsService.migrateLegacyPins();
    if (pinResult.migrated > 0) log.info('Migrated legacy PINs to scrypt', { count: pinResult.migrated });
    if (pinResult.legacySha256 > 0) log.warn('Students with unsalted SHA-256 PINs (will migrate on next verification)', { count: pinResult.legacySha256 });
    await rebuildLessonIndex();
    const server = startApi(PORT);

    function shutdown(signal) {
      log.info('Shutting down gracefully', { signal });
      server.close(() => {
        log.info('HTTP server closed');
        if (lmsEngine.isAvailable && lmsEngine.isAvailable()) {
          try { lmsEngine.persistState(); log.info('LMS state persisted'); }
          catch (e) { log.error('LMS state save failed', { error: e.message }); }
        }
        process.exit(0);
      });
      setTimeout(() => { log.error('Forced shutdown after timeout'); process.exit(1); }, 10000);
    }
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  })();
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
  applyRecommendationOverride,
  detectSkillGraphCycles
};
