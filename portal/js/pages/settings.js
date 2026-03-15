import { getHubUrl, setHubUrl, createHubApi, getHubKey, setHubKey } from '../api.js';
import { applyNavI18n, t, announcePortal } from '../i18n.js';
import { showToast } from '../toast.js';
import { getPath, navigateTo } from '../router.js';

export function render(main) {
  const current = getHubUrl();
  const hubKey = getHubKey();
  main.innerHTML = `
    <div class="top-page">
      <h1>${esc(t('settings_title'))}</h1>

      <div class="card">
        <h2>${esc(t('settings_hub_url'))}</h2>
        <p style="margin-bottom: 1rem; opacity: 0.9;">${esc(t('settings_hub_url_help'))}</p>
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
          <input type="url" id="hub-url-input" value="${esc(current)}" placeholder="http://localhost:8082" style="flex: 1; min-width: 200px;" aria-describedby="hub-url-desc" />
          <button type="button" class="btn btn-primary" id="hub-save-btn">${esc(t('common_save'))}</button>
          <button type="button" class="btn" id="hub-test-btn">${esc(t('common_test'))}</button>
        </div>
        <p id="hub-url-desc" class="hint" style="margin-top:0.5rem;">HTTP(S) base; no trailing slash required.</p>
        <p id="hub-status" style="margin-top: 0.5rem; font-size: 0.9rem;" role="status"></p>
      </div>

      <div class="card">
        <h2>${esc(t('settings_hub_key'))}</h2>
        <p style="margin-bottom: 0.75rem; opacity: 0.9; line-height:1.5;">${esc(t('settings_hub_key_help'))}</p>
        <input type="password" id="hub-key-input" class="input" placeholder="Hub device key" value="${esc(hubKey)}" autocomplete="off" style="max-width:420px;" aria-label="Hub key" />
        <p style="margin-top:0.5rem;display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center;">
          <button type="button" class="btn btn-primary" id="hub-key-save">${esc(t('settings_hub_key_save'))}</button>
          <button type="button" class="btn" id="hub-key-test">${esc(t('settings_hub_key_test'))}</button>
        </p>
        <p id="hub-key-status" class="hint" role="status"></p>
      </div>

      <div class="card">
        <h2>${esc(t('settings_lang'))}</h2>
        <p style="margin-bottom: 0.5rem; opacity: 0.9;">${esc(t('settings_lang_help'))}</p>
        <select id="lang-select" style="max-width: 200px;" aria-label="Language">
          <option value="en">English</option>
          <option value="es">Español</option>
          <option value="sw">Kiswahili</option>
          <option value="fr">Français</option>
        </select>
      </div>

      <p style="margin-top: 2rem;"><a href="#/">${esc(t('common_back_home'))}</a></p>
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
      announcePortal(t('settings_title') + ' — ' + t('settings_lang'));
    });
  }

  main.querySelector('#hub-save-btn').addEventListener('click', () => {
    const input = main.querySelector('#hub-url-input');
    const url = (input.value || '').trim().replace(/\/+$/, '');
    setHubUrl(url);
    const status = main.querySelector('#hub-status');
    status.textContent = 'Hub URL saved.';
    status.className = 'success-box';
    announcePortal('Hub URL saved');
    showToast('Hub URL saved.', 'success');
  });

  main.querySelector('#hub-key-save').addEventListener('click', () => {
    const v = (main.querySelector('#hub-key-input').value || '').trim();
    setHubKey(v);
    showToast(t('settings_hub_key_save'), 'success');
    announcePortal(t('settings_hub_key_save'));
  });

  main.querySelector('#hub-key-test').addEventListener('click', async () => {
    const url = getHubUrl();
    const st = main.querySelector('#hub-key-status');
    st.textContent = t('common_loading');
    if (!getHubKey()) {
      st.textContent = 'Set key first.';
      st.className = 'error-box';
      return;
    }
    if (!url) {
      st.textContent = 'Set Hub URL first.';
      st.className = 'error-box';
      return;
    }
    try {
      await createHubApi(url).testHubKey();
      st.textContent = t('settings_hub_key_ok');
      st.className = 'success-box';
      showToast(t('settings_hub_key_ok'), 'success');
      announcePortal(t('settings_hub_key_ok'));
    } catch (e) {
      const m = (e && e.message) || '';
      st.textContent = t('settings_hub_key_fail') + ' ' + m;
      st.className = 'error-box';
      showToast(t('settings_hub_key_fail'), 'error');
      announcePortal(t('settings_hub_key_fail'));
    }
  });

  main.querySelector('#hub-test-btn').addEventListener('click', async () => {
    const input = main.querySelector('#hub-url-input');
    const url = (input.value || '').trim();
    const status = main.querySelector('#hub-status');
    status.textContent = t('common_loading');
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

function esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
