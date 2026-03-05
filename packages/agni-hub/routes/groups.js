'use strict';

const { withLock } = require('@agni/utils/file-lock');

function register(router, ctx) {
  const { loadGroupsAsync, saveGroupsAsync, generateGroupId, loadOverridesAsync, saveOverridesAsync,
          handleJsonBody, adminOnly, GROUPS_PATH, OVERRIDES_PATH } = ctx;

  router.get('/api/groups', adminOnly(async (req, res, { sendResponse }) => {
    return sendResponse(200, await loadGroupsAsync());
  }));

  router.post('/api/groups', adminOnly((req, res, { sendResponse }) => {
    handleJsonBody(req, sendResponse, async (payload) => {
      const name = payload.name && String(payload.name).trim();
      if (!name) return sendResponse(400, { error: 'name required' });
      const studentIds = Array.isArray(payload.studentIds) ? payload.studentIds.filter(s => typeof s === 'string') : [];
      const result = await withLock(GROUPS_PATH, async () => {
        const data = await loadGroupsAsync();
        const id = generateGroupId();
        const group = { id, name, studentIds };
        data.groups.push(group);
        await saveGroupsAsync(data);
        return group;
      });
      return sendResponse(201, { ok: true, group: result });
    });
  }));

  router.put('/api/groups', adminOnly((req, res, { sendResponse }) => {
    handleJsonBody(req, sendResponse, async (payload) => {
      const id = payload.id && String(payload.id);
      if (!id) return sendResponse(400, { error: 'id required' });
      const result = await withLock(GROUPS_PATH, async () => {
        const data = await loadGroupsAsync();
        const idx = data.groups.findIndex(g => g.id === id);
        if (idx < 0) return { error: 'group not found' };
        const existing = data.groups[idx];
        if (payload.name !== undefined) existing.name = String(payload.name).trim() || existing.name;
        if (payload.studentIds !== undefined) existing.studentIds = Array.isArray(payload.studentIds) ? payload.studentIds.filter(s => typeof s === 'string') : existing.studentIds;
        await saveGroupsAsync(data);
        return { group: existing };
      });
      if (result.error) return sendResponse(404, { error: result.error, id });
      return sendResponse(200, { ok: true, group: result.group });
    });
  }));

  router.post('/api/groups/:id/assign', adminOnly((req, res, { params, sendResponse }) => {
    handleJsonBody(req, sendResponse, async (payload) => {
      const lessonId = payload.lessonId && String(payload.lessonId);
      if (!lessonId) return sendResponse(400, { error: 'lessonId required' });
      const result = await withLock(GROUPS_PATH, async () => {
        const data = await loadGroupsAsync();
        const group = data.groups.find(g => g.id === params.id);
        if (!group) return { error: 'group not found' };
        return { studentIds: group.studentIds || [] };
      });
      if (result.error) return sendResponse(404, { error: result.error, id: params.id });
      const assigned = [];
      const skipped = [];
      await withLock(OVERRIDES_PATH, async () => {
        const overrides = await loadOverridesAsync();
        for (const pseudoId of result.studentIds) {
          const eligible = await ctx.getLessonsSortedByTheta(pseudoId);
          const inList = eligible.some(l => l.lessonId === lessonId);
          if (inList) {
            overrides[pseudoId] = { lessonId };
            assigned.push(pseudoId);
          } else {
            skipped.push(pseudoId);
          }
        }
        await saveOverridesAsync(overrides);
      });
      return sendResponse(200, { ok: true, lessonId, assigned: assigned.length, skipped: skipped.length, assignedIds: assigned, skippedIds: skipped });
    });
  }));
}

module.exports = { register };
