'use strict';

function register(router, ctx) {
  const { authorService, accountsService, handleJsonBody,
          adminOnly, authOnly, loadLessonIndexAsync, loadApprovedCatalogAsync, paginate,
          lessonChain, loadLeaderboardMetricsAsync, saveLeaderboardMetricsAsync } = ctx;
  const envConfig = require('@agni/utils/env-config');
  const yamlDir = envConfig.yamlDir;

  router.get('/api/author/browse-lessons', authOnly(async (req, res, { qs, sendResponse }) => {
    let index = await loadLessonIndexAsync().catch(function () { return []; });
    const savedSlugs = authorService.listSavedLessons(yamlDir) || [];
    const savedSet = new Set(savedSlugs);

    if (qs.scope === 'mine') {
      index = index.filter(function (l) { return savedSet.has(l.slug); });
    } else if (qs.scope === 'others') {
      index = index.filter(function (l) { return !savedSet.has(l.slug); });
    }

    if (qs.q && String(qs.q).trim()) {
      const q = String(qs.q).trim().toLowerCase();
      index = index.filter(function (l) {
        return (l.title && l.title.toLowerCase().indexOf(q) !== -1) ||
          (l.description && l.description.toLowerCase().indexOf(q) !== -1) ||
          (l.slug && l.slug.toLowerCase().indexOf(q) !== -1);
      });
    }
    if (qs.utu) {
      const utuFilter = String(qs.utu).toLowerCase();
      index = index.filter(function (l) {
        const cls = l.utu && typeof l.utu === 'object' ? String(l.utu.class || '').toLowerCase() : '';
        return cls === utuFilter;
      });
    }
    if (qs.spine) {
      const spineFilter = String(qs.spine).toUpperCase();
      index = index.filter(function (l) {
        const cls = l.utu && typeof l.utu === 'object' ? String(l.utu.class || '') : '';
        return cls.toUpperCase().startsWith(spineFilter);
      });
    }
    if (qs.teaching_mode) {
      const modeFilter = String(qs.teaching_mode).toLowerCase();
      index = index.filter(function (l) { return String(l.teaching_mode || '').toLowerCase() === modeFilter; });
    }
    if (qs.factory) {
      const factoryId = String(qs.factory).trim();
      index = index.filter(function (l) {
        const manifest = l.factoryManifest || [];
        return manifest.indexOf(factoryId) !== -1;
      });
    }
    if (qs.hasSensor === 'true' || qs.hasSensor === '1') {
      index = index.filter(function (l) {
        const flags = l.inferredFeatures && l.inferredFeatures.flags;
        const counts = l.inferredFeatures && l.inferredFeatures.stepTypeCounts;
        return (flags && flags.has_sensors) || (counts && counts.hardware_trigger > 0);
      });
    }
    if (qs.hasVisuals === 'true' || qs.hasVisuals === '1') {
      index = index.filter(function (l) {
        const flags = l.inferredFeatures && l.inferredFeatures.flags;
        const manifest = l.factoryManifest || [];
        return (flags && flags.has_visuals) || manifest.length > 0;
      });
    }

    const page = paginate ? paginate(index, qs) : { items: index, total: index.length, limit: index.length, offset: 0 };
    return sendResponse(200, {
      lessons: page.items,
      savedSlugs: savedSlugs,
      total: page.total,
      limit: page.limit,
      offset: page.offset
    });
  }));

  router.get('/api/author/fork-check', authOnly(async (req, res, { qs, sendResponse }) => {
    if (!qs.slug) return sendResponse(400, { error: 'slug query param required' });
    const loaded = authorService.loadLesson(qs.slug, yamlDir);
    if (loaded.error) return sendResponse(404, { error: loaded.error });
    const meta = loaded.lessonData.meta || loaded.lessonData;
    const license = meta.license || '';
    const permission = lessonChain ? lessonChain.checkForkPermission(license) : { forkAllowed: true };
    const identifier = meta.identifier || loaded.lessonData.id || qs.slug;
    let forkAllowed = permission.forkAllowed !== false;
    if (forkAllowed && loadApprovedCatalogAsync) {
      try {
        const catalog = await loadApprovedCatalogAsync();
        const unforkable = (catalog && catalog.unforkableLessonIds) || [];
        if (unforkable.indexOf(identifier) !== -1 || unforkable.indexOf(qs.slug) !== -1) {
          forkAllowed = false;
        }
      } catch { /* ignore */ }
    }
    return sendResponse(200, {
      slug: qs.slug,
      license,
      forkAllowed,
      title: meta.title || qs.slug
    });
  }));

  router.get('/api/author/lessons', authOnly((req, res, { sendResponse }) => {
    const slugs = authorService.listSavedLessons(yamlDir);
    return sendResponse(200, { slugs: slugs });
  }));

  router.get('/api/author/load/:slug', authOnly((req, res, { params, sendResponse }) => {
    const result = authorService.loadLesson(params.slug, yamlDir);
    if (result.error) return sendResponse(404, { error: result.error });
    return sendResponse(200, { slug: params.slug, lessonData: result.lessonData });
  }));

  router.get('/api/author/sensors', authOnly((req, res, { sendResponse }) => {
    const plugins = require('@agni/plugins');
    const sensors = plugins.getSensors();
    const list = sensors.map(function (s) { return { id: s.id, label: s.label, group: s.group || 'Other' }; });
    return sendResponse(200, { sensors: list });
  }));

  router.post('/api/author/validate', authOnly((req, res, { sendResponse }) => {
    handleJsonBody(req, sendResponse, (body) => {
      const parsed = authorService.parseAuthorBody(body);
      if (parsed.error) return sendResponse(400, { error: parsed.error });
      const result = authorService.validateForAuthor(parsed.lessonData);
      sendResponse(200, { valid: result.valid, errors: result.errors || [], warnings: result.warnings || [] });
    });
  }));

  router.post('/api/author/save', authOnly((req, res, { sendResponse }) => {
    handleJsonBody(req, sendResponse, async (body) => {
      const parsed = authorService.parseAuthorBody(body);
      if (parsed.error) return sendResponse(400, { error: parsed.error });
      const compileFlag = parsed.lessonData && parsed.lessonData._compile;
      if (parsed.lessonData) delete parsed.lessonData._compile;
      const result = await authorService.saveLesson(parsed.lessonData, yamlDir, { compile: !!compileFlag });
      if (result.error) return sendResponse(400, { error: result.error });
      const creatorId = parsed.lessonData?.meta?.creator_id;
      if (creatorId && result.slug) {
        await accountsService.recordLessonAuthored(creatorId, result.slug);
      }
      const forkedFromSlug = body.forkedFromSlug && String(body.forkedFromSlug).trim();
      if (forkedFromSlug && loadLeaderboardMetricsAsync && saveLeaderboardMetricsAsync) {
        try {
          const metrics = await loadLeaderboardMetricsAsync();
          const counts = metrics.forkCountByLesson || {};
          counts[forkedFromSlug] = (counts[forkedFromSlug] || 0) + 1;
          metrics.forkCountByLesson = counts;
          await saveLeaderboardMetricsAsync(metrics);
        } catch { /* ignore */ }
      }
      const resp = { ok: true, slug: result.slug, path: result.path, warnings: result.warnings || [] };
      if (result.compiled != null) resp.compiled = result.compiled;
      sendResponse(200, resp);
    });
  }));

  router.delete('/api/author/delete/:slug', adminOnly(async (req, res, { params, sendResponse }) => {
    const result = authorService.deleteLesson(params.slug, yamlDir);
    if (result.error) return sendResponse(404, { error: result.error });
    const { pruneLessonCompiledDir } = require('../gc-disk-lessons');
    await pruneLessonCompiledDir(params.slug, envConfig.serveDir);
    sendResponse(200, { ok: true, deleted: result.deleted });
  }));

  router.post('/api/author/preview', authOnly((req, res, { sendResponse }) => {
    handleJsonBody(req, sendResponse, async (body) => {
      const parsed = authorService.parseAuthorBody(body);
      if (parsed.error) return sendResponse(400, { error: parsed.error });
      const result = await authorService.previewForAuthor(parsed.lessonData);
      if (result.error) return sendResponse(400, { error: result.error });
      const assemble = require('../lesson-server/assemble');
      let html;
      try {
        html = assemble.assembleHtml(result.ir, { dev: true });
      } catch (err) {
        return sendResponse(400, { error: 'Assemble failed: ' + (err.message || 'Unknown') });
      }
      sendResponse(200, { ir: result.ir, sidecar: result.sidecar, html: html });
    });
  }));
}

module.exports = { register };
