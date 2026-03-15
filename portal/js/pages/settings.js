import { getHubUrl, setHubUrl, createHubApi } from '../api.js';

export function render(main) {
  const current = getHubUrl();
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
        <h2>Language preference</h2>
        <p style="margin-bottom: 0.5rem; opacity: 0.9;">Stored for future portal translation. Lesson text still follows each lesson&rsquo;s <code>meta.language</code>.</p>
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
