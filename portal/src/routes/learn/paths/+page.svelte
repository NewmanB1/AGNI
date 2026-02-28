<script>
  import { hubApiStore, hubUrlStore } from '$lib/api';
  import { t } from '$lib/i18n';
  import { getOrCreatePseudoId } from '$lib/pseudoId';
  import { onMount } from 'svelte';

  const api = $derived($hubApiStore);
  const tr = $derived($t);

  let pseudoId = $state('');
  let paths = $state(/** @type {any[]} */ ([]));
  let loading = $state(true);
  let error = $state('');

  // Teacher mode: skill picker for creating paths
  let showCreate = $state(false);
  let newName = $state('');
  let newDesc = $state('');
  let newSkills = $state('');
  let allSkills = $state(/** @type {string[]} */ ([]));
  let creating = $state(false);

  async function load() {
    pseudoId = getOrCreatePseudoId();
    if (!api.baseUrl) { loading = false; return; }
    loading = true;
    try {
      const res = await api.getLearningPaths(pseudoId);
      paths = res.paths || [];

      const graph = await api.getSkillGraph();
      allSkills = (graph.nodes || []).map(n => n.id).sort();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    loading = false;
  }

  onMount(load);

  function lessonUrl(slug) {
    const base = ($hubUrlStore || '').replace(/\/$/, '');
    return base + '/lessons/' + encodeURIComponent(slug) + '?pseudoId=' + encodeURIComponent(pseudoId);
  }

  async function createPath() {
    if (!newName.trim()) return;
    creating = true;
    try {
      const skills = newSkills.split(',').map(s => s.trim()).filter(Boolean);
      await api.postLearningPath({ name: newName.trim(), description: newDesc.trim(), skills });
      showCreate = false;
      newName = ''; newDesc = ''; newSkills = '';
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    creating = false;
  }
</script>

<svelte:head>
  <title>Learning Paths | AGNI Portal</title>
</svelte:head>

<nav class="breadcrumb">
  <a href="/learn">{tr('learn.title')}</a> &rarr; Learning Paths
</nav>

<h1>Learning Paths</h1>
<p class="subtitle">Structured skill sequences to guide your learning journey.</p>

{#if loading}
  <p class="loading-msg">{tr('learn.loading')}</p>
{:else if error}
  <div class="card error-box">{error}</div>
{:else}
  {#if paths.length === 0}
    <div class="card empty-box">
      <p>No learning paths available yet. Teachers can create skill-based learning paths to guide students.</p>
    </div>
  {/if}

  <div class="paths-list">
    {#each paths as lp}
      <div class="path-card">
        <div class="path-header">
          <div>
            <strong class="path-name">{lp.name}</strong>
            {#if lp.description}
              <p class="path-desc">{lp.description}</p>
            {/if}
          </div>
          {#if lp.progress}
            <div class="path-progress-ring">
              <span class="pct">{lp.progress.pct}%</span>
              <span class="count">{lp.progress.completed}/{lp.progress.total}</span>
            </div>
          {/if}
        </div>
        {#if lp.progress}
          <div class="path-bar">
            <div class="path-bar-fill" style="width: {lp.progress.pct}%"></div>
          </div>
        {/if}
        <div class="path-skills">
          {#each lp.skills || [] as skill, i}
            <span class="skill-node" class:mastered={lp.progress && lp.progress.completed > i}>
              {#if lp.progress && lp.progress.completed > i}
                <span class="node-icon">✓</span>
              {:else if lp.progress && lp.progress.completed === i}
                <span class="node-icon current">▶</span>
              {:else}
                <span class="node-icon">{i + 1}</span>
              {/if}
              {skill}
            </span>
            {#if i < (lp.skills || []).length - 1}
              <span class="skill-arrow">→</span>
            {/if}
          {/each}
        </div>
      </div>
    {/each}
  </div>

  <!-- Create path (teacher) -->
  <button class="btn btn-secondary create-btn" onclick={() => showCreate = !showCreate}>
    {showCreate ? 'Cancel' : '+ Create Path'}
  </button>

  {#if showCreate}
    <div class="create-form card">
      <h3>Create Learning Path</h3>
      <label>
        Name
        <input type="text" bind:value={newName} placeholder="e.g. Forces & Motion" />
      </label>
      <label>
        Description
        <input type="text" bind:value={newDesc} placeholder="Optional description" />
      </label>
      <label>
        Skills (comma-separated, in order)
        <textarea bind:value={newSkills} rows="3" placeholder="force-concepts, newtons-laws, friction-basics"></textarea>
      </label>
      {#if allSkills.length > 0}
        <details class="skill-picker">
          <summary>Available skills ({allSkills.length})</summary>
          <div class="skill-chips">
            {#each allSkills as skill}
              <button class="chip" onclick={() => newSkills = newSkills ? newSkills + ', ' + skill : skill}>{skill}</button>
            {/each}
          </div>
        </details>
      {/if}
      <button class="btn btn-primary" onclick={createPath} disabled={creating || !newName.trim()}>
        {creating ? 'Creating...' : 'Create Path'}
      </button>
    </div>
  {/if}
{/if}

<style>
  .breadcrumb { margin-bottom: 1rem; font-size: 0.9rem; opacity: 0.9; }
  .breadcrumb a { color: var(--accent); }
  .subtitle { opacity: 0.7; margin-bottom: 1.5rem; }
  .loading-msg { opacity: 0.8; padding: 2rem 0; }
  .error-box { border-color: #ff6b6b; color: #ff6b6b; }
  .empty-box { text-align: center; padding: 2rem; opacity: 0.7; }

  .paths-list { display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1.5rem; }
  .path-card {
    padding: 1rem 1.25rem; background: var(--card); border: 1px solid var(--border);
    border-radius: 12px;
  }
  .path-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 0.5rem; }
  .path-name { font-size: 1.1rem; }
  .path-desc { font-size: 0.85rem; opacity: 0.6; margin: 0.2rem 0 0; }
  .path-progress-ring { text-align: center; }
  .path-progress-ring .pct { display: block; font-size: 1.3rem; font-weight: bold; color: var(--accent); }
  .path-progress-ring .count { font-size: 0.75rem; opacity: 0.5; }
  .path-bar { height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; margin-bottom: 0.75rem; }
  .path-bar-fill { height: 100%; background: var(--accent); transition: width 0.3s; border-radius: 3px; }

  .path-skills { display: flex; align-items: center; gap: 0.3rem; flex-wrap: wrap; }
  .skill-node {
    display: inline-flex; align-items: center; gap: 0.25rem;
    padding: 0.2rem 0.5rem; border-radius: 6px; font-size: 0.8rem;
    background: rgba(255,255,255,0.05); border: 1px solid var(--border);
  }
  .skill-node.mastered { background: rgba(0,230,118,0.1); border-color: var(--accent); color: var(--accent); }
  .node-icon { font-weight: bold; min-width: 1em; text-align: center; }
  .node-icon.current { color: #60a5fa; }
  .skill-arrow { opacity: 0.3; font-size: 0.8rem; }

  .create-btn { margin-bottom: 1rem; }
  .create-form { padding: 1.25rem; max-width: 500px; }
  .create-form h3 { margin-bottom: 0.75rem; }
  .create-form label { display: block; margin-bottom: 0.75rem; font-size: 0.9rem; }
  .create-form input, .create-form textarea {
    display: block; width: 100%; margin-top: 0.25rem; padding: 0.5rem;
    background: #1f2b4e; color: var(--text); border: 1px solid var(--border);
    border-radius: 8px; font-size: 0.9rem;
  }
  .skill-picker { margin-bottom: 0.75rem; font-size: 0.85rem; }
  .skill-picker summary { cursor: pointer; opacity: 0.7; }
  .skill-chips { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-top: 0.5rem; max-height: 150px; overflow-y: auto; }
  .chip {
    padding: 0.15rem 0.4rem; border-radius: 4px; border: 1px solid var(--border);
    background: transparent; color: var(--text); cursor: pointer; font-size: 0.75rem;
  }
  .chip:hover { border-color: var(--accent); color: var(--accent); }
</style>
