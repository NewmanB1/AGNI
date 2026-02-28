'use strict';

function register(router, ctx) {
  const { accountsService, handleJsonBody, extractBearerToken, safeErrorMessage,
          checkAuthRateLimit, requireAdmin } = ctx;

  router.post('/api/auth/register', (req, res, { sendResponse }) => {
    const clientIp = req.socket.remoteAddress || 'unknown';
    if (checkAuthRateLimit('register:' + clientIp, sendResponse)) return;
    handleJsonBody(req, sendResponse, async (payload) => {
      try {
        const result = await accountsService.registerCreator(payload);
        if (result.error) return sendResponse(400, result);
        return sendResponse(201, result);
      } catch (e) { return sendResponse(500, { error: safeErrorMessage(e) }); }
    });
  });

  router.post('/api/auth/login', (req, res, { sendResponse }) => {
    const clientIp = req.socket.remoteAddress || 'unknown';
    if (checkAuthRateLimit('login:' + clientIp, sendResponse)) return;
    handleJsonBody(req, sendResponse, async (payload) => {
      try {
        const result = await accountsService.loginCreator(payload);
        if (result.error) return sendResponse(401, result);
        return sendResponse(200, result);
      } catch (e) { return sendResponse(500, { error: safeErrorMessage(e) }); }
    });
  });

  router.get('/api/auth/me', (req, res, { qs, sendResponse }) => {
    const creator = accountsService.validateSession(extractBearerToken(req, qs));
    if (!creator) return sendResponse(401, { error: 'Not authenticated' });
    return sendResponse(200, { creator });
  });

  router.post('/api/auth/logout', (req, res, { qs, sendResponse }) => {
    accountsService.destroySession(extractBearerToken(req, qs));
    return sendResponse(200, { ok: true });
  });

  router.get('/api/accounts/creators', (req, res, { qs, sendResponse }) => {
    if (!requireAdmin(req, qs, sendResponse)) return;
    return sendResponse(200, { creators: accountsService.listCreators() });
  });

  router.put('/api/accounts/creator/approve', (req, res, { qs, sendResponse }) => {
    if (!requireAdmin(req, qs, sendResponse)) return;
    handleJsonBody(req, sendResponse, (payload) => {
      const result = accountsService.setCreatorApproval(payload.creatorId, payload.approved);
      if (result.error) return sendResponse(404, result);
      return sendResponse(200, result);
    });
  });

  router.post('/api/accounts/student', (req, res, { qs, sendResponse }) => {
    const creator = requireAdmin(req, qs, sendResponse);
    if (!creator) return;
    handleJsonBody(req, sendResponse, async (payload) => {
      const result = await accountsService.createStudent({
        displayName: payload.displayName,
        pin: payload.pin,
        createdBy: creator.id
      });
      return sendResponse(201, result);
    });
  });

  router.post('/api/accounts/students/bulk', (req, res, { qs, sendResponse }) => {
    const creator = requireAdmin(req, qs, sendResponse);
    if (!creator) return;
    handleJsonBody(req, sendResponse, async (payload) => {
      const result = await accountsService.createStudentsBulk({
        names: payload.names,
        pin: payload.pin,
        createdBy: creator.id
      });
      if (result.error) return sendResponse(400, result);
      return sendResponse(201, result);
    });
  });

  router.get('/api/accounts/students', (req, res, { qs, sendResponse }) => {
    if (!requireAdmin(req, qs, sendResponse)) return;
    const page = ctx.paginate(accountsService.listStudents(), qs);
    return sendResponse(200, { students: page.items, total: page.total, limit: page.limit, offset: page.offset });
  });

  router.put('/api/accounts/student', (req, res, { qs, sendResponse }) => {
    if (!requireAdmin(req, qs, sendResponse)) return;
    handleJsonBody(req, sendResponse, async (payload) => {
      if (!payload.pseudoId) return sendResponse(400, { error: 'pseudoId required' });
      const result = await accountsService.updateStudent(payload.pseudoId, payload);
      if (result.error) return sendResponse(404, result);
      return sendResponse(200, result);
    });
  });

  router.post('/api/accounts/student/transfer-token', (req, res, { sendResponse }) => {
    handleJsonBody(req, sendResponse, (payload) => {
      if (!payload.pseudoId) return sendResponse(400, { error: 'pseudoId required' });
      const result = accountsService.generateTransferToken(payload.pseudoId);
      if (result.error) return sendResponse(404, result);
      return sendResponse(200, result);
    });
  });

  router.post('/api/accounts/student/claim', (req, res, { sendResponse }) => {
    handleJsonBody(req, sendResponse, (payload) => {
      if (!payload.token) return sendResponse(400, { error: 'token required' });
      const result = accountsService.claimTransferToken(payload.token);
      if (result.error) return sendResponse(400, result);
      return sendResponse(200, result);
    });
  });

  router.post('/api/accounts/student/verify-pin', (req, res, { sendResponse }) => {
    handleJsonBody(req, sendResponse, async (payload) => {
      if (!payload.pseudoId) return sendResponse(400, { error: 'pseudoId required' });
      const result = await accountsService.verifyStudentPin(payload.pseudoId, payload.pin);
      if (result.error) return sendResponse(404, result);
      return sendResponse(200, result);
    });
  });
}

module.exports = { register };
