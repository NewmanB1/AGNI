<script>
  import { hubApiStore } from '$lib/api';
  import { onMount } from 'svelte';

  let config = {
    dataDir: '',
    serveDir: '',
    thetaPort: 8082,
    approvedCatalog: '',
    minLocalSample: 40,
    minLocalEdges: 5,
    yamlDir: '',
    factoryDir: '',
    katexDir: '',
    servePort: 8083,
    cacheMax: 100
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
            dataDir: c.dataDir || '',
            serveDir: c.serveDir || '',
            thetaPort: typeof c.thetaPort === 'number' ? c.thetaPort : 8082,
            approvedCatalog: c.approvedCatalog || '',
            minLocalSample: typeof c.minLocalSample === 'number' ? c.minLocalSample : 40,
            minLocalEdges: typeof c.minLocalEdges === 'number' ? c.minLocalEdges : 5,
            yamlDir: c.yamlDir || '',
            factoryDir: c.factoryDir || '',
            katexDir: c.katexDir || '',
            servePort: typeof c.servePort === 'number' ? c.servePort : 8083,
            cacheMax: typeof c.cacheMax === 'number' ? c.cacheMax : 100
          };
        }
      } catch (e) {
        error = 'Could not load config: ' + (e instanceof Error ? e.message : String(e));
      }
    } else {
      error = 'Configure hub URL in Settings to use admin wizards.';
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
    const payload = {};
    if (config.dataDir) payload.dataDir = config.dataDir;
    if (config.serveDir) payload.serveDir = config.serveDir;
    if (config.thetaPort) payload.thetaPort = config.thetaPort;
    if (config.approvedCatalog) payload.approvedCatalog = config.approvedCatalog;
    if (config.minLocalSample != null) payload.minLocalSample = config.minLocalSample;
    if (config.minLocalEdges != null) payload.minLocalEdges = config.minLocalEdges;
    if (config.yamlDir) payload.yamlDir = config.yamlDir;
    if (config.factoryDir) payload.factoryDir = config.factoryDir;
    if (config.katexDir) payload.katexDir = config.katexDir;
    if (config.servePort != null) payload.servePort = config.servePort;
    if (config.cacheMax != null) payload.cacheMax = config.cacheMax;
    try {
      const res = await $hubApiStore.putAdminConfig(payload);
      success = res.message || 'Config saved. Restart hub for changes to take effect.';
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    saving = false;
  }

  function downloadEnv() {
    const lines = [];
    if (config.dataDir) lines.push('AGNI_DATA_DIR=' + config.dataDir);
    if (config.serveDir) lines.push('AGNI_SERVE_DIR=' + config.serveDir);
    if (config.thetaPort) lines.push('AGNI_THETA_PORT=' + config.thetaPort);
    if (config.approvedCatalog) lines.push('AGNI_APPROVED_CATALOG=' + config.approvedCatalog);
    if (config.minLocalSample != null) lines.push('AGNI_MIN_LOCAL_SAMPLE=' + config.minLocalSample);
    if (config.minLocalEdges != null) lines.push('AGNI_MIN_LOCAL_EDGES=' + config.minLocalEdges);
    if (config.yamlDir) lines.push('AGNI_YAML_DIR=' + config.yamlDir);
    if (config.factoryDir) lines.push('AGNI_FACTORY_DIR=' + config.factoryDir);
    if (config.katexDir) lines.push('AGNI_KATEX_DIR=' + config.katexDir);
    if (config.servePort != null) lines.push('AGNI_SERVE_PORT=' + config.servePort);
    if (config.cacheMax != null) lines.push('AGNI_CACHE_MAX=' + config.cacheMax);
    const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'agni.env';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function downloadJson() {
    const payload = {};
    if (config.dataDir) payload.dataDir = config.dataDir;
    if (config.serveDir) payload.serveDir = config.serveDir;
    if (config.thetaPort) payload.thetaPort = config.thetaPort;
    if (config.approvedCatalog) payload.approvedCatalog = config.approvedCatalog;
    if (config.minLocalSample != null) payload.minLocalSample = config.minLocalSample;
    if (config.minLocalEdges != null) payload.minLocalEdges = config.minLocalEdges;
    if (config.yamlDir) payload.yamlDir = config.yamlDir;
    if (config.factoryDir) payload.factoryDir = config.factoryDir;
    if (config.katexDir) payload.katexDir = config.katexDir;
    if (config.servePort != null) payload.servePort = config.servePort;
    if (config.cacheMax != null) payload.cacheMax = config.cacheMax;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'hub_config.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }
</script>

<h1>Hub Setup (A1)</h1>
<p class="subtitle">Configure data paths, ports, and cache. Save to hub or download env/hub_config.json.</p>

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

    <h2>Paths</h2>
    <div class="form-group">
      <label>Data directory (AGNI_DATA_DIR)</label>
      <input type="text" bind:value={config.dataDir} placeholder="e.g. /var/agni/data" />
    </div>
    <div class="form-group">
      <label>Serve directory (AGNI_SERVE_DIR)</label>
      <input type="text" bind:value={config.serveDir} placeholder="e.g. ./serve" />
    </div>
    <div class="form-group">
      <label>YAML directory (AGNI_YAML_DIR)</label>
      <input type="text" bind:value={config.yamlDir} placeholder="e.g. data/yaml" />
    </div>
    <div class="form-group">
      <label>Factory directory (AGNI_FACTORY_DIR)</label>
      <input type="text" bind:value={config.factoryDir} placeholder="e.g. src/runtime" />
    </div>
    <div class="form-group">
      <label>KaTeX directory (AGNI_KATEX_DIR)</label>
      <input type="text" bind:value={config.katexDir} placeholder="e.g. data/katex-css" />
    </div>
    <div class="form-group">
      <label>Approved catalog path (AGNI_APPROVED_CATALOG)</label>
      <input type="text" bind:value={config.approvedCatalog} placeholder="e.g. data/approved_catalog.json" />
    </div>

    <h2>Ports</h2>
    <div class="row">
      <div class="form-group">
        <label>Theta port (AGNI_THETA_PORT)</label>
        <input type="number" bind:value={config.thetaPort} min="1" max="65535" />
      </div>
      <div class="form-group">
        <label>Serve port (AGNI_SERVE_PORT, hub-transform)</label>
        <input type="number" bind:value={config.servePort} min="1" max="65535" />
      </div>
    </div>

    <h2>Cache &amp; Graph</h2>
    <div class="row">
      <div class="form-group">
        <label>Min local sample size (AGNI_MIN_LOCAL_SAMPLE)</label>
        <input type="number" bind:value={config.minLocalSample} min="0" />
      </div>
      <div class="form-group">
        <label>Min local edges (AGNI_MIN_LOCAL_EDGES)</label>
        <input type="number" bind:value={config.minLocalEdges} min="0" />
      </div>
      <div class="form-group">
        <label>Lesson cache max (AGNI_CACHE_MAX)</label>
        <input type="number" bind:value={config.cacheMax} min="1" />
      </div>
    </div>

    <div class="actions">
      <button class="primary" onclick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save to Hub'}
      </button>
      <button class="secondary" onclick={downloadEnv}>Download .env snippet</button>
      <button class="secondary" onclick={downloadJson}>Download hub_config.json</button>
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

  .wizard h2:first-child {
    margin-top: 0;
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
    padding: 0.5rem;
    background: #1f2b4e;
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  .row {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .row .form-group {
    flex: 1;
    min-width: 140px;
  }

  .actions {
    margin-top: 2rem;
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
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
