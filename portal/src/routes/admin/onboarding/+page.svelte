<script>
  import { hubApiStore } from '$lib/api';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  let config = {
    dataDir: '',
    thetaPort: 8082,
    createPolicy: true
  };

  let loading = true;
  let saving = false;
  let error = '';
  let hubConnected = false;
  let isFirstRun = false;

  onMount(async () => {
    loading = true;
    error = '';
    if ($hubApiStore.baseUrl) {
      try {
        const s = await $hubApiStore.getOnboardingStatus();
        hubConnected = true;
        isFirstRun = s.isFirstRun === true;
        if (!isFirstRun) {
          goto('/admin/hub', { replaceState: true });
          return;
        }
        const c = await $hubApiStore.getAdminConfig().catch(() => null);
        if (c && typeof c === 'object' && c.dataDir) {
          config.dataDir = c.dataDir || '';
          config.thetaPort = typeof c.thetaPort === 'number' ? c.thetaPort : 8082;
        }
      } catch (e) {
        error = 'Could not reach hub: ' + (e instanceof Error ? e.message : String(e));
      }
    } else {
      error = 'Hub not connected. Set VITE_HUB_URL to use onboarding.';
    }
    loading = false;
  });

  async function complete() {
    if (!$hubApiStore.baseUrl) {
      error = 'Hub not connected.';
      return;
    }
    saving = true;
    error = '';
    const payload = {
      thetaPort: config.thetaPort,
      minLocalSample: 40,
      minLocalEdges: 5,
      cacheMax: 100
    };
    if (config.dataDir) payload.dataDir = config.dataDir;
    try {
      await $hubApiStore.putAdminConfig(payload);
      if (config.createPolicy) {
        await $hubApiStore.putGovernancePolicy({
          minDifficulty: 1,
          maxDifficulty: 5,
          requireUtu: false,
          requireTeachingMode: false
        }).catch(() => {});
      }
      goto('/admin/hub', { replaceState: true });
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    saving = false;
  }
</script>

<h1>Hub Onboarding (A3)</h1>
<p class="subtitle">First-run setup. Minimal config to provision a new hub in one flow.</p>

{#if loading}
  <p>Checking hub…</p>
{:else if !hubConnected}
  <div class="card warning-box">
    <p>{error}</p>
    <p class="hint">Start the theta hub (<code>node hub-tools/theta.js</code>) and configure the hub URL in <a href="/settings">Settings</a>.</p>
  </div>
{:else}
  <div class="card wizard">
    {#if error}
      <div class="error">{error}</div>
    {/if}

    <p>This hub has no config yet. Set minimal values and create config in one step.</p>

    <div class="form-group">
      <label>Data directory (optional)</label>
      <input type="text" bind:value={config.dataDir} placeholder="e.g. ./data (leave blank for default)" />
    </div>
    <div class="form-group">
      <label>Theta port</label>
      <input type="number" bind:value={config.thetaPort} min="1" max="65535" />
    </div>
    <label class="checkbox-label">
      <input type="checkbox" bind:checked={config.createPolicy} />
      Create default governance policy (min/max difficulty)
    </label>

    <div class="actions">
      <button class="primary" onclick={complete} disabled={saving}>
        {saving ? 'Creating…' : 'Create Config'}
      </button>
    </div>
  </div>
{/if}

<style>
  .subtitle {
    opacity: 0.9;
    margin-bottom: 1.5rem;
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

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 1rem 0;
  }

  .actions {
    margin-top: 1.5rem;
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

  .hint {
    margin-top: 0.5rem;
    font-size: 0.9rem;
    opacity: 0.8;
  }

  .warning-box {
    border-color: #ffaa00;
  }
</style>
