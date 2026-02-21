// src/runtime/telemetry.js
// AGNI Telemetry  v1.7.0
//
// Runs on the student's edge device (browser).
// Records lesson completion events and flushes them to the village hub
// whenever the device is on hub WiFi.
//
// WHAT IS RECORDED (one event per lesson completion):
//   lessonId       — lesson identifier from meta.identifier
//   pseudoId       — hub-assigned pseudonymous student ID (opaque to this file)
//   completedAt    — ISO timestamp
//   duration       — total time in lesson (seconds)
//   mastery        — weighted score M ∈ [0, 1]  (see formula below)
//   steps          — array of per-step outcomes (detail for Sentry analysis)
//   skillsProvided — skills this lesson provides, with mastery-adjusted levels
//
// MASTERY FORMULA:
//   Each step has a weight w_i. The step score s_i is:
//     1.0   if passed (instruction/completion steps always pass)
//     (max_attempts - (attempts - 1)) / max_attempts  if passed on attempt k
//     0.0   if skipped via on_fail without passing
//   M = Σ(w_i × s_i) / Σ(w_i)
//
// BUFFERING:
//   Events are written to IndexedDB immediately on lesson completion.
//   They survive page reloads, app kills, and connectivity loss.
//   A flush attempt runs:
//     - on lesson completion (if hub reachable)
//     - on page load (flush any buffered events from prior sessions)
//     - on service worker message 'HUB_REACHABLE' (when SW detects hub WiFi)
//
// PSEUDONYMOUS ID:
//   The hub assigns a random ID to this device on first contact.
//   It is stored in IndexedDB alongside events.
//   It never contains the student's real name or enrollment number.
//   The hub is the only place that can link it to a real identity (optionally).
// ─────────────────────────────────────────────────────────────────────────────

(function (global) {
  'use strict';

  var DB_NAME    = 'agni-telemetry';
  var DB_VERSION = 1;
  var STORE_EVENTS  = 'events';
  var STORE_META    = 'meta';

  var _db        = null;
  var _pseudoId  = null;
  var _hubUrl    = null;
  var _flushing  = false;

  var log = (global.AGNI_SHARED && global.AGNI_SHARED.log) || {
    debug: function () {},
    warn:  function (m) { console.warn('[TELEMETRY]', m); },
    error: function (m) { console.error('[TELEMETRY]', m); }
  };


  // ═══════════════════════════════════════════════════════════════════════════
  // 1. IndexedDB setup
  // ═══════════════════════════════════════════════════════════════════════════

  function _openDB() {
    if (_db) return Promise.resolve(_db);
    if (!global.indexedDB) return Promise.reject(new Error('IndexedDB not available'));

    return new Promise(function (resolve, reject) {
      var req = global.indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_EVENTS)) {
          var store = db.createObjectStore(STORE_EVENTS, { keyPath: 'eventId' });
          store.createIndex('by_flushed', 'flushed', { unique: false });
          store.createIndex('by_lesson',  'lessonId', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: 'key' });
        }
      };

      req.onsuccess = function (e) {
        _db = e.target.result;
        resolve(_db);
      };

      req.onerror = function (e) {
        reject(new Error('IndexedDB open failed: ' + e.target.error));
      };
    });
  }

  function _dbGet(storeName, key) {
    return _openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx  = db.transaction(storeName, 'readonly');
        var req = tx.objectStore(storeName).get(key);
        req.onsuccess = function () { resolve(req.result ? req.result.value : null); };
        req.onerror   = function () { reject(req.error); };
      });
    });
  }

  function _dbPut(storeName, key, value) {
    return _openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx  = db.transaction(storeName, 'readwrite');
        var req = tx.objectStore(storeName).put({ key: key, value: value });
        req.onsuccess = function () { resolve(); };
        req.onerror   = function () { reject(req.error); };
      });
    });
  }

  function _dbPutEvent(event) {
    return _openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx  = db.transaction(STORE_EVENTS, 'readwrite');
        var req = tx.objectStore(STORE_EVENTS).put(event);
        req.onsuccess = function () { resolve(); };
        req.onerror   = function () { reject(req.error); };
      });
    });
  }

  function _dbGetUnflushed() {
    return _openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx      = db.transaction(STORE_EVENTS, 'readonly');
        var store   = tx.objectStore(STORE_EVENTS);
        var index   = store.index('by_flushed');
        var results = [];
        var req     = index.openCursor(IDBKeyRange.only(false));
        req.onsuccess = function (e) {
          var cursor = e.target.result;
          if (cursor) { results.push(cursor.value); cursor.continue(); }
          else resolve(results);
        };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function _dbMarkFlushed(eventIds) {
    return _openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx    = db.transaction(STORE_EVENTS, 'readwrite');
        var store = tx.objectStore(STORE_EVENTS);
        var done  = 0;
        eventIds.forEach(function (id) {
          var getReq = store.get(id);
          getReq.onsuccess = function () {
            var event = getReq.result;
            if (event) {
              event.flushed = true;
              store.put(event);
            }
            done++;
            if (done === eventIds.length) resolve();
          };
        });
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Pseudonymous ID
  //    Generated once, stored in IndexedDB, never changes for this device.
  //    The hub maps it to a student identity optionally and locally.
  // ═══════════════════════════════════════════════════════════════════════════

  function _getPseudoId() {
    if (_pseudoId) return Promise.resolve(_pseudoId);
    return _dbGet(STORE_META, 'pseudoId').then(function (stored) {
      if (stored) { _pseudoId = stored; return stored; }
      // Generate a new random ID: "px-" + 8 random hex chars
      var id = 'px-' + Array.from(
        global.crypto
          ? global.crypto.getRandomValues(new Uint8Array(4))
          : [Math.random()*256, Math.random()*256, Math.random()*256, Math.random()*256]
      ).map(function (b) { return (b & 0xff).toString(16).padStart(2, '0'); }).join('');
      _pseudoId = id;
      return _dbPut(STORE_META, 'pseudoId', id).then(function () { return id; });
    });
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Mastery score computation
  //    Called by player.js at lesson completion with the step outcome array.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Compute weighted mastery score M ∈ [0, 1] for a completed lesson.
   *
   * @param {object[]} stepOutcomes  Array of { stepId, type, weight, passed,
   *                                            attempts, maxAttempts, skipped,
   *                                            durationMs }
   * @returns {{ mastery: number, stepScores: object[] }}
   */
  function computeMastery(stepOutcomes) {
    var totalWeight  = 0;
    var weightedSum  = 0;
    var stepScores   = [];

    stepOutcomes.forEach(function (step) {
      var w = typeof step.weight === 'number' ? step.weight : 0;
      totalWeight += w;

      var s;
      if (step.type === 'instruction' || step.type === 'completion') {
        // These steps have no pass/fail — always score 1.0
        s = 1.0;
      } else if (step.skipped) {
        // Skipped via on_fail without passing
        s = 0.0;
      } else if (step.passed) {
        // Passed: score decays with attempt count
        // First attempt = 1.0, each retry costs (1 / maxAttempts)
        var maxAtt = step.maxAttempts || 1;
        var att    = Math.max(1, step.attempts || 1);
        s = Math.max(0, (maxAtt - (att - 1)) / maxAtt);
      } else {
        s = 0.0;
      }

      weightedSum += w * s;
      stepScores.push({
        stepId:    step.stepId,
        type:      step.type,
        weight:    w,
        score:     s,
        passed:    !!step.passed,
        skipped:   !!step.skipped,
        attempts:  step.attempts || 0,
        durationMs: step.durationMs || 0
      });
    });

    var mastery = totalWeight > 0 ? weightedSum / totalWeight : 0;
    return { mastery: Math.round(mastery * 1000) / 1000, stepScores: stepScores };
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Record a lesson completion
  //    Called by player.js when the student reaches the completion step.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Record a lesson completion event and attempt to flush to the hub.
   *
   * @param {object} lessonData     window.LESSON_DATA
   * @param {object[]} stepOutcomes Array of step outcome objects (see computeMastery)
   * @param {number} totalDurationMs Total time spent in lesson
   * @returns {Promise<{ eventId, mastery }>}
   */
  function record(lessonData, stepOutcomes, totalDurationMs) {
    var meta    = lessonData.meta || {};
    var ont     = lessonData.ontology || {};
    var computed = computeMastery(stepOutcomes);

    return _getPseudoId().then(function (pseudoId) {
      // Adjust provided skill levels by mastery score
      // A skill declared at level 2 with mastery 0.6 is evidenced at level 1.2
      var skillsProvided = (ont.provides || []).map(function (p) {
        return {
          skill:          p.skill,
          declaredLevel:  p.level || 1,
          evidencedLevel: Math.round(((p.level || 1) * computed.mastery) * 100) / 100
        };
      });

      var eventId = 'ev-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);

      var event = {
        eventId:       eventId,
        schemaVersion: '1.7.0',
        // Identity
        pseudoId:      pseudoId,
        hubUrl:        lessonData._hubUrl || _hubUrl || null,
        // Lesson
        lessonId:      meta.identifier || lessonData.id || 'unknown',
        lessonVersion: lessonData.version || '1.0.0',
        difficulty:    meta.difficulty || 0,
        language:      meta.language || 'en',
        // Ontology
        skillsRequired: (ont.requires || []).map(function (r) { return r.skill; }),
        skillsProvided: skillsProvided,
        // Outcome
        mastery:       computed.mastery,
        steps:         computed.stepScores,
        durationMs:    Math.round(totalDurationMs || 0),
        // Metadata
        completedAt:   new Date().toISOString(),
        flushed:       false
      };

      return _dbPutEvent(event).then(function () {
        log.debug('Telemetry event recorded:', eventId, 'mastery:', computed.mastery);
        // Attempt immediate flush — non-blocking, failure is silent
        flush().catch(function () {});
        return { eventId: eventId, mastery: computed.mastery };
      });
    });
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // 5. Flush buffered events to the hub
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Send all unflushed events to the village hub.
   * Safe to call at any time — deduplicates concurrent calls,
   * silently no-ops if hub is unreachable.
   *
   * @returns {Promise<{ sent: number, failed: number }>}
   */
  function flush() {
    if (_flushing) return Promise.resolve({ sent: 0, failed: 0 });
    _flushing = true;

    var hubBase = _hubUrl ||
                  (global.LESSON_DATA && global.LESSON_DATA._hubUrl) ||
                  _inferHubUrl();

    if (!hubBase) {
      _flushing = false;
      return Promise.resolve({ sent: 0, failed: 0 });
    }

    return _dbGetUnflushed().then(function (events) {
      if (!events.length) { _flushing = false; return { sent: 0, failed: 0 }; }

      var endpoint = hubBase.replace(/\/$/, '') + '/api/telemetry';

      return fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ events: events })
      }).then(function (resp) {
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.json();
      }).then(function (result) {
        var accepted = result.accepted || events.map(function (e) { return e.eventId; });
        return _dbMarkFlushed(accepted).then(function () {
          _flushing = false;
          log.debug('Telemetry flushed:', accepted.length, 'events');
          return { sent: accepted.length, failed: events.length - accepted.length };
        });
      }).catch(function (err) {
        // Hub unreachable — events stay buffered, will retry next time
        _flushing = false;
        log.warn('Telemetry flush failed (will retry): ' + err.message);
        return { sent: 0, failed: events.length };
      });
    }).catch(function (err) {
      _flushing = false;
      log.warn('Telemetry DB error: ' + err.message);
      return { sent: 0, failed: 0 };
    });
  }

  /** Derive hub URL from current page location (works for hub-served lessons) */
  function _inferHubUrl() {
    try {
      var loc = global.location;
      return loc.protocol + '//' + loc.host;
    } catch (e) { return null; }
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // 6. Listen for service worker 'HUB_REACHABLE' signal
  //    When the SW detects the hub (successful factory fetch), it posts this
  //    message so the telemetry layer can flush without waiting for completion.
  // ═══════════════════════════════════════════════════════════════════════════

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', function (event) {
      if (event.data && event.data.type === 'HUB_REACHABLE') {
        flush().catch(function () {});
      }
    });
  }

  // Also attempt a flush on page load for events from previous sessions
  if (global.document) {
    global.document.addEventListener('DOMContentLoaded', function () {
      setTimeout(function () { flush().catch(function () {}); }, 2000);
    });
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // 7. Export
  // ═══════════════════════════════════════════════════════════════════════════

  global.AGNI_TELEMETRY = {
    record:         record,
    flush:          flush,
    computeMastery: computeMastery,
    getPseudoId:    _getPseudoId,
    setHubUrl:      function (url) { _hubUrl = url; }
  };

  if (global.AGNI_SHARED && global.AGNI_SHARED.registerModule) {
    global.AGNI_SHARED.registerModule('telemetry', '1.7.0');
  }

  var DEV_MODE = !!(global.LESSON_DATA && global.LESSON_DATA._devMode);
  if (DEV_MODE) console.log('[TELEMETRY] telemetry.js v1.7.0 loaded');

}(window));
