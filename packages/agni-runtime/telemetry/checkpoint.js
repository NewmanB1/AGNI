// @ts-nocheck — global typing, LESSON_DATA
// packages/agni-runtime/telemetry/checkpoint.js
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
   * Uses callbacks instead of a hand-rolled Promise for ES5 safety. [R10 P2.4]
   * Returns a thenable for backward compat with player.js .then() chains.
   */
  function loadRemote(hubUrl, pseudoId, lessonId, devMode) {
    var result = { _val: null, _settled: false, _cbs: [], _ecbs: [] };
    var thenable = {
      then: function (cb) {
        if (result._settled) { try { cb(result._val); } catch (e) {} }
        else { result._cbs.push(cb); }
        return thenable;
      },
      catch: function (cb) {
        if (result._settled && result._err) { try { cb(result._err); } catch (e) {} }
        else { result._ecbs.push(cb); }
        return thenable;
      }
    };

    function _resolve(val) {
      if (result._settled) return;
      result._settled = true;
      result._val = val;
      for (var i = 0; i < result._cbs.length; i++) {
        try { result._cbs[i](val); } catch (e) {}
      }
    }

    function _reject(err) {
      if (result._settled) return;
      result._settled = true;
      result._err = err;
      result._val = null;
      for (var i = 0; i < result._ecbs.length; i++) {
        try { result._ecbs[i](err); } catch (e) {}
      }
      // Fall back to success callbacks with null if no error handlers
      if (result._ecbs.length === 0) {
        for (var j = 0; j < result._cbs.length; j++) {
          try { result._cbs[j](null); } catch (e) {}
        }
      }
    }

    if (!hubUrl || !pseudoId || !lessonId) {
      _resolve(null);
      return thenable;
    }

    try {
      var url = hubUrl.replace(/\/$/, '') + '/api/checkpoint?pseudoId=' +
        encodeURIComponent(pseudoId) + '&lessonId=' + encodeURIComponent(lessonId);
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        var data = null;
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            data = JSON.parse(xhr.responseText);
            if (data && data.stepId) {
              localStorage.setItem(makeKey(lessonId), JSON.stringify(data));
              if (devMode) console.log('[CHECKPOINT] loaded from hub');
            } else {
              data = null;
            }
          } catch (e) {
            if (devMode) console.warn('[CHECKPOINT] parse remote failed:', e);
          }
        }
        _resolve(data);
      };
      xhr.onerror = function () {
        if (devMode) console.warn('[CHECKPOINT] remote load failed');
        _reject(new Error('Network error'));
      };
      xhr.timeout = 5000;
      xhr.ontimeout = xhr.onerror;
      xhr.send();
    } catch (e) {
      if (devMode) console.warn('[CHECKPOINT] loadRemote error:', e);
      _reject(e);
    }

    return thenable;
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
