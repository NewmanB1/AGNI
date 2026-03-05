'use strict';

const http = require('http');
const { updateSchedule } = require('../../../src/engine/sm2');
const { withLock } = require('../../../src/utils/file-lock');
const envConfig = require('../../../src/utils/env-config');

function forwardToSentry(events) {
  const port = envConfig.sentryPort;
  const body = JSON.stringify({ events: events });
  const req = http.request({
    hostname: '127.0.0.1',
    port: port,
    path: '/api/telemetry',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body, 'utf8') }
  }, function (res) {
    if (res.statusCode !== 200) {
      const log = require('../../../src/utils/logger').createLogger('theta');
      log.warn('Sentry forward failed', { statusCode: res.statusCode });
    }
  });
  req.on('error', function (e) {
    const log = require('../../../src/utils/logger').createLogger('theta');
    log.warn('Sentry forward error', { error: e.message });
  });
  req.setTimeout(5000, function () { req.destroy(); });
  req.end(body);
}

function register(router, ctx) {
  const { loadJSONAsync, saveJSONAsync, loadMasterySummaryAsync, handleJsonBody,
          requireHubKey, lmsService: lmsEngine, log, path,
          DATA_DIR, MASTERY_SUMMARY, REVIEW_SCHEDULE_PATH, thetaCache } = ctx;

  router.post('/api/telemetry', requireHubKey((req, res, { sendResponse }) => {
    handleJsonBody(req, sendResponse, async (payload) => {
      const events = Array.isArray(payload.events) ? payload.events : [];
      if (events.length === 0) return sendResponse(200, { accepted: [] });

      const accepted = [];

      // Lock mastery file for the entire read-modify-write cycle
      await withLock(MASTERY_SUMMARY, async () => {
        const mastery = await loadMasterySummaryAsync();
        if (!mastery.students) mastery.students = {};

        for (const event of events) {
          const pseudoId = event.pseudoId;
          const lessonId = event.lessonId;
          if (!pseudoId || !lessonId) continue;

          if (!mastery.students[pseudoId]) mastery.students[pseudoId] = {};
          const studentSkills = mastery.students[pseudoId];

          const provided = event.skillsProvided || [];
          for (const sp of provided) {
            if (!sp.skill) continue;
            const rawEvidence = typeof sp.evidencedLevel === 'number' ? sp.evidencedLevel : (sp.declaredLevel || 1) * (event.mastery || 0);
            const evidenced = Math.max(0, Math.min(1, typeof rawEvidence === 'number' && isFinite(rawEvidence) ? rawEvidence : 0));
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

        await saveJSONAsync(MASTERY_SUMMARY, mastery);
        thetaCache.clear();
      });

      // SM-2 schedule update under lock
      try {
        await withLock(REVIEW_SCHEDULE_PATH, async () => {
          const schedule = await loadJSONAsync(REVIEW_SCHEDULE_PATH, { students: {} });
          for (const event of events) {
            const pid = event.pseudoId;
            const lid = event.lessonId;
            if (!pid || !lid) continue;
            if (!schedule.students[pid]) schedule.students[pid] = {};
            const existing = schedule.students[pid][lid] || { interval: 1, easeFactor: 2.5, repetition: 0 };
            const rawMastery = typeof event.mastery === 'number' && isFinite(event.mastery) ? event.mastery : 0;
            const quality = Math.max(0, Math.min(5, Math.round(Math.max(0, Math.min(1, rawMastery)) * 5)));
            const result = updateSchedule(existing, quality);
            schedule.students[pid][lid] = {
              interval: result.interval,
              easeFactor: result.easeFactor,
              repetition: result.repetition,
              lastReviewAt: Date.now(),
              nextReviewAt: Date.now() + result.interval * 86400000,
              quality: quality
            };
          }
          await saveJSONAsync(REVIEW_SCHEDULE_PATH, schedule);
        });
      } catch (e) {
        log.warn('Review schedule update failed', { error: e.message });
      }

      // Telemetry events under lock
      try {
        const telPath = path.join(DATA_DIR, 'telemetry-events.json');
        await withLock(telPath, async () => {
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
        });
      } catch (e) {
        log.warn('Telemetry event persistence failed', { error: e.message });
      }

      if (envConfig.sentryForward) {
        forwardToSentry(events);
      }

      return sendResponse(200, { accepted, processed: events.length });
    });
  }));
}

module.exports = { register };
