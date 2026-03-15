'use strict';

/**
 * Leaderboard: lessons and creators ranked by approval, effectiveness, and forks.
 * Ribbons: Governance approved, Most forked, High impact (completions), Effective (avg mastery).
 */

function register(router, ctx) {
  const { loadLessonIndexAsync, loadApprovedCatalogAsync, loadLeaderboardMetricsAsync,
          loadTelemetryEventsAsync, authOnly } = ctx;

  router.get('/api/leaderboard', authOnly(async (req, res, { qs, sendResponse: send }) => {
    const limit = Math.min(Math.max(1, parseInt(qs.limit, 10) || 20), 100);
    const section = (qs.section || 'all').toLowerCase(); // all | lessons | creators

    let index = [];
    let catalog = { lessonIds: [], unforkableLessonIds: [] };
    let metrics = { forkCountByLesson: {} };
    let telemetry = { events: [] };

    try {
      index = await loadLessonIndexAsync();
    } catch (e) { index = []; }
    try {
      catalog = await loadApprovedCatalogAsync();
      if (!catalog) catalog = { lessonIds: [], unforkableLessonIds: [] };
    } catch (e) { /* ignore */ }
    try {
      metrics = await loadLeaderboardMetricsAsync();
      if (!metrics.forkCountByLesson) metrics.forkCountByLesson = {};
    } catch (e) { /* ignore */ }
    try {
      telemetry = await loadTelemetryEventsAsync();
      if (!telemetry.events) telemetry.events = [];
    } catch (e) { /* ignore */ }

    const approvedSet = new Set((catalog.lessonIds || []).map(String).filter(Boolean));
    const forkCounts = metrics.forkCountByLesson || {};

    var completionByLesson = {};
    var masterySumByLesson = {};
    var masteryCountByLesson = {};
    (telemetry.events || []).forEach(function (ev) {
      var lid = ev.lessonId && String(ev.lessonId).trim();
      if (!lid) return;
      completionByLesson[lid] = (completionByLesson[lid] || 0) + 1;
      var m = typeof ev.mastery === 'number' && isFinite(ev.mastery) ? Math.max(0, Math.min(1, ev.mastery)) : 0;
      masterySumByLesson[lid] = (masterySumByLesson[lid] || 0) + m;
      masteryCountByLesson[lid] = (masteryCountByLesson[lid] || 0) + 1;
    });

    function avgMastery(lessonId) {
      var sum = masterySumByLesson[lessonId];
      var n = masteryCountByLesson[lessonId];
      if (n === 0 || sum == null) return null;
      return Math.round((sum / n) * 1000) / 1000;
    }

    var lessonRows = index.map(function (ent) {
      var lessonId = ent.lessonId || ent.slug || '';
      var slug = ent.slug || lessonId;
      var approved = approvedSet.has(lessonId) || approvedSet.has(slug);
      var forkCount = forkCounts[slug] || forkCounts[lessonId] || 0;
      var completionCount = completionByLesson[lessonId] || completionByLesson[slug] || 0;
      var avgM = avgMastery(lessonId) || avgMastery(slug);
      var ribbons = [];
      if (approved) ribbons.push({ id: 'governance-approved', label: 'Governance approved', rank: 1 });
      if (forkCount > 0) ribbons.push({ id: 'forked', label: 'Forked', count: forkCount, rank: 2 });
      if (completionCount >= 10) ribbons.push({ id: 'high-impact', label: 'High impact', count: completionCount, rank: 3 });
      if (avgM != null && avgM >= 0.7) ribbons.push({ id: 'effective', label: 'Effective learning', value: avgM, rank: 4 });
      return {
        slug: slug,
        lessonId: lessonId,
        title: ent.title || slug,
        description: ent.description || '',
        creatorId: ent.creatorId || null,
        approved: approved,
        forkCount: forkCount,
        completionCount: completionCount,
        avgMastery: avgM,
        ribbons: ribbons
      };
    });

    var creators = {};
    lessonRows.forEach(function (row) {
      var cid = row.creatorId || '_anonymous';
      if (!creators[cid]) {
        creators[cid] = { creatorId: cid, lessonCount: 0, approvedCount: 0, totalForks: 0, totalCompletions: 0, masterySum: 0, masteryN: 0, ribbons: [] };
      }
      var c = creators[cid];
      c.lessonCount += 1;
      if (row.approved) c.approvedCount += 1;
      c.totalForks += row.forkCount;
      c.totalCompletions += row.completionCount;
      if (row.avgMastery != null) { c.masterySum += row.avgMastery * (row.completionCount || 1); c.masteryN += (row.completionCount || 1); }
    });
    var creatorRows = Object.keys(creators).map(function (cid) {
      var c = creators[cid];
      var avgMasteryCreator = c.masteryN > 0 ? Math.round((c.masterySum / c.masteryN) * 1000) / 1000 : null;
      var ribbons = [];
      if (c.approvedCount > 0) ribbons.push({ id: 'governance-approved', label: 'Governance approved', count: c.approvedCount });
      if (c.totalForks >= 3) ribbons.push({ id: 'often-forked', label: 'Often forked', count: c.totalForks });
      if (c.totalCompletions >= 20) ribbons.push({ id: 'high-impact', label: 'High impact', count: c.totalCompletions });
      if (avgMasteryCreator != null && avgMasteryCreator >= 0.7) ribbons.push({ id: 'effective', label: 'Effective', value: avgMasteryCreator });
      return {
        creatorId: c.creatorId,
        lessonCount: c.lessonCount,
        approvedCount: c.approvedCount,
        totalForks: c.totalForks,
        totalCompletions: c.totalCompletions,
        avgMastery: avgMasteryCreator,
        ribbons: ribbons
      };
    });

    function byForks(a, b) { return (b.forkCount || 0) - (a.forkCount || 0); }
    function byCompletions(a, b) { return (b.completionCount || 0) - (a.completionCount || 0); }
    function byCreatorImpact(a, b) {
      var sa = (a.approvedCount || 0) * 2 + (a.totalForks || 0) + (a.totalCompletions || 0) / 10;
      var sb = (b.approvedCount || 0) * 2 + (b.totalForks || 0) + (b.totalCompletions || 0) / 10;
      return sb - sa;
    }

    var topLessons = lessonRows
      .filter(function (r) { return r.approved || r.forkCount > 0 || r.completionCount > 0 || (r.avgMastery != null && r.avgMastery >= 0.6); })
      .sort(function (a, b) { return byForks(a, b) || byCompletions(a, b); })
      .slice(0, limit);

    var topCreators = creatorRows
      .filter(function (r) { return r.creatorId !== '_anonymous' && (r.approvedCount > 0 || r.totalForks > 0 || r.totalCompletions > 0); })
      .sort(byCreatorImpact)
      .slice(0, limit);

    var out = {
      topLessons: section === 'creators' ? [] : topLessons,
      topCreators: section === 'lessons' ? [] : topCreators,
      updatedAt: metrics.updatedAt || null
    };
    return send(200, out);
  }));
}

module.exports = { register };
