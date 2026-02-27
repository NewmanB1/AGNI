<script>
  import { hubApiStore } from '$lib/api';
  import { t } from '$lib/i18n';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';

  const api = $derived($hubApiStore);
  const tr = $derived($t);
  const lessonId = $derived($page.url.searchParams.get('lessonId') || '');

  let loading = $state(true);
  let error = $state('');
  let stepData = $state(/** @type {any[]} */ ([]));
  let totalEvents = $state(0);
  let allLessons = $state(/** @type {any[]} */ ([]));
  let selectedLesson = $state('');

  async function load(lid) {
    if (!api.baseUrl || !lid) { loading = false; return; }
    loading = true;
    error = '';
    try {
      const res = await api.getStepAnalytics(lid);
      stepData = res.steps || [];
      totalEvents = res.totalEvents || 0;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    loading = false;
  }

  async function loadLessons() {
    if (!api.baseUrl) return;
    try {
      const res = await api.getLessonIndex();
      allLessons = res.lessons || [];
      if (lessonId) {
        selectedLesson = lessonId;
      } else if (allLessons.length > 0) {
        selectedLesson = allLessons[0].identifier || allLessons[0].slug;
      }
    } catch { /* ignore */ }
  }

  onMount(async () => {
    await loadLessons();
    if (selectedLesson) await load(selectedLesson);
    else loading = false;
  });

  function selectLesson() {
    if (selectedLesson) load(selectedLesson);
  }

  function barWidth(value, max) {
    if (max <= 0) return '0%';
    return Math.min(100, (value / max) * 100) + '%';
  }
</script>

<svelte:head>
  <title>Step Analytics | AGNI Portal</title>
</svelte:head>

<nav class="breadcrumb" aria-label="Breadcrumb">
  <a href="/learn">{tr('learn.title')}</a> &rarr; Step Analytics
</nav>

<h1>Per-Step Analytics</h1>

<div class="lesson-picker" role="search" aria-label="Select lesson to analyze">
  <label for="lesson-select">Lesson:</label>
  <select id="lesson-select" bind:value={selectedLesson} onchange={selectLesson}>
    {#each allLessons as l}
      <option value={l.identifier || l.slug}>{l.title || l.slug}</option>
    {/each}
  </select>
</div>

{#if loading}
  <p aria-live="polite">{tr('learn.loading')}</p>
{:else if error}
  <div class="card error-box" role="alert">{error}</div>
{:else if stepData.length === 0}
  <div class="card empty" role="status">
    <p>No step-level data available yet. Data appears after students complete this lesson.</p>
    <p class="sub">Total completion events: {totalEvents}</p>
  </div>
{:else}
  <p class="sample-note">Based on {totalEvents} completion event(s)</p>

  <div class="analytics-table" role="table" aria-label="Step analytics">
    <div class="table-header" role="row">
      <span role="columnheader">Step</span>
      <span role="columnheader">Type</span>
      <span role="columnheader">Avg Score</span>
      <span role="columnheader">Pass Rate</span>
      <span role="columnheader">Avg Time</span>
      <span role="columnheader">Avg Attempts</span>
      <span role="columnheader">Skip Rate</span>
    </div>
    {#each stepData as s}
      {@const scorePct = Math.round(s.avgScore * 100)}
      {@const timeStr = s.avgDurationMs > 60000 ? (s.avgDurationMs / 60000).toFixed(1) + 'm' : (s.avgDurationMs / 1000).toFixed(0) + 's'}
      <div class="table-row" role="row" class:struggling={s.passRate < 50} class:strong={s.passRate >= 90}>
        <span role="cell" class="step-id">{s.stepId}</span>
        <span role="cell"><span class="type-badge">{s.type}</span></span>
        <span role="cell">
          <div class="bar-cell">
            <div class="bar-bg"><div class="bar-fill" class:low={scorePct < 50} style="width:{scorePct}%"></div></div>
            <span>{scorePct}%</span>
          </div>
        </span>
        <span role="cell">
          <div class="bar-cell">
            <div class="bar-bg"><div class="bar-fill" class:low={s.passRate < 50} style="width:{s.passRate}%"></div></div>
            <span>{s.passRate}%</span>
          </div>
        </span>
        <span role="cell">{timeStr}</span>
        <span role="cell">{s.avgAttempts}</span>
        <span role="cell" class:warn={s.skipRate > 20}>{s.skipRate}%</span>
      </div>
    {/each}
  </div>
{/if}

<style>
  .breadcrumb { margin-bottom: 1rem; font-size: 0.9rem; opacity: 0.9; }
  .breadcrumb a { color: var(--accent); }
  .error-box { border-color: #ff6b6b; color: #ff6b6b; }
  .empty { text-align: center; padding: 2rem; }
  .empty .sub { font-size: 0.85rem; opacity: 0.5; }

  .lesson-picker { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.5rem; }
  .lesson-picker label { font-weight: 600; }
  .lesson-picker select {
    padding: 0.5rem; background: #1f2b4e; color: var(--text);
    border: 1px solid var(--border); border-radius: 8px; font-size: 0.95rem; max-width: 400px; flex: 1;
  }

  .sample-note { font-size: 0.85rem; opacity: 0.6; margin-bottom: 1rem; }

  .analytics-table { display: flex; flex-direction: column; gap: 2px; }
  .table-header {
    display: grid; grid-template-columns: 1.5fr 0.7fr 1.2fr 1.2fr 0.8fr 0.8fr 0.8fr;
    gap: 0.5rem; padding: 0.5rem 0.75rem; font-weight: 600; font-size: 0.8rem;
    opacity: 0.7; border-bottom: 1px solid var(--border);
  }
  .table-row {
    display: grid; grid-template-columns: 1.5fr 0.7fr 1.2fr 1.2fr 0.8fr 0.8fr 0.8fr;
    gap: 0.5rem; padding: 0.5rem 0.75rem; align-items: center;
    background: var(--card); border-radius: 6px; font-size: 0.85rem;
  }
  .table-row.struggling { border-left: 3px solid #ff5252; }
  .table-row.strong { border-left: 3px solid #4ade80; }

  .step-id { font-family: monospace; font-size: 0.8rem; opacity: 0.8; word-break: break-all; }
  .type-badge {
    font-size: 0.7rem; padding: 0.1rem 0.35rem; border-radius: 4px;
    background: rgba(96,165,250,0.15); color: #60a5fa;
  }

  .bar-cell { display: flex; align-items: center; gap: 0.4rem; }
  .bar-bg { flex: 1; height: 8px; background: var(--border); border-radius: 4px; overflow: hidden; }
  .bar-fill { height: 100%; background: var(--accent); border-radius: 4px; transition: width 0.3s; }
  .bar-fill.low { background: #ff5252; }

  .warn { color: #fbbf24; font-weight: 600; }
</style>
