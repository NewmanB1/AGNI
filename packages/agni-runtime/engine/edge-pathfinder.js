// packages/agni-runtime/engine/edge-pathfinder.js
// Minimal pathfinder for edge device: orders precached lessons when offline.
// Uses: SW cache (precached lessons), localStorage (pathfinder snapshot, user log), AGNI_NAVIGATOR.
// ES5 only — targets Android 7.0 (Nougat, API 24).
(function (global) {
  'use strict';

  var STORAGE_PATHFINDER_SNAPSHOT = 'agni_pathfinder_snapshot';
  var STORAGE_USER_LOG = 'agni_edge_user_log';
  var LESSON_CACHE_SUFFIX = '-lessons';

  /**
   * Map hub lesson format to navigator format.
   * Navigator expects: identifier, title, difficulty, ontology: { provides, requires }, inferredFeatures.
   */
  function hubToNavigator(lesson) {
    var prov = lesson.skillsProvided || [];
    var req = lesson.skillsRequired || [];
    var provides = [];
    var requires = [];
    for (var i = 0; i < prov.length; i++) {
      provides.push({ skill: typeof prov[i] === 'object' ? (prov[i].skill || prov[i]) : prov[i] });
    }
    for (var j = 0; j < req.length; j++) {
      requires.push({ skill: typeof req[j] === 'object' ? (req[j].skill || req[j]) : req[j] });
    }
    return {
      identifier: lesson.lessonId || lesson.slug,
      slug: lesson.slug,
      title: lesson.title || lesson.slug,
      difficulty: typeof lesson.difficulty === 'number' ? lesson.difficulty : 2,
      ontology: { provides: provides, requires: requires },
      inferredFeatures: lesson.inferredFeatures || {}
    };
  }

  /**
   * Discover precached lesson URLs from SW cache.
   * Returns array of slugs (last path segment of /lessons/:slug).
   */
  function getPrecachedSlugs() {
    if (typeof caches === 'undefined') return Promise.resolve([]);
    return caches.keys().then(function (names) {
      var lessonCache = null;
      for (var i = 0; i < names.length; i++) {
        if (names[i].indexOf(LESSON_CACHE_SUFFIX) === names[i].length - LESSON_CACHE_SUFFIX.length) {
          lessonCache = names[i];
          break;
        }
      }
      if (!lessonCache) return [];
      return caches.open(lessonCache).then(function (cache) {
        return cache.keys();
      }).then(function (requests) {
        var slugs = [];
        for (var k = 0; k < requests.length; k++) {
          var url = requests[k].url || '';
          var m = url.match(/\/lessons\/([a-zA-Z0-9_\-/]+?)(?:\?|$)/);
          if (m) slugs.push(m[1]);
        }
        return slugs;
      });
    }).catch(function () { return []; });
  }

  /**
   * Get stored pathfinder snapshot from localStorage (saved when online).
   */
  function getStoredSnapshot() {
    try {
      var raw = localStorage.getItem(STORAGE_PATHFINDER_SNAPSHOT);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !Array.isArray(data.lessons)) return null;
      return data;
    } catch (e) { return null; }
  }

  /**
   * Get local user log from localStorage (optional, for style/mastery scoring).
   */
  function getLocalUserLog() {
    try {
      var raw = localStorage.getItem(STORAGE_USER_LOG);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  /**
   * Filter stored lessons to those that are precached (in cache).
   */
  function filterToPrecached(lessons, slugs) {
    var set = {};
    for (var i = 0; i < slugs.length; i++) set[slugs[i]] = true;
    var out = [];
    for (var j = 0; j < lessons.length; j++) {
      var slug = lessons[j].slug || lessons[j].lessonId;
      if (set[slug]) out.push(lessons[j]);
    }
    return out;
  }

  /**
   * Get ordered precached lessons. Resolves with [] when offline and no data.
   */
  function getOrderedPrecachedLessons() {
    var navigator = global.AGNI_NAVIGATOR;
    if (!navigator || typeof navigator.sortLessons !== 'function') {
      return Promise.resolve([]);
    }

    var snapshot = getStoredSnapshot();
    var userLog = getLocalUserLog();
    var graphWeights = (snapshot && snapshot.graphWeights) ? snapshot.graphWeights : { edges: [] };

    return getPrecachedSlugs().then(function (slugs) {
      if (slugs.length === 0) return [];
      if (!snapshot || !snapshot.lessons || snapshot.lessons.length === 0) {
        return slugs.map(function (s) {
          return hubToNavigator({ slug: s, title: s, skillsProvided: [], skillsRequired: [] });
        });
      }
      var available = filterToPrecached(snapshot.lessons, slugs);
      if (available.length === 0) {
        return slugs.map(function (s) {
          return hubToNavigator({ slug: s, title: s, skillsProvided: [], skillsRequired: [] });
        });
      }
      var navLessons = [];
      for (var i = 0; i < available.length; i++) {
        navLessons.push(hubToNavigator(available[i]));
      }
      return navigator.sortLessons(navLessons, userLog, graphWeights);
    });
  }

  /**
   * Store pathfinder snapshot (call when theta response received; used by precache).
   */
  function storeThetaSnapshot(lessons, graphWeights) {
    try {
      var payload = {
        lessons: lessons || [],
        graphWeights: graphWeights || { edges: [] },
        storedAt: Date.now()
      };
      localStorage.setItem(STORAGE_PATHFINDER_SNAPSHOT, JSON.stringify(payload));
    } catch (e) { /* ignore */ }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getOrderedPrecachedLessons: getOrderedPrecachedLessons, storeThetaSnapshot: storeThetaSnapshot };
  } else {
    global.AGNI_EDGE_PATHFINDER = {
      getOrderedPrecachedLessons: getOrderedPrecachedLessons,
      storeThetaSnapshot: storeThetaSnapshot
    };
  }
})(typeof window !== 'undefined' ? window : global);
