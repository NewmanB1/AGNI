'use strict';

function register(router, ctx) {
  const { authorService, accountsService, readBody, handleJsonBody,
          safeErrorMessage, requireAdmin, DATA_DIR, path } = ctx;

  router.get('/api/author/load/:slug', (req, res, { params, sendResponse }) => {
    const yamlDir = process.env.AGNI_YAML_DIR || path.join(DATA_DIR, 'yaml');
    const result = authorService.loadLesson(params.slug, yamlDir);
    if (result.error) return sendResponse(404, { error: result.error });
    return sendResponse(200, { slug: params.slug, lessonData: result.lessonData });
  });

  router.post('/api/author/validate', (req, res, { sendResponse }) => {
    readBody(req).then(body => {
      try {
        const parsed = authorService.parseAuthorBody(body);
        if (parsed.error) return sendResponse(400, { error: parsed.error });
        const result = authorService.validateForAuthor(parsed.lessonData);
        sendResponse(200, { valid: result.valid, errors: result.errors || [], warnings: result.warnings || [] });
      } catch (err) { sendResponse(500, { error: safeErrorMessage(err) }); }
    }).catch(err => sendResponse(500, { error: safeErrorMessage(err) }));
  });

  router.post('/api/author/save', (req, res, { sendResponse }) => {
    readBody(req).then(async (body) => {
      try {
        const parsed = authorService.parseAuthorBody(body);
        if (parsed.error) return sendResponse(400, { error: parsed.error });
        const yamlDir = process.env.AGNI_YAML_DIR || path.join(DATA_DIR, 'yaml');
        const compileFlag = parsed.lessonData && parsed.lessonData._compile;
        if (parsed.lessonData) delete parsed.lessonData._compile;
        const result = await authorService.saveLesson(parsed.lessonData, yamlDir, { compile: !!compileFlag });
        if (result.error) return sendResponse(400, { error: result.error });
        const creatorId = parsed.lessonData?.meta?.creator_id;
        if (creatorId && result.slug) {
          accountsService.recordLessonAuthored(creatorId, result.slug);
        }
        const resp = { ok: true, slug: result.slug, path: result.path, warnings: result.warnings || [] };
        if (result.compiled != null) resp.compiled = result.compiled;
        sendResponse(200, resp);
      } catch (err) {
        sendResponse(500, { error: safeErrorMessage(err) });
      }
    }).catch(err => sendResponse(500, { error: safeErrorMessage(err) }));
  });

  router.delete('/api/author/delete/:slug', (req, res, { params, qs, sendResponse }) => {
    if (!requireAdmin(req, qs, sendResponse)) return;
    const yamlDir = process.env.AGNI_YAML_DIR || path.join(DATA_DIR, 'yaml');
    const result = authorService.deleteLesson(params.slug, yamlDir);
    if (result.error) return sendResponse(404, { error: result.error });
    sendResponse(200, { ok: true, deleted: result.deleted });
  });

  router.post('/api/author/preview', (req, res, { sendResponse }) => {
    readBody(req).then(body => {
      const parsed = authorService.parseAuthorBody(body);
      if (parsed.error) return sendResponse(400, { error: parsed.error });
      authorService.previewForAuthor(parsed.lessonData)
        .then(result => {
          if (result.error) return sendResponse(400, { error: result.error });
          sendResponse(200, { ir: result.ir, sidecar: result.sidecar });
        })
        .catch(err => sendResponse(500, { error: safeErrorMessage(err) }));
    }).catch(err => sendResponse(500, { error: safeErrorMessage(err) }));
  });
}

module.exports = { register };
