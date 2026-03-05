'use strict';

const { withLock } = require('../../../src/utils/file-lock');

var INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function isInviteExpired(invite) {
  if (!invite.createdAt) return true;
  return Date.now() - new Date(invite.createdAt).getTime() > INVITE_TTL_MS;
}

function register(router, ctx) {
  const { loadMasterySummaryAsync, loadOverridesAsync, loadParentLinksAsync, saveParentLinksAsync,
          generateInviteCode, handleJsonBody, adminOnly, withRateLimit, requireHubKey,
          PARENT_LINKS_PATH } = ctx;

  router.post('/api/parent/invite', adminOnly((req, res, { sendResponse }) => {
    handleJsonBody(req, sendResponse, async (payload) => {
      const pseudoId = payload.pseudoId && String(payload.pseudoId);
      if (!pseudoId) return sendResponse(400, { error: 'pseudoId required' });
      const mastery = await loadMasterySummaryAsync();
      if (!mastery.students || !mastery.students[pseudoId]) {
        return sendResponse(404, { error: 'Student not found', pseudoId });
      }
      const result = await withLock(PARENT_LINKS_PATH, async () => {
        const data = await loadParentLinksAsync();
        const existing = data.invites.find(inv => inv.pseudoId === pseudoId && !inv.used && !isInviteExpired(inv));
        if (existing) {
          return { code: existing.code, pseudoId, existing: true, status: 200 };
        }
        const code = generateInviteCode();
        data.invites.push({ code, pseudoId, createdAt: new Date().toISOString(), used: false });
        await saveParentLinksAsync(data);
        return { code, pseudoId, existing: false, status: 201 };
      });
      return sendResponse(result.status, { code: result.code, pseudoId: result.pseudoId, existing: result.existing });
    });
  }));

  router.post('/api/parent/link', requireHubKey(withRateLimit('parent-link', (req, res, { sendResponse }) => {
    handleJsonBody(req, sendResponse, async (payload) => {
      const code = payload.code && String(payload.code).trim().toUpperCase();
      const parentId = payload.parentId && String(payload.parentId).trim();
      if (!code) return sendResponse(400, { error: 'code required' });
      if (!parentId) return sendResponse(400, { error: 'parentId required' });
      const result = await withLock(PARENT_LINKS_PATH, async () => {
        const data = await loadParentLinksAsync();
        const invite = data.invites.find(inv => inv.code === code && !inv.used && !isInviteExpired(inv));
        if (!invite) return { error: 'Invalid or expired invite code', status: 404 };
        const alreadyLinked = data.links.find(l => l.parentId === parentId && l.pseudoId === invite.pseudoId);
        if (alreadyLinked) {
          return { ok: true, pseudoId: invite.pseudoId, alreadyLinked: true, status: 200 };
        }
        invite.used = true;
        invite.usedAt = new Date().toISOString();
        invite.usedBy = parentId;
        data.links.push({ parentId, pseudoId: invite.pseudoId, linkedAt: new Date().toISOString() });
        await saveParentLinksAsync(data);
        return { ok: true, pseudoId: invite.pseudoId, alreadyLinked: false, status: 201 };
      });
      if (result.error) return sendResponse(result.status, { error: result.error });
      return sendResponse(result.status, { ok: true, pseudoId: result.pseudoId, alreadyLinked: result.alreadyLinked });
    });
  })));

  router.get('/api/parent/child/:pseudoId/progress', requireHubKey(withRateLimit('parent-read', async (req, res, { params, qs, sendResponse }) => {
    const pseudoId = params.pseudoId;
    const parentId = qs.parentId;
    if (!parentId) return sendResponse(400, { error: 'parentId query param required' });
    const data = await loadParentLinksAsync();
    const link = data.links.find(l => l.parentId === parentId && l.pseudoId === pseudoId);
    if (!link) return sendResponse(403, { error: 'Not linked to this student' });
    const mastery = await loadMasterySummaryAsync();
    const studentMastery = mastery.students?.[pseudoId] || {};
    const lessons = await ctx.getLessonsSortedByTheta(pseudoId);
    const overrides = await loadOverridesAsync();
    const override = overrides[pseudoId]?.lessonId || null;
    const completedCount = Object.values(studentMastery).filter(v => typeof v === 'number' && v >= 1.0).length;
    const totalSkills = Object.keys(studentMastery).length;
    return sendResponse(200, {
      pseudoId, linkedAt: link.linkedAt, mastery: studentMastery,
      completedSkills: completedCount, totalSkills,
      recommendedLessons: lessons.slice(0, 5), currentOverride: override
    });
  })));

  router.get('/api/parent/children', requireHubKey(withRateLimit('parent-read', async (req, res, { qs, sendResponse }) => {
    const parentId = qs.parentId;
    if (!parentId) return sendResponse(400, { error: 'parentId query param required' });
    const data = await loadParentLinksAsync();
    const children = data.links
      .filter(l => l.parentId === parentId)
      .map(l => ({ pseudoId: l.pseudoId, linkedAt: l.linkedAt }));
    return sendResponse(200, { parentId, children });
  })));
}

module.exports = { register };
