'use strict';

function register(router, ctx) {
  const { lessonChain, authorService, handleJsonBody, requireHubKey, DATA_DIR, path } = ctx;

  router.get('/api/chain/:slug', requireHubKey(async (req, res, { params, sendResponse }) => {
    const chain = await lessonChain.loadChain(params.slug);
    return sendResponse(200, chain);
  }));

  router.post('/api/chain/verify', requireHubKey((req, res, { sendResponse }) => {
    handleJsonBody(req, sendResponse, async (payload) => {
      if (!payload.slug) return sendResponse(400, { error: 'slug required' });
      const chainResult = await lessonChain.verifyChain(payload.slug);
      if (payload.lessonData) {
        const contentResult = lessonChain.verifyContentHash(payload.lessonData);
        return sendResponse(200, { chain: chainResult, content: contentResult });
      }
      return sendResponse(200, { chain: chainResult });
    });
  }));

  router.get('/api/fork-check', requireHubKey((req, res, { qs, sendResponse }) => {
    if (!qs.slug) return sendResponse(400, { error: 'slug query param required' });
    const yamlDir = process.env.AGNI_YAML_DIR || path.join(DATA_DIR, 'yaml');
    const loaded = authorService.loadLesson(qs.slug, yamlDir);
    if (loaded.error) return sendResponse(404, { error: loaded.error });
    const meta = loaded.lessonData.meta || loaded.lessonData;
    const license = meta.license || '';
    const permission = lessonChain.checkForkPermission(license);
    const inherited = lessonChain.inheritedForkLicense(license);
    return sendResponse(200, {
      slug: qs.slug, license, ...permission,
      inheritedLicense: inherited,
      sourceUri: meta.uri || null, sourceHash: meta.content_hash || null
    });
  }));
}

module.exports = { register };
