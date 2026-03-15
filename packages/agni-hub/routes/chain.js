'use strict';

const envConfig = require('@agni/utils/env-config');

function register(router, ctx) {
  const { lessonChain, authorService, handleJsonBody, requireHubKey, loadApprovedCatalogAsync } = ctx;

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

  router.get('/api/fork-check', requireHubKey(async (req, res, { qs, sendResponse }) => {
    if (!qs.slug) return sendResponse(400, { error: 'slug query param required' });
    const yamlDir = envConfig.yamlDir;
    const loaded = authorService.loadLesson(qs.slug, yamlDir);
    if (loaded.error) return sendResponse(404, { error: loaded.error });
    const meta = loaded.lessonData.meta || loaded.lessonData;
    const license = meta.license || '';
    const permission = lessonChain.checkForkPermission(license);
    const inherited = lessonChain.inheritedForkLicense(license);
    const identifier = meta.identifier || loaded.lessonData.id || qs.slug;
    let forkAllowed = permission.forkAllowed !== false;
    if (forkAllowed && loadApprovedCatalogAsync) {
      try {
        const catalog = await loadApprovedCatalogAsync();
        const unforkable = (catalog && catalog.unforkableLessonIds) || [];
        if (unforkable.indexOf(identifier) !== -1 || unforkable.indexOf(qs.slug) !== -1) {
          forkAllowed = false;
        }
      } catch (e) { /* ignore */ }
    }
    return sendResponse(200, {
      slug: qs.slug,
      license,
      forkAllowed,
      ...permission,
      inheritedLicense: inherited,
      sourceUri: meta.uri || null,
      sourceHash: meta.content_hash || null
    });
  }));
}

module.exports = { register };
