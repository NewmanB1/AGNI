'use strict';

const envConfig = require('@agni/utils/env-config');

function register(router, ctx) {
  const { loadMasterySummaryAsync, loadLessonIndexAsync, loadOverridesAsync, saveOverridesAsync,
          authorService, handleJsonBody, requireHubKey, adminOnly,
          pathfinderCache } = ctx;

  router.get('/api/pathfinder', requireHubKey(async (req, res, { qs, sendResponse }) => {
    if (!qs.pseudoId) return sendResponse(400, { error: 'pseudoId required' });
    const lessons = await ctx.getLessonsSortedByPathfinder(qs.pseudoId);
    const overrides = await loadOverridesAsync();
    const overrideLessonId = overrides[qs.pseudoId]?.lessonId || null;
    const effectiveLessons = ctx.applyRecommendationOverride(lessons, overrideLessonId);
    const graphWeights = await ctx.getEffectiveGraphWeights(qs.pseudoId);
    const precacheN = envConfig.precacheHintCount;
    const precacheSlugs = effectiveLessons
      .slice(0, precacheN)
      .map(function (l) { return l.slug; })
      .filter(Boolean);
    return sendResponse(200, {
      pseudoId:      qs.pseudoId,
      lessons:       effectiveLessons,
      precacheSlugs: precacheSlugs,
      graphWeights:  graphWeights,
      computedAt:    new Date().toISOString(),
      cached:        pathfinderCache.has(qs.pseudoId),
      graphSource:   graphWeights.level || 'village',
      override:      overrideLessonId || undefined
    });
  }));

  router.get('/api/pathfinder/all', adminOnly(async (req, res, { qs, sendResponse }) => {
    const mastery = await loadMasterySummaryAsync();
    const allIds = Object.keys(mastery.students || {});
    const page = ctx.paginate(allIds, qs);
    const result  = {};
    for (const id of page.items) {
      result[id] = await ctx.getLessonsSortedByPathfinder(id);
    }
    return sendResponse(200, { students: result, total: page.total, limit: page.limit, offset: page.offset, computedAt: new Date().toISOString() });
  }));

  router.get('/api/pathfinder/graph', requireHubKey(async (req, res, { sendResponse }) => {
    return sendResponse(200, await ctx.getEffectiveGraphWeights());
  }));

  router.get('/api/lessons', requireHubKey(async (req, res, { qs, sendResponse }) => {
    let index = await loadLessonIndexAsync();
    const savedSlugs = authorService.listSavedLessons(envConfig.yamlDir);
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
    const page = ctx.paginate(index, qs);
    return sendResponse(200, { lessons: page.items, savedSlugs, total: page.total, limit: page.limit, offset: page.offset });
  }));

  router.post('/api/pathfinder/override', adminOnly((req, res, { sendResponse }) => {
    handleJsonBody(req, sendResponse, async (payload) => {
      const pseudoId = payload.pseudoId;
      const lessonId = payload.lessonId !== undefined ? payload.lessonId : null;
      if (!pseudoId || typeof pseudoId !== 'string') {
        return sendResponse(400, { error: 'pseudoId required' });
      }
      const overrides = await loadOverridesAsync();
      if (lessonId === null || lessonId === '') {
        delete overrides[pseudoId];
        await saveOverridesAsync(overrides);
        return sendResponse(200, { ok: true, override: null });
      }
      const eligible = await ctx.getLessonsSortedByPathfinder(pseudoId);
      const inList = eligible.some(l => l.lessonId === lessonId);
      if (!inList) {
        return sendResponse(400, { error: 'lessonId not in eligible list for this student', lessonId });
      }
      overrides[pseudoId] = { lessonId: String(lessonId) };
      await saveOverridesAsync(overrides);
      return sendResponse(200, { ok: true, override: lessonId });
    });
  }));
}

module.exports = { register };
