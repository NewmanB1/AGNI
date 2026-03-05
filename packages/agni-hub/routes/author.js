'use strict';

const path = require('path');
const generateLesson = (function () {
  try {
    return require(path.join(__dirname, '../../scripts/generate-lesson')).generateLesson;
  } catch (_) {
    return null;
  }
})();

function register(router, ctx) {
  const { authorService, accountsService, handleJsonBody,
          adminOnly, authOnly } = ctx;
  const envConfig = require('@agni/utils/env-config');
  const yamlDir = envConfig.yamlDir;

  router.get('/api/author/load/:slug', authOnly((req, res, { params, sendResponse }) => {
    const result = authorService.loadLesson(params.slug, yamlDir);
    if (result.error) return sendResponse(404, { error: result.error });
    return sendResponse(200, { slug: params.slug, lessonData: result.lessonData });
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
      const resp = { ok: true, slug: result.slug, path: result.path, warnings: result.warnings || [] };
      if (result.compiled != null) resp.compiled = result.compiled;
      sendResponse(200, resp);
    });
  }));

  router.delete('/api/author/delete/:slug', adminOnly((req, res, { params, sendResponse }) => {
    const result = authorService.deleteLesson(params.slug, yamlDir);
    if (result.error) return sendResponse(404, { error: result.error });
    sendResponse(200, { ok: true, deleted: result.deleted });
  }));

  router.post('/api/author/preview', authOnly((req, res, { sendResponse }) => {
    handleJsonBody(req, sendResponse, async (body) => {
      const parsed = authorService.parseAuthorBody(body);
      if (parsed.error) return sendResponse(400, { error: parsed.error });
      const result = await authorService.previewForAuthor(parsed.lessonData);
      if (result.error) return sendResponse(400, { error: result.error });
      sendResponse(200, { ir: result.ir, sidecar: result.sidecar });
    });
  }));

  router.post('/api/author/generate', authOnly((req, res, { sendResponse }) => {
    handleJsonBody(req, sendResponse, async (body) => {
      const skillDescription = body?.skillDescription;
      const archetypeId = body?.archetypeId;
      const result = await authorService.generateForAuthor({
        skillDescription,
        archetypeId,
        generateLesson: generateLesson || undefined
      });
      if (!result.ok) return sendResponse(400, { ok: false, error: result.error });
      sendResponse(200, { ok: true, lesson: result.lesson });
    });
  }));
}

module.exports = { register };
