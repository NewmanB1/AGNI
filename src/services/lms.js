'use strict';

// LMS engine service wrapper.
// Provides a small, top-down API around src/engine/index.js so that
// callers (theta, future HTTP handlers, tools) do not need to know
// the engine's internal file layout.

var path = require('path');

var ENGINE_PATH = path.join(__dirname, '../engine/index.js');
var engine = null;

try {
  engine = require(ENGINE_PATH);
  // Best-effort early status log; callers can also use getStatus().
  if (engine && typeof engine.getStatus === 'function') {
    try {
      var status = engine.getStatus();
      console.log('[LMS-SERVICE] Engine loaded:', JSON.stringify(status));
    } catch (_) {
      console.log('[LMS-SERVICE] Engine loaded (status unavailable)');
    }
  }
} catch (err) {
  console.warn(
    '[LMS-SERVICE] Engine not available:', err.message,
    '\n[LMS-SERVICE] Degraded mode: theta scheduling active, bandit selection disabled'
  );
}

function isAvailable() {
  return !!engine;
}

function requireEngine() {
  if (!engine) {
    throw new Error('LMS engine not available');
  }
  return engine;
}

function getStatus() {
  return requireEngine().getStatus();
}

function seedLessons(lessons) {
  return requireEngine().seedLessons(lessons);
}

function selectBestLesson(studentId, candidates) {
  return requireEngine().selectBestLesson(studentId, candidates);
}

function recordObservation(studentId, lessonId, probeResults) {
  return requireEngine().recordObservation(studentId, lessonId, probeResults);
}

function exportBanditSummary() {
  return requireEngine().exportBanditSummary();
}

function mergeRemoteSummary(remote) {
  return requireEngine().mergeRemoteSummary(remote);
}

function reloadState() {
  return requireEngine().reloadState();
}

module.exports = {
  isAvailable:        isAvailable,
  getStatus:          getStatus,
  seedLessons:        seedLessons,
  selectBestLesson:   selectBestLesson,
  recordObservation:  recordObservation,
  exportBanditSummary: exportBanditSummary,
  mergeRemoteSummary: mergeRemoteSummary,
  reloadState:        reloadState
};

