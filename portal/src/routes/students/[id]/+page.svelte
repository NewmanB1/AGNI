<script>
  import { hubApiStore } from '$lib/api';
  import { t } from '$lib/i18n';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { getStudentName, setStudentName, hasNickname } from '$lib/studentNames';
  import { computeStatus, statusColor, statusLabel as statusLabelFn, formatDaysUntil } from '$lib/studentStatus';

  const api = $derived($hubApiStore);
  const tr = $derived($t);
  const pseudoId = $derived($page.params.id);

  let lessons = $state(/** @type {any[]} */ ([]));
  let currentOverride = $state(/** @type {string | null} */ (null));
  let loading = $state(true);
  let error = $state('');
  let hubConnected = $state(false);

  let editingName = $state(false);
  let nameInput = $state('');

  let overrideLessonId = $state('');
  let overrideLoading = $state(false);
  let overrideMsg = $state('');
  let overrideErr = $state('');

  let showTab = $state('recommendations');

  const displayName = $derived(getStudentName(pseudoId));

  const masteredLessons = $derived(lessons.filter(l => l.alreadyMastered));
  const unmastered = $derived(lessons.filter(l => !l.alreadyMastered));
  const masteryPct = $derived(lessons.length > 0 ? Math.round((masteredLessons.length / lessons.length) * 100) : 0);

  const status = $derived(computeStatus(masteryPct, lessons.length > 0));

  const allSkills = $derived.by(() => {
    const skills = /** @type {Map<string, { skill: string; mastered: boolean; lessonCount: number }>} */ (new Map());
    for (const l of lessons) {
      for (const sp of (l.skillsProvided || [])) {
        const existing = skills.get(sp.skill);
        if (!existing) {
          skills.set(sp.skill, { skill: sp.skill, mastered: l.alreadyMastered, lessonCount: 1 });
        } else {
          existing.lessonCount++;
          if (l.alreadyMastered) existing.mastered = true;
        }
      }
    }
    return [...skills.values()].sort((a, b) => {
      if (a.mastered !== b.mastered) return a.mastered ? 1 : -1;
      return a.skill.localeCompare(b.skill);
    });
  });

  let reviewsDue = $state(/** @type {any[]} */ ([]));
  let reviewsUpcoming = $state(/** @type {any[]} */ ([]));

  function reviewTitle(lessonId) {
    const l = lessons.find(ll => ll.lessonId === lessonId);
    return l ? l.title : lessonId;
  }

  async function load() {
    if (!api.baseUrl || !pseudoId) { loading = false; return; }
    loading = true;
    error = '';
    try {
      const res = await api.getTheta(pseudoId);
      lessons = res.lessons || [];
      currentOverride = res.override || null;
      overrideLessonId = currentOverride || '';
      hubConnected = true;

      try {
        const reviews = await api.getReviews(pseudoId);
        reviewsDue = reviews.due || [];
        reviewsUpcoming = reviews.upcoming || [];
      } catch { /* reviews not available */ }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      hubConnected = false;
    }
    loading = false;
  }

  onMount(load);

  function startEditName() {
    editingName = true;
    nameInput = hasNickname(pseudoId) ? getStudentName(pseudoId) : '';
  }

  function saveName() {
    setStudentName(pseudoId, nameInput);
    editingName = false;
  }

  async function applyOverride() {
    overrideLoading = true;
    overrideErr = '';
    overrideMsg = '';
    try {
      await api.setRecommendationOverride(pseudoId, overrideLessonId || null);
      overrideMsg = overrideLessonId ? 'Override applied.' : 'Override cleared.';
      currentOverride = overrideLessonId || null;
      await load();
    } catch (e) {
      overrideErr = e instanceof Error ? e.message : String(e);
    }
    overrideLoading = false;
  }

  function statusLabelI18n(s) {
    return statusLabelFn(s, tr);
  }
</script>

<svelte:head>
  <title>{displayName} — Student | AGNI Portal</title>
</svelte:head>

<nav class="breadcrumb" aria-label="Breadcrumb">
  <a href="/hub">{tr('nav.hub')}</a> &rarr; <a href="/students">{tr('nav.students')}</a> &rarr; {displayName}
</nav>

{#if loading}
  <p>Loading…</p>
{:else if !hubConnected}
  <div class="card warning-box">
    <p>Configure hub URL in <a href="/settings">Settings</a>.</p>
    {#if error}<p class="err">{error}</p>{/if}
  </div>
{:else}
  <!-- Student header -->
  <div class="student-header-card card">
    <div class="header-top">
      <span class="status-badge" style="background: {statusColor(status)};">{statusLabelI18n(status)}</span>
      <div class="identity">
        {#if editingName}
          <input class="name-input" type="text" bind:value={nameInput}
                 placeholder="Enter nickname…"
                 onkeydown={(e) => e.key === 'Enter' && saveName()}
                 onblur={saveName} />
        {:else}
          <h1 onclick={startEditName} class="clickable-name" title="Click to edit nickname">
            {displayName}
          </h1>
        {/if}
        <p class="pseudo">{pseudoId}</p>
      </div>
    </div>

    <div class="mastery-bar-row">
      <div class="mastery-bar-bg">
        <div class="mastery-bar-fill" style="width: {masteryPct}%; background: {statusColor(status)};"></div>
      </div>
      <span class="mastery-label">{masteryPct}% — {masteredLessons.length}/{lessons.length} lessons mastered</span>
    </div>

    {#if currentOverride}
      <p class="override-notice">Active override: <strong>{lessons.find(l => l.lessonId === currentOverride)?.title || currentOverride}</strong></p>
    {/if}
  </div>

  <!-- Tabs -->
  <div class="tabs" role="tablist" aria-label="Student detail tabs">
    <button class:active={showTab === 'recommendations'} onclick={() => showTab = 'recommendations'} role="tab" aria-selected={showTab === 'recommendations'}>Recommendations</button>
    <button class:active={showTab === 'skills'} onclick={() => showTab = 'skills'} role="tab" aria-selected={showTab === 'skills'}>{tr('tab.skills')} ({allSkills.length})</button>
    <button class:active={showTab === 'mastered'} onclick={() => showTab = 'mastered'} role="tab" aria-selected={showTab === 'mastered'}>{tr('tab.completed')} ({masteredLessons.length})</button>
    {#if reviewsDue.length > 0 || reviewsUpcoming.length > 0}
      <button class:active={showTab === 'reviews'} onclick={() => showTab = 'reviews'} role="tab" aria-selected={showTab === 'reviews'}>{tr('tab.reviews')} ({reviewsDue.length} due)</button>
    {/if}
    <button class:active={showTab === 'override'} onclick={() => showTab = 'override'} role="tab" aria-selected={showTab === 'override'}>Override</button>
  </div>

  {#if showTab === 'recommendations'}
    <section class="card">
      <h2>Recommended Lessons</h2>
      {#if unmastered.length === 0}
        <p class="all-done">All available lessons have been mastered.</p>
      {:else}
        <div class="lesson-list">
          {#each unmastered as l, i}
            <div class="lesson-row" class:top-pick={i === 0}>
              <span class="rank">#{i + 1}</span>
              <div class="lesson-info">
                <strong>{l.title}</strong>
                <span class="slug">{l.slug}</span>
              </div>
              <span class="theta">θ={l.theta}</span>
              <div class="lesson-skills">
                {#each (l.skillsProvided || []).slice(0, 3) as sp}
                  <span class="skill-tag">{sp.skill}</span>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  {/if}

  {#if showTab === 'skills'}
    <section class="card">
      <h2>Skill Breakdown</h2>
      <div class="skill-grid">
        {#each allSkills as sk}
          <div class="skill-item" class:mastered={sk.mastered}>
            <span class="skill-dot" style="background: {sk.mastered ? '#4ade80' : '#ff5252'};"></span>
            <span class="skill-name">{sk.skill}</span>
            <span class="skill-lessons">{sk.lessonCount} lesson(s)</span>
          </div>
        {/each}
      </div>
      {#if allSkills.length === 0}
        <p class="empty">No skill data available.</p>
      {/if}
    </section>
  {/if}

  {#if showTab === 'mastered'}
    <section class="card">
      <h2>Mastered Lessons</h2>
      {#if masteredLessons.length === 0}
        <p class="empty">No lessons mastered yet.</p>
      {:else}
        <div class="lesson-list">
          {#each masteredLessons as l}
            <div class="lesson-row mastered">
              <span class="check">✓</span>
              <div class="lesson-info">
                <strong>{l.title}</strong>
                <span class="slug">{l.slug}</span>
              </div>
              <div class="lesson-skills">
                {#each (l.skillsProvided || []).slice(0, 3) as sp}
                  <span class="skill-tag">{sp.skill}</span>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  {/if}

  {#if showTab === 'reviews'}
    <section class="card">
      <h2>Spaced Repetition Schedule</h2>
      {#if reviewsDue.length === 0 && reviewsUpcoming.length === 0}
        <p class="empty">No reviews scheduled for this student.</p>
      {:else}
        {#if reviewsDue.length > 0}
          <h3 class="section-subtitle">Due Now ({reviewsDue.length})</h3>
          <div class="lesson-list">
            {#each reviewsDue as r}
              <div class="lesson-row review-due">
                <span class="review-icon">!</span>
                <div class="lesson-info">
                  <strong>{reviewTitle(r.lessonId)}</strong>
                  <span class="slug">Rep #{r.repetition + 1} &middot; Quality: {r.quality}/5 &middot; Ease: {r.easeFactor}</span>
                </div>
              </div>
            {/each}
          </div>
        {/if}
        {#if reviewsUpcoming.length > 0}
          <h3 class="section-subtitle">Upcoming</h3>
          <div class="lesson-list">
            {#each reviewsUpcoming as r}
              <div class="lesson-row review-upcoming">
                <span class="review-icon dim">~</span>
                <div class="lesson-info">
                  <strong>{reviewTitle(r.lessonId)}</strong>
                  <span class="slug">Due {formatDaysUntil(r.nextReviewAt)} &middot; Interval: {r.interval}d</span>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      {/if}
    </section>
  {/if}

  {#if showTab === 'override'}
    <section class="card">
      <h2>Recommendation Override</h2>
      <p class="hint">Override the theta-computed recommendation for this student. The selected lesson will be served next regardless of theta order.</p>

      <label class="block">
        Override lesson
        <select bind:value={overrideLessonId}>
          <option value="">— Use theta order (no override) —</option>
          {#each lessons as l}
            <option value={l.lessonId}>
              {l.title} ({l.slug}) · θ={l.theta}
              {l.alreadyMastered ? ' ✓ mastered' : ''}
            </option>
          {/each}
        </select>
      </label>

      {#if overrideErr}<p class="err">{overrideErr}</p>{/if}
      {#if overrideMsg}<p class="ok">{overrideMsg}</p>{/if}

      <div class="override-actions">
        <button class="primary" onclick={applyOverride} disabled={overrideLoading}>
          {overrideLoading ? 'Saving…' : overrideLessonId ? 'Apply Override' : 'Clear Override'}
        </button>
      </div>
    </section>
  {/if}
{/if}

<style>
  .breadcrumb { margin-bottom: 1rem; font-size: 0.9rem; opacity: 0.9; }
  .breadcrumb a { color: var(--accent); }

  .warning-box { border-color: #ff6b6b; max-width: 500px; }

  .student-header-card { margin-bottom: 0; }
  .header-top { display: flex; align-items: flex-start; gap: 1rem; margin-bottom: 1rem; }
  .status-badge {
    padding: 0.3rem 0.8rem; border-radius: 20px; font-size: 0.85rem;
    font-weight: bold; color: #1a1a2e; white-space: nowrap; margin-top: 0.3rem;
  }
  .identity { flex: 1; }
  h1 { margin: 0; }
  .clickable-name { cursor: pointer; }
  .clickable-name:hover { color: var(--accent); }
  .pseudo { font-size: 0.85rem; opacity: 0.5; margin-top: 0.25rem; word-break: break-all; }
  .name-input {
    font-size: 1.5rem; font-weight: bold; padding: 0.25rem 0.5rem;
    background: #1f2b4e; color: var(--text); border: 1px solid var(--accent);
    border-radius: 6px; width: 100%; max-width: 400px;
  }

  .mastery-bar-row { margin-bottom: 0.75rem; }
  .mastery-bar-bg { height: 10px; background: var(--border); border-radius: 5px; overflow: hidden; }
  .mastery-bar-fill { height: 100%; transition: width 0.3s; border-radius: 5px; }
  .mastery-label { font-size: 0.9rem; opacity: 0.9; margin-top: 0.25rem; display: block; }

  .override-notice {
    background: rgba(255,170,0,0.1); padding: 0.5rem 0.75rem;
    border-radius: 6px; font-size: 0.9rem; color: #ffaa00; margin-top: 0.5rem;
  }

  .tabs {
    display: flex; gap: 0; margin: 1.5rem 0 0;
    border-bottom: 2px solid var(--border);
  }
  .tabs button {
    padding: 0.6rem 1.2rem; background: none; color: var(--text);
    border: none; border-bottom: 2px solid transparent; cursor: pointer;
    font-size: 0.95rem; margin-bottom: -2px; transition: all 0.15s;
  }
  .tabs button:hover { color: var(--accent); }
  .tabs button.active {
    color: var(--accent); border-bottom-color: var(--accent); font-weight: bold;
  }

  .lesson-list { display: flex; flex-direction: column; gap: 0.5rem; }
  .lesson-row {
    display: flex; align-items: center; gap: 0.75rem; padding: 0.6rem 0.75rem;
    background: rgba(255,255,255,0.03); border: 1px solid var(--border);
    border-radius: 8px; flex-wrap: wrap;
  }
  .lesson-row.top-pick { border-color: var(--accent); background: rgba(0,230,118,0.05); }
  .lesson-row.mastered { border-color: rgba(74,222,128,0.3); }
  .rank { font-weight: bold; color: var(--accent); min-width: 30px; }
  .check { color: #4ade80; font-size: 1.1rem; min-width: 30px; text-align: center; }
  .lesson-info { flex: 1; min-width: 200px; }
  .lesson-info strong { display: block; }
  .slug { font-size: 0.8rem; opacity: 0.5; }
  .theta { font-size: 0.9rem; opacity: 0.7; min-width: 60px; text-align: right; }
  .lesson-skills { display: flex; gap: 0.3rem; flex-wrap: wrap; }
  .skill-tag {
    font-size: 0.75rem; padding: 0.15rem 0.4rem; background: rgba(0,230,118,0.1);
    color: var(--accent); border-radius: 4px;
  }

  .skill-grid { display: flex; flex-direction: column; gap: 0.3rem; }
  .skill-item {
    display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.5rem;
    border-radius: 6px;
  }
  .skill-item.mastered { opacity: 0.7; }
  .skill-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .skill-name { flex: 1; }
  .skill-lessons { font-size: 0.8rem; opacity: 0.6; }

  label.block { display: block; margin: 1rem 0 0.5rem; font-weight: bold; }
  select {
    width: 100%; max-width: 500px; padding: 0.6rem; background: #1f2b4e;
    color: var(--text); border: 1px solid var(--border); border-radius: 6px;
    font-size: 1rem; margin-top: 0.25rem;
  }
  .override-actions { margin-top: 1rem; }
  button.primary {
    padding: 0.6rem 1.2rem; background: var(--accent); color: #1a1a2e;
    border: none; border-radius: 6px; cursor: pointer; font-weight: bold;
  }
  button:disabled { opacity: 0.5; cursor: not-allowed; }

  .hint { font-size: 0.9rem; opacity: 0.8; margin-bottom: 1rem; }
  .err { color: #ff6b6b; margin: 0.5rem 0; }
  .ok { color: #4ade80; margin: 0.5rem 0; }
  .all-done { color: #4ade80; }
  .empty { opacity: 0.7; }

  .section-subtitle { font-size: 0.95rem; margin: 1rem 0 0.5rem; opacity: 0.8; }
  .review-icon { min-width: 30px; text-align: center; font-weight: bold; color: #fbbf24; font-size: 1.1rem; }
  .review-icon.dim { color: var(--text); opacity: 0.4; }
  .review-due { border-left: 3px solid #fbbf24; }
  .review-upcoming { opacity: 0.65; }
</style>
