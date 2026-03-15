/**
 * Learn — student pathfinder (HubKey)
 */
import { getHubUrl, createHubApi, getHubKey } from '../api.js';
import { t } from '../i18n.js';

function esc(s) {
  if (s == null) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

export function renderLearn(main) {
  const base = getHubUrl();
  const hasKey = !!getHubKey();
  main.innerHTML =
    '<div class="top-page">' +
    '<h1>' +
    esc(t('learn_title')) +
    '</h1>' +
    '<p class="hint" style="line-height:1.5;">' +
    esc(t('learn_help')) +
    '</p>' +
    (!base
      ? '<div class="card warning-box"><p><a href="#/settings">' + esc(t('nav_settings')) + '</a></p></div>'
      : !hasKey
        ? '<div class="card warning-box"><p>' +
          esc(t('settings_hub_key')) +
          ' — <a href="#/settings">' +
          esc(t('nav_settings')) +
          '</a>. ' +
          esc(t('learn_fail_auth')) +
          '</p></div>'
        : '<div class="card hint-box" style="border-style:dashed;"><p>' +
          esc(t('students_title')) +
          ': <a href="#/students">' +
          esc(t('nav_students')) +
          '</a> ' +
          esc(t('students_help')) +
          '</p></div>') +
    '<div class="card">' +
    '<label>' +
    esc(t('learn_pseudo')) +
    ' <input type="text" id="learn-pseudo" class="input" placeholder="pseudo-id" aria-required="true" /></label>' +
    '<p style="margin-top:0.75rem;">' +
    '<button type="button" class="btn btn-primary" id="learn-load">' +
    esc(t('learn_load')) +
    '</button> ' +
    '<button type="button" class="btn" id="learn-retry" style="display:none;">' +
    esc(t('common_retry')) +
    '</button></p>' +
    '<div id="learn-status" class="hint" role="status" aria-live="polite"></div>' +
    '<div id="learn-results"></div>' +
    '</div>' +
    '<p><a href="#/">' +
    esc(t('common_back_home')) +
    '</a></p>' +
    '</div>';

  const api = base ? createHubApi(base) : null;
  try {
    const pre = sessionStorage.getItem('learn_prefill_pseudo');
    if (pre) {
      main.querySelector('#learn-pseudo').value = pre;
      sessionStorage.removeItem('learn_prefill_pseudo');
    }
  } catch (e) {}
  const statusEl = main.querySelector('#learn-status');
  const resultsEl = main.querySelector('#learn-results');
  const retryBtn = main.querySelector('#learn-retry');

  function load() {
    const pseudo = (main.querySelector('#learn-pseudo').value || '').trim();
    if (!pseudo || !api) return;
    statusEl.textContent = t('common_loading');
    resultsEl.innerHTML = '';
    retryBtn.style.display = 'none';
    api
      .getPathfinderForPseudo(pseudo)
      .then(function (r) {
        statusEl.textContent = '';
        retryBtn.style.display = 'inline-flex';
        const lessons = r.lessons || [];
        const list = Array.isArray(lessons) ? lessons : [];
        if (!list.length) {
          resultsEl.innerHTML = '<p class="hint">' + esc(t('learn_empty')) + '</p>';
          return;
        }
        resultsEl.innerHTML =
          '<ol class="learn-list">' +
          list
            .map(function (L) {
              const id = L.lessonId || L.slug || L.id || '?';
              const title = L.title || L.slug || id;
              return '<li>' + esc(title) + ' <code>' + esc(id) + '</code></li>';
            })
            .join('') +
          '</ol>';
      })
      .catch(function (e) {
        const m = (e && e.message) || '';
        statusEl.textContent = m;
        statusEl.className = 'error-box';
        retryBtn.style.display = 'inline-flex';
        resultsEl.innerHTML =
          '<p class="hint">' + esc(t('learn_fail_auth')) + '</p>';
      });
  }

  main.querySelector('#learn-load').addEventListener('click', load);
  retryBtn.addEventListener('click', load);
}
