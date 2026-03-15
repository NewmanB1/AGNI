/**
 * Students — roster from pathfinder/all (admin Bearer)
 */
import { getHubUrl, createHubApi } from '../api.js';
import { getStoredToken } from '../auth.js';

function esc(s) {
  if (s == null) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

export function renderStudentsRoster(main) {
  if (!getStoredToken()) {
    main.innerHTML =
      '<div class="top-page card"><p><a href="#/author/login">Log in</a> (admin) to view roster.</p></div>';
    return;
  }
  const base = getHubUrl();
  if (!base) {
    main.innerHTML =
      '<div class="top-page card warning-box"><p>Set <a href="#/settings">Hub URL</a>. Roster requires admin session.</p></div>';
    return;
  }

  let loading = true;
  let error = '';
  let ids = [];

  function draw() {
    main.innerHTML =
      '<div class="top-page">' +
      '<h1>Students</h1>' +
      '<p class="hint">Student pseudoIds from hub pathfinder (same source as Groups). Admin only.</p>' +
      (error
        ? '<div class="card error-box">' +
          esc(error) +
          ' <button type="button" class="btn btn-primary" id="students-retry">Retry</button></div>'
        : '') +
      (loading
        ? '<div class="card"><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line short"></div></div>'
        : ids.length
          ? '<div class="card"><p><strong>' +
            ids.length +
            '</strong> student(s)</p><ul class="roster-list">' +
            ids.map(function (id) {
              return '<li><code>' + esc(id) + '</code> <a href="#/learn" class="btn btn-sm learn-prefill" data-id="' + esc(id) + '">Learn →</a></li>';
            }).join('') +
            '</ul></div>'
          : '<div class="card"><p>No students in pathfinder data yet.</p></div>') +
      '<p><a href="#/groups">Groups</a> · <a href="#/">Home</a></p>' +
      '</div>';

    main.querySelector('#students-retry')?.addEventListener('click', fetchRoster);
    main.querySelectorAll('.learn-prefill').forEach(function (a) {
      a.addEventListener('click', function () {
        sessionStorage.setItem('learn_prefill_pseudo', a.getAttribute('data-id') || '');
      });
    });
  }

  function fetchRoster() {
    loading = true;
    error = '';
    draw();
    createHubApi(base)
      .getPathfinderAll()
      .then(function (r) {
        ids = Object.keys(r.students || {}).sort();
        loading = false;
        draw();
      })
      .catch(function (e) {
        error = e.message || 'Failed (need admin hub role)';
        loading = false;
        draw();
      });
  }

  fetchRoster();
}
