<script>
  import { hubUrlStore, setHubUrl, testConnection } from '$lib/api';
  import { currentLang, setLanguage } from '$lib/i18n';

  let hubUrl = $state('');
  let testing = $state(false);
  let testResult = $state(/** @type {{ ok: boolean; message?: string } | null} */ (null));
  let selectedLang = $state($currentLang);

  function changeLang(code) {
    selectedLang = code;
    setLanguage(code);
  }

  $effect(() => {
    hubUrl = $hubUrlStore;
  });

  async function onTest() {
    testing = true;
    testResult = null;
    try {
      testResult = await testConnection(hubUrl);
    } finally {
      testing = false;
    }
  }

  function onSave() {
    setHubUrl(hubUrl);
    testResult = { ok: true, message: 'Saved. Hub connection updated.' };
  }
</script>

<div class="card">
  <h1>Hub Connection</h1>
  <p>Point the portal at your AGNI theta hub to use governance, overrides, and admin wizards.</p>

  <label>
    Hub URL
    <input type="url" bind:value={hubUrl} placeholder="http://localhost:8082" />
  </label>

  <div class="actions">
    <button onclick={onTest} disabled={testing || !hubUrl.trim()}>
      {testing ? 'Testing…' : 'Test Connection'}
    </button>
    <button class="primary" onclick={onSave} disabled={!hubUrl.trim()}>
      Save
    </button>
  </div>

  {#if testResult}
    <p class:ok={testResult.ok} class:err={!testResult.ok}>{testResult.message}</p>
  {/if}

  <p class="hint">
    Example: <code>http://localhost:8082</code> when running <code>node hub-tools/theta.js</code> locally.
    VITE_HUB_URL (build-time) is used if you have not saved a URL.
  </p>
</div>

<div class="card" style="margin-top: 1.5rem; max-width: 500px;">
  <h2>Language</h2>
  <p>Select your preferred language for the portal and lesson player.</p>
  <div class="lang-picker">
    {#each ['en', 'es', 'sw', 'fr'] as code}
      <button
        class="lang-btn"
        class:active={selectedLang === code}
        onclick={() => changeLang(code)}>
        {{ en: 'English', es: 'Español', sw: 'Kiswahili', fr: 'Français' }[code]}
      </button>
    {/each}
  </div>
</div>

<div class="card" style="margin-top: 1.5rem; max-width: 500px;">
  <h2>Accessibility</h2>
  <p>Haptic intensity, reduced motion, text size and contrast.</p>
  <a href="/settings/accessibility" class="a11y-link">Open accessibility settings →</a>
</div>

<style>
  .card {
    max-width: 500px;
  }
  label {
    display: block;
    margin: 1rem 0 0.5rem;
    font-weight: bold;
  }
  input {
    width: 100%;
    padding: 0.6rem;
    background: #1f2b4e;
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 1rem;
  }
  .actions {
    display: flex;
    gap: 1rem;
    margin-top: 1.5rem;
  }
  button {
    padding: 0.6rem 1.2rem;
    background: #2a2a4a;
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
  }
  button.primary {
    background: var(--accent);
    color: #1a1a2e;
    border: none;
    font-weight: bold;
  }
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  p.ok {
    color: #4ade80;
    margin-top: 1rem;
  }
  p.err {
    color: #ff6b6b;
    margin-top: 1rem;
  }
  .hint {
    margin-top: 1.5rem;
    font-size: 0.9rem;
    opacity: 0.8;
  }
  .hint code {
    background: rgba(255, 255, 255, 0.1);
    padding: 0.1rem 0.3rem;
    border-radius: 4px;
  }
  h2 { margin-top: 0; margin-bottom: 0.5rem; }
  .a11y-link { color: var(--accent); }
  .lang-picker { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.75rem; }
  .lang-btn {
    padding: 0.4rem 0.8rem; border-radius: 8px; border: 1px solid var(--border);
    background: transparent; color: var(--text); cursor: pointer; font-size: 0.9rem;
  }
  .lang-btn.active { background: var(--accent); color: #1a1a2e; font-weight: 600; border-color: var(--accent); }
</style>
