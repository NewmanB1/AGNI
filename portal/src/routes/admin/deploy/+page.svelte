<script>
  import { hubApiStore } from '$lib/api';
  import { onMount } from 'svelte';

  let config = {
    hubId: '',
    homeUrl: '',
    thetaPort: 8082,
    servePort: 8083,
    sentryPort: 8081,
    usbPath: ''
  };

  let loading = true;
  let saving = false;
  let error = '';
  let success = '';
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
            hubId: c.hubId || '',
            homeUrl: c.homeUrl || '',
            thetaPort: typeof c.thetaPort === 'number' ? c.thetaPort : 8082,
            servePort: typeof c.servePort === 'number' ? c.servePort : 8083,
            sentryPort: typeof c.sentryPort === 'number' ? c.sentryPort : 8081,
            usbPath: c.usbPath || ''
          };
        }
      } catch (e) {
        error = 'Could not load config: ' + (e instanceof Error ? e.message : String(e));
      }
    } else {
      error = 'Configure hub URL in Settings to use deployment wizard.';
    }
    loading = false;
  });

  async function save() {
    if (!$hubApiStore.baseUrl) {
      error = 'Hub not connected.';
      return;
    }
    saving = true;
    error = '';
    success = '';
    let current = {};
    try {
      current = await $hubApiStore.getAdminConfig();
    } catch (e) {}
    const payload = { ...current };
    if (config.hubId) payload.hubId = config.hubId;
    if (config.homeUrl !== undefined) payload.homeUrl = config.homeUrl;
    if (config.thetaPort) payload.thetaPort = config.thetaPort;
    if (config.servePort != null) payload.servePort = config.servePort;
    if (config.sentryPort != null) payload.sentryPort = config.sentryPort;
    if (config.usbPath !== undefined) payload.usbPath = config.usbPath;
    try {
      const res = await $hubApiStore.putAdminConfig(payload);
      success = res.message || 'Config saved. Restart hub, sync, and Sentry for changes to take effect.';
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    saving = false;
  }

  function downloadEnv() {
    const lines = [];
    if (config.hubId) lines.push('AGNI_HUB_ID=' + config.hubId);
    if (config.homeUrl) lines.push('AGNI_HOME_URL=' + config.homeUrl);
    if (config.thetaPort) lines.push('AGNI_THETA_PORT=' + config.thetaPort);
    if (config.servePort != null) lines.push('AGNI_SERVE_PORT=' + config.servePort);
    if (config.sentryPort != null) lines.push('AGNI_SENTRY_PORT=' + config.sentryPort);
    if (config.usbPath) lines.push('AGNI_USB_PATH=' + config.usbPath);
    const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'agni-deploy.env';
    a.click();
    URL.revokeObjectURL(a.href);
  }
</script>

<h1>Deployment (F1)</h1>
<p class="subtitle">Field tech: provision hub ID, home URL, ports, USB path for sync. One-flow setup.</p>

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

    <h2>Identity &amp; Sync</h2>
    <div class="form-group">
      <label>Hub ID (AGNI_HUB_ID)</label>
      <input type="text" bind:value={config.hubId} placeholder="e.g. village-alpha-01" />
      <span class="hint">Unique ID for this hub; used in sync packages.</span>
    </div>
    <div class="form-group">
      <label>Home URL (AGNI_HOME_URL)</label>
      <input type="text" bind:value={config.homeUrl} placeholder="e.g. https://home.example.com" />
      <span class="hint">Starlink endpoint for sync; leave blank for USB-only.</span>
    </div>
    <div class="form-group">
      <label>USB path (AGNI_USB_PATH)</label>
      <input type="text" bind:value={config.usbPath} placeholder="e.g. /mnt/usb/agni-sync" />
      <span class="hint">Sneakernet export/import path.</span>
    </div>

    <h2>Ports</h2>
    <div class="row">
      <div class="form-group">
        <label>Theta (AGNI_THETA_PORT)</label>
        <input type="number" bind:value={config.thetaPort} min="1" max="65535" />
      </div>
      <div class="form-group">
        <label>Serve (AGNI_SERVE_PORT)</label>
        <input type="number" bind:value={config.servePort} min="1" max="65535" />
      </div>
      <div class="form-group">
        <label>Sentry (AGNI_SENTRY_PORT)</label>
        <input type="number" bind:value={config.sentryPort} min="1" max="65535" />
      </div>
    </div>

    <div class="actions">
      <button class="primary" onclick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button class="secondary" onclick={downloadEnv}>Download .env snippet</button>
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
    font-size: 0.9rem;
    margin-bottom: 0.25rem;
  }

  .form-group input {
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

  .row {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .row .form-group {
    flex: 1;
    min-width: 120px;
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

  .primary:disabled {
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
