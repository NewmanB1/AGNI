<script>
  import { hubApi } from '$lib/api';
  import { onMount } from 'svelte';

  const TEACHING_MODES = ['socratic', 'didactic', 'guided_discovery', 'narrative', 'constructivist', 'direct'];

  let policy = {
    utuTargets: [],
    allowedTeachingModes: [],
    minDifficulty: 3,
    maxDifficulty: 5,
    requireUtu: false,
    requireTeachingMode: false
  };

  let loading = true;
  let saving = false;
  let error = '';
  let success = '';
  let hubConnected = false;

  onMount(async () => {
    loading = true;
    error = '';
    if (hubApi.baseUrl) {
      try {
        const p = await hubApi.getGovernancePolicy();
        hubConnected = true;
        if (p && typeof p === 'object') {
          const q = p;
          policy = {
            utuTargets: Array.isArray(q.utuTargets) ? q.utuTargets : [],
            allowedTeachingModes: Array.isArray(q.allowedTeachingModes) ? q.allowedTeachingModes : [],
            minDifficulty: typeof q.minDifficulty === 'number' ? q.minDifficulty : 3,
            maxDifficulty: typeof q.maxDifficulty === 'number' ? q.maxDifficulty : 5,
            requireUtu: Boolean(q.requireUtu),
            requireTeachingMode: Boolean(q.requireTeachingMode)
          };
        }
      } catch (e) {
        error = 'Could not load policy: ' + (e instanceof Error ? e.message : String(e));
      }
    } else {
      error = 'Hub not connected. Set VITE_HUB_URL to use governance wizards.';
    }
    loading = false;
  });

  function addUtuTarget() {
    policy = {
      ...policy,
      utuTargets: [...policy.utuTargets, { class: '', band: 1 }]
    };
  }

  function removeUtuTarget(i) {
    policy = {
      ...policy,
      utuTargets: policy.utuTargets.filter((_, idx) => idx !== i)
    };
  }

  function toggleMode(mode) {
    const idx = policy.allowedTeachingModes.indexOf(mode);
    if (idx >= 0) {
      policy = {
        ...policy,
        allowedTeachingModes: policy.allowedTeachingModes.filter(m => m !== mode)
      };
    } else {
      policy = {
        ...policy,
        allowedTeachingModes: [...policy.allowedTeachingModes, mode]
      };
    }
  }

  async function save() {
    if (!hubApi.baseUrl) {
      error = 'Hub not connected.';
      return;
    }
    saving = true;
    error = '';
    success = '';
    try {
      await hubApi.putGovernancePolicy(policy);
      success = 'Policy saved.';
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    saving = false;
  }
</script>

<h1>Governance Policy (G1)</h1>
<p class="subtitle">Configure UTU targets, allowed teaching modes, and difficulty bounds.</p>

{#if loading}
  <p>Loading policy…</p>
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

    <h2>UTU Targets</h2>
    <p class="hint">Target classes and bands for cohort coverage (e.g. MAC-2 Band 4).</p>
    {#each policy.utuTargets as target, i}
      <div class="row">
        <input type="text" bind:value={target.class} placeholder="e.g. MAC-2" />
        <input type="number" bind:value={target.band} min="1" max="10" placeholder="Band" />
        <button type="button" class="small" on:click={() => removeUtuTarget(i)}>Remove</button>
      </div>
    {/each}
    <button type="button" class="secondary" on:click={addUtuTarget}>+ Add UTU target</button>

    <h2>Allowed Teaching Modes</h2>
    <p class="hint">Select modes permitted for lessons. Leave empty to allow all.</p>
    <div class="checkbox-grid">
      {#each TEACHING_MODES as mode}
        <label class="checkbox-label">
          <input
            type="checkbox"
            checked={policy.allowedTeachingModes.includes(mode)}
            on:change={() => toggleMode(mode)}
          />
          {mode}
        </label>
      {/each}
    </div>

    <h2>Difficulty Bounds</h2>
    <p class="hint">Lesson difficulty (1–5). Lessons outside this range fail compliance.</p>
    <div class="row">
      <label>
        Min <input type="number" bind:value={policy.minDifficulty} min="1" max="5" />
      </label>
      <label>
        Max <input type="number" bind:value={policy.maxDifficulty} min="1" max="5" />
      </label>
    </div>

    <h2>Requirements</h2>
    <label class="checkbox-label">
      <input type="checkbox" bind:checked={policy.requireUtu} />
      Require UTU label on lessons
    </label>
    <label class="checkbox-label">
      <input type="checkbox" bind:checked={policy.requireTeachingMode} />
      Require teaching_mode on lessons
    </label>

    <div class="actions">
      <button class="primary" on:click={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save Policy'}
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

  .wizard h2:first-child {
    margin-top: 0;
  }

  .hint {
    font-size: 0.9rem;
    opacity: 0.8;
    margin-bottom: 0.5rem;
  }

  .row {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .row input {
    flex: 1;
    padding: 0.5rem;
    background: #1f2b4e;
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  .checkbox-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 0.5rem;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: normal;
    cursor: pointer;
  }

  .secondary, .small {
    padding: 0.5rem 1rem;
    background: var(--border);
    color: var(--text);
    border: none;
    border-radius: 6px;
    cursor: pointer;
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

  .actions {
    margin-top: 2rem;
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
