<script>
  const FORK_TYPES = ['translation', 'adaptation', 'remix', 'correction'];

  let { fork = $bindable(null), onchange = () => {} } = $props();

  let enabled = $state(fork != null);

  function toggle() {
    enabled = !enabled;
    if (enabled) {
      fork = { source_identifier: '', source_version: '', fork_type: 'adaptation', changes: '' };
    } else {
      fork = null;
    }
    onchange();
  }

  function update(field, value) {
    fork = { ...fork, [field]: value };
    onchange();
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
      <div class="row">
        <div class="form-group">
          <label>Source identifier
            <input type="text" value={fork.source_identifier || ''} oninput={(e) => update('source_identifier', e.target.value)}
                   placeholder="e.g. ols:agni:gravity_v1" />
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
          <label>Source hash
            <input type="text" value={fork.source_hash || ''} oninput={(e) => update('source_hash', e.target.value)}
                   placeholder="sha256:... (optional)" />
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

  .form-group { margin-bottom: 0.6rem; }
  .form-group label { display: block; font-weight: 600; font-size: 0.9rem; margin-bottom: 0.2rem; }
  .form-group input,
  .form-group select,
  .form-group textarea {
    width: 100%; padding: 0.45rem; background: #1a2544; color: var(--text);
    border: 1px solid var(--border); border-radius: 5px; font-size: 0.95rem; font-family: inherit;
  }
  .form-group textarea { resize: vertical; }
  .row { display: flex; gap: 0.75rem; flex-wrap: wrap; }
  .row .form-group { flex: 1; min-width: 140px; }
</style>
