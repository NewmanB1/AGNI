/**
 * Leaderboard — lessons and creators ranked by approval, effectiveness, forks.
 * Displays ribbons: Governance approved, Most forked, High impact, Effective learning.
 */

import { getHubUrl, createHubApi } from '../api.js';
import { getStoredToken } from '../auth.js';

function escapeHtml(s) {
  if (s == null) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

function renderRibbons(ribbons) {
  if (!ribbons || !ribbons.length) return '';
  var html = '';
  ribbons.forEach(function (r) {
    var label = r.label || r.id;
    if (r.count != null) label += ' (' + r.count + ')';
    if (r.value != null) label += ' ' + (Math.round(r.value * 100) / 100);
    var cls = 'ribbon ribbon-' + (r.id || '').replace(/\s+/g, '-');
    html += '<span class="' + escapeHtml(cls) + '" title="' + escapeHtml(label) + '">' + escapeHtml(r.label) + (r.count != null ? ' ' + r.count : '') + '</span> ';
  });
  return html;
}

export function renderLeaderboard(main) {
  if (!getStoredToken()) {
    main.innerHTML = '<div class="top-page card"><p>Please <a href="#/author/login">log in</a> to view the leaderboard.</p><p><a href="#/">← Back to Home</a></p></div>';
    return;
  }

  var baseUrl = getHubUrl();
  if (!baseUrl) {
    main.innerHTML = '<div class="top-page card"><p>Set the <a href="#/settings">Hub URL</a> in Settings.</p><p><a href="#/">← Back to Home</a></p></div>';
    return;
  }

  var api = createHubApi(baseUrl);
  var activeSection = 'all';
  var data = { topLessons: [], topCreators: [], updatedAt: null };
  var loading = true;
  var error = '';

  function load() {
    loading = true;
    error = '';
    api.getLeaderboard({ limit: 30, section: activeSection }).then(function (r) {
      data.topLessons = r.topLessons || [];
      data.topCreators = r.topCreators || [];
      data.updatedAt = r.updatedAt || null;
      loading = false;
      render();
    }).catch(function (e) {
      error = e && e.message ? e.message : 'Load failed';
      loading = false;
      render();
    });
  }

  function render() {
    var lessonsHtml = '';
    if (data.topLessons.length === 0 && !loading && !error) {
      lessonsHtml = '<p class="hint">No lessons with recognition yet. Approved, forked, or high-impact lessons will appear here.</p>';
    } else {
      data.topLessons.forEach(function (row, i) {
        lessonsHtml += '<li class="browse-item leaderboard-item">' +
          '<span class="leaderboard-rank">' + (i + 1) + '</span>' +
          '<div class="leaderboard-content">' +
          '<div><strong>' + escapeHtml(row.title) + '</strong> ' + renderRibbons(row.ribbons) + '</div>' +
          (row.description ? '<div class="hint" style="font-size:0.9rem;">' + escapeHtml(row.description.slice(0, 120)) + (row.description.length > 120 ? '…' : '') + '</div>' : '') +
          '<div class="leaderboard-meta">' +
          'Forks: ' + (row.forkCount || 0) + ' · Completions: ' + (row.completionCount || 0) +
          (row.avgMastery != null ? ' · Avg mastery: ' + (Math.round(row.avgMastery * 100) / 100) : '') +
          (row.creatorId ? ' · Creator: ' + escapeHtml(row.creatorId) : '') +
          '</div>' +
          '<a href="#/author/' + encodeURIComponent(row.slug) + '/edit" class="btn btn-sm">Edit</a>' +
          '</div></li>';
      });
    }

    var creatorsHtml = '';
    if (data.topCreators.length === 0 && !loading && !error) {
      creatorsHtml = '<p class="hint">No creators with recognition yet.</p>';
    } else {
      data.topCreators.forEach(function (row, i) {
        creatorsHtml += '<li class="browse-item leaderboard-item">' +
          '<span class="leaderboard-rank">' + (i + 1) + '</span>' +
          '<div class="leaderboard-content">' +
          '<div><strong>' + escapeHtml(row.creatorId) + '</strong> ' + renderRibbons(row.ribbons) + '</div>' +
          '<div class="leaderboard-meta">' +
          'Lessons: ' + (row.lessonCount || 0) + ' · Approved: ' + (row.approvedCount || 0) + ' · Forks: ' + (row.totalForks || 0) + ' · Completions: ' + (row.totalCompletions || 0) +
          (row.avgMastery != null ? ' · Avg mastery: ' + (Math.round(row.avgMastery * 100) / 100) : '') +
          '</div></div></li>';
      });
    }

    main.innerHTML = '<div class="top-page">' +
      '<h1>Leaderboard</h1>' +
      '<p class="tagline">Lessons and creators recognized for governance approval, effective learning, and community forks.</p>' +
      (error ? '<div class="card error-box">' + escapeHtml(error) + '</div>' : '') +
      (data.updatedAt ? '<p class="hint">Metrics updated: ' + escapeHtml(data.updatedAt) + '</p>' : '') +
      '<div class="browse-tabs" role="tablist">' +
      '<button type="button" class="browse-tab' + (activeSection === 'all' ? ' active' : '') + '" data-section="all">All</button>' +
      '<button type="button" class="browse-tab' + (activeSection === 'lessons' ? ' active' : '') + '" data-section="lessons">Lessons</button>' +
      '<button type="button" class="browse-tab' + (activeSection === 'creators' ? ' active' : '') + '" data-section="creators">Creators</button>' +
      '</div>' +
      (loading ? '<div class="card"><p>Loading…</p></div>' : '') +
      (activeSection !== 'creators' ? '<div class="card" style="margin-top:1rem;"><h2>Top lessons</h2><ul class="browse-list">' + lessonsHtml + '</ul></div>' : '') +
      (activeSection !== 'lessons' ? '<div class="card" style="margin-top:1rem;"><h2>Top creators</h2><ul class="browse-list">' + creatorsHtml + '</ul></div>' : '') +
      '<p style="margin-top:1.5rem;"><a href="#/">← Back to Home</a></p>' +
      '</div>';

    main.querySelectorAll('.browse-tab[data-section]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        activeSection = btn.getAttribute('data-section') || 'all';
        load();
      });
    });
  }

  load();
}
