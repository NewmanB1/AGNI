'use strict';

function register(router, ctx) {
  const { loadJSONAsync, saveJSONAsync, loadMasterySummaryAsync, handleJsonBody,
          lmsService: lmsEngine, log, path,
          DATA_DIR, MASTERY_SUMMARY, REVIEW_SCHEDULE_PATH, thetaCache } = ctx;

  router.post('/api/telemetry', (req, res, { sendResponse }) => {
    handleJsonBody(req, sendResponse, async (payload) => {
      const events = Array.isArray(payload.events) ? payload.events : [];
      if (events.length === 0) return sendResponse(200, { accepted: [] });

      const mastery = await loadMasterySummaryAsync();
      if (!mastery.students) mastery.students = {};
      const accepted = [];

      for (const event of events) {
        const pseudoId = event.pseudoId;
        const lessonId = event.lessonId;
        if (!pseudoId || !lessonId) continue;

        if (!mastery.students[pseudoId]) mastery.students[pseudoId] = {};
        const studentSkills = mastery.students[pseudoId];

        const provided = event.skillsProvided || [];
        for (const sp of provided) {
          if (!sp.skill) continue;
          const evidenced = typeof sp.evidencedLevel === 'number' ? sp.evidencedLevel : (sp.declaredLevel || 1) * (event.mastery || 0);
          studentSkills[sp.skill] = Math.max(studentSkills[sp.skill] || 0, Math.round(evidenced * 1000) / 1000);
        }

        if (lmsEngine.isAvailable && lmsEngine.isAvailable()) {
          let probeResults = event.probeResults;
          if (!probeResults || probeResults.length === 0) {
            probeResults = (event.steps || [])
              .filter(s => s.type !== 'instruction' && s.type !== 'completion')
              .map(s => ({ probeId: s.stepId || lessonId + '_' + s.type, correct: !!s.passed }));
          }
          if (probeResults.length > 0) {
            try { lmsEngine.recordObservation(pseudoId, lessonId, probeResults); }
            catch (e) { log.warn('LMS observation failed', { pseudoId, error: e.message }); }
          }
        }

        accepted.push(event.eventId || lessonId);
      }

      // SM-2 spaced repetition schedule update
      try {
        const schedule = await loadJSONAsync(REVIEW_SCHEDULE_PATH, { students: {} });
        for (const event of events) {
          const pid = event.pseudoId;
          const lid = event.lessonId;
          if (!pid || !lid) continue;
          if (!schedule.students[pid]) schedule.students[pid] = {};
          const existing = schedule.students[pid][lid] || { interval: 1, easeFactor: 2.5, repetition: 0 };
          const quality = Math.round((event.mastery || 0) * 5);
          let ef = existing.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
          if (ef < 1.3) ef = 1.3;
          let interval, rep;
          if (quality < 3) { rep = 0; interval = 1; }
          else {
            rep = existing.repetition + 1;
            if (rep === 1) interval = 1;
            else if (rep === 2) interval = 6;
            else interval = Math.round(existing.interval * ef);
          }
          schedule.students[pid][lid] = {
            interval, easeFactor: Math.round(ef * 100) / 100, repetition: rep,
            lastReviewAt: Date.now(), nextReviewAt: Date.now() + interval * 86400000, quality
          };
        }
        await saveJSONAsync(REVIEW_SCHEDULE_PATH, schedule);
      } catch (e) {
        log.warn('Review schedule update failed', { error: e.message });
      }

      // Persist mastery
      try {
        await saveJSONAsync(MASTERY_SUMMARY, mastery);
        thetaCache.clear();
      } catch (e) {
        log.warn('Failed to write mastery summary', { error: e.message });
      }

      // Persist telemetry events (capped at 10000)
      try {
        const telPath = path.join(DATA_DIR, 'telemetry_events.json');
        const telData = await loadJSONAsync(telPath, { events: [] });
        for (const event of events) {
          telData.events.push({
            eventId: event.eventId, pseudoId: event.pseudoId, lessonId: event.lessonId,
            mastery: event.mastery, steps: event.steps || [], completedAt: event.completedAt,
            durationMs: event.durationMs, skillsProvided: event.skillsProvided
          });
        }
        if (telData.events.length > 10000) telData.events = telData.events.slice(-10000);
        await saveJSONAsync(telPath, telData);
      } catch (e) {
        log.warn('Telemetry event persistence failed', { error: e.message });
      }

      return sendResponse(200, { accepted, processed: events.length });
    });
  });
}

module.exports = { register };
