import { getHubUrl, createHubApi } from '../api.js';
import { restoreCreatorSession, setCreatorSession, clearCreatorSession, getStoredToken } from '../auth.js';
import { navigateTo } from '../router.js';

export function renderAuthorList(main) {
  const token = getStoredToken();
  if (!token) {
    main.innerHTML = `
      <div class="top-page">
        <h1>Lesson Author</h1>
        <p>You must be logged in to author lessons.</p>
        <a href="#/author/login" class="btn btn-primary">Log In or Register</a>
      </div>
    `;
    return;
  }

  main.innerHTML = `
    <div class="top-page">
      <h1>Lesson Author</h1>
      <p style="margin-bottom: 1rem;">Create or edit lessons.</p>
      <a href="#/author/new" class="btn btn-primary">Create New Lesson</a>
      <p style="margin-top: 1.5rem;"><a href="#/author/login">Account / Log out</a></p>
    </div>
  `;
}

function esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

export function renderAuthorLogin(main) {
  const baseUrl = getHubUrl();
  main.innerHTML = `
    <div class="top-page">
      <h1>Creator Login</h1>
      <p style="margin-bottom: 1rem;">Log in or register to author lessons.</p>

      <div class="card" style="max-width: 400px;">
        <p class="hint" style="margin-bottom: 1rem;">Hub: ${esc(baseUrl || 'Not set')}</p>
        <form id="login-form">
          <div style="margin-bottom: 1rem;">
            <label for="email">Email</label>
            <input type="email" id="email" required placeholder="you@example.com" />
          </div>
          <div style="margin-bottom: 1rem;">
            <label for="password">Password</label>
            <input type="password" id="password" required placeholder="8+ characters" />
          </div>
          <div style="margin-bottom: 1rem;">
            <label for="register-name">Name (for registration only)</label>
            <input type="text" id="register-name" placeholder="Your name" />
          </div>
          <div style="display: flex; gap: 0.5rem;">
            <button type="submit" class="btn btn-primary" id="login-btn">Log In</button>
            <button type="button" class="btn" id="register-btn">Register</button>
          </div>
        </form>
        <p id="auth-status" style="margin-top: 0.5rem;"></p>
      </div>

      <p style="margin-top: 1rem;"><a href="#/">← Back</a></p>
    </div>
  `;

  const form = main.querySelector('#login-form');
  const status = main.querySelector('#auth-status');

  if (!baseUrl) {
    status.textContent = 'Set Hub URL in Settings first.';
    status.className = 'error-box';
    return;
  }

  const api = createHubApi(baseUrl);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = main.querySelector('#email').value;
    const password = main.querySelector('#password').value;
    status.textContent = 'Logging in…';
    try {
      const res = await api.postAuthLogin({ email, password });
      setCreatorSession(res.token, res.creator);
      status.textContent = 'Logged in.';
      status.className = 'success-box';
      setTimeout(() => navigateTo('#/author/new'), 500);
    } catch (err) {
      const msg = err.message || '';
      status.textContent = msg === 'Failed to fetch'
        ? `Cannot reach hub at ${baseUrl}. Is it running? Check Settings.`
        : (msg || 'Login failed.');
      status.className = 'error-box';
    }
  });

  main.querySelector('#register-btn').addEventListener('click', async () => {
    const name = (main.querySelector('#register-name').value || '').trim();
    const email = main.querySelector('#email').value;
    const password = main.querySelector('#password').value;
    if (!name || !email || !password) {
      status.textContent = 'Enter name, email, and password (8+ chars).';
      status.className = 'error-box';
      return;
    }
    status.textContent = 'Registering…';
    try {
      const res = await api.postAuthRegister({ name, email, password });
      setCreatorSession(res.token, res.creator);
      status.textContent = 'Registered.';
      status.className = 'success-box';
      setTimeout(() => navigateTo('#/author/new'), 500);
    } catch (err) {
      const msg = err.message || '';
      status.textContent = msg === 'Failed to fetch'
        ? `Cannot reach hub at ${baseUrl}. Is it running? Check Settings.`
        : (msg || 'Registration failed.');
      status.className = 'error-box';
    }
  });
}

export function renderAuthorNew(main, slug) {
  const token = getStoredToken();
  if (!token) {
    main.innerHTML = '<p>Please <a href="#/author/login">log in</a> first.</p>';
    navigateTo('#/author/login');
    return;
  }

  main.innerHTML = `
    <div class="top-page">
      <h1>${slug ? 'Edit Lesson' : 'New Lesson'}</h1>
      <p style="margin-bottom: 1rem;">Lesson editor (simplified). Full editor in Svelte portal.</p>
      <div class="card">
        <p>To use the full lesson editor with WYSIWYG, steps, gates, and preview, run the Svelte portal:</p>
        <code style="display: block; margin: 1rem 0; padding: 0.5rem; background: var(--input-bg);">cd portal && VITE_HUB_URL=http://localhost:8082 npm run dev</code>
        <p>This vanilla portal provides the core structure. Lesson authoring can be extended here.</p>
      </div>
      <p style="margin-top: 1rem;"><a href="#/author">← Back to Author</a></p>
    </div>
  `;
}
