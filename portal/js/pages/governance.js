/**
 * Governance — policy and catalog (e.g. unforkable lesson whitelist).
 * Admin-only actions (e.g. updating unforkable list) require admin role.
 */

import { getHubUrl, createHubApi } from '../api.js';
import { getStoredToken } from '../auth.js';

function escapeHtml(s) {
  if (s == null) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

export function renderGovernance(main) {
  if (!getStoredToken()) {
    main.innerHTML = '<div class="top-page card"><p>Please <a href="#/author/login">log in</a> to view governance.</p><p><a href="#/">← Back to Home</a></p></div>';
    return;
  }

  const baseUrl = getHubUrl();
  if (!baseUrl) {
    main.innerHTML = '<div class="top-page card"><p>Set the <a href="#/settings">Hub URL</a> in Settings.</p><p><a href="#/">← Back to Home</a></p></div>';
    return;
  }

  const api = createHubApi(baseUrl);
  let catalog = { lessonIds: [], unforkableLessonIds: [] };
  let loading = true;
  let error = '';
  let saveStatus = '';

  function load() {
    loading = true;
    error = '';
    api.getGovernanceCatalog().then(function (c) {
      catalog = c || { lessonIds: [], unforkableLessonIds: [] };
      if (!catalog.unforkableLessonIds) catalog.unforkableLessonIds = [];
      loading = false;
      render();
    }).catch(function (e) {
      error = e && e.message ? e.message : 'Load failed';
      loading = false;
      render();
    });
  }

  function addUnforkable(id) {
    const raw = (main.querySelector('#unforkable-add') && main.querySelector('#unforkable-add').value) || id || '';
    const trimmed = String(raw).trim();
    if (!trimmed) return;
    const next = catalog.unforkableLessonIds.indexOf(trimmed) >= 0
      ? catalog.unforkableLessonIds
      : catalog.unforkableLessonIds.concat(trimmed);
    api.updateGovernanceCatalog({ unforkableLessonIds: next }).then(function () {
      catalog.unforkableLessonIds = next;
      saveStatus = 'Added.';
      if (main.querySelector('#unforkable-add')) main.querySelector('#unforkable-add').value = '';
      render();
    }).catch(function (e) {
      saveStatus = 'Error: ' + (e && e.message ? e.message : 'Save failed');
      render();
    });
  }

  function removeUnforkable(id) {
    const next = catalog.unforkableLessonIds.filter(function (x) { return x !== id; });
    api.updateGovernanceCatalog({ unforkableLessonIds: next }).then(function () {
      catalog.unforkableLessonIds = next;
      saveStatus = 'Removed.';
      render();
    }).catch(function (e) {
      saveStatus = 'Error: ' + (e && e.message ? e.message : 'Save failed');
      render();
    });
  }

  function render() {
    const list = catalog.unforkableLessonIds || [];
    const unforkableHtml = loading
      ? '<p class="hint">Loading catalog…</p>'
      : '<div class="wizard-form">' +
        '<p class="hint">Lessons in this list cannot be forked (fork-check returns forkAllowed: false). Add lesson identifier or slug.</p>' +
        '<div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;margin-bottom:1rem;">' +
        '<input type="text" id="unforkable-add" class="input" placeholder="Lesson ID or slug" style="max-width:280px;" />' +
        '<button type="button" class="btn btn-primary" id="unforkable-add-btn">Add</button>' +
        '</div>' +
        (saveStatus ? '<p class="hint">' + escapeHtml(saveStatus) + '</p>' : '') +
        (list.length === 0
          ? '<p class="hint">No unforkable lessons.</p>'
          : '<ul class="browse-list">' + list.map(function (id) {
              return '<li class="browse-item" style="display:flex;justify-content:space-between;align-items:center;">' +
                '<span>' + escapeHtml(id) + '</span>' +
                '<button type="button" class="btn btn-sm browse-unforkable-remove" data-id="' + escapeHtml(id) + '">Remove</button>' +
                '</li>';
            }).join('') + '</ul>') +
        '</div>';

    main.innerHTML = '<div class="top-page">' +
      '<h1>Governance</h1>' +
      '<p class="tagline">Policy and catalog. Unforkable list is admin-only.</p>' +
      (error ? '<div class="card error-box">' + escapeHtml(error) + '</div>' : '') +
      '<div class="card" style="margin-top:1rem;">' +
      '<h2>Unforkable lessons</h2>' +
      unforkableHtml +
      '</div>' +
      '<p style="margin-top:1.5rem;"><a href="#/">← Back to Home</a></p>' +
      '</div>';

    main.querySelector('#unforkable-add-btn') && main.querySelector('#unforkable-add-btn').addEventListener('click', function () { addUnforkable(); });
    main.querySelector('#unforkable-add') && main.querySelector('#unforkable-add').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); addUnforkable(); }
    });
    main.querySelectorAll('.browse-unforkable-remove').forEach(function (btn) {
      btn.addEventListener('click', function () { removeUnforkable(btn.getAttribute('data-id')); });
    });
  }

  load();
}
