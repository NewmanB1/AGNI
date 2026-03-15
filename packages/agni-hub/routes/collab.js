'use strict';

const { withLock } = require('@agni/utils/file-lock');
const collabSessions = require('../collab-sessions');

function register(router, ctx) {
  const { loadJSONAsync, saveJSONAsync, loadLessonIndexAsync,
          handleJsonBody, requireHubKey, requireParam, adminOnly, authOnly,
          getCollabOpportunities, COLLAB_SESSIONS_PATH } = ctx;

  router.get('/api/collab/opportunities', requireHubKey(async (req, res, { qs, sendResponse }) => {
    const pseudoId = requireParam(qs, 'pseudoId', sendResponse);
    if (!pseudoId) return;
    const opportunities = await getCollabOpportunities(pseudoId);
    return sendResponse(200, { opportunities });
  }));

  router.post('/api/collab/seek', requireHubKey((req, res, { sendResponse }) => {
    handleJsonBody(req, sendResponse, async (payload) => {
      const pseudoId = payload.pseudoId && String(payload.pseudoId).trim();
      const lessonId = payload.lessonId && String(payload.lessonId).trim();
      if (!pseudoId) return sendResponse(400, { error: 'pseudoId required' });
      if (!lessonId) return sendResponse(400, { error: 'lessonId required' });

      const result = await withLock(COLLAB_SESSIONS_PATH, async () => {
        const state = await collabSessions.loadState(loadJSONAsync, COLLAB_SESSIONS_PATH);
        const out = collabSessions.addSeek(state, pseudoId, lessonId);
        await saveJSONAsync(COLLAB_SESSIONS_PATH, state);
        return out;
      });
      return sendResponse(200, result);
    });
  }));

  router.get('/api/collab/status', requireHubKey(async (req, res, { qs, sendResponse }) => {
    const pseudoId = requireParam(qs, 'pseudoId', sendResponse);
    if (!pseudoId) return;

    const state = await collabSessions.loadState(loadJSONAsync, COLLAB_SESSIONS_PATH);
    const status = collabSessions.getSeekStatus(state, pseudoId);
    return sendResponse(200, status);
  }));

  router.post('/api/collab/cancel-seek', requireHubKey((req, res, { sendResponse }) => {
    handleJsonBody(req, sendResponse, async (payload) => {
      const pseudoId = payload.pseudoId && String(payload.pseudoId).trim();
      if (!pseudoId) return sendResponse(400, { error: 'pseudoId required' });

      await withLock(COLLAB_SESSIONS_PATH, async () => {
        const state = await collabSessions.loadState(loadJSONAsync, COLLAB_SESSIONS_PATH);
        collabSessions.cancelSeek(state, pseudoId);
        await saveJSONAsync(COLLAB_SESSIONS_PATH, state);
      });
      return sendResponse(200, { ok: true });
    });
  }));

  router.get('/api/collab/sessions', authOnly(async (req, res, { sendResponse }) => {
    const state = await collabSessions.loadState(loadJSONAsync, COLLAB_SESSIONS_PATH);
    const sessions = collabSessions.listSessions(state);
    const index = await loadLessonIndexAsync();
    const enriched = sessions.map(function (s) {
      const lesson = index.find(function (l) {
        return (l.lessonId === s.lessonId || l.identifier === s.lessonId || l.slug === s.lessonId);
      });
      return {
        id: s.id,
        lessonId: s.lessonId,
        lessonTitle: lesson ? (lesson.title || lesson.slug || s.lessonId) : s.lessonId,
        pseudoIds: s.pseudoIds || [],
        status: s.status,
        createdAt: s.createdAt
      };
    });
    return sendResponse(200, { sessions: enriched });
  }));

  router.post('/api/collab/sessions/:id/deny', adminOnly(async (req, res, { params, sendResponse }) => {
    const sessionId = params && params.id;
    if (!sessionId) return sendResponse(400, { error: 'session id required' });

    let ok = false;
    await withLock(COLLAB_SESSIONS_PATH, async () => {
      const state = await collabSessions.loadState(loadJSONAsync, COLLAB_SESSIONS_PATH);
      ok = collabSessions.denySession(state, sessionId);
      if (ok) await saveJSONAsync(COLLAB_SESSIONS_PATH, state);
    });
    if (!ok) return sendResponse(404, { error: 'Session not found or already denied' });
    return sendResponse(200, { ok: true });
  }));
}

module.exports = { register };
