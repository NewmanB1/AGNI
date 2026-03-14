// packages/agni-runtime/shell/library.js
// ES5 compatible — targets Android 7.0+ (Nougat, API 24).
// Uses edge-pathfinder when available to order precached lessons offline.
// Collab: opportunities banner, find-classmates flow, beacon sound.

var AVAILABLE_LESSONS = [
    { identifier: 'math:fractions', title: 'Fractions w/ Rhythm', difficulty: 3, inferredFeatures: { sensors_used: ['accelerometer'], has_haptic_feedback: true } },
    { identifier: 'math:ratios', title: 'Ratios (Textbook)', difficulty: 3, inferredFeatures: { sensors_used: [], interactive_elements_count: 0 } },
    { identifier: 'science:gravity', title: 'Gravity Lab', difficulty: 2, inferredFeatures: { sensors_used: ['accelerometer'], has_graphs: true } }
];
var USER_LOG = [{ skillId: 'intro:sensors', features: ['accelerometer'], score: 1.0, pace: 0.8 }];
var GRAPH_WEIGHTS = { edges: [] };

var STORAGE_PSEUDO = 'agni_pseudo_id';
var STORAGE_HUB_KEY = 'agni_hub_key';
var COLLAB_POLL_MS = 4000;

function getPseudoId() {
  try {
    var params = new URLSearchParams(window.location.search);
    var fromUrl = params.get('pseudoId');
    if (fromUrl) {
      try { localStorage.setItem(STORAGE_PSEUDO, fromUrl); } catch (_) { void 0; }
      return fromUrl;
    }
    return localStorage.getItem(STORAGE_PSEUDO);
  } catch (_) { return null; }
}

function getHubKey() {
  try {
    if (typeof window.AGNI_HUB_KEY === 'string' && window.AGNI_HUB_KEY) return window.AGNI_HUB_KEY;
    return localStorage.getItem(STORAGE_HUB_KEY);
  } catch (_) { return null; }
}

function getHubBase() {
  try {
    return window.location.origin;
  } catch (_) { return ''; }
}

function renderLessons(sorted, listEl) {
    listEl.innerHTML = '';
    if (sorted.length === 0) {
        listEl.innerHTML = '<p style="color:#555;padding:1rem;">No lessons available. Connect to the hub and open a lesson to precache.</p>';
        return;
    }
    sorted.forEach(function (lesson, index) {
        var isRecommended = index === 0;
        var el = document.createElement('div');
        el.className = 'card' + (isRecommended ? ' recommended' : '');
        
        var affinityLabel = (lesson._score && lesson._score.components && lesson._score.components.styleBonus > 0) ? 'Matches Your Style' : '';
        var sensors = (lesson.inferredFeatures && lesson.inferredFeatures.sensors_used) ? lesson.inferredFeatures.sensors_used : [];

        var h3 = document.createElement('h3');
        h3.textContent = (lesson.title || lesson.identifier || '') + (isRecommended ? ' ⭐' : '');
        var metaDiv = document.createElement('div');
        metaDiv.className = 'meta';
        var tagSpan = document.createElement('span');
        sensors.forEach(function (s) {
            var tag = document.createElement('span');
            tag.className = 'tag';
            tag.textContent = s;
            tagSpan.appendChild(tag);
        });
        if (affinityLabel) {
            var affSpan = document.createElement('span');
            affSpan.style.cssText = 'color:#0B5FFF;margin-left:5px;font-weight:bold;';
            affSpan.textContent = affinityLabel;
            tagSpan.appendChild(affSpan);
        }
        var thetaSpan = document.createElement('span');
        thetaSpan.className = 'theta-score';
        thetaSpan.textContent = 'θ ' + (lesson._score ? lesson._score.theta : '—');
        metaDiv.appendChild(tagSpan);
        metaDiv.appendChild(thetaSpan);
        el.appendChild(h3);
        el.appendChild(metaDiv);
        
        el.onclick = function () { launchLesson(lesson.identifier || lesson.slug || lesson.lessonId); };
        listEl.appendChild(el);
    });
}

function renderCollabBanner(opportunities, bannerEl) {
  if (!opportunities || opportunities.length === 0) {
    bannerEl.style.display = 'none';
    return;
  }
  bannerEl.style.display = 'block';
  bannerEl.innerHTML = '';
  var h3 = document.createElement('h3');
  h3.textContent = 'Collaborative learning available';
  bannerEl.appendChild(h3);
  var p = document.createElement('p');
  p.textContent = opportunities[0].peerCount + ' classmate(s) are ready to learn with you.';
  bannerEl.appendChild(p);
  opportunities.forEach(function (opp) {
    var btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = 'Learn "' + (opp.title || opp.lessonId) + '" together';
    btn.onclick = function () { startCollabSeek(opp); };
    bannerEl.appendChild(btn);
  });
}

function renderCollabFinder(lessonId, lessonTitle, finderEl) {
  finderEl.style.display = 'block';
  finderEl.innerHTML = '';
  var h3 = document.createElement('h3');
  h3.textContent = 'Find your classmates';
  finderEl.appendChild(h3);
  var p = document.createElement('p');
  p.textContent = 'Follow the sound to find each other. When you are together, both press "I\'m ready".';
  finderEl.appendChild(p);
  var playBtn = document.createElement('button');
  playBtn.className = 'btn';
  playBtn.textContent = 'Play beacon';
  playBtn.onclick = function () {
    if (window.AGNI_BEACON && window.AGNI_BEACON.playBeacon) {
      window.AGNI_BEACON.playBeacon();
    }
  };
  finderEl.appendChild(playBtn);
  var readyBtn = document.createElement('button');
  readyBtn.className = 'btn btn-secondary';
  readyBtn.textContent = 'I\'m ready';
  readyBtn.onclick = function () {
    ensureSeekAndPoll(lessonId, lessonTitle, finderEl);
  };
  finderEl.appendChild(readyBtn);
  var backBtn = document.createElement('button');
  backBtn.className = 'btn btn-secondary';
  backBtn.textContent = 'Cancel';
  backBtn.onclick = function () {
    cancelCollabSeek();
    finderEl.style.display = 'none';
    document.getElementById('collab-banner').style.display = 'block';
  };
  finderEl.appendChild(backBtn);
}

function startCollabSeek(opp) {
  var pseudoId = getPseudoId();
  var hubKey = getHubKey();
  var hubBase = getHubBase();
  if (!pseudoId || !hubKey || !hubBase) return;

  document.getElementById('collab-banner').style.display = 'none';
  var finderEl = document.getElementById('collab-finder');
  renderCollabFinder(opp.lessonId, opp.title, finderEl);

  var url = hubBase.replace(/\/$/, '') + '/api/collab/seek';
  var headers = { 'Content-Type': 'application/json', 'X-Hub-Key': hubKey };
  fetch(url, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({ pseudoId: pseudoId, lessonId: opp.lessonId })
  }).then(function (r) { return r.json(); }).then(function (data) {
    if (data.status === 'matched') {
      launchLesson(opp.lessonId, data.sessionId);
      finderEl.style.display = 'none';
      if (window.AGNI_BEACON && window.AGNI_BEACON.stopBeacon) window.AGNI_BEACON.stopBeacon();
    }
  }).catch(function () { void 0; });
}

function cancelCollabSeek() {
  var pseudoId = getPseudoId();
  var hubKey = getHubKey();
  var hubBase = getHubBase();
  if (!pseudoId || !hubKey || !hubBase) return;
  var url = hubBase.replace(/\/$/, '') + '/api/collab/cancel-seek';
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Hub-Key': hubKey },
    body: JSON.stringify({ pseudoId: pseudoId })
  }).catch(function () { void 0; });
}

var _collabPollTimer = null;

function ensureSeekAndPoll(lessonId, lessonTitle, finderEl) {
  var pseudoId = getPseudoId();
  var hubKey = getHubKey();
  var hubBase = getHubBase();
  if (!pseudoId || !hubKey || !hubBase) return;
  var url = hubBase.replace(/\/$/, '') + '/api/collab/seek';
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Hub-Key': hubKey },
    body: JSON.stringify({ pseudoId: pseudoId, lessonId: lessonId })
  }).then(function (r) { return r.json(); }).then(function (data) {
    if (data.status === 'matched') {
      if (window.AGNI_BEACON && window.AGNI_BEACON.stopBeacon) window.AGNI_BEACON.stopBeacon();
      launchLesson(lessonId, data.sessionId);
      finderEl.style.display = 'none';
    } else {
      startCollabPoll(lessonId, lessonTitle, finderEl);
    }
  }).catch(function () { startCollabPoll(lessonId, lessonTitle, finderEl); });
}

function startCollabPoll(lessonId, lessonTitle, finderEl) {
  if (_collabPollTimer) return;
  var pseudoId = getPseudoId();
  var hubKey = getHubKey();
  var hubBase = getHubBase();
  if (!pseudoId || !hubKey || !hubBase) return;

  function poll() {
    var url = hubBase.replace(/\/$/, '') + '/api/collab/status?pseudoId=' + encodeURIComponent(pseudoId);
    fetch(url, { headers: { 'X-Hub-Key': hubKey } })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.status === 'matched') {
          if (_collabPollTimer) clearInterval(_collabPollTimer);
          _collabPollTimer = null;
          if (window.AGNI_BEACON && window.AGNI_BEACON.stopBeacon) window.AGNI_BEACON.stopBeacon();
          launchLesson(lessonId, data.sessionId);
          finderEl.style.display = 'none';
        } else if (data.status === 'denied') {
          if (_collabPollTimer) clearInterval(_collabPollTimer);
          _collabPollTimer = null;
          if (window.AGNI_BEACON && window.AGNI_BEACON.stopBeacon) window.AGNI_BEACON.stopBeacon();
          finderEl.innerHTML = '<p style="color:#c62828;">Teacher has cancelled this session. Return to the library.</p>';
          setTimeout(function () {
            finderEl.style.display = 'none';
            document.getElementById('collab-banner').style.display = 'block';
          }, 2000);
        }
      })
      .catch(function () { void 0; });
  }

  poll();
  _collabPollTimer = setInterval(poll, COLLAB_POLL_MS);
}

function launchLesson(id, sessionId) {
  var url = '/lessons/' + encodeURIComponent(id);
  if (sessionId) url += '?sessionId=' + encodeURIComponent(sessionId);
  window.location.href = url;
}

function fetchCollabOpportunities() {
  var pseudoId = getPseudoId();
  var hubKey = getHubKey();
  var hubBase = getHubBase();
  if (!pseudoId || !hubKey || !hubBase) return Promise.resolve([]);

  var url = hubBase.replace(/\/$/, '') + '/api/collab/opportunities?pseudoId=' + encodeURIComponent(pseudoId);
  return fetch(url, { headers: { 'X-Hub-Key': hubKey } })
    .then(function (r) { return r.ok ? r.json() : { opportunities: [] }; })
    .then(function (data) { return data.opportunities || []; })
    .catch(function () { return []; });
}

function initLibrary() {
    var listEl = document.getElementById('lesson-list');
    if (!listEl) return;

    var loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.textContent = 'Loading lessons...';

    var bannerEl = document.getElementById('collab-banner');
    var finderEl = document.getElementById('collab-finder');

    function done(sorted) {
        if (loadingEl) loadingEl.style.display = 'none';
        renderLessons(sorted, listEl);
        fetchCollabOpportunities().then(function (opps) {
          if (bannerEl && opps.length > 0) renderCollabBanner(opps, bannerEl);
        });
    }

    var edgePathfinder = window.AGNI_EDGE_PATHFINDER;
    if (edgePathfinder && typeof edgePathfinder.getOrderedPrecachedLessons === 'function') {
        edgePathfinder.getOrderedPrecachedLessons().then(function (sorted) {
            if (sorted && sorted.length > 0) return done(sorted);
            if (window.AGNI_NAVIGATOR && typeof window.AGNI_NAVIGATOR.sortLessons === 'function') {
                return done(window.AGNI_NAVIGATOR.sortLessons(AVAILABLE_LESSONS, USER_LOG, GRAPH_WEIGHTS));
            }
            done([]);
        }).catch(function () { done([]); });
        return;
    }

    if (window.AGNI_NAVIGATOR && typeof window.AGNI_NAVIGATOR.sortLessons === 'function') {
        done(window.AGNI_NAVIGATOR.sortLessons(AVAILABLE_LESSONS, USER_LOG, GRAPH_WEIGHTS));
    } else {
        done([]);
    }
}

document.addEventListener('DOMContentLoaded', initLibrary);
