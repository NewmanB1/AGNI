'use strict';

function register(router, ctx) {
  const { governanceService, loadJSONAsync, loadLessonIndexAsync, loadMasterySummaryAsync,
          handleJsonBody, adminOnly, thetaCache, DATA_DIR, path } = ctx;

  router.get('/api/governance/report', async (req, res, { sendResponse }) => {
    const lessonIndex = await loadLessonIndexAsync();
    const masterySummary = await loadMasterySummaryAsync();
    const report = governanceService.aggregateCohortCoverage(lessonIndex, masterySummary);
    return sendResponse(200, report);
  });

  router.get('/api/governance/policy', (req, res, { sendResponse }) => {
    const policy = governanceService.loadPolicy();
    return sendResponse(200, policy || {});
  });

  router.get('/api/governance/utu-constants', async (req, res, { sendResponse }) => {
    const utuPath = path.join(DATA_DIR, 'utu-constants.json');
    const utu = await loadJSONAsync(utuPath, { protocols: [], spineIds: [], spines: {}, bands: [] });
    return sendResponse(200, utu);
  });

  router.post('/api/governance/compliance', (req, res, { sendResponse }) => {
    handleJsonBody(req, sendResponse, (sidecar) => {
      const policy = governanceService.loadPolicy();
      const result = governanceService.evaluateLessonCompliance(sidecar, policy);
      sendResponse(200, result);
    });
  });

  router.put('/api/governance/policy', adminOnly((req, res, { sendResponse }) => {
    handleJsonBody(req, sendResponse, (policy) => {
      const result = governanceService.savePolicy(policy);
      if (result.ok) sendResponse(200, { ok: true });
      else sendResponse(400, { error: result.error });
    });
  }));

  router.get('/api/governance/catalog', (req, res, { sendResponse }) => {
    const catalog = governanceService.loadCatalog();
    return sendResponse(200, catalog || { lessonIds: [] });
  });

  router.post('/api/governance/catalog', adminOnly((req, res, { sendResponse }) => {
    handleJsonBody(req, sendResponse, (payload) => {
      const result = governanceService.updateCatalog(payload);
      if (result.ok) {
        thetaCache.clear();
        sendResponse(200, { ok: true, catalog: result.catalog });
      } else {
        sendResponse(400, { error: result.error });
      }
    });
  }));

  router.post('/api/governance/catalog/import', adminOnly((req, res, { sendResponse }) => {
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
  }));
}

module.exports = { register };
