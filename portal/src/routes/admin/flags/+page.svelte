<script>
  import { hubApiStore } from '$lib/api';
  import { onMount } from 'svelte';

  const api = $derived($hubApiStore);

  let loading = $state(true);
  let error = $state('');
  let success = $state('');
  let hubConnected = $state(false);

  /** @type {Record<string, import('$lib/api').FeatureFlag>} */
  let flags = $state({});

  let newName = $state('');
  let newDesc = $state('');
  let newRollout = $state(100);
  let newMetric = $state('');
  let creating = $state(false);

  /** @type {string | null} */
  let expandedFlag = $state(null);
  /** @type {import('$lib/api').FlagResults | null} */
  let results = $state(null);
  let resultsLoading = $state(false);

  /** @type {string | null} */
  let editingFlag = $state(null);
  let editRollout = $state(100);
  let editDesc = $state('');
  let editMetric = $state('');
  let editEnabled = $state(true);
  let saving = $state(false);

  onMount(async () => {
    loading = true;
    error = '';
    if (api.baseUrl) {
      try {
        const data = await api.getFlags();
        flags = data.flags || {};
        hubConnected = true;
      } catch (e) {
        error = 'Could not load flags: ' + (e instanceof Error ? e.message : String(e));
      }
    } else {
      error = 'Configure hub URL in Settings to manage feature flags.';
    }
    loading = false;
  });

  const flagNames = $derived(Object.keys(flags).sort());

  async function createFlag() {
    if (!newName.trim()) { error = 'Flag name is required.'; return; }
    creating = true;
    error = '';
    success = '';
    try {
      const { flag } = await api.putFlag(newName.trim(), {
        enabled: true,
        rollout: newRollout,
        description: newDesc.trim(),
        metric: newMetric.trim() || null
      });
      flags[newName.trim()] = flag;
      flags = { ...flags };
      success = `Flag "${newName.trim()}" created.`;
      newName = '';
      newDesc = '';
      newRollout = 100;
      newMetric = '';
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    creating = false;
  }

  function startEdit(name) {
    editingFlag = name;
    const f = flags[name];
    editEnabled = f.enabled;
    editRollout = f.rollout;
    editDesc = f.description || '';
    editMetric = f.metric || '';
  }

  async function saveEdit() {
    if (!editingFlag) return;
    saving = true;
    error = '';
    success = '';
    try {
      const { flag } = await api.putFlag(editingFlag, {
        enabled: editEnabled,
        rollout: editRollout,
        description: editDesc.trim(),
        metric: editMetric.trim() || null
      });
      flags[editingFlag] = flag;
      flags = { ...flags };
      success = `Flag "${editingFlag}" updated.`;
      editingFlag = null;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    saving = false;
  }

  async function toggleResults(name) {
    if (expandedFlag === name) {
      expandedFlag = null;
      results = null;
      return;
    }
    expandedFlag = name;
    results = null;
    resultsLoading = true;
    try {
      results = await api.getFlagResults(name);
    } catch (e) {
      error = 'Could not load results: ' + (e instanceof Error ? e.message : String(e));
    }
    resultsLoading = false;
  }
</script>

<svelte:head>
  <title>Feature Flags — AGNI Admin</title>
</svelte:head>

{#if loading}
  <p>Loading…</p>
{:else if !hubConnected}
  <div class="card warning-box"><p>{error}</p></div>
{:else}
  <div class="card">
    <h1>Feature Flags</h1>
    <p class="subtitle">Manage A/B tests and feature rollouts. Flags use deterministic student bucketing.</p>

    {#if error}<div class="error-banner">{error}</div>{/if}
    {#if success}<div class="success-banner">{success}</div>{/if}

    <h2>Create Flag</h2>
    <div class="create-form">
      <div class="row">
        <label>
          Name
          <input type="text" bind:value={newName} placeholder="e.g. new_quiz_layout" />
        </label>
        <label>
          Rollout %
          <input type="number" bind:value={newRollout} min="0" max="100" />
        </label>
        <label>
          Metric
          <input type="text" bind:value={newMetric} placeholder="mastery, completion_rate, frustration_score" />
        </label>
      </div>
      <label>
        Description
        <input type="text" bind:value={newDesc} placeholder="What does this flag control?" />
      </label>
      <button class="btn-primary" onclick={createFlag} disabled={creating || !newName.trim()}>
        {creating ? 'Creating…' : 'Create Flag'}
      </button>
    </div>

    <h2>Active Flags ({flagNames.length})</h2>
    {#if flagNames.length === 0}
      <p class="empty">No feature flags defined yet.</p>
    {:else}
      <table class="flags-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Enabled</th>
            <th>Rollout</th>
            <th>Metric</th>
            <th>Description</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each flagNames as name}
            {@const f = flags[name]}
            <tr class:disabled-row={!f.enabled}>
              <td class="flag-name">{name}</td>
              <td><span class="badge" class:on={f.enabled} class:off={!f.enabled}>{f.enabled ? 'ON' : 'OFF'}</span></td>
              <td>{f.rollout}%</td>
              <td>{f.metric || '—'}</td>
              <td class="desc">{f.description || '—'}</td>
              <td class="actions">
                <button class="link-btn" onclick={() => startEdit(name)}>Edit</button>
                <button class="link-btn" onclick={() => toggleResults(name)}>
                  {expandedFlag === name ? 'Hide' : 'A/B Results'}
                </button>
              </td>
            </tr>
            {#if expandedFlag === name}
              <tr class="results-row">
                <td colspan="6">
                  {#if resultsLoading}
                    <p>Loading results…</p>
                  {:else if results}
                    <div class="results-grid">
                      <div class="result-card treatment">
                        <strong>Treatment</strong>
                        <span class="count">{results.treatment.count} students</span>
                        <span class="avg">avg {results.metric}: {results.treatment.avg}</span>
                      </div>
                      <div class="result-card control">
                        <strong>Control</strong>
                        <span class="count">{results.control.count} students</span>
                        <span class="avg">avg {results.metric}: {results.control.avg}</span>
                      </div>
                    </div>
                  {:else}
                    <p>No results available.</p>
                  {/if}
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    {/if}
  </div>

  {#if editingFlag}
    <div class="modal-overlay" onclick={() => editingFlag = null}>
      <div class="modal" onclick={(e) => e.stopPropagation()}>
        <h2>Edit: {editingFlag}</h2>
        <label>
          <input type="checkbox" bind:checked={editEnabled} />
          Enabled
        </label>
        <label>
          Rollout %
          <input type="number" bind:value={editRollout} min="0" max="100" />
        </label>
        <label>
          Description
          <input type="text" bind:value={editDesc} />
        </label>
        <label>
          Metric
          <input type="text" bind:value={editMetric} placeholder="mastery, completion_rate, frustration_score" />
        </label>
        <div class="modal-actions">
          <button class="btn-primary" onclick={saveEdit} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button class="btn-secondary" onclick={() => editingFlag = null}>Cancel</button>
        </div>
      </div>
    </div>
  {/if}
{/if}

<style>
  .card { max-width: 900px; }
  .subtitle { opacity: 0.7; margin-top: 0; }
  .error-banner { background: rgba(255, 100, 100, 0.15); color: #ff6b6b; padding: 0.75rem; border-radius: 6px; margin-bottom: 1rem; }
  .success-banner { background: rgba(74, 222, 128, 0.15); color: #4ade80; padding: 0.75rem; border-radius: 6px; margin-bottom: 1rem; }
  .warning-box { color: #ff6b6b; }

  h2 { margin-top: 2rem; margin-bottom: 0.75rem; }

  .create-form {
    background: rgba(255,255,255,0.03);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1.5rem;
  }
  .create-form .row { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 0.75rem; }
  .create-form .row label { flex: 1; min-width: 150px; }
  .create-form label { display: block; font-weight: 600; margin-bottom: 0.5rem; font-size: 0.9rem; }
  .create-form input[type="text"],
  .create-form input[type="number"] {
    display: block;
    width: 100%;
    padding: 0.5rem;
    margin-top: 0.25rem;
    background: #1f2b4e;
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 0.95rem;
  }
  .create-form input[type="number"] { max-width: 100px; }

  .btn-primary {
    padding: 0.5rem 1.2rem;
    background: var(--accent);
    color: #1a1a2e;
    border: none;
    border-radius: 6px;
    font-weight: bold;
    cursor: pointer;
    margin-top: 0.5rem;
  }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

  .btn-secondary {
    padding: 0.5rem 1.2rem;
    background: transparent;
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
  }

  .flags-table { width: 100%; border-collapse: collapse; }
  .flags-table th, .flags-table td { padding: 0.6rem 0.75rem; text-align: left; border-bottom: 1px solid var(--border); }
  .flags-table th { font-size: 0.85rem; text-transform: uppercase; opacity: 0.7; }
  .flag-name { font-family: monospace; font-weight: 600; }
  .desc { max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .disabled-row { opacity: 0.5; }

  .badge {
    display: inline-block;
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
    font-size: 0.8rem;
    font-weight: bold;
  }
  .badge.on { background: rgba(74, 222, 128, 0.2); color: #4ade80; }
  .badge.off { background: rgba(255, 100, 100, 0.2); color: #ff6b6b; }

  .actions { display: flex; gap: 0.5rem; }
  .link-btn {
    background: none;
    border: none;
    color: var(--accent);
    cursor: pointer;
    font-size: 0.85rem;
    text-decoration: underline;
    padding: 0;
  }

  .results-row td { background: rgba(255,255,255,0.02); }
  .results-grid { display: flex; gap: 1.5rem; padding: 0.5rem 0; }
  .result-card {
    flex: 1;
    padding: 0.75rem 1rem;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .result-card.treatment { background: rgba(74, 222, 128, 0.08); border: 1px solid rgba(74, 222, 128, 0.2); }
  .result-card.control { background: rgba(100, 149, 237, 0.08); border: 1px solid rgba(100, 149, 237, 0.2); }
  .result-card strong { font-size: 0.9rem; }
  .result-card .count { font-size: 0.85rem; opacity: 0.8; }
  .result-card .avg { font-size: 1.1rem; font-weight: 600; }

  .empty { opacity: 0.6; font-style: italic; }

  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }
  .modal {
    background: var(--card, #1a1a2e);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1.5rem;
    min-width: 360px;
    max-width: 480px;
  }
  .modal h2 { margin-top: 0; }
  .modal label { display: block; font-weight: 600; margin-bottom: 0.75rem; font-size: 0.9rem; }
  .modal input[type="text"],
  .modal input[type="number"] {
    display: block;
    width: 100%;
    padding: 0.5rem;
    margin-top: 0.25rem;
    background: #1f2b4e;
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
  }
  .modal input[type="number"] { max-width: 100px; }
  .modal input[type="checkbox"] { margin-right: 0.4rem; }
  .modal-actions { display: flex; gap: 0.75rem; margin-top: 1rem; }
</style>
