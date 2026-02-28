'use strict';

function register(router, ctx) {
  const { lmsService: lmsEngine, safeErrorMessage, handleJsonBody } = ctx;

  router.get('/api/lms/select', (req, res, { qs, sendResponse }) => {
    if (!lmsEngine.isAvailable || !lmsEngine.isAvailable()) {
      return sendResponse(503, { error: 'LMS engine not available' });
    }
    if (!qs.pseudoId) return sendResponse(400, { error: 'pseudoId required' });
    const candidates = qs.candidates
      ? qs.candidates.split(',').map(s => s.trim()).filter(Boolean)
      : [];
    if (candidates.length === 0) return sendResponse(400, { error: 'candidates required' });
    try {
      const selected = lmsEngine.selectBestLesson(qs.pseudoId, candidates);
      const ability  = lmsEngine.getStudentAbility(qs.pseudoId);
      return sendResponse(200, {
        pseudoId:   qs.pseudoId,
        selected:   selected,
        ability:    ability,
        candidates: candidates.length
      });
    } catch (err) {
      return sendResponse(500, { error: safeErrorMessage(err) });
    }
  });

  router.post('/api/lms/observation', (req, res, { sendResponse }) => {
    if (!lmsEngine.isAvailable || !lmsEngine.isAvailable()) {
      return sendResponse(503, { error: 'LMS engine not available' });
    }
    handleJsonBody(req, sendResponse, (payload) => {
      if (!payload.studentId || !payload.lessonId || !Array.isArray(payload.probeResults)) {
        return sendResponse(400, { error: 'studentId, lessonId, probeResults required' });
      }
      lmsEngine.recordObservation(payload.studentId, payload.lessonId, payload.probeResults);
      sendResponse(200, { ok: true });
    });
  });

  router.get('/api/lms/status', (req, res, { sendResponse }) => {
    if (!lmsEngine.isAvailable || !lmsEngine.isAvailable()) {
      return sendResponse(503, { error: 'LMS engine not available' });
    }
    return sendResponse(200, lmsEngine.getStatus());
  });

  router.post('/api/lms/federation/merge', (req, res, { sendResponse }) => {
    if (!lmsEngine.isAvailable || !lmsEngine.isAvailable()) {
      return sendResponse(503, { error: 'LMS engine not available' });
    }
    handleJsonBody(req, sendResponse, (remote) => {
      if (!remote.mean || !remote.precision || typeof remote.sampleSize !== 'number') {
        return sendResponse(400, { error: 'mean, precision, sampleSize required' });
      }
      lmsEngine.mergeRemoteSummary(remote);
      sendResponse(200, { ok: true, status: lmsEngine.getStatus() });
    });
  });

  router.get('/api/lms/transitions', (req, res, { qs, sendResponse }) => {
    if (!lmsEngine.isAvailable || !lmsEngine.isAvailable()) {
      return sendResponse(503, { error: 'LMS engine not available' });
    }
    try {
      const table = lmsEngine.exportTransitionTable();
      const history = qs.pseudoId
        ? lmsEngine.getStudentLessonHistory(qs.pseudoId)
        : [];
      return sendResponse(200, { transitionTable: table, recentLessons: history });
    } catch (err) {
      return sendResponse(500, { error: safeErrorMessage(err) });
    }
  });

  router.get('/api/lms/bottlenecks', (req, res, { qs, sendResponse }) => {
    if (!lmsEngine.isAvailable || !lmsEngine.isAvailable()) {
      return sendResponse(503, { error: 'LMS engine not available' });
    }
    try {
      const topK = parseInt(qs.topK || '10', 10);
      const minSample = parseInt(qs.minSample || '5', 10);
      return sendResponse(200, {
        flowBottlenecks: lmsEngine.getFlowBottlenecks(topK),
        dropoutBottlenecks: lmsEngine.getDropoutBottlenecks(minSample)
      });
    } catch (err) {
      return sendResponse(500, { error: safeErrorMessage(err) });
    }
  });
}

module.exports = { register };
