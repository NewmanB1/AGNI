<script>
  import { hubApiStore, hubUrlStore } from '$lib/api';
  import { t } from '$lib/i18n';
  import { getPseudoId } from '$lib/pseudoId';
  import { onMount } from 'svelte';

  const api = $derived($hubApiStore);
  const tr = $derived($t);

  let allLessons = $state(/** @type {any[]} */ ([]));
  let loading = $state(true);
  let error = $state('');
  let search = $state('');
  let selectedTopic = $state('');

  const topics = $derived.by(() => {
    const set = new Set();
    for (const l of allLessons) {
      if (l.subject) set.add(l.subject);
      if (l.utu?.class) set.add(l.utu.class);
    }
    return [...set].sort();
  });

  const filtered = $derived.by(() => {
    let list = allLessons;
    if (selectedTopic) {
      list = list.filter(l => l.subject === selectedTopic || (l.utu?.class) === selectedTopic);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(l =>
        (l.title || '').toLowerCase().includes(q) ||
        (l.slug || '').toLowerCase().includes(q) ||
        (l.ontology?.provides || []).some(p => p.skill.toLowerCase().includes(q)) ||
        (l.subject || '').toLowerCase().includes(q)
      );
    }
    return list;
  });

  function lessonUrl(slug) {
    const base = ($hubUrlStore || '').replace(/\/$/, '');
    return base + '/lessons/' + encodeURIComponent(slug) + '?pseudoId=' + encodeURIComponent(getPseudoId());
  }

  async function load() {
    if (!api.baseUrl) { loading = false; return; }
    loading = true;
    try {
      const res = await api.getLessonIndex();
      allLessons = res.lessons || [];
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    loading = false;
  }

  onMount(load);
</script>

<svelte:head>
  <title>{tr('browse.title')} | AGNI Portal</title>
</svelte:head>

<nav class="breadcrumb">
  <a href="/learn">{tr('learn.title')}</a> &rarr; {tr('browse.title')}
</nav>

<h1>{tr('browse.title')}</h1>

{#if loading}
  <p>{tr('learn.loading')}</p>
{:else if error}
  <div class="card error-box">{error}</div>
{:else}
  <div class="filter-row">
    <input type="text" class="search-input" bind:value={search} placeholder={tr('browse.search')} />
    <select class="topic-select" bind:value={selectedTopic}>
      <option value="">{tr('browse.all_topics')}</option>
      {#each topics as topic}
        <option value={topic}>{topic}</option>
      {/each}
    </select>
  </div>

  <p class="result-count">{filtered.length} lesson(s)</p>

  {#if filtered.length === 0}
    <p class="empty">{tr('browse.no_results')}</p>
  {:else}
    <div class="browse-grid">
      {#each filtered as l}
        <a href={lessonUrl(l.slug)} class="browse-card" target="_blank" rel="noopener">
          <div class="card-header">
            <strong class="card-title">{l.title || l.slug}</strong>
            {#if l.difficulty}
              <span class="difficulty">Lvl {l.difficulty}</span>
            {/if}
          </div>
          {#if l.description}
            <p class="card-desc">{l.description.slice(0, 120)}{l.description.length > 120 ? '\u2026' : ''}</p>
          {/if}
          <div class="card-footer">
            {#if l.subject}
              <span class="topic-badge">{l.subject}</span>
            {/if}
            {#if l.teaching_mode}
              <span class="mode-badge">{l.teaching_mode}</span>
            {/if}
            {#each (l.ontology?.provides || []).slice(0, 2) as sp}
              <span class="skill-badge">{sp.skill}</span>
            {/each}
          </div>
        </a>
      {/each}
    </div>
  {/if}
{/if}

<style>
  .breadcrumb { margin-bottom: 1rem; font-size: 0.9rem; opacity: 0.9; }
  .breadcrumb a { color: var(--accent); }
  .error-box { border-color: #ff6b6b; color: #ff6b6b; }

  .filter-row { display: flex; gap: 0.75rem; margin-bottom: 1rem; flex-wrap: wrap; }
  .search-input {
    flex: 1; min-width: 200px; padding: 0.5rem 0.75rem;
    background: #1f2b4e; color: var(--text); border: 1px solid var(--border);
    border-radius: 8px; font-size: 0.95rem;
  }
  .topic-select {
    padding: 0.5rem; background: #1f2b4e; color: var(--text);
    border: 1px solid var(--border); border-radius: 8px; font-size: 0.95rem;
  }

  .result-count { font-size: 0.85rem; opacity: 0.6; margin-bottom: 1rem; }
  .empty { opacity: 0.7; }

  .browse-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 0.75rem; }
  .browse-card {
    padding: 0.75rem 1rem; background: var(--card); border: 1px solid var(--border);
    border-radius: 10px; text-decoration: none; color: var(--text);
    transition: all 0.15s; display: flex; flex-direction: column; gap: 0.4rem;
  }
  .browse-card:hover { border-color: var(--accent); transform: translateY(-1px); text-decoration: none; }
  .card-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; }
  .card-title { font-size: 0.95rem; }
  .difficulty { font-size: 0.75rem; padding: 0.1rem 0.4rem; background: rgba(255,255,255,0.1); border-radius: 4px; white-space: nowrap; }
  .card-desc { font-size: 0.8rem; opacity: 0.65; margin: 0; line-height: 1.3; }
  .card-footer { display: flex; gap: 0.3rem; flex-wrap: wrap; margin-top: auto; }
  .topic-badge, .mode-badge, .skill-badge {
    font-size: 0.7rem; padding: 0.1rem 0.35rem; border-radius: 4px;
  }
  .topic-badge { background: rgba(96,165,250,0.15); color: #60a5fa; }
  .mode-badge { background: rgba(251,191,36,0.15); color: #fbbf24; }
  .skill-badge { background: rgba(0,230,118,0.1); color: var(--accent); }
</style>
