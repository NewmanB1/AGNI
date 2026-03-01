'use strict';

function register(router, ctx) {
  const { loadJSONAsync, saveJSONAsync, loadLessonIndexAsync, loadMasterySummaryAsync,
          loadTelemetryEventsAsync, getStudentSkills, requireParam,
          computeStreaks, collectReviewDates, handleJsonBody, requireHubKey, adminOnly,
          lmsService: lmsEngine, path, fs,
          DATA_DIR, REVIEW_SCHEDULE_PATH, LEARNING_PATHS_PATH, CHECKPOINTS_DIR,
          MASTERY_SUMMARY, MASTERY_THRESHOLD } = ctx;

  // ── Checkpoint sync endpoints ────────────────────────────────────────────

  router.post('/api/checkpoint', requireHubKey((req, res, { sendResponse }) => {
    handleJsonBody(req, sendResponse, async (payload) => {
      const pseudoId = payload.pseudoId;
      const lessonId = payload.lessonId;
      if (!pseudoId || typeof pseudoId !== 'string') return sendResponse(400, { error: 'pseudoId required' });
      if (!lessonId || typeof lessonId !== 'string') return sendResponse(400, { error: 'lessonId required' });
      if (typeof payload.stepIndex !== 'number') return sendResponse(400, { error: 'stepIndex required' });

      const safePseudoId = pseudoId.replace(/[^a-zA-Z0-9_-]/g, '_');
      const studentDir = path.join(CHECKPOINTS_DIR, safePseudoId);
      const resolvedDir = path.resolve(studentDir);
      if (!resolvedDir.startsWith(path.resolve(CHECKPOINTS_DIR))) {
        return sendResponse(400, { error: 'Invalid pseudoId' });
      }
      if (!fs.existsSync(resolvedDir)) fs.mkdirSync(resolvedDir, { recursive: true });

      const filePath = path.join(resolvedDir, lessonId.replace(/[^a-zA-Z0-9_-]/g, '_') + '.json');
      const existing = await loadJSONAsync(filePath, null);
      if (existing && existing.savedAt && payload.savedAt && payload.savedAt <= existing.savedAt) {
        return sendResponse(200, { ok: true, skipped: true });
      }

      const checkpoint = {
        version:      payload.version || 1,
        stepIndex:    payload.stepIndex,
        stepId:       payload.stepId || null,
        stepOutcomes: payload.stepOutcomes || [],
        probeResults: payload.probeResults || [],
        savedAt:      payload.savedAt || Date.now()
      };
      await saveJSONAsync(filePath, checkpoint);
      return sendResponse(200, { ok: true });
    });
  }));

  router.get('/api/checkpoint', requireHubKey(async (req, res, { qs, sendResponse }) => {
    const pseudoId = requireParam(qs, 'pseudoId', sendResponse);
    if (!pseudoId) return;
    const lessonId = requireParam(qs, 'lessonId', sendResponse);
    if (!lessonId) return;

    const safePseudoId = pseudoId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = path.join(CHECKPOINTS_DIR, safePseudoId, lessonId.replace(/[^a-zA-Z0-9_-]/g, '_') + '.json');
    const data = await loadJSONAsync(filePath, null);
    if (!data) return sendResponse(404, { error: 'No checkpoint found' });
    return sendResponse(200, data);
  }));

  router.get('/api/step-analytics', requireHubKey(async (req, res, { qs, sendResponse }) => {
    const lessonId = requireParam(qs, 'lessonId', sendResponse);
    if (!lessonId) return;
    const telData = await loadTelemetryEventsAsync();
    const events = (telData.events || []).filter(e => e.lessonId === lessonId);
    const stepMap = {};
    for (const ev of events) {
      for (const s of (ev.steps || [])) {
        if (!stepMap[s.stepId]) {
          stepMap[s.stepId] = { stepId: s.stepId, type: s.type, weight: s.weight, totalScore: 0, totalDurationMs: 0, totalAttempts: 0, passCount: 0, skipCount: 0, count: 0 };
        }
        const sm = stepMap[s.stepId];
        sm.totalScore += s.score || 0;
        sm.totalDurationMs += s.durationMs || 0;
        sm.totalAttempts += s.attempts || 0;
        sm.passCount += s.passed ? 1 : 0;
        sm.skipCount += s.skipped ? 1 : 0;
        sm.count++;
      }
    }
    const analytics = Object.values(stepMap).map(sm => ({
      stepId: sm.stepId, type: sm.type, weight: sm.weight,
      avgScore: sm.count > 0 ? Math.round((sm.totalScore / sm.count) * 100) / 100 : 0,
      avgDurationMs: sm.count > 0 ? Math.round(sm.totalDurationMs / sm.count) : 0,
      avgAttempts: sm.count > 0 ? Math.round((sm.totalAttempts / sm.count) * 10) / 10 : 0,
      passRate: sm.count > 0 ? Math.round((sm.passCount / sm.count) * 100) : 0,
      skipRate: sm.count > 0 ? Math.round((sm.skipCount / sm.count) * 100) : 0,
      sampleSize: sm.count
    }));
    return sendResponse(200, { lessonId, steps: analytics, totalEvents: events.length });
  }));

  router.get('/api/mastery-history', requireHubKey(async (req, res, { qs, sendResponse }) => {
    const pseudoId = requireParam(qs, 'pseudoId', sendResponse);
    if (!pseudoId) return;
    const telData = await loadTelemetryEventsAsync();
    const events = (telData.events || []).filter(e => e.pseudoId === pseudoId)
      .sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt));
    const snapshots = [];
    let runningMastery = 0;
    let lessonCount = 0;
    const mastered = new Set();
    const index = await loadLessonIndexAsync();
    const totalLessons = index.length || 1;
    for (const ev of events) {
      lessonCount++;
      runningMastery += ev.mastery || 0;
      if ((ev.mastery || 0) >= 0.6) mastered.add(ev.lessonId);
      snapshots.push({
        date: ev.completedAt, lessonId: ev.lessonId, mastery: ev.mastery || 0,
        runningAvgMastery: Math.round((runningMastery / lessonCount) * 100) / 100,
        masteredCount: mastered.size,
        masteryPct: Math.round((mastered.size / totalLessons) * 100)
      });
    }
    return sendResponse(200, { pseudoId, snapshots, totalLessons });
  }));

  router.get('/api/skill-graph', requireHubKey(async (req, res, { qs, sendResponse }) => {
    const index = await loadLessonIndexAsync();
    const pseudoId = qs.pseudoId || '';
    const studentSkills = await getStudentSkills(pseudoId);
    const nodes = new Map();
    const edges = [];
    for (const lesson of index) {
      const ont = lesson.ontology || {};
      const provides = ont.provides || [];
      const requires = ont.requires || [];
      for (const p of provides) {
        if (!nodes.has(p.skill)) nodes.set(p.skill, { id: p.skill, level: p.level || 1, mastery: studentSkills[p.skill] || 0, lessonIds: [] });
        nodes.get(p.skill).lessonIds.push(lesson.identifier || lesson.slug);
      }
      for (const r of requires) {
        if (!nodes.has(r.skill)) nodes.set(r.skill, { id: r.skill, level: r.level || 1, mastery: studentSkills[r.skill] || 0, lessonIds: [] });
        for (const p of provides) {
          edges.push({ from: r.skill, to: p.skill, lessonId: lesson.identifier || lesson.slug });
        }
      }
    }
    return sendResponse(200, { nodes: [...nodes.values()], edges, totalSkills: nodes.size });
  }));

  router.get('/api/reviews', requireHubKey(async (req, res, { qs, sendResponse }) => {
    const pseudoId = requireParam(qs, 'pseudoId', sendResponse);
    if (!pseudoId) return;
    const schedule = await loadJSONAsync(REVIEW_SCHEDULE_PATH, { students: {} });
    const studentReviews = schedule.students[pseudoId] || {};
    const now = Date.now();
    const due = [];
    const upcoming = [];
    for (const lessonId of Object.keys(studentReviews)) {
      const entry = studentReviews[lessonId];
      if (entry.nextReviewAt <= now) due.push({ lessonId, ...entry, overdue: true });
      else upcoming.push({ lessonId, ...entry, overdue: false });
    }
    due.sort((a, b) => a.nextReviewAt - b.nextReviewAt);
    upcoming.sort((a, b) => a.nextReviewAt - b.nextReviewAt);
    return sendResponse(200, { pseudoId, due, upcoming, total: due.length + upcoming.length });
  }));

  router.get('/api/streaks', requireHubKey(async (req, res, { qs, sendResponse }) => {
    const pseudoId = requireParam(qs, 'pseudoId', sendResponse);
    if (!pseudoId) return;
    const schedule = await loadJSONAsync(REVIEW_SCHEDULE_PATH, { students: {} });
    const studentReviews = schedule.students && schedule.students[pseudoId] ? schedule.students[pseudoId] : {};
    const sortedDates = collectReviewDates(studentReviews);
    const today = new Date().toISOString().slice(0, 10);
    const { currentStreak, longestStreak } = computeStreaks(sortedDates);
    const dailyGoal = 1;
    const completionsToday = sortedDates.filter(d => d === today).length;
    return sendResponse(200, {
      currentStreak, longestStreak, totalSessions: sortedDates.length,
      todayCount: completionsToday, dailyGoal, goalMet: completionsToday >= dailyGoal, dates: sortedDates
    });
  }));

  router.get('/api/badges', requireHubKey(async (req, res, { qs, sendResponse }) => {
    const pseudoId = requireParam(qs, 'pseudoId', sendResponse);
    if (!pseudoId) return;
    const studentSkills = await getStudentSkills(pseudoId);
    const skillCount = Object.keys(studentSkills).filter(k => studentSkills[k] >= 0.6).length;
    const totalSkills = new Set();
    const index = await loadLessonIndexAsync();
    for (const l of index) { for (const p of (l.skillsProvided || [])) totalSkills.add(p.skill); }
    const schedule = await loadJSONAsync(REVIEW_SCHEDULE_PATH, { students: {} });
    const studentReviews = (schedule.students && schedule.students[pseudoId]) || {};
    const lessonCount = Object.keys(studentReviews).length;
    const sortedDates = collectReviewDates(studentReviews);
    const { longestStreak } = computeStreaks(sortedDates);
    // Badge definitions loaded from data file [R10 P5.3]
    const badgeData = await loadJSONAsync(path.join(DATA_DIR, 'badge-definitions.json'), { badges: [] });
    const metricValues = { lessonCount, skillCount, longestStreak };
    const badges = badgeData.badges.map(def => {
      let earned = false;
      if (def.metric === 'allSkills') {
        earned = totalSkills.size > 0 && skillCount >= totalSkills.size;
      } else {
        earned = (metricValues[def.metric] || 0) >= def.threshold;
      }
      return { id: def.id, name: def.name, description: def.desc, icon: def.icon, earned };
    });
    return sendResponse(200, { pseudoId, badges, stats: { lessons: lessonCount, skills: skillCount, longestStreak, totalSkills: totalSkills.size } });
  }));

  router.get('/api/diagnostic', requireHubKey(async (req, res, { sendResponse }) => {
    const index = await loadLessonIndexAsync();
    const probes = [];
    const seen = new Set();
    const sorted = [...index]
      .filter(l => l.skillsProvided && l.skillsProvided.length > 0)
      .sort((a, b) => (a.difficulty || 2) - (b.difficulty || 2));
    for (const diff of [1, 2, 2, 3, 3, 4, 4, 5]) {
      const candidates = sorted.filter(l =>
        Math.round(l.difficulty || 2) === diff && !seen.has(l.skillsProvided[0].skill)
      );
      if (candidates.length > 0) {
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        seen.add(pick.skillsProvided[0].skill);
        probes.push({
          probeId: pick.lessonId + '_diag', skill: pick.skillsProvided[0].skill,
          difficulty: pick.difficulty || 2,
          question: 'Do you already know: ' + pick.skillsProvided[0].skill + '?',
          type: 'self_assess', options: ['No experience', 'Some experience', 'Confident']
        });
      }
    }
    return sendResponse(200, { probes });
  }));

  router.post('/api/diagnostic', requireHubKey((req, res, { sendResponse }) => {
    handleJsonBody(req, sendResponse, async (payload) => {
      const pseudoId = payload.pseudoId;
      const responses = payload.responses || [];
      if (!pseudoId) return sendResponse(400, { error: 'pseudoId required' });
      const mastery = await loadMasterySummaryAsync();
      if (!mastery.students) mastery.students = {};
      if (!mastery.students[pseudoId]) mastery.students[pseudoId] = {};
      const skills = mastery.students[pseudoId];
      let totalDifficulty = 0;
      let correctCount = 0;
      for (const r of responses) {
        const selfLevel = typeof r.answer === 'number' ? r.answer : 0;
        const evidenced = selfLevel === 2 ? 0.8 : (selfLevel === 1 ? 0.4 : 0);
        if (r.skill && evidenced > 0) {
          skills[r.skill] = Math.max(skills[r.skill] || 0, evidenced);
          correctCount++;
        }
        totalDifficulty += r.difficulty || 2;
      }
      const bootstrapAbility = responses.length > 0
        ? Math.round(((correctCount / responses.length) * (totalDifficulty / responses.length)) * 100) / 100
        : 0;
      await saveJSONAsync(MASTERY_SUMMARY, mastery);
      if (lmsEngine.isAvailable && lmsEngine.isAvailable()) {
        try {
          const probeResults = responses
            .filter(r => r.skill)
            .map(r => ({ probeId: r.probeId || r.skill, correct: (r.answer || 0) >= 1 }));
          if (probeResults.length > 0) lmsEngine.recordObservation(pseudoId, 'diagnostic', probeResults);
        } catch (e) { /* non-critical */ }
      }
      try {
        const diagPath = path.join(DATA_DIR, 'diagnostic-status.json');
        const status = await loadJSONAsync(diagPath, {});
        status[pseudoId] = { completedAt: new Date().toISOString(), ability: bootstrapAbility };
        await saveJSONAsync(diagPath, status);
      } catch (e) { /* non-critical */ }
      return sendResponse(200, { ok: true, ability: bootstrapAbility, skillsBootstrapped: Object.keys(skills).length });
    });
  }));

  router.get('/api/learning-paths', requireHubKey(async (req, res, { qs, sendResponse }) => {
    const data = await loadJSONAsync(LEARNING_PATHS_PATH, { paths: [] });
    const pseudoId = qs.pseudoId || '';
    if (pseudoId) {
      const studentSkills = await getStudentSkills(pseudoId);
      for (const p of data.paths) {
        let completed = 0;
        for (const skill of (p.skills || [])) {
          if ((studentSkills[skill] || 0) >= MASTERY_THRESHOLD) completed++;
        }
        p.progress = { completed, total: (p.skills || []).length, pct: (p.skills || []).length > 0 ? Math.round((completed / p.skills.length) * 100) : 0 };
      }
    }
    return sendResponse(200, data);
  }));

  router.get('/api/learning-paths/:id', requireHubKey(async (req, res, { params, qs, sendResponse }) => {
    const data = await loadJSONAsync(LEARNING_PATHS_PATH, { paths: [] });
    const lp = data.paths.find(p => p.id === params.id);
    if (!lp) return sendResponse(404, { error: 'Path not found' });
    const pseudoId = qs.pseudoId || '';
    const index = await loadLessonIndexAsync();
    const studentSkills = await getStudentSkills(pseudoId);
    const steps = (lp.skills || []).map(skill => {
      const m = (studentSkills[skill] || 0) >= MASTERY_THRESHOLD;
      const candidates = index.filter(l => (l.skillsProvided || []).some(sp => sp.skill === skill));
      const bestLesson = candidates.length > 0 ? candidates.sort((a, b) => (a.difficulty || 2) - (b.difficulty || 2))[0] : null;
      return {
        skill, mastered: m, masteryLevel: studentSkills[skill] || 0,
        suggestedLesson: bestLesson ? { lessonId: bestLesson.lessonId, slug: bestLesson.slug, title: bestLesson.title, difficulty: bestLesson.difficulty || 2 } : null
      };
    });
    const completed = steps.filter(s => s.mastered).length;
    return sendResponse(200, { ...lp, steps, progress: { completed, total: steps.length, pct: steps.length > 0 ? Math.round((completed / steps.length) * 100) : 0 } });
  }));

  router.post('/api/learning-paths', adminOnly((req, res, { sendResponse }) => {
    handleJsonBody(req, sendResponse, async (payload) => {
      if (!payload.name || typeof payload.name !== 'string' || !payload.name.trim()) {
        return sendResponse(400, { error: 'name is required and must be non-empty' });
      }
      if (!payload.description || typeof payload.description !== 'string' || !payload.description.trim()) {
        return sendResponse(400, { error: 'description is required and must be non-empty' });
      }
      if (!Array.isArray(payload.skills) || payload.skills.length === 0) {
        return sendResponse(400, { error: 'skills is required and must contain at least one skill' });
      }

      const data = await loadJSONAsync(LEARNING_PATHS_PATH, { paths: [] });
      const trimmedName = payload.name.trim();
      const duplicate = data.paths.find(p => p.name === trimmedName);
      const warnings = [];
      if (duplicate) warnings.push('A path named "' + trimmedName + '" already exists');

      const id = payload.id || 'path-' + Date.now();
      const newPath = {
        id, name: trimmedName, description: payload.description.trim(),
        skills: payload.skills,
        createdAt: new Date().toISOString(), createdBy: payload.createdBy || 'teacher'
      };
      data.paths.push(newPath);
      await saveJSONAsync(LEARNING_PATHS_PATH, data);
      const response = { ok: true, path: newPath };
      if (warnings.length > 0) response.warnings = warnings;
      return sendResponse(201, response);
    });
  }));

  router.put('/api/learning-paths', adminOnly((req, res, { sendResponse }) => {
    handleJsonBody(req, sendResponse, async (payload) => {
      const data = await loadJSONAsync(LEARNING_PATHS_PATH, { paths: [] });
      const idx = data.paths.findIndex(p => p.id === payload.id);
      if (idx === -1) return sendResponse(404, { error: 'Path not found' });
      if (payload.name) data.paths[idx].name = payload.name;
      if (payload.description !== undefined) data.paths[idx].description = payload.description;
      if (Array.isArray(payload.skills)) data.paths[idx].skills = payload.skills;
      await saveJSONAsync(LEARNING_PATHS_PATH, data);
      return sendResponse(200, { ok: true, path: data.paths[idx] });
    });
  }));

  router.get('/api/collab/stats', requireHubKey(async (req, res, { qs, sendResponse }) => {
    const lessonIds = (qs.lessonIds || '').split(',').filter(Boolean);
    const mastery = await loadMasterySummaryAsync();
    const students = mastery.students || {};
    const index = await loadLessonIndexAsync();
    const stats = {};
    for (const lid of lessonIds) {
      let completedCount = 0;
      let activeCount = 0;
      const lesson = index.find(l => l.identifier === lid || l.slug === lid);
      if (!lesson) { stats[lid] = { activeCount: 0, completedCount: 0 }; continue; }
      for (const pid of Object.keys(students)) {
        const skills = students[pid] || {};
        const provides = (lesson.ontology && lesson.ontology.provides) || [];
        const hasAllSkills = provides.length > 0 && provides.every(p => (skills[p.skill] || 0) >= 0.6);
        if (hasAllSkills) completedCount++;
        else if (provides.some(p => (skills[p.skill] || 0) > 0)) activeCount++;
      }
      stats[lid] = { activeCount, completedCount };
    }
    return sendResponse(200, { stats });
  }));
}

module.exports = { register };
