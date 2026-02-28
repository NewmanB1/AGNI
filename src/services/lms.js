'use strict';

// LMS engine service wrapper.
// Provides a small, top-down API around src/engine/index.js so that
// callers (theta, future HTTP handlers, tools) do not need to know
// the engine's internal file layout.

var path = require('path');

var { createLogger } = require('../utils/logger');
var log = createLogger('lms-service');

var ENGINE_PATH = path.join(__dirname, '../engine/index.js');
var engine = null;

try {
  engine = require(ENGINE_PATH);
  log.info('Engine module loaded (state deferred until first use)');
} catch (err) {
  log.warn('Engine not available — degraded mode: theta scheduling active, bandit selection disabled', { error: err.message });
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

function getStudentAbility(studentId) {
  return requireEngine().getStudentAbility(studentId);
}

function exportTransitionTable() {
  return requireEngine().exportTransitionTable();
}

function getStudentLessonHistory(studentId) {
  return requireEngine().getStudentLessonHistory(studentId);
}

function getFlowBottlenecks(topK) {
  return requireEngine().getFlowBottlenecks(topK);
}

function getDropoutBottlenecks(minSample) {
  return requireEngine().getDropoutBottlenecks(minSample);
}

function persistState() {
  return requireEngine().persistState();
}

module.exports = {
  isAvailable:            isAvailable,
  getStatus:              getStatus,
  seedLessons:            seedLessons,
  selectBestLesson:       selectBestLesson,
  recordObservation:      recordObservation,
  exportBanditSummary:    exportBanditSummary,
  mergeRemoteSummary:     mergeRemoteSummary,
  reloadState:            reloadState,
  getStudentAbility:      getStudentAbility,
  exportTransitionTable:  exportTransitionTable,
  getStudentLessonHistory: getStudentLessonHistory,
  getFlowBottlenecks:     getFlowBottlenecks,
  getDropoutBottlenecks:  getDropoutBottlenecks,
  persistState:           persistState
};

