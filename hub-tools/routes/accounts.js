'use strict';

function register(router, ctx) {
  const { accountsService, handleJsonBody, extractBearerToken,
          adminOnly, withRateLimit } = ctx;

  router.post('/api/auth/register', withRateLimit('register', (req, res, { sendResponse }) => {
    handleJsonBody(req, sendResponse, async (payload) => {
      const result = await accountsService.registerCreator(payload);
      if (result.error) return sendResponse(400, result);
      return sendResponse(201, result);
    });
  }));

  router.post('/api/auth/login', withRateLimit('login', (req, res, { sendResponse }) => {
    handleJsonBody(req, sendResponse, async (payload) => {
      const result = await accountsService.loginCreator(payload);
      if (result.error) return sendResponse(401, result);
      return sendResponse(200, result);
    });
  }));

  router.get('/api/auth/me', async (req, res, { qs, sendResponse }) => {
    const creator = await accountsService.validateSession(extractBearerToken(req, qs));
    if (!creator) return sendResponse(401, { error: 'Not authenticated' });
    return sendResponse(200, { creator });
  });

  router.post('/api/auth/logout', async (req, res, { qs, sendResponse }) => {
    await accountsService.destroySession(extractBearerToken(req, qs));
    return sendResponse(200, { ok: true });
  });

  router.get('/api/accounts/creators', adminOnly((req, res, { sendResponse }) => {
    return accountsService.listCreators().then(list => sendResponse(200, { creators: list }));
  }));

  router.put('/api/accounts/creator/approve', adminOnly((req, res, { sendResponse }) => {
    handleJsonBody(req, sendResponse, async (payload) => {
      const result = await accountsService.setCreatorApproval(payload.creatorId, payload.approved);
      if (result.error) return sendResponse(404, result);
      return sendResponse(200, result);
    });
  }));

  router.post('/api/accounts/student', adminOnly((req, res, { sendResponse, creator }) => {
    handleJsonBody(req, sendResponse, async (payload) => {
      const result = await accountsService.createStudent({
        displayName: payload.displayName,
        pin: payload.pin,
        createdBy: creator.id
      });
      return sendResponse(201, result);
    });
  }));

  router.post('/api/accounts/students/bulk', adminOnly((req, res, { sendResponse, creator }) => {
    handleJsonBody(req, sendResponse, async (payload) => {
      const result = await accountsService.createStudentsBulk({
        names: payload.names,
        pin: payload.pin,
        createdBy: creator.id
      });
      if (result.error) return sendResponse(400, result);
      return sendResponse(201, result);
    });
  }));

  router.get('/api/accounts/students', adminOnly(async (req, res, { qs, sendResponse }) => {
    const page = ctx.paginate(await accountsService.listStudents(), qs);
    return sendResponse(200, { students: page.items, total: page.total, limit: page.limit, offset: page.offset });
  }));

  router.put('/api/accounts/student', adminOnly((req, res, { sendResponse }) => {
    handleJsonBody(req, sendResponse, async (payload) => {
      if (!payload.pseudoId) return sendResponse(400, { error: 'pseudoId required' });
      const result = await accountsService.updateStudent(payload.pseudoId, payload);
      if (result.error) return sendResponse(404, result);
      return sendResponse(200, result);
    });
  }));

  router.post('/api/accounts/student/transfer-token', adminOnly((req, res, { sendResponse }) => {
    handleJsonBody(req, sendResponse, async (payload) => {
      if (!payload.pseudoId) return sendResponse(400, { error: 'pseudoId required' });
      const result = await accountsService.generateTransferToken(payload.pseudoId);
      if (result.error) return sendResponse(404, result);
      return sendResponse(200, result);
    });
  }));

  router.post('/api/accounts/student/claim', withRateLimit('claim', (req, res, { sendResponse }) => {
    handleJsonBody(req, sendResponse, async (payload) => {
      if (!payload.token) return sendResponse(400, { error: 'token required' });
      const result = await accountsService.claimTransferToken(payload.token);
      if (result.error) return sendResponse(400, result);
      return sendResponse(200, result);
    });
  }));

  router.post('/api/accounts/student/verify-pin', withRateLimit('pin', (req, res, { sendResponse }) => {
    handleJsonBody(req, sendResponse, async (payload) => {
      if (!payload.pseudoId) return sendResponse(400, { error: 'pseudoId required' });
      const result = await accountsService.verifyStudentPin(payload.pseudoId, payload.pin);
      if (result.error) return sendResponse(404, result);
      return sendResponse(200, result);
    });
  }));
}

module.exports = { register };
