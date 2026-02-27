<script>
  import { hubApiStore } from '$lib/api';
  import { t } from '$lib/i18n';
  import { getPseudoId } from '$lib/pseudoId';
  import { onMount } from 'svelte';

  const api = $derived($hubApiStore);
  const tr = $derived($t);

  let loading = $state(true);
  let currentStreak = $state(0);
  let longestStreak = $state(0);
  let totalSessions = $state(0);
  let todayCount = $state(0);
  let dailyGoal = $state(1);
  let goalMet = $state(false);
  let dates = $state(/** @type {string[]} */ ([]));

  // Calendar: show last 28 days
  const calendarDays = $derived.by(() => {
    const days = [];
    const dateSet = new Set(dates);
    const now = new Date();
    for (let i = 27; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const dayLabel = d.toLocaleDateString(undefined, { weekday: 'narrow' });
      const dayNum = d.getDate();
      days.push({ iso, active: dateSet.has(iso), dayLabel, dayNum });
    }
    return days;
  });

  async function load() {
    const pseudoId = getPseudoId();
    if (!api.baseUrl || !pseudoId) { loading = false; return; }
    try {
      const res = await api.getStreaks(pseudoId);
      currentStreak = res.currentStreak || 0;
      longestStreak = res.longestStreak || 0;
      totalSessions = res.totalSessions || 0;
      todayCount = res.todayCount || 0;
      dailyGoal = res.dailyGoal || 1;
      goalMet = res.goalMet || false;
      dates = res.dates || [];
    } catch { /* streaks not available yet */ }
    loading = false;
  }

  onMount(load);
</script>

<svelte:head>
  <title>{tr('streaks.title')} | AGNI Portal</title>
</svelte:head>

<nav class="breadcrumb">
  <a href="/learn">{tr('learn.title')}</a> &rarr; {tr('streaks.title')}
</nav>

<h1>{tr('streaks.title')}</h1>

{#if loading}
  <p>{tr('learn.loading')}</p>
{:else}
  <div class="streak-summary">
    <div class="streak-card accent">
      <span class="big-num">{currentStreak}</span>
      <span class="card-label">{tr('streaks.current')}</span>
      <span class="unit">{tr('streaks.days')}</span>
    </div>
    <div class="streak-card">
      <span class="big-num">{longestStreak}</span>
      <span class="card-label">{tr('streaks.longest')}</span>
      <span class="unit">{tr('streaks.days')}</span>
    </div>
    <div class="streak-card">
      <span class="big-num">{totalSessions}</span>
      <span class="card-label">{tr('streaks.total')}</span>
    </div>
  </div>

  <!-- Daily goal -->
  <div class="card goal-card">
    <h2>{tr('streaks.daily_goal')}</h2>
    {#if goalMet}
      <p class="goal-met">{tr('streaks.goal_complete')}</p>
    {:else}
      <p class="goal-pending">{tr('streaks.lessons_today', { count: todayCount })} / {dailyGoal} goal</p>
    {/if}
    <div class="goal-bar-bg">
      <div class="goal-bar-fill" style="width: {Math.min(100, (todayCount / dailyGoal) * 100)}%;"></div>
    </div>
  </div>

  <!-- Activity calendar -->
  <div class="card calendar-card">
    <h2>Last 28 Days</h2>
    <div class="cal-grid">
      {#each calendarDays as day}
        <div class="cal-day" class:active={day.active} title={day.iso}>
          <span class="day-num">{day.dayNum}</span>
        </div>
      {/each}
    </div>
    <div class="cal-legend">
      <span class="legend-dot active"></span> Active day
      <span class="legend-dot"></span> No activity
    </div>
  </div>
{/if}

<style>
  .breadcrumb { margin-bottom: 1rem; font-size: 0.9rem; opacity: 0.9; }
  .breadcrumb a { color: var(--accent); }

  .streak-summary { display: flex; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
  .streak-card {
    flex: 1; min-width: 120px; text-align: center; padding: 1.25rem;
    background: var(--card); border: 1px solid var(--border); border-radius: 12px;
  }
  .streak-card.accent { border-color: var(--accent); background: rgba(0,230,118,0.06); }
  .big-num { display: block; font-size: 2.5rem; font-weight: bold; color: var(--accent); }
  .card-label { display: block; font-size: 0.85rem; opacity: 0.7; }
  .unit { font-size: 0.8rem; opacity: 0.5; }

  .goal-card { margin-bottom: 1.5rem; max-width: 500px; }
  .goal-met { color: #4ade80; font-weight: bold; font-size: 1.1rem; }
  .goal-pending { opacity: 0.8; }
  .goal-bar-bg { height: 10px; background: var(--border); border-radius: 5px; overflow: hidden; margin-top: 0.5rem; }
  .goal-bar-fill { height: 100%; background: var(--accent); border-radius: 5px; transition: width 0.3s; }

  .calendar-card { max-width: 500px; }
  .cal-grid {
    display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin-top: 0.75rem;
  }
  .cal-day {
    aspect-ratio: 1; display: flex; align-items: center; justify-content: center;
    border-radius: 6px; background: rgba(255,255,255,0.04);
    font-size: 0.75rem; opacity: 0.4;
  }
  .cal-day.active { background: rgba(0,230,118,0.25); opacity: 1; color: var(--accent); font-weight: bold; }
  .day-num { pointer-events: none; }

  .cal-legend { display: flex; align-items: center; gap: 0.75rem; margin-top: 0.75rem; font-size: 0.8rem; opacity: 0.7; }
  .legend-dot {
    display: inline-block; width: 12px; height: 12px; border-radius: 3px;
    background: rgba(255,255,255,0.04); margin-right: 0.25rem;
  }
  .legend-dot.active { background: rgba(0,230,118,0.25); }
</style>
