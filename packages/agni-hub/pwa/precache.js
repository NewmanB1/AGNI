// precache.js — Opportunistic lesson precaching
// Fetches pathfinder's precacheSlugs and prefetches /lessons/:slug in background.
// ES5 compatible. Runs when shell loads, throttled (default 5 min).
(function () {
  'use strict';

  var THROTTLE_MS = 5 * 60 * 1000;
  var STORAGE_KEY_LAST = 'agni_precache_last';
  var STORAGE_KEY_PSEUDO = 'agni_pseudo_id';
  var STORAGE_KEY_HUB_KEY = 'agni_hub_key';

  function getPseudoId() {
    try {
      var params = new URLSearchParams(window.location.search);
      var fromUrl = params.get('pseudoId');
      if (fromUrl) {
        try { localStorage.setItem(STORAGE_KEY_PSEUDO, fromUrl); } catch (_ignore) { void _ignore; }
        return fromUrl;
      }
      return localStorage.getItem(STORAGE_KEY_PSEUDO);
    } catch (_ignore) { void _ignore; return null; }
  }

  function getHubKey() {
    try {
      if (typeof window.AGNI_HUB_KEY === 'string' && window.AGNI_HUB_KEY) return window.AGNI_HUB_KEY;
      return localStorage.getItem(STORAGE_KEY_HUB_KEY);
    } catch (_ignore) { void _ignore; return null; }
  }

  function isThrottled() {
    try {
      var last = localStorage.getItem(STORAGE_KEY_LAST);
      if (!last) return false;
      return (Date.now() - parseInt(last, 10)) < THROTTLE_MS;
    } catch (_ignore) { void _ignore; return false; }
  }

  function setThrottle() {
    try { localStorage.setItem(STORAGE_KEY_LAST, String(Date.now())); } catch (_ignore) { void _ignore; }
  }

  function runPrecache() {
    if (!navigator.onLine) return;
    var pseudoId = getPseudoId();
    var hubKey = getHubKey();
    if (!pseudoId || !hubKey) return;
    if (isThrottled()) return;

    var base = window.location.origin;
    var pathfinderUrl = base + '/api/pathfinder?pseudoId=' + encodeURIComponent(pseudoId);
    var headers = { 'X-Hub-Key': hubKey };

    fetch(pathfinderUrl, { headers: headers })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data) return;
        setThrottle();
        if (Array.isArray(data.lessons) && (data.lessons.length > 0 || Array.isArray(data.precacheSlugs))) {
          try {
            var payload = {
              lessons: data.lessons || [],
              graphWeights: data.graphWeights || { edges: [] },
              storedAt: Date.now()
            };
            localStorage.setItem('agni_pathfinder_snapshot', JSON.stringify(payload));
          // eslint-disable-next-line no-unused-vars
          } catch (_e) { void 0; }
        }
        if (!Array.isArray(data.precacheSlugs) || data.precacheSlugs.length === 0) return;
        var requested = 0;
        data.precacheSlugs.forEach(function (slug) {
          if (!slug) return;
          requested++;
          fetch(base + '/lessons/' + encodeURIComponent(slug), { credentials: 'same-origin' })
            .catch(function () { void 0; });
        });
        if (typeof window.DEV_MODE !== 'undefined' && window.DEV_MODE) {
          /* eslint-disable-next-line no-console */
          console.log('[PRECACHE] Requested ' + requested + ' lessons');
        }
      })
      .catch(function () { void 0; });
  }

  function schedule() {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(function () { runPrecache(); }, { timeout: 3000 });
    } else {
      setTimeout(runPrecache, 2000);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedule);
  } else {
    schedule();
  }
})();
