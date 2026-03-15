/**
 * Collaborative sessions — teacher view
 */
import { getHubUrl, createHubApi } from '../api.js';
import { t } from '../i18n.js';
import { showToast } from '../toast.js';
import { announcePortal } from '../i18n.js';

const POLL_MS = 30000;

function escapeHtml(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function statusLabel(st) {
  if (st === 'seek' || st === 'waiting') return t('collab_status_seek');
  if (st === 'matched' || st === 'active') return t('collab_status_matched');
  return st || '';
}

export function renderCollab(main) {
  const baseUrl = getHubUrl();
  if (!baseUrl) {
    main.innerHTML =
      '<div class="top-page card warning-box"><h1>' +
      escapeHtml(t('collab_title')) +
      '</h1><p><a href="#/settings">' +
      escapeHtml(t('nav_settings')) +
      '</a></p></div>';
    return;
  }

  const api = createHubApi(baseUrl);
  let state = { sessions: [], loading: true, error: '', pollTimer: null, lastPoll: 0 };

  function render() {
    let html = '<div class="top-page card"><h1>' + escapeHtml(t('collab_title')) + '</h1>';
    html += '<p class="hint" style="line-height:1.5;">' + escapeHtml(t('collab_help')) + '</p>';
    html +=
      '<p class="hint" style="display:flex;align-items:center;gap:0.5rem;"><span class="collab-poll-dot" aria-hidden="true"></span>' +
      escapeHtml(t('collab_polling')) +
      '</p>';
    if (state.error) html += '<p class="error-box">' + escapeHtml(state.error) + '</p>';
    if (state.loading && state.sessions.length === 0) {
      html += '<p>' + escapeHtml(t('common_loading')) + '</p>';
    } else {
      const active = state.sessions.filter((s) => s.status === 'matched' || s.status === 'active');
      if (active.length > 0) {
        html +=
          '<div class="collab-alert" style="background:#FFF3E0;border:2px solid #FF9800;padding:1rem;margin:1rem 0;border-radius:4px;">' +
          '<strong>' +
          escapeHtml(t('collab_status_matched')) +
          '</strong></div>';
      }
      if (state.sessions.length === 0) {
        html += '<p>' + escapeHtml(t('collab_none')) + '</p>';
      } else {
        html += '<ul class="collab-list" style="list-style:none;padding:0;">';
        state.sessions.forEach((s) => {
          html += '<li style="border:1px solid var(--border);padding:1rem;margin:0.5rem 0;border-radius:4px;">';
          html += '<strong>' + escapeHtml(s.lessonTitle || s.lessonId) + '</strong> ';
          html +=
            '<span style="opacity:0.85;">(' +
            (s.pseudoIds || []).map(escapeHtml).join(', ') +
            ')</span> ';
          html +=
            '<span class="status-badge" style="background:var(--border);padding:2px 8px;border-radius:4px;font-size:0.85rem;">' +
            escapeHtml(statusLabel(s.status)) +
            '</span>';
          if (s.status !== 'denied' && s.status !== 'completed') {
            html +=
              ' <button type="button" class="btn btn-danger collab-deny-btn" data-deny="' +
              escapeHtml(s.id) +
              '" style="margin-left:0.5rem;min-height:44px;">Deny</button>';
          }
          html += '</li>';
        });
        html += '</ul>';
      }
    }
    html += '</div>';
    main.innerHTML = html;

    main.querySelectorAll('[data-deny]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-deny');
        if (!id) return;
        btn.disabled = true;
        try {
          await api.denyCollabSession(id);
          showToast('Session denied.', 'success');
          announcePortal('Session denied');
          await load();
        } catch (e) {
          state.error = e instanceof Error ? e.message : String(e);
          showToast(state.error, 'error');
          render();
        }
      });
    });
  }

  async function load() {
    state.error = '';
    state.lastPoll = Date.now();
    try {
      const res = await api.getCollabSessions();
      state.sessions = res.sessions || [];
      state.loading = false;
      render();
    } catch (e) {
      state.error = e instanceof Error ? e.message : String(e);
      state.loading = false;
      render();
    }
  }

  function startPolling() {
    if (state.pollTimer) return;
    state.pollTimer = setInterval(load, POLL_MS);
  }
  function stopPolling() {
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
  }

  load();
  startPolling();
  return function () {
    stopPolling();
  };
}
