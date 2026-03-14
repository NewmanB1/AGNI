'use strict';
// packages/agni-hub/collab-sessions.js
// Collab session state: seeks and matched sessions. Persisted to JSON.

const crypto = require('crypto');
const { withLock } = require('@agni/utils/file-lock');

const SEEK_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Load collab state from disk.
 * @param {Function} loadJSONAsync (path, defaultVal) => Promise<object>
 * @param {string} path
 * @returns {Promise<{ seeks: Array<{pseudoId:string, lessonId:string, startedAt:number}>, sessions: Array<{id:string, lessonId:string, pseudoIds:string[], status:string, createdAt:number}> }>}
 */
async function loadState(loadJSONAsync, path) {
  var data = await loadJSONAsync(path, { seeks: [], sessions: [] });
  if (!Array.isArray(data.seeks)) data.seeks = [];
  if (!Array.isArray(data.sessions)) data.sessions = [];
  return data;
}

/**
 * Remove stale seeks (older than SEEK_TTL_MS).
 * @param {Array} seeks
 * @returns {Array}
 */
function pruneStaleSeeks(seeks) {
  var now = Date.now();
  return seeks.filter(function (s) {
    return (now - (s.startedAt || 0)) < SEEK_TTL_MS;
  });
}

/**
 * Add a seek. If 2+ students seek same lessonId, create session and return matched.
 * @param {object} state - { seeks, sessions }
 * @param {string} pseudoId
 * @param {string} lessonId
 * @returns {{ status: 'seeking'|'matched', sessionId?: string, matchedPseudoIds?: string[] }}
 */
function addSeek(state, pseudoId, lessonId) {
  state.seeks = pruneStaleSeeks(state.seeks);

  // Remove any existing seek for this student
  state.seeks = state.seeks.filter(function (s) { return s.pseudoId !== pseudoId; });

  var now = Date.now();
  state.seeks.push({ pseudoId: pseudoId, lessonId: lessonId, startedAt: now });

  var sameLesson = state.seeks.filter(function (s) { return s.lessonId === lessonId; });
  if (sameLesson.length >= 2) {
    var pseudoIds = sameLesson.map(function (s) { return s.pseudoId; });
    var sessionId = 'collab-' + crypto.randomBytes(8).toString('hex');
    state.sessions.push({
      id: sessionId,
      lessonId: lessonId,
      pseudoIds: pseudoIds,
      status: 'matched',
      createdAt: now
    });
    state.seeks = state.seeks.filter(function (s) { return s.lessonId !== lessonId; });
    return { status: 'matched', sessionId: sessionId, matchedPseudoIds: pseudoIds };
  }
  return { status: 'seeking' };
}

/**
 * Get seek status for a student.
 * @param {object} state
 * @param {string} pseudoId
 * @returns {{ seeking: boolean, sessionId?: string, lessonId?: string, status?: string, matchedPseudoIds?: string[] }}
 */
function getSeekStatus(state, pseudoId) {
  state.seeks = pruneStaleSeeks(state.seeks);

  var seek = state.seeks.find(function (s) { return s.pseudoId === pseudoId; });
  if (seek) {
    return { seeking: true, lessonId: seek.lessonId };
  }

  var session = state.sessions.find(function (s) {
    return s.pseudoIds && s.pseudoIds.indexOf(pseudoId) !== -1 &&
           (s.status === 'matched' || s.status === 'active' || s.status === 'denied');
  });
  if (session) {
    return {
      seeking: false,
      sessionId: session.id,
      lessonId: session.lessonId,
      status: session.status,
      matchedPseudoIds: session.pseudoIds
    };
  }
  return { seeking: false };
}

/**
 * Cancel seek for a student.
 * @param {object} state
 * @param {string} pseudoId
 */
function cancelSeek(state, pseudoId) {
  state.seeks = state.seeks.filter(function (s) { return s.pseudoId !== pseudoId; });
}

/**
 * Deny a session.
 * @param {object} state
 * @param {string} sessionId
 * @returns {boolean} true if found and denied
 */
function denySession(state, sessionId) {
  var session = state.sessions.find(function (s) { return s.id === sessionId; });
  if (!session) return false;
  if (session.status === 'denied' || session.status === 'completed') return false;
  session.status = 'denied';
  return true;
}

/**
 * Mark session as active (when lesson starts).
 * @param {object} state
 * @param {string} sessionId
 */
function markSessionActive(state, sessionId) {
  var session = state.sessions.find(function (s) { return s.id === sessionId; });
  if (session && session.status === 'matched') session.status = 'active';
}

/**
 * Get all sessions for teacher view.
 * @param {object} state
 * @returns {Array}
 */
function listSessions(state) {
  return state.sessions.filter(function (s) {
    return s.status === 'matched' || s.status === 'active' || s.status === 'denied';
  });
}

module.exports = {
  SEEK_TTL_MS,
  loadState,
  addSeek,
  getSeekStatus,
  cancelSeek,
  denySession,
  markSessionActive,
  listSessions
};
