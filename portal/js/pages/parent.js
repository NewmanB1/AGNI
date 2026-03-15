/**
 * Parent — child progress (HubKey)
 */
import { getHubUrl, createHubApi, getHubKey } from '../api.js';
import { t } from '../i18n.js';

function esc(s) {
  if (s == null) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

export function renderParent(main) {
  const base = getHubUrl();
  const hasKey = !!getHubKey();
  main.innerHTML =
    '<div class="top-page">' +
    '<h1>' + esc(t('parent_title')) + '</h1>' +
    '<p class="hint">' + esc(t('parent_hint')) + '</p>' +
    (!base
      ? '<div class="card warning-box"><p>' + esc(t('parent_warn_hub')) + ' <a href="#/settings">' + esc(t('settings_title')) + '</a></p></div>'
      : !hasKey
        ? '<div class="card warning-box"><p>' + esc(t('parent_warn_key')) + ' <a href="#/settings">' + esc(t('settings_title')) + '</a></p></div>'
        : '') +
    '<div class="card">' +
    '<label>' + esc(t('parent_child_label')) + ' <input type="text" id="parent-pseudo" class="input" placeholder="' +
    esc(t('parent_placeholder')) + '" /></label>' +
    '<p style="margin-top:0.75rem;"><button type="button" class="btn btn-primary" id="parent-load">' + esc(t('parent_load')) + '</button>' +
    ' <button type="button" class="btn" id="parent-retry" style="display:none;">' + esc(t('common_retry')) + '</button></p>' +
    '<pre id="parent-out" style="margin-top:1rem;white-space:pre-wrap;font-size:0.85rem;" class="card"></pre>' +
    '</div>' +
    '<p><a href="#/">' + esc(t('common_back_home')) + '</a></p>' +
    '</div>';

  const api = base ? createHubApi(base) : null;
  const out = main.querySelector('#parent-out');
  const retryBtn = main.querySelector('#parent-retry');

  function load() {
    const pseudo = (main.querySelector('#parent-pseudo').value || '').trim();
    if (!pseudo || !api) return;
    out.textContent = t('common_loading');
    retryBtn.style.display = 'none';
    api
      .getParentChildProgress(pseudo)
      .then(function (r) {
        out.textContent = JSON.stringify(r, null, 2);
        retryBtn.style.display = 'inline-flex';
      })
      .catch(function (e) {
        out.textContent = e.message || t('parent_failed');
        retryBtn.style.display = 'inline-flex';
      });
  }

  main.querySelector('#parent-load').addEventListener('click', load);
  retryBtn.addEventListener('click', load);
}
