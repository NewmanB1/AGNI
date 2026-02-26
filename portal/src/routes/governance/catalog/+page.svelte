<script>
  import { hubApi } from '$lib/api';
  import { onMount } from 'svelte';

  let catalog = { lessonIds: [] };
  let loading = true;
  let error = '';
  let success = '';
  let hubConnected = false;
  let newId = '';
  let saving = false;

  onMount(loadCatalog);

  async function loadCatalog() {
    loading = true;
    error = '';
    if (hubApi.baseUrl) {
      try {
        catalog = await hubApi.getGovernanceCatalog();
        if (!catalog.lessonIds) catalog.lessonIds = [];
        hubConnected = true;
      } catch (e) {
        error = 'Could not load catalog: ' + (e instanceof Error ? e.message : String(e));
      }
    } else {
      error = 'Hub not connected. Set VITE_HUB_URL to use governance wizards.';
    }
    loading = false;
  }

  async function addLesson() {
    const id = newId.trim();
    if (!id || !hubApi.baseUrl) return;
    saving = true;
    error = '';
    success = '';
    try {
      const res = await hubApi.postGovernanceCatalog({ add: [id] });
      catalog = res.catalog;
      newId = '';
      success = 'Added ' + id;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    saving = false;
  }

  async function removeLesson(id) {
    if (!hubApi.baseUrl) return;
    saving = true;
    error = '';
    success = '';
    try {
      const res = await hubApi.postGovernanceCatalog({ remove: [id] });
      catalog = res.catalog;
      success = 'Removed ' + id;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    saving = false;
  }

  function exportCatalog() {
    const blob = new Blob([JSON.stringify(catalog, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'approved_catalog_' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    success = 'Catalog exported.';
  }
</script>

<h1>Approved Catalog (G2)</h1>
<p class="subtitle">Manage the set of governance-approved lesson IDs. Theta filters eligible lessons to this set.</p>

{#if loading}
  <p>Loading catalog…</p>
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

    <div class="add-row">
      <input
        type="text"
        bind:value={newId}
        placeholder="Lesson ID (e.g. ols:physics:gravity_v1)"
        on:keydown={(e) => e.key === 'Enter' && addLesson()}
      />
      <button class="primary" on:click={addLesson} disabled={saving || !newId.trim()}>
        Add
      </button>
    </div>

    <h2>Approved lessons ({catalog.lessonIds.length})</h2>
    {#if catalog.lessonIds.length === 0}
      <p class="empty">No approved lessons. Add IDs above or <a href="/governance/catalog/import">import from another authority</a>.</p>
    {:else}
      <ul class="lesson-list">
        {#each catalog.lessonIds as id}
          <li>
            <span class="id">{id}</span>
            <button type="button" class="small remove" on:click={() => removeLesson(id)}>Remove</button>
          </li>
        {/each}
      </ul>
    {/if}

    <div class="actions">
      <button class="secondary" on:click={exportCatalog}>Export catalog (G4)</button>
      <a href="/governance/catalog/import" class="link-btn">Import from another authority →</a>
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

  .add-row {
    display: flex;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .add-row input {
    flex: 1;
    padding: 0.6rem;
    background: #1f2b4e;
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  .lesson-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .lesson-list li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--border);
  }

  .lesson-list .id {
    font-family: monospace;
    font-size: 0.9rem;
  }

  .small.remove {
    padding: 0.3rem 0.6rem;
    font-size: 0.85rem;
    background: rgba(255, 82, 82, 0.2);
    color: #ff5252;
  }

  .empty {
    opacity: 0.8;
    margin: 0.5rem 0;
  }

  .actions {
    margin-top: 2rem;
    display: flex;
    gap: 1rem;
    align-items: center;
  }

  .secondary {
    padding: 0.6rem 1rem;
    background: var(--border);
    color: var(--text);
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }

  .primary {
    padding: 0.6rem 1.2rem;
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

  .link-btn {
    color: var(--accent);
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
