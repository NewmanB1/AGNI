<script>
  import { hubApiStore } from '$lib/api';

  const FORK_TYPES = ['translation', 'adaptation', 'remix', 'correction'];

  let { fork = $bindable(null), onchange = () => {} } = $props();

  const api = $derived($hubApiStore);

  let enabled = $state(fork != null);
  let sourceSlug = $state('');
  let forkCheck = $state(null);
  let checking = $state(false);
  let checkError = $state('');

  function toggle() {
    enabled = !enabled;
    if (enabled) {
      fork = { source_identifier: '', source_version: '', fork_type: 'adaptation', changes: '' };
    } else {
      fork = null;
      forkCheck = null;
      checkError = '';
    }
    onchange();
  }

  function update(field, value) {
    fork = { ...fork, [field]: value };
    onchange();
  }

  async function checkPermission() {
    if (!sourceSlug.trim()) { checkError = 'Enter a source lesson slug'; return; }
    checking = true;
    checkError = '';
    forkCheck = null;
    try {
      const result = await api.checkForkPermission(sourceSlug.trim());
      forkCheck = result;
      if (result.allowed && fork) {
        fork = {
          ...fork,
          source_identifier: result.sourceUri || sourceSlug.trim(),
          source_hash: result.sourceHash || ''
        };
        onchange();
      }
    } catch (e) {
      checkError = e instanceof Error ? e.message : 'Check failed';
    } finally {
      checking = false;
    }
  }

  $effect(() => { enabled = fork != null; });
</script>

<section class="fork-editor">
  <div class="fork-header">
    <h2>Fork Provenance</h2>
    <label class="toggle-label">
      <input type="checkbox" checked={enabled} onchange={toggle} />
      {enabled ? 'Enabled' : 'Disabled'}
    </label>
  </div>

  {#if !enabled}
    <p class="hint">Not a fork. Toggle on if this lesson is derived from another.</p>
  {:else if fork}
    <div class="fork-fields">
      <div class="permission-check">
        <label>Check source lesson's fork permission
          <div class="check-row">
            <input type="text" bind:value={sourceSlug} placeholder="Source lesson slug" class="check-input" />
            <button class="check-btn" onclick={checkPermission} disabled={checking}>
              {checking ? 'Checking...' : 'Check'}
            </button>
          </div>
        </label>
        {#if checkError}
          <p class="check-error">{checkError}</p>
        {/if}
        {#if forkCheck}
          {#if forkCheck.allowed}
            <div class="check-result allowed">
              Forking allowed under <strong>{forkCheck.license}</strong>.
              {#if forkCheck.nonCommercial}
                <span class="nc-warning">Non-commercial only — your fork must also be non-commercial.</span>
              {/if}
              {#if forkCheck.inheritedLicense}
                <span class="sa-notice">ShareAlike: your fork must use <strong>{forkCheck.inheritedLicense}</strong>.</span>
              {/if}
              {#if forkCheck.sourceUri}
                <br/>Source URI: <code>{forkCheck.sourceUri}</code>
              {/if}
            </div>
          {:else}
            <div class="check-result denied">
              Forking NOT allowed: {forkCheck.reason}
            </div>
          {/if}
        {/if}
      </div>

      <div class="row">
        <div class="form-group">
          <label>Source identifier / URI
            <input type="text" value={fork.source_identifier || ''} oninput={(e) => update('source_identifier', e.target.value)}
                   placeholder="agni:cr-.../lesson-slug" />
          </label>
        </div>
        <div class="form-group">
          <label>Source version
            <input type="text" value={fork.source_version || ''} oninput={(e) => update('source_version', e.target.value)}
                   placeholder="e.g. 1.7.0" />
          </label>
        </div>
      </div>

      <div class="row">
        <div class="form-group">
          <label>Fork type
            <select value={fork.fork_type || 'adaptation'} onchange={(e) => update('fork_type', e.target.value)}>
              {#each FORK_TYPES as t}
                <option value={t}>{t}</option>
              {/each}
            </select>
          </label>
        </div>
        <div class="form-group">
          <label>Source content hash
            <input type="text" value={fork.source_hash || ''} oninput={(e) => update('source_hash', e.target.value)}
                   placeholder="sha256:... (auto-populated from check)" readonly={!!forkCheck?.sourceHash} />
          </label>
        </div>
      </div>

      <div class="form-group">
        <label>Changes
          <textarea value={fork.changes || ''} oninput={(e) => update('changes', e.target.value)}
                    rows="2" placeholder="What changed from the source lesson"></textarea>
        </label>
      </div>
    </div>
  {/if}
</section>

<style>
  .fork-editor { margin-top: 0.5rem; }
  .fork-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
  .fork-header h2 { margin: 0; }
  .toggle-label {
    display: flex; align-items: center; gap: 0.4rem; cursor: pointer;
    font-size: 0.9rem; font-weight: 600;
  }
  .toggle-label input[type="checkbox"] { accent-color: var(--accent); }
  .hint { opacity: 0.7; font-style: italic; font-size: 0.9rem; }

  .fork-fields {
    border: 1px solid var(--border);
    border-left: 3px solid #26a69a;
    border-radius: 8px;
    padding: 0.75rem 1rem;
    background: rgba(31,43,78,0.5);
  }

  .permission-check {
    margin-bottom: 1rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--border, #333);
  }
  .permission-check label { display: block; font-weight: 600; font-size: 0.9rem; margin-bottom: 0.3rem; }
  .check-row { display: flex; gap: 0.5rem; }
  .check-input {
    flex: 1; padding: 0.45rem; background: #1a2544; color: var(--text);
    border: 1px solid var(--border); border-radius: 5px; font-size: 0.95rem;
  }
  .check-btn {
    padding: 0.4rem 0.8rem; background: var(--accent, #4fc3f7); color: #000;
    border: none; border-radius: 5px; font-weight: 600; cursor: pointer; font-size: 0.85rem;
    white-space: nowrap;
  }
  .check-btn:disabled { opacity: 0.5; cursor: wait; }
  .check-error { color: #ff5252; font-size: 0.85rem; margin: 0.3rem 0 0; }
  .check-result {
    margin-top: 0.5rem; padding: 0.5rem 0.75rem; border-radius: 6px; font-size: 0.85rem; line-height: 1.5;
  }
  .check-result.allowed { background: #1b3a1b; border: 1px solid #2e7d32; color: #a5d6a7; }
  .check-result.denied { background: #3a1b1b; border: 1px solid #c62828; color: #ef9a9a; }
  .check-result code { background: rgba(0,0,0,0.3); padding: 0.1rem 0.3rem; border-radius: 3px; font-size: 0.8rem; }
  .nc-warning { display: block; color: #ffab40; margin-top: 0.25rem; }
  .sa-notice { display: block; color: #81d4fa; margin-top: 0.25rem; }

  .form-group { margin-bottom: 0.6rem; }
  .form-group label { display: block; font-weight: 600; font-size: 0.9rem; margin-bottom: 0.2rem; }
  .form-group input,
  .form-group select,
  .form-group textarea {
    width: 100%; padding: 0.45rem; background: #1a2544; color: var(--text);
    border: 1px solid var(--border); border-radius: 5px; font-size: 0.95rem; font-family: inherit;
  }
  .form-group input[readonly] { opacity: 0.7; cursor: not-allowed; }
  .form-group textarea { resize: vertical; }
  .row { display: flex; gap: 0.75rem; flex-wrap: wrap; }
  .row .form-group { flex: 1; min-width: 140px; }
</style>
