'use strict';

/**
 * Hub routes: auth (register, login, logout, me), accounts (creators, students, transfer-token, claim, verify-pin).
 * Used by pathfinder.js. Requires ctx: accountsService, adminOnly, withRateLimit, handleJsonBody, extractBearerToken, etc.
 */

function register(router, ctx) {
  const { accountsService, handleJsonBody, extractBearerToken, extractStudentSessionToken, getClientIp, getClientUserAgent,
          adminOnly, withRateLimit, STUDENT_SESSION_TTL_MS } = ctx;

  // P2-12: Device ID trust — session identity for integrity watermark check.
  // Returns pseudoId when student session is valid. Used by integrity.js to verify
  // OLS_INTENDED_OWNER matches authenticated identity (not URL-controlled).
  router.get('/api/session/identity', (req, res, { sendResponse }) => {
    const token = extractStudentSessionToken(req);
    if (!token) return sendResponse(401, { error: 'No session' });
    return accountsService.validateStudentSession(token, { clientIp: getClientIp(req), userAgent: getClientUserAgent(req) })
      .then(function (session) {
        if (!session || !session.pseudoId) return sendResponse(401, { error: 'Invalid session' });
        return sendResponse(200, { pseudoId: session.pseudoId });
      })
      .catch(function () { return sendResponse(401, { error: 'Invalid session' }); });
  });

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
      if (result.error) {
        const code = /maxStudents/.test(result.error) ? 403 : 400;
        return sendResponse(code, result);
      }
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
      if (result.error) {
        const code = /maxStudents/.test(result.error) ? 403 : 400;
        return sendResponse(code, result);
      }
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
      const result = await accountsService.claimTransferToken(payload.token, { clientIp: getClientIp(req), userAgent: getClientUserAgent(req) });
      if (result.error) return sendResponse(400, result);
      if (result.sessionToken) {
        const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
        const maxAge = Math.floor((STUDENT_SESSION_TTL_MS || 21600000) / 1000);
        res.setHeader('Set-Cookie', 'agni_student_session=' + result.sessionToken + '; HttpOnly; Path=/; Max-Age=' + maxAge + '; SameSite=Lax' + secure);
      }
      return sendResponse(200, result);
    });
  }));

  router.post('/api/accounts/student/verify-pin', withRateLimit('pin', (req, res, { sendResponse }) => {
    handleJsonBody(req, sendResponse, async (payload) => {
      if (!payload.pseudoId) return sendResponse(400, { error: 'pseudoId required' });
      const result = await accountsService.verifyStudentPin(payload.pseudoId, payload.pin, { clientIp: getClientIp(req), userAgent: getClientUserAgent(req) });
      if (result.error) return sendResponse(404, result);
      if (result.sessionToken) {
        const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
        const maxAge = Math.floor((STUDENT_SESSION_TTL_MS || 21600000) / 1000);
        res.setHeader('Set-Cookie', 'agni_student_session=' + result.sessionToken + '; HttpOnly; Path=/; Max-Age=' + maxAge + '; SameSite=Lax' + secure);
      }
      return sendResponse(200, result);
    });
  }));
}

module.exports = { register };
