<script>
  import { hubUrlStore, setHubUrl, testConnection } from '$lib/api';

  let dismissed = $state(false);
  let hubUrl = $state('');
  let testing = $state(false);
  let saving = $state(false);
  let testResult = $state(null);

  const hasUrl = $derived(!!$hubUrlStore);

  const show = $derived(!hasUrl && !dismissed);

  async function onTest() {
    testing = true;
    testResult = null;
    try {
      testResult = await testConnection(hubUrl);
    } finally {
      testing = false;
    }
  }

  async function onSave() {
    if (!hubUrl.trim()) return;
    saving = true;
    testResult = null;
    const result = await testConnection(hubUrl);
    if (result.ok) {
      setHubUrl(hubUrl);
      testResult = { ok: true, message: 'Connected! Hub URL saved.' };
    } else {
      setHubUrl(hubUrl);
      testResult = { ok: true, message: 'Saved (hub not reachable — will retry when online).' };
    }
    saving = false;
  }
</script>

{#if show}
  <div class="setup-overlay">
    <div class="setup-card">
      <h2>Welcome to AGNI</h2>
      <p>Before you start, connect this device to your school's AGNI hub.</p>
      <p class="detail">Ask your teacher or facilitator for the hub address. This only needs to be done once — it's saved on this device.</p>

      <label>
        Hub URL
        <input type="url" bind:value={hubUrl} placeholder="http://192.168.1.10:8082"
               onkeydown={(e) => e.key === 'Enter' && onSave()} />
      </label>

      <div class="actions">
        <button onclick={onTest} disabled={testing || !hubUrl.trim()}>
          {testing ? 'Testing…' : 'Test'}
        </button>
        <button class="primary" onclick={onSave} disabled={saving || !hubUrl.trim()}>
          {saving ? 'Saving…' : 'Save & Connect'}
        </button>
      </div>

      {#if testResult}
        <p class:ok={testResult.ok} class:err={!testResult.ok}>{testResult.message}</p>
      {/if}

      <button class="skip-btn" onclick={() => dismissed = true}>Skip for now</button>
    </div>
  </div>
{/if}

<style>
  .setup-overlay {
    position: fixed; inset: 0; z-index: 1000;
    background: rgba(10, 10, 30, 0.92);
    display: flex; align-items: center; justify-content: center;
    padding: 1rem;
  }

  .setup-card {
    background: var(--card, #1a1a2e); border: 1px solid var(--border, #2a2a4a);
    border-radius: 12px; padding: 2rem; max-width: 440px; width: 100%;
  }

  .setup-card h2 { margin-top: 0; color: var(--accent); }
  .setup-card p { line-height: 1.6; margin-bottom: 0.5rem; }
  .detail { font-size: 0.9rem; opacity: 0.8; margin-bottom: 1rem; }

  label { display: block; font-weight: bold; margin-bottom: 0.25rem; }
  input {
    width: 100%; padding: 0.6rem; background: #1f2b4e; color: var(--text);
    border: 1px solid var(--border); border-radius: 6px; font-size: 1rem;
    margin-top: 0.25rem;
  }

  .actions { display: flex; gap: 0.75rem; margin-top: 1.25rem; }
  button {
    padding: 0.55rem 1.1rem; background: #2a2a4a; color: var(--text);
    border: 1px solid var(--border); border-radius: 6px; cursor: pointer;
  }
  button.primary { background: var(--accent); color: #1a1a2e; border: none; font-weight: bold; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }

  p.ok { color: #4ade80; margin-top: 0.75rem; }
  p.err { color: #ff6b6b; margin-top: 0.75rem; }

  .skip-btn {
    display: block; margin-top: 1.25rem; background: none; border: none;
    color: var(--text); opacity: 0.5; cursor: pointer; font-size: 0.85rem;
    padding: 0;
  }
  .skip-btn:hover { opacity: 0.8; text-decoration: underline; }
</style>
