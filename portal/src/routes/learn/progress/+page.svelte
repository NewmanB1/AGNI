<script>
  import { hubApiStore, hubUrlStore } from '$lib/api';
  import { t } from '$lib/i18n';
  import { getPseudoId } from '$lib/pseudoId';
  import { formatDaysUntil } from '$lib/studentStatus';
  import { onMount } from 'svelte';

  const api = $derived($hubApiStore);
  const tr = $derived($t);

  let pseudoId = $state('');
  let lessons = $state(/** @type {any[]} */ ([]));
  let override = $state(/** @type {string | null} */ (null));
  let loading = $state(true);
  let error = $state('');
  let hubConnected = $state(false);
  let showTab = $state('skills');
  let reviewsDue = $state(/** @type {any[]} */ ([]));
  let reviewsUpcoming = $state(/** @type {any[]} */ ([]));
  let masterySnapshots = $state(/** @type {any[]} */ ([]));

  const mastered = $derived(lessons.filter(l => l.alreadyMastered));
  const unmastered = $derived(lessons.filter(l => !l.alreadyMastered));
  const masteryPct = $derived(lessons.length > 0 ? Math.round((mastered.length / lessons.length) * 100) : 0);

  const allSkills = $derived.by(() => {
    const skills = /** @type {Map<string, { skill: string; mastered: boolean; lessonCount: number; lessons: string[] }>} */ (new Map());
    for (const l of lessons) {
      for (const sp of (l.skillsProvided || [])) {
        const existing = skills.get(sp.skill);
        if (!existing) {
          skills.set(sp.skill, { skill: sp.skill, mastered: l.alreadyMastered, lessonCount: 1, lessons: [l.title] });
        } else {
          existing.lessonCount++;
          existing.lessons.push(l.title);
          if (l.alreadyMastered) existing.mastered = true;
        }
      }
    }
    return [...skills.values()].sort((a, b) => {
      if (a.mastered !== b.mastered) return a.mastered ? 1 : -1;
      return a.skill.localeCompare(b.skill);
    });
  });

  const masteredSkills = $derived(allSkills.filter(s => s.mastered));
  const unmasteredSkills = $derived(allSkills.filter(s => !s.mastered));
  const lessonMap = $derived(new Map(lessons.map(l => [l.lessonId, l])));

  function reviewTitle(lessonId) {
    const l = lessonMap.get(lessonId);
    return l ? l.title : lessonId;
  }

  async function load() {
    pseudoId = getPseudoId();
    if (!api.baseUrl || !pseudoId) { loading = false; return; }
    loading = true;
    error = '';
    try {
      const res = await api.getTheta(pseudoId);
      lessons = res.lessons || [];
      override = res.override || null;
      hubConnected = true;

      try {
        const reviews = await api.getReviews(pseudoId);
        reviewsDue = reviews.due || [];
        reviewsUpcoming = reviews.upcoming || [];
      } catch { /* reviews not available */ }

      try {
        const history = await api.getMasteryHistory(pseudoId);
        masterySnapshots = history.snapshots || [];
      } catch { /* mastery history not available */ }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      hubConnected = false;
    }
    loading = false;
  }

  onMount(load);
</script>

<svelte:head>
  <title>{tr('progress.title')} | AGNI Portal</title>
</svelte:head>

<nav class="breadcrumb" aria-label="Breadcrumb">
  <a href="/learn">{tr('learn.title')}</a> &rarr; {tr('progress.title')}
</nav>

<h1>{tr('progress.title')}</h1>

{#if loading}
  <p>Loading…</p>
{:else if !hubConnected}
  <div class="card setup-box">
    {#if !pseudoId}
      <p>Visit <a href="/learn">{tr('learn.title')}</a> first to set up your student identity, then come back here.</p>
    {:else}
      <p>Configure hub URL in <a href="/settings">{tr('nav.settings')}</a> to view your progress.</p>
      {#if error}<p class="err">{error}</p>{/if}
    {/if}
  </div>
{:else}
  <!-- Overall summary -->
  <div class="card summary-card">
    <div class="summary-row">
      <div class="summary-item big">
        <span class="val accent">{masteryPct}%</span>
        <span class="lbl">{tr('progress.overall')}</span>
      </div>
      <div class="summary-item">
        <span class="val">{mastered.length}</span>
        <span class="lbl">{tr('progress.lessons_done')}</span>
      </div>
      <div class="summary-item">
        <span class="val">{unmastered.length}</span>
        <span class="lbl">{tr('progress.lessons_left')}</span>
      </div>
      <div class="summary-item">
        <span class="val">{masteredSkills.length}/{allSkills.length}</span>
        <span class="lbl">{tr('progress.skills_mastered')}</span>
      </div>
    </div>

    <div class="bar-bg" role="progressbar" aria-valuenow={masteryPct} aria-valuemin="0" aria-valuemax="100" aria-label="Overall mastery progress">
      <div class="bar-fill" style="width: {masteryPct}%;"></div>
    </div>

    {#if override}
      <p class="override-note">{tr('progress.override_note')}</p>
    {/if}
  </div>

  <!-- Tabs -->
  <div class="tabs" role="tablist" aria-label="Progress categories">
    <button class:active={showTab === 'skills'} onclick={() => showTab = 'skills'} role="tab" aria-selected={showTab === 'skills'}>
      {tr('tab.skills')} ({allSkills.length})
    </button>
    <button class:active={showTab === 'completed'} onclick={() => showTab = 'completed'} role="tab" aria-selected={showTab === 'completed'}>
      {tr('tab.completed')} ({mastered.length})
    </button>
    <button class:active={showTab === 'upcoming'} onclick={() => showTab = 'upcoming'} role="tab" aria-selected={showTab === 'upcoming'}>
      {tr('tab.upcoming')} ({unmastered.length})
    </button>
    {#if masterySnapshots.length > 0}
      <button class:active={showTab === 'trend'} onclick={() => showTab = 'trend'} role="tab" aria-selected={showTab === 'trend'}>
        Trend ({masterySnapshots.length})
      </button>
    {/if}
    {#if reviewsDue.length > 0 || reviewsUpcoming.length > 0}
      <button class:active={showTab === 'reviews'} onclick={() => showTab = 'reviews'} role="tab" aria-selected={showTab === 'reviews'}>
        {tr('tab.reviews')} ({reviewsDue.length} due)
      </button>
    {/if}
  </div>

  {#if showTab === 'skills'}
    <section class="card tab-content">
      <h2>{tr('progress.skill_map')}</h2>
      {#if allSkills.length === 0}
        <p class="empty">{tr('progress.no_skills')}</p>
      {:else}
        <div class="skill-map">
          {#each allSkills as sk}
            <div class="skill-row" class:done={sk.mastered}>
              <span class="skill-indicator" style="background: {sk.mastered ? '#4ade80' : '#ff5252'};"></span>
              <span class="skill-name">{sk.skill}</span>
              <span class="skill-detail">
                {sk.mastered ? tr('progress.mastered_label') : tr('progress.in_progress')} &middot; {sk.lessonCount} lesson(s)
              </span>
            </div>
          {/each}
        </div>

        <div class="skill-summary">
          <span class="skill-count done">{masteredSkills.length} mastered</span>
          <span class="skill-count remaining">{unmasteredSkills.length} remaining</span>
        </div>
      {/if}
    </section>
  {/if}

  {#if showTab === 'completed'}
    <section class="card tab-content">
      <h2>{tr('progress.completed_lessons')}</h2>
      {#if mastered.length === 0}
        <p class="empty">{tr('progress.no_completed')} <a href="/learn">{tr('progress.start_learning')}</a></p>
      {:else}
        <div class="lesson-list">
          {#each mastered as l}
            <div class="lesson-item">
              <span class="check">✓</span>
              <div class="lesson-detail">
                <strong>{l.title}</strong>
                <span class="slug">{l.slug}</span>
                <div class="lesson-chips">
                  {#each (l.skillsProvided || []).slice(0, 4) as sp}
                    <span class="chip">{sp.skill}</span>
                  {/each}
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  {/if}

  {#if showTab === 'upcoming'}
    <section class="card tab-content">
      <h2>{tr('progress.upcoming_lessons')}</h2>
      {#if unmastered.length === 0}
        <p class="empty all-done">{tr('progress.all_mastered')}</p>
      {:else}
        <div class="lesson-list">
          {#each unmastered as l, i}
            <div class="lesson-item upcoming">
              <span class="rank">#{i + 1}</span>
              <div class="lesson-detail">
                <strong>{l.title}</strong>
                <span class="slug">{l.slug} · θ={l.theta}</span>
                {#if l.skillsRequired?.length}
                  <span class="prereq">Requires: {l.skillsRequired.join(', ')}</span>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  {/if}

  {#if showTab === 'trend'}
    <section class="card tab-content" role="region" aria-label="Mastery trend over time">
      <h2>Mastery Trend</h2>
      {#if masterySnapshots.length === 0}
        <p class="empty">No history data yet.</p>
      {:else}
        <div class="trend-chart" role="img" aria-label="Mastery percentage over time">
          <div class="chart-y-axis">
            <span>100%</span><span>50%</span><span>0%</span>
          </div>
          <div class="chart-bars">
            {#each masterySnapshots.slice(-30) as snap, i}
              {@const pct = Math.round((snap.mastery || 0) * 100)}
              <div class="chart-bar-col" title="{snap.date?.slice(0,10)} — {pct}%">
                <div class="chart-bar" style="height:{pct}%" class:high={pct >= 80} class:mid={pct >= 50 && pct < 80} class:low={pct < 50}></div>
              </div>
            {/each}
          </div>
        </div>
        <div class="trend-table">
          {#each masterySnapshots.slice(-10).reverse() as snap}
            <div class="trend-row">
              <span class="trend-date">{snap.date?.slice(0, 10)}</span>
              <span class="trend-lesson">{snap.lessonId}</span>
              <span class="trend-score">{Math.round((snap.mastery || 0) * 100)}%</span>
              <span class="trend-total">{snap.masteryPct}% overall</span>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  {/if}

  {#if showTab === 'reviews'}
    <section class="card tab-content">
      <h2>{tr('progress.review_schedule')}</h2>
      {#if reviewsDue.length === 0 && reviewsUpcoming.length === 0}
        <p class="empty">{tr('progress.no_reviews')}</p>
      {:else}
        {#if reviewsDue.length > 0}
          <h3 class="section-subtitle">Due Now ({reviewsDue.length})</h3>
          <div class="lesson-list">
            {#each reviewsDue as r}
              <div class="lesson-item review-due">
                <span class="review-icon">!</span>
                <div class="lesson-detail">
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
              <div class="lesson-item review-upcoming">
                <span class="review-icon dim">~</span>
                <div class="lesson-detail">
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

  <p class="id-note">Student ID: <code>{pseudoId}</code></p>
{/if}

<style>
  .breadcrumb { margin-bottom: 1rem; font-size: 0.9rem; opacity: 0.9; }
  .breadcrumb a { color: var(--accent); }

  .setup-box { max-width: 500px; }
  .err { color: #ff6b6b; margin-top: 0.5rem; }

  .summary-card { margin-bottom: 0; }
  .summary-row {
    display: flex; gap: 2rem; margin-bottom: 1rem; flex-wrap: wrap;
  }
  .summary-item { text-align: center; }
  .summary-item.big { min-width: 100px; }
  .val { display: block; font-size: 1.5rem; font-weight: bold; color: #fff; }
  .val.accent { color: var(--accent); font-size: 2rem; }
  .lbl { font-size: 0.8rem; opacity: 0.7; }

  .bar-bg { height: 12px; background: var(--border); border-radius: 6px; overflow: hidden; }
  .bar-fill { height: 100%; background: var(--accent); transition: width 0.3s; border-radius: 6px; }

  .override-note {
    margin-top: 0.75rem; padding: 0.4rem 0.6rem;
    background: rgba(255,170,0,0.1); color: #ffaa00; border-radius: 6px;
    font-size: 0.9rem;
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
  .tabs button.active { color: var(--accent); border-bottom-color: var(--accent); font-weight: bold; }

  .tab-content { margin-top: 0; border-top-left-radius: 0; border-top-right-radius: 0; }
  .tab-content h2 { margin-bottom: 1rem; }

  .skill-map { display: flex; flex-direction: column; gap: 0.35rem; }
  .skill-row {
    display: flex; align-items: center; gap: 0.5rem; padding: 0.35rem 0.5rem;
    border-radius: 6px; transition: background 0.1s;
  }
  .skill-row:hover { background: rgba(255,255,255,0.03); }
  .skill-row.done { opacity: 0.7; }
  .skill-indicator { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .skill-name { flex: 1; font-weight: 500; }
  .skill-detail { font-size: 0.8rem; opacity: 0.6; }

  .skill-summary { display: flex; gap: 1.5rem; margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid var(--border); }
  .skill-count { font-size: 0.9rem; font-weight: bold; }
  .skill-count.done { color: #4ade80; }
  .skill-count.remaining { color: #ff5252; }

  .lesson-list { display: flex; flex-direction: column; gap: 0.4rem; }
  .lesson-item {
    display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0.5rem;
    border-radius: 6px;
  }
  .lesson-item:hover { background: rgba(255,255,255,0.03); }
  .check { color: #4ade80; font-size: 1.1rem; min-width: 25px; text-align: center; }
  .rank { color: var(--accent); font-weight: bold; min-width: 25px; text-align: center; }
  .lesson-detail { flex: 1; }
  .lesson-detail strong { display: block; }
  .slug { font-size: 0.8rem; opacity: 0.5; }
  .prereq { display: block; font-size: 0.8rem; color: #ffaa00; margin-top: 0.2rem; }
  .lesson-chips { display: flex; gap: 0.25rem; flex-wrap: wrap; margin-top: 0.2rem; }
  .chip {
    font-size: 0.7rem; padding: 0.1rem 0.3rem;
    background: rgba(0,230,118,0.1); color: var(--accent); border-radius: 3px;
  }

  .empty { opacity: 0.7; }
  .all-done { color: #4ade80; }

  .section-subtitle { font-size: 0.95rem; margin: 1rem 0 0.5rem; opacity: 0.8; }
  .review-icon { min-width: 25px; text-align: center; font-weight: bold; color: #fbbf24; font-size: 1.1rem; }
  .review-icon.dim { color: var(--text); opacity: 0.4; }
  .review-due { border-left: 3px solid #fbbf24; padding-left: 0.75rem; }
  .review-upcoming { opacity: 0.65; }

  .id-note { margin-top: 2rem; font-size: 0.8rem; opacity: 0.4; }
  .id-note code { background: rgba(255,255,255,0.1); padding: 0.1rem 0.3rem; border-radius: 4px; }

  .trend-chart { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; height: 120px; }
  .chart-y-axis { display: flex; flex-direction: column; justify-content: space-between; font-size: 0.7rem; opacity: 0.5; padding: 0 0.25rem; }
  .chart-bars { flex: 1; display: flex; align-items: flex-end; gap: 2px; }
  .chart-bar-col { flex: 1; display: flex; align-items: flex-end; height: 100%; min-width: 6px; }
  .chart-bar { width: 100%; border-radius: 2px 2px 0 0; transition: height 0.3s; min-height: 2px; }
  .chart-bar.high { background: #4ade80; }
  .chart-bar.mid { background: #60a5fa; }
  .chart-bar.low { background: #ff5252; }

  .trend-table { display: flex; flex-direction: column; gap: 0.2rem; }
  .trend-row { display: flex; align-items: center; gap: 0.75rem; padding: 0.3rem 0.5rem; font-size: 0.85rem; border-radius: 4px; }
  .trend-row:hover { background: rgba(255,255,255,0.03); }
  .trend-date { font-size: 0.8rem; opacity: 0.6; min-width: 80px; }
  .trend-lesson { flex: 1; font-size: 0.8rem; opacity: 0.7; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .trend-score { font-weight: bold; min-width: 40px; text-align: right; }
  .trend-total { font-size: 0.8rem; opacity: 0.5; min-width: 80px; text-align: right; }
</style>
