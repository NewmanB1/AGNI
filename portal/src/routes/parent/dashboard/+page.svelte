<script>
  import { hubApiStore } from '$lib/api';
  import { onMount } from 'svelte';

  const api = $derived($hubApiStore);

  let parentId = $state('');
  let identified = $state(false);
  let children = $state([]);
  let loading = $state(false);
  let error = $state('');

  let linkCode = $state('');
  let linking = $state(false);
  let linkSuccess = $state('');

  let selectedChild = $state(null);
  let progress = $state(null);
  let loadingProgress = $state(false);

  onMount(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('agni_parent_id') : null;
    if (saved) {
      parentId = saved;
      identified = true;
      loadChildren();
    }
  });

  function identify() {
    if (!parentId.trim()) return;
    if (typeof localStorage !== 'undefined') localStorage.setItem('agni_parent_id', parentId.trim());
    identified = true;
    loadChildren();
  }

  async function loadChildren() {
    if (!api.baseUrl || !parentId.trim()) return;
    loading = true;
    error = '';
    try {
      const res = await api.getParentChildren(parentId.trim());
      children = res.children || [];
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    loading = false;
  }

  async function redeemCode() {
    if (!api.baseUrl || !linkCode.trim() || !parentId.trim()) return;
    linking = true;
    error = '';
    linkSuccess = '';
    try {
      const res = await api.postParentLink(linkCode.trim(), parentId.trim());
      if (res.alreadyLinked) {
        linkSuccess = `Already linked to ${res.pseudoId}.`;
      } else {
        linkSuccess = `Linked to ${res.pseudoId}!`;
      }
      linkCode = '';
      await loadChildren();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    linking = false;
  }

  async function viewProgress(pseudoId) {
    if (!api.baseUrl) return;
    selectedChild = pseudoId;
    loadingProgress = true;
    progress = null;
    error = '';
    try {
      progress = await api.getParentChildProgress(pseudoId, parentId.trim());
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    loadingProgress = false;
  }

  function logout() {
    if (typeof localStorage !== 'undefined') localStorage.removeItem('agni_parent_id');
    parentId = '';
    identified = false;
    children = [];
    selectedChild = null;
    progress = null;
  }

  const masteryEntries = $derived(
    progress?.mastery
      ? Object.entries(progress.mastery).sort((a, b) => b[1] - a[1])
      : []
  );
</script>

<svelte:head>
  <title>Parent Dashboard | AGNI Portal</title>
</svelte:head>

<nav class="breadcrumb">
  <a href="/">Home</a> → Parent Dashboard
</nav>

<h1>Parent Dashboard</h1>

{#if !api.baseUrl}
  <div class="card error-box">Hub not connected. Configure in <a href="/settings">Settings</a>.</div>
{:else if !identified}
  <div class="card wizard">
    <h2>Identify yourself</h2>
    <p class="hint">Enter your parent ID. This is stored locally in your browser.</p>
    <div class="id-form">
      <input type="text" bind:value={parentId} placeholder="e.g. parent_jane" onkeydown={(e) => e.key === 'Enter' && identify()} />
      <button class="primary" onclick={identify} disabled={!parentId.trim()}>Continue</button>
    </div>
  </div>
{:else}
  <div class="parent-bar">
    <span class="parent-id">Logged in as: <strong>{parentId}</strong></span>
    <button class="link-btn" onclick={logout}>Switch / Logout</button>
  </div>

  {#if error}
    <div class="card error-box">{error}</div>
  {/if}
  {#if linkSuccess}
    <div class="card success-box">{linkSuccess}</div>
  {/if}

  <div class="card wizard">
    <h2>Link to a child</h2>
    <p class="hint">Enter the 6-character invite code provided by the teacher.</p>
    <div class="id-form">
      <input type="text" bind:value={linkCode} placeholder="e.g. A3K7P2" maxlength="6"
             style="text-transform: uppercase; letter-spacing: 0.15em; font-family: monospace; font-size: 1.1rem;"
             onkeydown={(e) => e.key === 'Enter' && redeemCode()} />
      <button class="primary" onclick={redeemCode} disabled={linking || linkCode.trim().length < 4}>
        {linking ? 'Linking…' : 'Link'}
      </button>
    </div>
  </div>

  {#if loading}
    <p>Loading children…</p>
  {:else if children.length === 0}
    <p class="hint" style="margin-top: 1rem;">No children linked yet. Use an invite code above to get started.</p>
  {:else}
    <h2>Your children ({children.length})</h2>
    <div class="children-grid">
      {#each children as child}
        <button class="child-card" class:active={selectedChild === child.pseudoId} onclick={() => viewProgress(child.pseudoId)}>
          <span class="child-id">{child.pseudoId}</span>
          <span class="child-linked">Linked {new Date(child.linkedAt).toLocaleDateString()}</span>
        </button>
      {/each}
    </div>
  {/if}

  {#if selectedChild}
    <div class="card progress-card">
      <h2>Progress: {selectedChild}</h2>

      {#if loadingProgress}
        <p>Loading progress…</p>
      {:else if progress}
        <div class="stats-row">
          <div class="stat">
            <span class="stat-value">{progress.completedSkills}</span>
            <span class="stat-label">Skills mastered</span>
          </div>
          <div class="stat">
            <span class="stat-value">{progress.totalSkills}</span>
            <span class="stat-label">Total skills</span>
          </div>
          <div class="stat">
            <span class="stat-value">{progress.totalSkills ? Math.round((progress.completedSkills / progress.totalSkills) * 100) : 0}%</span>
            <span class="stat-label">Completion</span>
          </div>
        </div>

        {#if progress.currentOverride}
          <p class="override-note">Teacher override active: <strong>{progress.currentOverride}</strong></p>
        {/if}

        {#if progress.recommendedLessons.length > 0}
          <h3>Next recommended lessons</h3>
          <ol class="rec-list">
            {#each progress.recommendedLessons as lesson}
              <li>
                <span class="rec-id">{lesson.lessonId}</span>
                {#if lesson.score != null}
                  <span class="rec-score">{(lesson.score * 100).toFixed(0)}%</span>
                {/if}
              </li>
            {/each}
          </ol>
        {/if}

        {#if masteryEntries.length > 0}
          <h3>Skill mastery</h3>
          <div class="mastery-grid">
            {#each masteryEntries as [skill, level]}
              <div class="mastery-item">
                <span class="skill-name">{skill}</span>
                <div class="mastery-bar-bg">
                  <div class="mastery-bar-fill" style="width: {Math.min(level * 100, 100)}%"
                       class:complete={level >= 1.0}></div>
                </div>
                <span class="mastery-pct">{(level * 100).toFixed(0)}%</span>
              </div>
            {/each}
          </div>
        {:else}
          <p class="hint">No mastery data recorded yet.</p>
        {/if}
      {/if}
    </div>
  {/if}
{/if}

<style>
  .breadcrumb { margin-bottom: 1rem; font-size: 0.9rem; opacity: 0.9; }
  .breadcrumb a { color: var(--accent); }

  .parent-bar {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 1rem; padding: 0.5rem 0; border-bottom: 1px solid var(--border);
  }
  .parent-id { font-size: 0.95rem; }
  .link-btn { background: none; border: none; color: var(--accent); cursor: pointer; font-size: 0.9rem; }
  .link-btn:hover { text-decoration: underline; }

  .wizard h2 { margin-top: 0; margin-bottom: 0.5rem; }
  .hint { font-size: 0.9rem; opacity: 0.8; margin-bottom: 0.75rem; }

  .id-form { display: flex; gap: 0.75rem; align-items: center; }
  .id-form input {
    flex: 1; max-width: 300px; padding: 0.5rem; background: #1f2b4e; color: var(--text);
    border: 1px solid var(--border); border-radius: 6px; font-size: 1rem;
  }
  button.primary {
    background: var(--accent); color: #1a1a2e; border: none;
    padding: 0.5rem 1.2rem; border-radius: 6px; cursor: pointer; font-weight: bold;
  }
  button.primary:disabled { opacity: 0.5; cursor: not-allowed; }

  .error-box { border-color: #ff6b6b; color: #ff6b6b; }
  .success-box { border-color: #4ade80; color: #4ade80; }

  h2 { margin-top: 1.5rem; margin-bottom: 0.75rem; }

  .children-grid { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1rem; }
  .child-card {
    background: var(--card); border: 1px solid var(--border); border-radius: 8px;
    padding: 0.75rem 1rem; cursor: pointer; text-align: left;
    transition: border-color 0.15s, transform 0.15s;
  }
  .child-card:hover { border-color: var(--accent); transform: translateY(-1px); }
  .child-card.active { border-color: var(--accent); background: rgba(0,230,118,0.06); }
  .child-id { display: block; font-weight: bold; font-size: 1rem; margin-bottom: 0.2rem; }
  .child-linked { display: block; font-size: 0.8rem; opacity: 0.7; }

  .progress-card { margin-top: 1rem; }
  .progress-card h2 { margin-top: 0; }

  .stats-row { display: flex; gap: 1.5rem; margin-bottom: 1rem; flex-wrap: wrap; }
  .stat { text-align: center; min-width: 80px; }
  .stat-value { display: block; font-size: 1.8rem; font-weight: bold; color: var(--accent); }
  .stat-label { display: block; font-size: 0.8rem; opacity: 0.7; margin-top: 0.15rem; }

  .override-note {
    background: rgba(255,170,0,0.1); color: #ffaa00; padding: 0.5rem 0.75rem;
    border-radius: 6px; font-size: 0.9rem; margin-bottom: 1rem;
  }

  h3 { margin-top: 1rem; margin-bottom: 0.5rem; font-size: 1rem; }

  .rec-list { margin: 0 0 0 1.5rem; }
  .rec-list li { margin-bottom: 0.3rem; }
  .rec-id { font-family: monospace; }
  .rec-score { font-size: 0.85rem; opacity: 0.7; margin-left: 0.5rem; }

  .mastery-grid { display: flex; flex-direction: column; gap: 0.4rem; }
  .mastery-item { display: flex; align-items: center; gap: 0.5rem; }
  .skill-name { min-width: 120px; font-size: 0.9rem; font-family: monospace; }
  .mastery-bar-bg {
    flex: 1; height: 14px; background: rgba(255,255,255,0.06); border-radius: 7px; overflow: hidden;
  }
  .mastery-bar-fill {
    height: 100%; background: var(--accent); border-radius: 7px;
    transition: width 0.3s ease;
  }
  .mastery-bar-fill.complete { background: #4ade80; }
  .mastery-pct { min-width: 40px; text-align: right; font-size: 0.85rem; opacity: 0.8; }
</style>
