// src/runtime/checkpoint.js
// AGNI Checkpoint Persistence Module
//
// Saves and restores lesson progress via localStorage so students can
// resume after closing the browser. Checkpoints expire after a configurable
// duration (default 7 days). Opportunistic hub sync enables device-switching
// when a hub URL and pseudoId are available.
//
// Registers: window.AGNI_CHECKPOINT
// Depends on: nothing (standalone)
// Load order: before player.js
//
// ES5 only — targets Android 6.0+ (Chrome 44 WebView).

(function (global) {
  'use strict';

  var VERSION = 2;
  var DEFAULT_EXPIRY_MS = 604800000; // 7 days

  function makeKey(lessonId) {
    return 'agni_ckpt_' + lessonId;
  }

  function getExpiryMs() {
    if (typeof LESSON_DATA !== 'undefined' && LESSON_DATA && LESSON_DATA.checkpointExpiryMs) {
      return LESSON_DATA.checkpointExpiryMs;
    }
    return DEFAULT_EXPIRY_MS;
  }

  function save(lessonId, data, devMode) {
    try {
      var payload = {
        version:      VERSION,
        stepIndex:    data.stepIndex,
        stepId:       data.stepId,
        stepOutcomes: data.stepOutcomes,
        probeResults: data.probeResults,
        savedAt:      Date.now()
      };
      localStorage.setItem(makeKey(lessonId), JSON.stringify(payload));
    } catch (e) {
      if (devMode) console.warn('[CHECKPOINT] save failed:', e);
    }
  }

  function load(lessonId, devMode) {
    try {
      var raw = localStorage.getItem(makeKey(lessonId));
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (data.savedAt && (Date.now() - data.savedAt) > getExpiryMs()) {
        clear(lessonId, devMode);
        return null;
      }
      return data;
    } catch (e) {
      if (devMode) console.warn('[CHECKPOINT] load failed:', e);
      return null;
    }
  }

  function clear(lessonId, devMode) {
    try {
      localStorage.removeItem(makeKey(lessonId));
    } catch (e) {
      if (devMode) console.warn('[CHECKPOINT] clear failed:', e);
    }
  }

  /**
   * Opportunistic sync to hub. Fire-and-forget — failures are silent.
   * Uses XMLHttpRequest for ES5/Android 6 compatibility.
   */
  function sync(hubUrl, pseudoId, lessonId, devMode) {
    if (!hubUrl || !pseudoId || !lessonId) return;
    try {
      var raw = localStorage.getItem(makeKey(lessonId));
      if (!raw) return;
      var payload = JSON.parse(raw);
      payload.pseudoId = pseudoId;
      payload.lessonId = lessonId;

      var xhr = new XMLHttpRequest();
      xhr.open('POST', hubUrl.replace(/\/$/, '') + '/api/checkpoint', true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4 && devMode) {
          if (xhr.status >= 200 && xhr.status < 300) {
            console.log('[CHECKPOINT] synced to hub');
          } else {
            console.warn('[CHECKPOINT] hub sync failed:', xhr.status);
          }
        }
      };
      xhr.send(JSON.stringify(payload));
    } catch (e) {
      if (devMode) console.warn('[CHECKPOINT] sync error:', e);
    }
  }

  /**
   * Attempt to load a checkpoint from the hub when no local checkpoint exists.
   * Returns a Promise that resolves with the checkpoint data or null.
   * Uses XMLHttpRequest for ES5/Android 6 compatibility.
   */
  function loadRemote(hubUrl, pseudoId, lessonId, devMode) {
    if (!hubUrl || !pseudoId || !lessonId) {
      return { then: function (cb) { cb(null); return this; }, catch: function () { return this; } };
    }

    var _resolve, _reject;
    var promise = {
      _cbs: [], _ecbs: [], _val: undefined, _settled: false,
      then: function (cb) {
        if (promise._settled) { cb(promise._val); return promise; }
        promise._cbs.push(cb);
        return promise;
      },
      catch: function (cb) {
        promise._ecbs.push(cb);
        return promise;
      }
    };

    try {
      var url = hubUrl.replace(/\/$/, '') + '/api/checkpoint?pseudoId=' +
        encodeURIComponent(pseudoId) + '&lessonId=' + encodeURIComponent(lessonId);
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        var result = null;
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            result = JSON.parse(xhr.responseText);
            if (result && result.stepId) {
              localStorage.setItem(makeKey(lessonId), JSON.stringify(result));
              if (devMode) console.log('[CHECKPOINT] loaded from hub');
            } else {
              result = null;
            }
          } catch (e) {
            if (devMode) console.warn('[CHECKPOINT] parse remote failed:', e);
          }
        }
        promise._settled = true;
        promise._val = result;
        for (var i = 0; i < promise._cbs.length; i++) promise._cbs[i](result);
      };
      xhr.onerror = function () {
        if (devMode) console.warn('[CHECKPOINT] remote load failed');
        promise._settled = true;
        promise._val = null;
        for (var i = 0; i < promise._cbs.length; i++) promise._cbs[i](null);
      };
      xhr.timeout = 5000;
      xhr.ontimeout = xhr.onerror;
      xhr.send();
    } catch (e) {
      if (devMode) console.warn('[CHECKPOINT] loadRemote error:', e);
      promise._settled = true;
      promise._val = null;
    }

    return promise;
  }

  global.AGNI_CHECKPOINT = {
    save:       save,
    load:       load,
    clear:      clear,
    sync:       sync,
    loadRemote: loadRemote,
    VERSION:    VERSION,
    DEFAULT_EXPIRY_MS: DEFAULT_EXPIRY_MS
  };

})(typeof self !== 'undefined' ? self : this);
