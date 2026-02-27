<script>
  import { hubApiStore } from '$lib/api';
  import { goto } from '$app/navigation';

  const api = $derived($hubApiStore);
  const hubConnected = $derived(!!api.baseUrl);

  let fileInput = $state(null);
  let pasteText = $state('');
  let strategy = $state('merge');
  let loading = $state(false);
  let error = $state('');
  let success = $state('');
  let preview = $state(null);

  $effect(() => { if (!hubConnected) error = 'Configure hub URL in Settings to use import.'; });

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(String(reader.result));
        if (!json.lessonIds || !Array.isArray(json.lessonIds)) {
          error = 'Invalid catalog: must have lessonIds array.';
          preview = null;
        } else {
          preview = json;
          error = '';
        }
      } catch {
        error = 'Invalid JSON file.';
        preview = null;
      }
    };
    reader.readAsText(file);
  }

  function parsePaste() {
    const text = pasteText.trim();
    if (!text) return;
    try {
      const json = JSON.parse(text);
      if (!json.lessonIds || !Array.isArray(json.lessonIds)) {
        error = 'Invalid catalog: must have lessonIds array.';
        preview = null;
      } else {
        preview = json;
        error = '';
      }
    } catch {
      error = 'Invalid JSON.';
      preview = null;
    }
  }

  function clearPreview() {
    preview = null;
    pasteText = '';
    error = '';
    if (fileInput) fileInput.value = '';
  }

  async function doImport() {
    if (!preview || !api.baseUrl) return;
    loading = true;
    error = '';
    success = '';
    try {
      await api.postGovernanceCatalogImport({ catalog: preview, strategy });
      success = `Import complete (${strategy}). ${preview.lessonIds.length} lesson(s).`;
      setTimeout(() => goto('/governance/catalog'), 1500);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    loading = false;
  }
</script>

<h1>Import Catalog (G3)</h1>
<p class="subtitle">Import an approved lesson list from another authority. Conflicts are resolved at import time.</p>

{#if !hubConnected}
  <div class="card warning-box"><p>{error}</p></div>
{:else}
  <div class="card wizard">
    {#if error}
      <div class="error-banner">{error}</div>
    {/if}
    {#if success}
      <div class="success-banner">{success}</div>
    {/if}

    <h2>1. Upload or paste catalog</h2>
    <p class="hint">JSON file or text containing a lessonIds array.</p>
    <div class="upload-section">
      <input type="file" accept=".json,application/json" bind:this={fileInput}
             onchange={handleFileChange} />
      <span class="or">or</span>
      <div class="paste-area">
        <textarea bind:value={pasteText} placeholder="Paste JSON with lessonIds array" rows="4"></textarea>
        <button type="button" class="btn-secondary" onclick={parsePaste}>Parse</button>
      </div>
    </div>

    {#if preview}
      <h2>2. Strategy</h2>
      <p class="hint">How to resolve conflicts with current catalog.</p>
      <div class="strategy-options">
        <label class="radio-label">
          <input type="radio" bind:group={strategy} value="replace" />
          Replace — imported catalog becomes the full set
        </label>
        <label class="radio-label">
          <input type="radio" bind:group={strategy} value="merge" />
          Merge — union of current and imported IDs
        </label>
        <label class="radio-label">
          <input type="radio" bind:group={strategy} value="add-only" />
          Add only — add imported IDs not already present
        </label>
      </div>

      <h2>3. Preview</h2>
      <p>{preview.lessonIds.length} lesson(s) to import.</p>
      <div class="preview-list">
        {#each preview.lessonIds.slice(0, 10) as id}
          <code>{id}</code>
        {/each}
        {#if preview.lessonIds.length > 10}
          <span class="more">… and {preview.lessonIds.length - 10} more</span>
        {/if}
      </div>

      <div class="actions">
        <button class="btn-secondary" onclick={clearPreview}>Clear</button>
        <button class="btn-primary" onclick={doImport} disabled={loading}>
          {loading ? 'Importing…' : 'Import'}
        </button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .wizard h2 { margin-top: 1.5rem; margin-bottom: 0.5rem; }
  .wizard h2:first-of-type { margin-top: 0; }

  .upload-section { display: flex; flex-direction: column; gap: 0.75rem; }
  .or { opacity: 0.7; }
  .paste-area { display: flex; flex-direction: column; gap: 0.5rem; }
  .paste-area textarea {
    width: 100%; padding: 0.6rem; background: #1f2b4e; color: var(--text);
    border: 1px solid var(--border); border-radius: 6px;
    font-family: monospace; font-size: 0.9rem; resize: vertical;
  }

  .strategy-options { display: flex; flex-direction: column; gap: 0.5rem; }
  .radio-label {
    display: flex; align-items: center; gap: 0.5rem;
    font-weight: normal; cursor: pointer;
  }

  .preview-list { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 0.5rem 0; }
  .preview-list code {
    background: var(--border); padding: 0.2rem 0.5rem;
    border-radius: 4px; font-size: 0.85rem;
  }
  .more { opacity: 0.8; }

  .actions { margin-top: 2rem; display: flex; gap: 1rem; }
</style>
