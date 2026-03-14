/**
 * Collaborative sessions page - teacher view, deny sessions
 */
import { getHubUrl, createHubApi } from '../api.js';

const POLL_MS = 30000;

function escapeHtml(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

export function renderCollab(main) {
  const baseUrl = getHubUrl();
  if (!baseUrl) {
    main.innerHTML = `
      <div class="top-page card warning-box">
        <h1>Collaborative Sessions</h1>
        <p>Configure hub URL in <a href="#/settings">Settings</a> to view and manage collaborative lesson sessions.</p>
      </div>
    `;
    return;
  }

  const api = createHubApi(baseUrl);
  let state = { sessions: [], loading: true, error: '', pollTimer: null };

  function render() {
    let html = '<div class="top-page card"><h1>Collaborative Sessions</h1>';
    if (state.error) html += `<p class="error">${escapeHtml(state.error)}</p>`;
    if (state.loading && state.sessions.length === 0) {
      html += '<p>Loading…</p>';
    } else {
      const active = state.sessions.filter(s => s.status === 'matched' || s.status === 'active');
      if (active.length > 0) {
        html += '<div class="collab-alert" style="background:#FFF3E0;border:2px solid #FF9800;padding:1rem;margin:1rem 0;border-radius:4px;">';
        html += '<strong>Students have started a collaborative lesson — consider supervising.</strong>';
        html += '</div>';
      }
      html += '<p class="hint">When students pair for collaborative lessons, their session appears here. You can deny a session to cancel it.</p>';
      if (state.sessions.length === 0) {
        html += '<p>No active sessions.</p>';
      } else {
        html += '<ul class="collab-list" style="list-style:none;padding:0;">';
        state.sessions.forEach(s => {
          html += '<li style="border:1px solid #ddd;padding:1rem;margin:0.5rem 0;border-radius:4px;">';
          html += '<strong>' + escapeHtml(s.lessonTitle || s.lessonId) + '</strong> ';
          html += '<span style="color:#666;">(' + (s.pseudoIds || []).map(escapeHtml).join(', ') + ')</span> ';
          html += '<span class="status-badge" style="background:#e0e0e0;padding:2px 6px;border-radius:4px;font-size:0.85rem;">' + escapeHtml(s.status) + '</span>';
          if (s.status !== 'denied' && s.status !== 'completed') {
            html += ' <button class="btn btn-danger" data-deny="' + escapeHtml(s.id) + '" style="margin-left:0.5rem;">Deny</button>';
          }
          html += '</li>';
        });
        html += '</ul>';
      }
    }
    html += '</div>';
    main.innerHTML = html;

    main.querySelectorAll('[data-deny]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-deny');
        if (!id) return;
        btn.disabled = true;
        try {
          await api.denyCollabSession(id);
          await load();
        } catch (e) {
          state.error = e instanceof Error ? e.message : String(e);
          render();
        }
      });
    });
  }

  async function load() {
    state.error = '';
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

  render();
  load().then(() => startPolling());

  return () => stopPolling();
}
