/**
 * Parent — child progress (HubKey)
 */
import { getHubUrl, createHubApi, getHubKey } from '../api.js';

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
    '<h1>Parent dashboard</h1>' +
    '<p class="hint">Link codes are created by your school (admin). After linking on device, you can view progress here with the child&rsquo;s pseudoId and Hub key.</p>' +
    (!base
      ? '<div class="card warning-box"><p>Set <a href="#/settings">Hub URL</a>.</p></div>'
      : !hasKey
        ? '<div class="card warning-box"><p>Set <a href="#/settings">Hub key</a> (same as family tablet).</p></div>'
        : '') +
    '<div class="card">' +
    '<label>Child pseudoId <input type="text" id="parent-pseudo" class="input" placeholder="linked-child-id" /></label>' +
    '<p style="margin-top:0.75rem;"><button type="button" class="btn btn-primary" id="parent-load">Load progress</button>' +
    ' <button type="button" class="btn" id="parent-retry" style="display:none;">Retry</button></p>' +
    '<pre id="parent-out" style="margin-top:1rem;white-space:pre-wrap;font-size:0.85rem;" class="card"></pre>' +
    '</div>' +
    '<p><a href="#/">← Home</a></p>' +
    '</div>';

  const api = base ? createHubApi(base) : null;
  const out = main.querySelector('#parent-out');
  const retryBtn = main.querySelector('#parent-retry');

  function load() {
    const pseudo = (main.querySelector('#parent-pseudo').value || '').trim();
    if (!pseudo || !api) return;
    out.textContent = 'Loading…';
    retryBtn.style.display = 'none';
    api
      .getParentChildProgress(pseudo)
      .then(function (r) {
        out.textContent = JSON.stringify(r, null, 2);
        retryBtn.style.display = 'inline-flex';
      })
      .catch(function (e) {
        out.textContent = e.message || 'Failed';
        retryBtn.style.display = 'inline-flex';
      });
  }

  main.querySelector('#parent-load').addEventListener('click', load);
  retryBtn.addEventListener('click', load);
}
