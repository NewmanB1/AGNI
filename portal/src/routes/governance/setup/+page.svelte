<script>
  import { hubApiStore } from '$lib/api';
  import { onMount } from 'svelte';

  const api = $derived($hubApiStore);

  const TEACHING_MODES = ['socratic', 'didactic', 'guided_discovery', 'narrative', 'constructivist', 'direct'];

  let policy = $state({
    utuTargets: [],
    allowedTeachingModes: [],
    allowedProtocols: [],
    minProtocol: undefined,
    maxProtocol: undefined,
    failureModeHints: false,
    minDifficulty: 3,
    maxDifficulty: 5,
    requireUtu: false,
    requireTeachingMode: false
  });

  let utuConstants = $state({});
  let loading = $state(true);
  let saving = $state(false);
  let error = $state('');
  let success = $state('');
  let hubConnected = $state(false);
  let fileInput = $state(null);

  const spineIds = $derived((utuConstants.spineIds || []).length ? utuConstants.spineIds : ['MAC-2', 'SCI-1', 'SCI-4', 'SOC-1']);
  const protocols = $derived((utuConstants.protocols || []).length ? utuConstants.protocols : [
    { id: 1, name: 'Transmission', short: 'P1' },
    { id: 2, name: 'Guided Construction', short: 'P2' },
    { id: 3, name: 'Apprenticeship', short: 'P3' },
    { id: 4, name: 'Dev. Sequencing', short: 'P4' },
    { id: 5, name: 'Meaning Activation', short: 'P5' }
  ]);

  function applyPolicy(p) {
    const targets = Array.isArray(p.utuTargets)
      ? p.utuTargets.map(t => ({ class: t.class || '', band: t.band || 1, protocol: typeof t.protocol === 'number' ? t.protocol : undefined }))
      : [];
    policy = {
      utuTargets: targets,
      allowedTeachingModes: Array.isArray(p.allowedTeachingModes) ? p.allowedTeachingModes : [],
      allowedProtocols: Array.isArray(p.allowedProtocols) ? p.allowedProtocols : [],
      minProtocol: typeof p.minProtocol === 'number' ? p.minProtocol : undefined,
      maxProtocol: typeof p.maxProtocol === 'number' ? p.maxProtocol : undefined,
      failureModeHints: Boolean(p.failureModeHints),
      minDifficulty: typeof p.minDifficulty === 'number' ? p.minDifficulty : 3,
      maxDifficulty: typeof p.maxDifficulty === 'number' ? p.maxDifficulty : 5,
      requireUtu: Boolean(p.requireUtu),
      requireTeachingMode: Boolean(p.requireTeachingMode)
    };
  }

  onMount(async () => {
    loading = true;
    error = '';
    if (api.baseUrl) {
      try {
        const [p, utu] = await Promise.all([
          api.getGovernancePolicy(),
          api.getUtuConstants().catch(() => ({}))
        ]);
        hubConnected = true;
        if (utu && typeof utu === 'object') utuConstants = utu;
        if (p && typeof p === 'object') applyPolicy(p);
      } catch (e) {
        error = 'Could not load policy: ' + (e instanceof Error ? e.message : String(e));
      }
    } else {
      error = 'Configure hub URL in Settings to use governance wizards.';
    }
    loading = false;
  });

  function addUtuTarget() {
    policy.utuTargets = [...policy.utuTargets, { class: spineIds[0] || '', band: 1, protocol: undefined }];
  }

  function removeUtuTarget(i) {
    policy.utuTargets = policy.utuTargets.filter((_, idx) => idx !== i);
  }

  function toggleProtocol(id) {
    const idx = policy.allowedProtocols.indexOf(id);
    if (idx >= 0) {
      policy.allowedProtocols = policy.allowedProtocols.filter(n => n !== id);
    } else {
      policy.allowedProtocols = [...policy.allowedProtocols, id].sort((a, b) => a - b);
    }
  }

  function toggleMode(mode) {
    const idx = policy.allowedTeachingModes.indexOf(mode);
    if (idx >= 0) {
      policy.allowedTeachingModes = policy.allowedTeachingModes.filter(m => m !== mode);
    } else {
      policy.allowedTeachingModes = [...policy.allowedTeachingModes, mode];
    }
  }

  async function save() {
    if (!api.baseUrl) { error = 'Hub not connected.'; return; }
    saving = true;
    error = '';
    success = '';
    try {
      await api.putGovernancePolicy(policy);
      success = 'Policy saved.';
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    saving = false;
  }

  function exportPolicy() {
    const blob = new Blob([JSON.stringify(policy, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'governance_policy_' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    success = 'Policy exported.';
  }

  function handlePolicyFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(String(reader.result));
        if (typeof json !== 'object' || json === null) {
          error = 'Invalid policy: must be a JSON object.';
          return;
        }
        applyPolicy(json);
        success = 'Policy loaded from file. Review and save to apply.';
        error = '';
      } catch {
        error = 'Invalid JSON file.';
      }
    };
    reader.readAsText(file);
  }
</script>

<h1>Governance Policy (G1 / U4)</h1>
<p class="subtitle">Configure UTU targets (Spine + Band), Protocol bounds, teaching modes, and difficulty.</p>

{#if loading}
  <p>Loading policy…</p>
{:else if !hubConnected}
  <div class="card warning-box"><p>{error}</p></div>
{:else}
  <div class="card wizard">
    {#if error}
      <div class="error-banner">{error}</div>
    {/if}
    {#if success}
      <div class="success-banner">{success}</div>
    {/if}

    <h2>UTU Targets</h2>
    <p class="hint">Target Spine IDs, bands, and optional protocols for cohort coverage (e.g. MAC-2 Band 4 P2).</p>
    {#each policy.utuTargets as target, i}
      <div class="gov-form-row">
        <select bind:value={target.class} class="spine-picker">
          {#each spineIds as sid}
            <option value={sid}>{sid}</option>
          {/each}
        </select>
        <input type="number" bind:value={target.band} min="1" max="6" placeholder="Band" class="band-input" />
        <select bind:value={target.protocol} class="protocol-picker">
          <option value={undefined}>Any P</option>
          {#each protocols as p}
            <option value={p.id}>{p.short}</option>
          {/each}
        </select>
        <button type="button" class="btn-small remove-btn" onclick={() => removeUtuTarget(i)}>Remove</button>
      </div>
    {/each}
    <button type="button" class="btn-secondary" onclick={addUtuTarget}>+ Add UTU target</button>

    <h2>Protocol Targets</h2>
    <p class="hint">Allow protocols (P1–P5). E.g. P1, P2, P3 for rigor. Or set min/max bounds.</p>
    <div class="checkbox-grid">
      {#each protocols as p}
        <label class="checkbox-label">
          <input type="checkbox" checked={policy.allowedProtocols.includes(p.id)}
                 onchange={() => toggleProtocol(p.id)} />
          {p.short} — {p.name}
        </label>
      {/each}
    </div>
    <div class="gov-form-row protocol-bounds">
      <label>Min Protocol <input type="number" bind:value={policy.minProtocol} min="1" max="5" placeholder="—" /></label>
      <label>Max Protocol <input type="number" bind:value={policy.maxProtocol} min="1" max="5" placeholder="—" /></label>
      <span class="hint-inline">Leave empty to use allowed list above.</span>
    </div>
    <label class="checkbox-label">
      <input type="checkbox" bind:checked={policy.failureModeHints} />
      Include failure-mode hints when protocol check fails
    </label>

    <h2>Allowed Teaching Modes</h2>
    <p class="hint">Select modes permitted for lessons. Leave empty to allow all.</p>
    <div class="checkbox-grid">
      {#each TEACHING_MODES as mode}
        <label class="checkbox-label">
          <input type="checkbox" checked={policy.allowedTeachingModes.includes(mode)}
                 onchange={() => toggleMode(mode)} />
          {mode}
        </label>
      {/each}
    </div>

    <h2>Difficulty Bounds</h2>
    <p class="hint">Lesson difficulty (1–5). Lessons outside this range fail compliance.</p>
    <div class="gov-form-row">
      <label>Min <input type="number" bind:value={policy.minDifficulty} min="1" max="5" /></label>
      <label>Max <input type="number" bind:value={policy.maxDifficulty} min="1" max="5" /></label>
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
      <button class="btn-primary" onclick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save Policy'}
      </button>
      <button class="btn-secondary" onclick={exportPolicy}>Export policy</button>
      <label class="btn-secondary import-label">
        Import policy
        <input type="file" accept=".json,application/json" bind:this={fileInput}
               onchange={handlePolicyFileChange} class="hidden-file" />
      </label>
    </div>
  </div>
{/if}

<style>
  .wizard h2 { margin-top: 1.5rem; margin-bottom: 0.5rem; }
  .wizard h2:first-child { margin-top: 0; }

  .spine-picker { flex: 1; min-width: 120px; }
  .band-input { width: 5rem; flex: none; }
  .protocol-picker { width: 5.5rem; flex: none; }

  .protocol-bounds { flex-wrap: wrap; }
  .hint-inline { font-size: 0.85rem; opacity: 0.7; margin-left: 0.5rem; }

  .remove-btn { background: #FFEBEE; color: #B00020; }

  .actions {
    margin-top: 2rem;
    display: flex; gap: 1rem; align-items: center; flex-wrap: wrap;
  }

  .import-label {
    display: inline-flex; align-items: center; cursor: pointer;
  }
  .hidden-file { display: none; }
</style>
