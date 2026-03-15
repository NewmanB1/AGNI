import { getHubUrl, setHubUrl, createHubApi, getHubKey, setHubKey } from '../api.js';
import { applyNavI18n } from '../i18n.js';
import { showToast } from '../toast.js';
import { getPath, navigateTo } from '../router.js';

export function render(main) {
  const current = getHubUrl();
  const hubKey = getHubKey();
  main.innerHTML = `
    <div class="top-page">
      <h1>Settings</h1>

      <div class="card">
        <h2>Hub URL</h2>
        <p style="margin-bottom: 1rem; opacity: 0.9;">Set the Village Hub base URL. Example: <code>http://localhost:8082</code></p>
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
          <input type="url" id="hub-url-input" value="${escapeHtml(current)}" placeholder="http://localhost:8082" style="flex: 1; min-width: 200px;" />
          <button type="button" class="btn btn-primary" id="hub-save-btn">Save</button>
          <button type="button" class="btn" id="hub-test-btn">Test</button>
        </div>
        <p id="hub-status" style="margin-top: 0.5rem; font-size: 0.9rem;"></p>
      </div>

      <div class="card">
        <h2>Hub key (device / parent)</h2>
        <p style="margin-bottom: 0.75rem; opacity: 0.9;">Used for <strong>Learn</strong>, <strong>Parent</strong>, and lesson player sync (<code>X-Hub-Key</code>). Not your creator password.</p>
        <input type="password" id="hub-key-input" class="input" placeholder="Hub device key" value="${escapeHtml(hubKey)}" autocomplete="off" style="max-width:420px;" />
        <p style="margin-top:0.5rem;"><button type="button" class="btn btn-primary" id="hub-key-save">Save hub key</button></p>
      </div>

      <div class="card">
        <h2>Language preference</h2>
        <p style="margin-bottom: 0.5rem; opacity: 0.9;">Portal navigation and home cards. Lesson text still follows each lesson&rsquo;s <code>meta.language</code>.</p>
        <select id="lang-select" style="max-width: 200px;">
          <option value="en">English</option>
          <option value="es">Español</option>
          <option value="sw">Kiswahili</option>
          <option value="fr">Français</option>
        </select>
      </div>

      <p style="margin-top: 2rem;"><a href="#/">← Back to Home</a></p>
    </div>
  `;

  const lang = localStorage.getItem('agni_lang') || 'en';
  const langSelect = main.querySelector('#lang-select');
  if (langSelect) {
    langSelect.value = lang;
    langSelect.addEventListener('change', () => {
      localStorage.setItem('agni_lang', langSelect.value);
      applyNavI18n();
      const p = getPath();
      if (p === '/' || p === '') navigateTo('#/', true);
      else navigateTo('#' + (p.startsWith('/') ? p : '/' + p), true);
    });
  }

  main.querySelector('#hub-save-btn').addEventListener('click', () => {
    const input = main.querySelector('#hub-url-input');
    const url = (input.value || '').trim().replace(/\/+$/, '');
    setHubUrl(url);
    const status = main.querySelector('#hub-status');
    status.textContent = 'Hub URL saved.';
    status.className = 'success-box';
  });

  main.querySelector('#hub-key-save').addEventListener('click', () => {
    const v = (main.querySelector('#hub-key-input').value || '').trim();
    setHubKey(v);
    showToast('Hub key saved.', 'success');
  });

  main.querySelector('#hub-test-btn').addEventListener('click', async () => {
    const input = main.querySelector('#hub-url-input');
    const url = (input.value || '').trim();
    const status = main.querySelector('#hub-status');
    status.textContent = 'Testing…';
    status.className = '';
    try {
      const api = createHubApi(url);
      const health = await api.getHealth();
      status.textContent = health ? 'Connected.' : 'No response.';
      status.className = health ? 'success-box' : 'error-box';
    } catch (e) {
      status.textContent = 'Failed: ' + (e.message || 'Connection error');
      status.className = 'error-box';
    }
  });
}

function escapeHtml(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

