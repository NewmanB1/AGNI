/**
 * Students — pathfinder/all (admin)
 */
import { getHubUrl, createHubApi } from '../api.js';
import { getStoredToken } from '../auth.js';
import { t } from '../i18n.js';

function esc(s) {
  if (s == null) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

export function renderStudentsRoster(main) {
  if (!getStoredToken()) {
    main.innerHTML =
      '<div class="top-page card" role="status"><p><a href="#/author/login">' +
      esc(t('author_login_needed')) +
      '</a></p></div>';
    return;
  }
  const base = getHubUrl();
  if (!base) {
    main.innerHTML =
      '<div class="top-page card warning-box"><p><a href="#/settings">' +
      esc(t('nav_settings')) +
      '</a></p></div>';
    return;
  }

  let loading = true;
  let error = '';
  let ids = [];
  let forbidden = false;

  function draw() {
    main.innerHTML =
      '<div class="top-page">' +
      '<h1>' +
      esc(t('students_title')) +
      '</h1>' +
      '<p class="hint">' +
      esc(t('students_help')) +
      '</p>' +
      (forbidden
        ? '<div class="card warning-box"><p>' + esc(t('students_admin')) + '</p><p><a href="#/groups">Groups</a></p></div>'
        : '') +
      (error && !forbidden
        ? '<div class="card error-box">' +
          esc(error) +
          ' <button type="button" class="btn btn-primary" id="students-retry">' +
          esc(t('common_retry')) +
          '</button></div>'
        : '') +
      (loading
        ? '<div class="card"><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line short"></div></div>'
        : !forbidden && ids.length
          ? '<div class="card"><p><strong>' +
            ids.length +
            '</strong></p><ul class="roster-list">' +
            ids.map(function (id) {
              return (
                '<li><code>' +
                esc(id) +
                '</code> <a href="#/learn" class="btn btn-sm learn-prefill" data-id="' +
                esc(id) +
                '" style="min-height:44px;">' +
                esc(t('students_learn')) +
                '</a></li>'
              );
            }).join('') +
            '</ul></div>'
          : !forbidden
            ? '<div class="card"><p>' + esc(t('students_none')) + '</p></div>'
            : '') +
      '<p><a href="#/groups">Groups</a> · <a href="#/">' + esc(t('nav_home')) + '</a></p>' +
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
    forbidden = false;
    draw();
    createHubApi(base)
      .getPathfinderAll()
      .then(function (r) {
        ids = Object.keys(r.students || {}).sort();
        loading = false;
        draw();
      })
      .catch(function (e) {
        const m = e.message || '';
        if (m.indexOf('403') >= 0 || m.indexOf('401') >= 0 || /admin/i.test(m)) {
          forbidden = true;
          error = '';
        } else {
          error = m || 'Load failed';
        }
        loading = false;
        draw();
      });
  }

  fetchRoster();
}
