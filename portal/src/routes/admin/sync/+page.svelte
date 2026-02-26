<script>
  import { hubApiStore } from '$lib/api';
  import { onMount } from 'svelte';

  let config = {
    syncTransport: 'starlink',
    homeUrl: '',
    usbPath: ''
  };

  let loading = true;
  let saving = false;
  let testing = false;
  let error = '';
  let success = '';
  let testResult = '';
  let hubConnected = false;

  onMount(async () => {
    loading = true;
    error = '';
    if ($hubApiStore.baseUrl) {
      try {
        const c = await $hubApiStore.getAdminConfig();
        hubConnected = true;
        if (c && typeof c === 'object') {
          config = {
            syncTransport: c.syncTransport || 'starlink',
            homeUrl: c.homeUrl || '',
            usbPath: c.usbPath || ''
          };
        }
      } catch (e) {
        error = 'Could not load config: ' + (e instanceof Error ? e.message : String(e));
      }
    } else {
      error = 'Configure hub URL in Settings to use sync wizard.';
    }
    loading = false;
  });

  async function save() {
    if (!$hubApiStore.baseUrl) return;
    saving = true;
    error = '';
    success = '';
    testResult = '';
    let current = {};
    try {
      current = await $hubApiStore.getAdminConfig();
    } catch (e) {}
    const payload = { ...current, syncTransport: config.syncTransport };
    if (config.homeUrl !== undefined) payload.homeUrl = config.homeUrl;
    if (config.usbPath !== undefined) payload.usbPath = config.usbPath;
    try {
      await $hubApiStore.putAdminConfig(payload);
      success = 'Config saved. Restart sync for changes to take effect.';
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    saving = false;
  }

  async function testConnection() {
    if (!$hubApiStore.baseUrl) return;
    testing = true;
    testResult = '';
    error = '';
    try {
      const res = await $hubApiStore.postSyncTest({
        transport: config.syncTransport,
        homeUrl: config.homeUrl,
        usbPath: config.usbPath
      });
      testResult = res.ok ? '✓ ' + (res.message || 'OK') : '✗ ' + (res.message || 'Failed');
    } catch (e) {
      testResult = '✗ ' + (e instanceof Error ? e.message : String(e));
    }
    testing = false;
  }
</script>

<h1>Sync (F2)</h1>
<p class="subtitle">Configure sync transport (Starlink or USB), home URL, import/export paths. Sneakernet configurable via UI.</p>

{#if loading}
  <p>Loading config…</p>
{:else if !hubConnected}
  <div class="card warning-box">
    <p>{error}</p>
  </div>
{:else}
  <div class="card wizard">
    {#if error}
      <div class="error">{error}</div>
    {/if}
    {#if success}
      <div class="success">{success}</div>
    {/if}
    {#if testResult}
      <div class="test-result">{testResult}</div>
    {/if}

    <h2>Transport</h2>
    <div class="form-group">
      <label>
        <input type="radio" bind:group={config.syncTransport} value="starlink" />
        Starlink — POST to home server
      </label>
      <label>
        <input type="radio" bind:group={config.syncTransport} value="usb" />
        USB / Sneakernet — write to USB path
      </label>
    </div>

    <h2>Home URL (Starlink)</h2>
    <div class="form-group">
      <label>AGNI_HOME_URL</label>
      <input type="text" bind:value={config.homeUrl} placeholder="e.g. https://home.example.com" />
      <span class="hint">Endpoint for sync. Events POST to /api/hub-sync.</span>
    </div>

    <h2>USB Path (Sneakernet)</h2>
    <div class="form-group">
      <label>AGNI_USB_PATH</label>
      <input type="text" bind:value={config.usbPath} placeholder="e.g. /mnt/usb/agni-sync" />
      <span class="hint">Export path for sync packages. Import uses: node hub-tools/sync.js --import=/path/to/file.json</span>
    </div>

    <div class="actions">
      <button class="primary" onclick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button class="secondary" onclick={testConnection} disabled={testing}>
        {testing ? 'Testing…' : 'Test Connection'}
      </button>
    </div>
  </div>
{/if}

<style>
  .subtitle {
    opacity: 0.9;
    margin-bottom: 1.5rem;
  }

  .wizard h2 {
    margin-top: 1.5rem;
    margin-bottom: 0.5rem;
  }

  .form-group {
    margin-bottom: 1rem;
  }

  .form-group label {
    display: block;
    margin-bottom: 0.25rem;
  }

  .form-group input[type="text"] {
    width: 100%;
    max-width: 400px;
    padding: 0.5rem;
    background: #1f2b4e;
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  .hint {
    display: block;
    font-size: 0.8rem;
    opacity: 0.7;
    margin-top: 0.25rem;
  }

  .test-result {
    padding: 0.75rem;
    border-radius: 6px;
    margin-bottom: 1rem;
    background: var(--card);
    border: 1px solid var(--border);
  }

  .actions {
    margin-top: 2rem;
    display: flex;
    gap: 0.75rem;
  }

  .primary {
    padding: 0.75rem 1.5rem;
    background: var(--accent);
    color: #1a1a2e;
    border: none;
    border-radius: 6px;
    font-weight: bold;
    cursor: pointer;
  }

  .secondary {
    padding: 0.5rem 1rem;
    background: var(--border);
    color: var(--text);
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }

  .primary:disabled,
  .secondary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .error {
    background: rgba(255, 82, 82, 0.15);
    color: #ff5252;
    padding: 0.75rem;
    border-radius: 6px;
    margin-bottom: 1rem;
  }

  .success {
    background: rgba(0, 230, 118, 0.15);
    color: var(--accent);
    padding: 0.75rem;
    border-radius: 6px;
    margin-bottom: 1rem;
  }

  .warning-box {
    border-color: #ffaa00;
  }
</style>
