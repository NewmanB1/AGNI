<script>
  import { hubApiStore } from '$lib/api';
  import { onMount } from 'svelte';

  const api = $derived($hubApiStore);

  let catalog = $state({ lessonIds: [] });
  let lessonIndex = $state([]);
  let policy = $state({});
  let loading = $state(true);
  let error = $state('');
  let success = $state('');
  let hubConnected = $state(false);
  let newId = $state('');
  let saving = $state(false);
  let search = $state('');

  const lessonMap = $derived(() => {
    const m = {};
    for (const l of lessonIndex) {
      if (l.lessonId) m[l.lessonId] = l;
      if (l.slug) m[l.slug] = l;
    }
    return m;
  });

  const filteredIds = $derived(
    catalog.lessonIds.filter(id => {
      if (!search) return true;
      const q = search.toLowerCase();
      if (id.toLowerCase().includes(q)) return true;
      const info = lessonMap()[id];
      if (info?.title?.toLowerCase().includes(q)) return true;
      if (info?.utu?.class?.toLowerCase().includes(q)) return true;
      if (info?.teaching_mode?.toLowerCase().includes(q)) return true;
      return false;
    })
  );

  function checkCompliance(id) {
    const info = lessonMap()[id];
    if (!info) return { status: 'unknown', issues: ['Not in lesson index'] };
    const issues = [];
    if (policy.requireUtu && (!info.utu || !info.utu.class)) {
      issues.push('Missing UTU');
    }
    if (policy.requireTeachingMode && !info.teaching_mode) {
      issues.push('Missing teaching mode');
    }
    if (info.teaching_mode && Array.isArray(policy.allowedTeachingModes) && policy.allowedTeachingModes.length > 0) {
      if (!policy.allowedTeachingModes.includes(info.teaching_mode)) {
        issues.push('Mode not allowed');
      }
    }
    if (typeof info.difficulty === 'number') {
      if (typeof policy.minDifficulty === 'number' && info.difficulty < policy.minDifficulty) {
        issues.push('Difficulty too low');
      }
      if (typeof policy.maxDifficulty === 'number' && info.difficulty > policy.maxDifficulty) {
        issues.push('Difficulty too high');
      }
    }
    return { status: issues.length === 0 ? 'ok' : 'fail', issues };
  }

  onMount(loadCatalog);

  async function loadCatalog() {
    loading = true;
    error = '';
    if (api.baseUrl) {
      try {
        const [cat, lessons, pol] = await Promise.all([
          api.getGovernanceCatalog(),
          api.getLessons().catch(() => ({ lessons: [], savedSlugs: [], total: 0 })),
          api.getGovernancePolicy().catch(() => ({}))
        ]);
        catalog = cat && cat.lessonIds ? cat : { lessonIds: [] };
        lessonIndex = lessons.lessons || [];
        policy = pol || {};
        hubConnected = true;
      } catch (e) {
        error = 'Could not load catalog: ' + (e instanceof Error ? e.message : String(e));
      }
    } else {
      error = 'Configure hub URL in Settings to use governance wizards.';
    }
    loading = false;
  }

  async function addLesson() {
    const id = newId.trim();
    if (!id || !api.baseUrl) return;
    saving = true;
    error = '';
    success = '';
    try {
      const res = await api.postGovernanceCatalog({ add: [id] });
      catalog = res.catalog;
      newId = '';
      success = 'Added ' + id;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    saving = false;
  }

  async function removeLesson(id) {
    if (!api.baseUrl) return;
    saving = true;
    error = '';
    success = '';
    try {
      const res = await api.postGovernanceCatalog({ remove: [id] });
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

  const complianceSummary = $derived(() => {
    let ok = 0, fail = 0, unknown = 0;
    for (const id of catalog.lessonIds) {
      const c = checkCompliance(id);
      if (c.status === 'ok') ok++;
      else if (c.status === 'fail') fail++;
      else unknown++;
    }
    return { ok, fail, unknown };
  });
</script>

<h1>Approved Catalog (G2)</h1>
<p class="subtitle">Manage the set of governance-approved lesson IDs. Theta filters eligible lessons to this set.</p>

{#if loading}
  <p>Loading catalog…</p>
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

    <div class="add-row">
      <input type="text" bind:value={newId} placeholder="Lesson ID (e.g. ols:physics:gravity_v1)"
             onkeydown={(e) => e.key === 'Enter' && addLesson()} />
      <button class="btn-primary" onclick={addLesson} disabled={saving || !newId.trim()}>Add</button>
    </div>

    <div class="catalog-header">
      <h2>Approved lessons ({catalog.lessonIds.length})</h2>
      {#if catalog.lessonIds.length > 0}
        <div class="compliance-summary">
          <span class="badge badge-ok">{complianceSummary().ok} pass</span>
          {#if complianceSummary().fail > 0}
            <span class="badge badge-fail">{complianceSummary().fail} fail</span>
          {/if}
          {#if complianceSummary().unknown > 0}
            <span class="badge badge-unknown">{complianceSummary().unknown} unknown</span>
          {/if}
        </div>
      {/if}
    </div>

    {#if catalog.lessonIds.length > 5}
      <div class="search-row">
        <input type="text" bind:value={search} placeholder="Search by ID, title, UTU, mode…" class="search-input" />
        {#if search}
          <span class="search-count">{filteredIds.length} of {catalog.lessonIds.length}</span>
        {/if}
      </div>
    {/if}

    {#if catalog.lessonIds.length === 0}
      <p class="empty">No approved lessons. Add IDs above or <a href="/governance/catalog/import">import from another authority</a>.</p>
    {:else}
      <ul class="lesson-list">
        {#each filteredIds as id}
          {@const info = lessonMap()[id]}
          {@const compliance = checkCompliance(id)}
          <li>
            <div class="lesson-main">
              <span class="compliance-dot" class:dot-ok={compliance.status === 'ok'} class:dot-fail={compliance.status === 'fail'} class:dot-unknown={compliance.status === 'unknown'}
                    title={compliance.status === 'ok' ? 'Compliant' : compliance.issues.map(i => typeof i === 'string' ? i : i.message).join(', ')}></span>
              <div class="lesson-info">
                <span class="id">{id}</span>
                {#if info}
                  <span class="meta">
                    {info.title || ''}
                    {#if info.utu?.class} · <span class="utu-tag">{info.utu.class}{info.utu.band ? '-B' + info.utu.band : ''}</span>{/if}
                    {#if info.difficulty != null} · D{info.difficulty}{/if}
                    {#if info.teaching_mode} · {info.teaching_mode}{/if}
                  </span>
                {/if}
              </div>
            </div>
            <button type="button" class="btn-small remove-btn" onclick={() => removeLesson(id)}>Remove</button>
          </li>
        {/each}
      </ul>
    {/if}

    <div class="actions">
      <button class="btn-secondary" onclick={exportCatalog}>Export catalog (G4)</button>
      <a href="/governance/catalog/import" class="link-btn">Import from another authority →</a>
    </div>
  </div>
{/if}

<style>
  .wizard h2 { margin-top: 1.5rem; margin-bottom: 0.5rem; }

  .add-row { display: flex; gap: 0.75rem; margin-bottom: 1rem; }
  .add-row input {
    flex: 1; padding: 0.6rem; background: #1f2b4e; color: var(--text);
    border: 1px solid var(--border); border-radius: 6px;
  }

  .catalog-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; }
  .compliance-summary { display: flex; gap: 0.4rem; }
  .badge {
    font-size: 0.8rem; padding: 0.15rem 0.5rem; border-radius: 10px; font-weight: 600;
  }
  .badge-ok { background: rgba(0,230,118,0.15); color: var(--accent); }
  .badge-fail { background: rgba(255,82,82,0.15); color: #ff5252; }
  .badge-unknown { background: rgba(255,170,0,0.15); color: #ffaa00; }

  .search-row { display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.75rem; }
  .search-input {
    flex: 1; padding: 0.5rem; background: #1f2b4e; color: var(--text);
    border: 1px solid var(--border); border-radius: 6px; font-size: 0.9rem;
  }
  .search-count { font-size: 0.85rem; opacity: 0.7; white-space: nowrap; }

  .lesson-list { list-style: none; margin: 0; padding: 0; }
  .lesson-list li {
    display: flex; justify-content: space-between; align-items: center;
    padding: 0.5rem 0; border-bottom: 1px solid var(--border);
    gap: 0.5rem;
  }
  .lesson-main { display: flex; align-items: center; gap: 0.5rem; flex: 1; min-width: 0; }

  .compliance-dot {
    width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
    background: rgba(255,255,255,0.2);
  }
  .compliance-dot.dot-ok { background: var(--accent); }
  .compliance-dot.dot-fail { background: #ff5252; }
  .compliance-dot.dot-unknown { background: #ffaa00; }

  .lesson-info { min-width: 0; }
  .id { font-family: monospace; font-size: 0.9rem; display: block; }
  .meta { font-size: 0.8rem; opacity: 0.7; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .utu-tag { color: var(--accent); font-weight: 600; }

  .remove-btn { background: rgba(255,82,82,0.2); color: #ff5252; flex-shrink: 0; }

  .empty { opacity: 0.8; margin: 0.5rem 0; }
  .empty a { color: var(--accent); }

  .actions { margin-top: 2rem; display: flex; gap: 1rem; align-items: center; }
  .link-btn { color: var(--accent); }
</style>
