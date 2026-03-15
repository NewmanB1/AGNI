/**
 * Learn — student pseudoId + pathfinder (HubKey)
 */
import { getHubUrl, createHubApi, getHubKey } from '../api.js';

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
    '<h1>Learn</h1>' +
    '<p class="hint">Enter a student <strong>pseudoId</strong> to see their recommended lesson order (hub pathfinder). Requires Hub key in Settings.</p>' +
    (!base
      ? '<div class="card warning-box"><p>Set <a href="#/settings">Hub URL</a> first.</p></div>'
      : !hasKey
        ? '<div class="card warning-box"><p>Set <a href="#/settings">Hub key</a> (device/parent access) to load recommendations.</p></div>'
        : '') +
    '<div class="card">' +
    '<label>Pseudo ID <input type="text" id="learn-pseudo" class="input" placeholder="student-pseudo-id" /></label>' +
    '<p style="margin-top:0.75rem;"><button type="button" class="btn btn-primary" id="learn-load">Load lessons</button>' +
    ' <button type="button" class="btn" id="learn-retry" style="display:none;">Retry</button></p>' +
    '<p id="learn-status" class="hint"></p>' +
    '<div id="learn-results"></div>' +
    '</div>' +
    '<p><a href="#/">← Home</a></p>' +
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
    statusEl.textContent = 'Loading…';
    resultsEl.innerHTML = '';
    retryBtn.style.display = 'none';
    api
      .getPathfinderForPseudo(pseudo)
      .then(function (r) {
        statusEl.textContent = '';
        retryBtn.style.display = 'inline-flex';
        const lessons = r.lessons || r.orderedLessons || r.order || [];
        const list = Array.isArray(lessons) ? lessons : [];
        if (!list.length) {
          resultsEl.innerHTML = '<p class="hint">No ordered lessons returned (empty path or new student).</p>';
          return;
        }
        resultsEl.innerHTML =
          '<h3 style="margin-top:1rem;">Recommended order</h3><ol class="learn-list">' +
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
        statusEl.textContent = e.message || 'Failed';
        statusEl.className = 'error-box';
        retryBtn.style.display = 'inline-flex';
        resultsEl.innerHTML = '<p class="hint">Check Hub key and pseudoId. Teachers see roster under <a href="#/students">Students</a>.</p>';
      });
  }

  main.querySelector('#learn-load').addEventListener('click', load);
  retryBtn.addEventListener('click', load);
}
