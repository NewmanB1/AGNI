'use strict';

function register(router, ctx) {
  const { loadMasterySummaryAsync, loadOverridesAsync, loadParentLinksAsync, saveParentLinksAsync,
          generateInviteCode, handleJsonBody } = ctx;

  router.post('/api/parent/invite', (req, res, { sendResponse }) => {
    handleJsonBody(req, sendResponse, async (payload) => {
      const pseudoId = payload.pseudoId && String(payload.pseudoId);
      if (!pseudoId) return sendResponse(400, { error: 'pseudoId required' });
      const mastery = await loadMasterySummaryAsync();
      if (!mastery.students || !mastery.students[pseudoId]) {
        return sendResponse(404, { error: 'Student not found', pseudoId });
      }
      const data = await loadParentLinksAsync();
      const existing = data.invites.find(inv => inv.pseudoId === pseudoId && !inv.used);
      if (existing) {
        return sendResponse(200, { code: existing.code, pseudoId, existing: true });
      }
      const code = generateInviteCode();
      data.invites.push({ code, pseudoId, createdAt: new Date().toISOString(), used: false });
      await saveParentLinksAsync(data);
      return sendResponse(201, { code, pseudoId, existing: false });
    });
  });

  router.post('/api/parent/link', (req, res, { sendResponse }) => {
    handleJsonBody(req, sendResponse, async (payload) => {
      const code = payload.code && String(payload.code).trim().toUpperCase();
      const parentId = payload.parentId && String(payload.parentId).trim();
      if (!code) return sendResponse(400, { error: 'code required' });
      if (!parentId) return sendResponse(400, { error: 'parentId required' });
      const data = await loadParentLinksAsync();
      const invite = data.invites.find(inv => inv.code === code && !inv.used);
      if (!invite) return sendResponse(404, { error: 'Invalid or expired invite code' });
      const alreadyLinked = data.links.find(l => l.parentId === parentId && l.pseudoId === invite.pseudoId);
      if (alreadyLinked) {
        return sendResponse(200, { ok: true, pseudoId: invite.pseudoId, alreadyLinked: true });
      }
      invite.used = true;
      invite.usedAt = new Date().toISOString();
      invite.usedBy = parentId;
      data.links.push({ parentId, pseudoId: invite.pseudoId, linkedAt: new Date().toISOString() });
      await saveParentLinksAsync(data);
      return sendResponse(201, { ok: true, pseudoId: invite.pseudoId, alreadyLinked: false });
    });
  });

  router.get('/api/parent/child/:pseudoId/progress', async (req, res, { params, qs, sendResponse }) => {
    const pseudoId = params.pseudoId;
    const parentId = qs.parentId;
    if (!parentId) return sendResponse(400, { error: 'parentId query param required' });
    const data = await loadParentLinksAsync();
    const link = data.links.find(l => l.parentId === parentId && l.pseudoId === pseudoId);
    if (!link) return sendResponse(403, { error: 'Not linked to this student' });
    const mastery = await loadMasterySummaryAsync();
    const studentMastery = mastery.students?.[pseudoId] || {};
    const lessons = ctx.getLessonsSortedByTheta(pseudoId);
    const overrides = await loadOverridesAsync();
    const override = overrides[pseudoId]?.lessonId || null;
    const completedCount = Object.values(studentMastery).filter(v => typeof v === 'number' && v >= 1.0).length;
    const totalSkills = Object.keys(studentMastery).length;
    return sendResponse(200, {
      pseudoId, linkedAt: link.linkedAt, mastery: studentMastery,
      completedSkills: completedCount, totalSkills,
      recommendedLessons: lessons.slice(0, 5), currentOverride: override
    });
  });

  router.get('/api/parent/children', async (req, res, { qs, sendResponse }) => {
    const parentId = qs.parentId;
    if (!parentId) return sendResponse(400, { error: 'parentId query param required' });
    const data = await loadParentLinksAsync();
    const children = data.links
      .filter(l => l.parentId === parentId)
      .map(l => ({ pseudoId: l.pseudoId, linkedAt: l.linkedAt }));
    return sendResponse(200, { parentId, children });
  });
}

module.exports = { register };
