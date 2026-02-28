<script>
  import { hubApiStore, hubUrlStore } from '$lib/api';
  import { t } from '$lib/i18n';
  import { getOrCreatePseudoId } from '$lib/pseudoId';
  import { formatDaysUntil } from '$lib/studentStatus';
  import { onMount } from 'svelte';

  const api = $derived($hubApiStore);
  const hubUrl = $derived($hubUrlStore);
  const tr = $derived($t);

  let pseudoId = $state('');
  let lessons = $state(/** @type {any[]} */ ([]));
  let banditPick = $state(/** @type {string | null} */ (null));
  let ability = $state(/** @type {{ ability: number; variance: number } | null} */ (null));
  let loading = $state(true);
  let error = $state('');
  let hubConnected = $state(false);
  let caching = $state(/** @type {Set<string>} */ (new Set()));
  let cached = $state(/** @type {Set<string>} */ (new Set()));
  let reviewsDue = $state(/** @type {any[]} */ ([]));
  let reviewsUpcoming = $state(/** @type {any[]} */ ([]));
  let activeTab = $state(/** @type {'new' | 'review'} */ ('new'));
  let streakDays = $state(0);
  let goalMet = $state(false);
  let collabStats = $state(/** @type {Record<string, {activeCount:number;completedCount:number}>} */ ({}));
  let badges = $state(/** @type {Array<{id:string;name:string;description:string;icon:string;earned:boolean}>} */ ([]));

  // ── Diagnostic placement assessment ──
  let showDiagnostic = $state(false);
  let diagnosticProbes = $state(/** @type {Array<{probeId:string;skill:string;difficulty:number;question:string;type:string;options:string[]}>} */ ([]));
  let diagnosticAnswers = $state(/** @type {Record<string, number>} */ ({}));
  let diagnosticStep = $state(0);
  let diagnosticDone = $state(false);
  let diagnosticResult = $state(/** @type {{ ability: number; skillsBootstrapped: number } | null} */ (null));

  let search = $state('');

  const unmastered = $derived.by(() => {
    let list = lessons.filter(l => !l.alreadyMastered);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(l =>
        (l.title || '').toLowerCase().includes(q) ||
        (l.slug || '').toLowerCase().includes(q) ||
        (l.description || '').toLowerCase().includes(q) ||
        (l.subject || '').toLowerCase().includes(q) ||
        (l.skillsProvided || []).some(sp => sp.skill.toLowerCase().includes(q))
      );
    }
    return list;
  });
  const mastered = $derived(lessons.filter(l => l.alreadyMastered));
  const masteryPct = $derived(lessons.length > 0 ? Math.round((mastered.length / lessons.length) * 100) : 0);
  const lessonMap = $derived(new Map(lessons.map(l => [l.lessonId, l])));

  async function load() {
    pseudoId = getOrCreatePseudoId();
    if (!api.baseUrl || !pseudoId) { loading = false; return; }
    loading = true;
    error = '';
    try {
      const res = await api.getTheta(pseudoId);
      lessons = res.lessons || [];
      hubConnected = true;

      // Try bandit selection for optimal next lesson
      const candidateIds = unmastered.slice(0, 20).map(l => l.lessonId);
      if (candidateIds.length > 0) {
        try {
          const sel = await api.getLmsSelect(pseudoId, candidateIds);
          banditPick = sel.selected;
          ability = sel.ability;
        } catch {
          banditPick = null;
        }
      }

      // Fetch spaced repetition review schedule
      try {
        const reviews = await api.getReviews(pseudoId);
        reviewsDue = reviews.due || [];
        reviewsUpcoming = reviews.upcoming || [];
        if (reviewsDue.length > 0) activeTab = 'review';
      } catch { /* reviews endpoint may not exist yet */ }

      // Streaks
      try {
        const s = await api.getStreaks(pseudoId);
        streakDays = s.currentStreak || 0;
        goalMet = s.goalMet || false;
      } catch { /* streaks not available */ }

      // Badges
      try {
        const b = await api.getBadges(pseudoId);
        badges = b.badges || [];
      } catch { /* badges not available */ }

      // Diagnostic placement: offer if student has no mastered lessons
      if (mastered.length === 0 && !localStorage.getItem('agni_diag_done_' + pseudoId)) {
        try {
          const diag = await api.getDiagnosticProbes();
          if (diag.probes && diag.probes.length > 0) {
            diagnosticProbes = diag.probes;
            showDiagnostic = true;
          }
        } catch { /* diagnostic not available */ }
      }

      // Collaborative awareness
      try {
        const ids = lessons.slice(0, 20).map(l => l.lessonId).filter(Boolean);
        if (ids.length > 0) {
          const c = await api.getCollabStats(ids);
          collabStats = c.stats || {};
        }
      } catch { /* collab not available */ }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      hubConnected = false;
    }
    loading = false;
  }

  onMount(load);

  function lessonUrl(slug) {
    const base = ($hubUrlStore || '').replace(/\/$/, '');
    return base + '/lessons/' + encodeURIComponent(slug) + '?pseudoId=' + encodeURIComponent(pseudoId);
  }

  function reviewLessonTitle(lessonId) {
    const l = lessonMap.get(lessonId);
    return l ? l.title : lessonId;
  }

  function reviewLessonSlug(lessonId) {
    const l = lessonMap.get(lessonId);
    return l ? l.slug : lessonId;
  }

  async function cacheLesson(slug) {
    const url = lessonUrl(slug);
    const next = new Set(caching);
    next.add(slug);
    caching = next;
    try {
      await fetch(url, { mode: 'no-cors' });
      const done = new Set(cached);
      done.add(slug);
      cached = done;
    } catch { /* offline cache best-effort */ }
    const after = new Set(caching);
    after.delete(slug);
    caching = after;
  }

  async function cacheTopLessons() {
    const top = unmastered.slice(0, 5);
    for (const l of top) {
      await cacheLesson(l.slug);
    }
  }

  function isBanditPick(lessonId) {
    return banditPick && banditPick === lessonId;
  }

  // ── Student preferences (localStorage) ──
  let showPrefs = $state(false);
  let difficultyPref = $state(/** @type {'any' | 'easy' | 'challenge'} */ ('any'));
  let dailyGoal = $state(3);
  let bookmarks = $state(/** @type {Set<string>} */ (new Set()));

  function loadPrefs() {
    try {
      difficultyPref = /** @type {any} */ (localStorage.getItem('agni_difficulty_pref')) || 'any';
      dailyGoal = parseInt(localStorage.getItem('agni_daily_goal') || '3', 10) || 3;
      const bk = localStorage.getItem('agni_bookmarks');
      bookmarks = bk ? new Set(JSON.parse(bk)) : new Set();
    } catch { /* defaults */ }
  }

  function savePref(key, value) {
    try { localStorage.setItem(key, typeof value === 'object' ? JSON.stringify(value) : String(value)); } catch {}
  }

  function setDifficultyPref(val) {
    difficultyPref = val;
    savePref('agni_difficulty_pref', val);
  }

  function setDailyGoal(val) {
    dailyGoal = val;
    savePref('agni_daily_goal', val);
  }

  function toggleBookmark(slug) {
    const next = new Set(bookmarks);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    bookmarks = next;
    savePref('agni_bookmarks', [...next]);
  }

  $effect(() => { loadPrefs(); });

  function answerDiagnostic(probeId, answer) {
    diagnosticAnswers = { ...diagnosticAnswers, [probeId]: answer };
    if (diagnosticStep < diagnosticProbes.length - 1) {
      diagnosticStep++;
    }
  }

  async function submitDiagnostic() {
    const responses = diagnosticProbes.map(p => ({
      probeId: p.probeId,
      skill: p.skill,
      difficulty: p.difficulty,
      answer: diagnosticAnswers[p.probeId] ?? 0
    }));
    try {
      const result = await api.postDiagnostic(pseudoId, responses);
      diagnosticResult = result;
      diagnosticDone = true;
      localStorage.setItem('agni_diag_done_' + pseudoId, 'true');
      setTimeout(() => { showDiagnostic = false; load(); }, 2000);
    } catch {
      showDiagnostic = false;
    }
  }

  function skipDiagnostic() {
    showDiagnostic = false;
    localStorage.setItem('agni_diag_done_' + pseudoId, 'true');
  }
</script>

<svelte:head>
  <title>{tr('learn.title')} | AGNI Portal</title>
</svelte:head>

<div class="learn-page" role="main" aria-label="Learning dashboard">
  <h1>{tr('learn.title')}</h1>

  {#if loading}
    <p class="loading-msg" aria-live="polite">{tr('learn.loading')}</p>
  {:else if !hubConnected}
    <div class="card setup-box">
      <h2>{tr('learn.connect')}</h2>
      <p>{tr('learn.connect_desc')} <a href="/settings">{tr('nav.settings')}</a></p>
    </div>
  {:else}
    {#if error}
      <div class="card error-box" role="alert">{error}</div>
    {/if}

    <!-- Diagnostic placement assessment -->
    {#if showDiagnostic && diagnosticProbes.length > 0}
      <div class="diagnostic-overlay" role="dialog" aria-label="Placement assessment">
        <div class="diagnostic-card">
          {#if diagnosticDone}
            <div class="diagnostic-done">
              <h2>Assessment complete!</h2>
              <p>Your personalized learning path is ready.</p>
            </div>
          {:else}
            <h2>Quick Placement Assessment</h2>
            <p class="diagnostic-subtitle">Help us personalize your lessons. This takes about a minute.</p>
            <div class="diagnostic-progress">
              <div class="diagnostic-bar" style="width: {((diagnosticStep + 1) / diagnosticProbes.length) * 100}%"></div>
            </div>
            <p class="diagnostic-counter">{diagnosticStep + 1} of {diagnosticProbes.length}</p>

            {@const probe = diagnosticProbes[diagnosticStep]}
            <div class="diagnostic-probe">
              <p class="probe-question">{probe.question}</p>
              <div class="probe-options">
                {#each probe.options as opt, i}
                  <button class="probe-btn" class:selected={diagnosticAnswers[probe.probeId] === i} onclick={() => answerDiagnostic(probe.probeId, i)}>
                    {opt}
                  </button>
                {/each}
              </div>
            </div>

            <div class="diagnostic-actions">
              {#if diagnosticStep > 0}
                <button class="btn btn-secondary" onclick={() => diagnosticStep--}>Back</button>
              {/if}
              {#if Object.keys(diagnosticAnswers).length >= diagnosticProbes.length}
                <button class="btn btn-primary" onclick={submitDiagnostic}>Finish</button>
              {:else if diagnosticAnswers[diagnosticProbes[diagnosticStep]?.probeId] !== undefined && diagnosticStep < diagnosticProbes.length - 1}
                <button class="btn btn-primary" onclick={() => diagnosticStep++}>Next</button>
              {/if}
              <button class="btn btn-secondary" onclick={skipDiagnostic}>Skip assessment</button>
            </div>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Streak banner -->
    {#if streakDays > 0}
      <div class="streak-banner" class:goal-done={goalMet}>
        <span class="streak-fire">{streakDays} day streak</span>
        {#if goalMet}
          <span class="goal-badge">{tr('streaks.goal_complete')}</span>
        {/if}
        <a href="/learn/streaks" class="streak-link">{tr('streaks.title')} &rarr;</a>
      </div>
    {/if}

    <!-- Progress summary -->
    <div class="progress-header" role="region" aria-label="Progress summary">
      <div class="progress-stat">
        <span class="stat-value">{masteryPct}%</span>
        <span class="stat-label">{tr('progress.mastery')}</span>
      </div>
      <div class="progress-stat">
        <span class="stat-value">{mastered.length}</span>
        <span class="stat-label">{tr('progress.completed')}</span>
      </div>
      <div class="progress-stat">
        <span class="stat-value">{unmastered.length}</span>
        <span class="stat-label">{tr('progress.remaining')}</span>
      </div>
      {#if ability}
        <div class="progress-stat">
          <span class="stat-value">{ability.ability.toFixed(1)}</span>
          <span class="stat-label">{tr('progress.ability')}</span>
        </div>
      {/if}
      <a href="/learn/progress" class="progress-link">{tr('learn.full_progress')}</a>
    </div>

    <div class="progress-bar-row">
      <div class="progress-bg" role="progressbar" aria-valuenow={masteryPct} aria-valuemin="0" aria-valuemax="100" aria-label="Mastery progress">
        <div class="progress-fill" style="width: {masteryPct}%;"></div>
      </div>
    </div>

    <!-- Badges -->
    {#if badges.length > 0}
      <div class="badges-row" role="region" aria-label="Achievements">
        {#each badges as badge}
          <div class="badge" class:earned={badge.earned} class:locked={!badge.earned} title={badge.earned ? badge.name + ': ' + badge.description : badge.description + ' (locked)'}>
            <span class="badge-icon">{badge.icon}</span>
            <span class="badge-name">{badge.name}</span>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Offline caching -->
    {#if unmastered.length > 0}
      <div class="offline-row">
        <button class="cache-btn" onclick={cacheTopLessons} disabled={caching.size > 0}>
          {caching.size > 0 ? tr('learn.downloading') : tr('learn.save_offline')}
        </button>
        {#if cached.size > 0}
          <span class="cached-note">{tr('learn.cached', { count: cached.size })}</span>
        {/if}
      </div>
    {/if}

    <!-- Search + Preferences -->
    <div class="search-row">
      <input type="text" class="search-input" bind:value={search} placeholder="Search lessons by title, skill, or topic..." />
      <button class="pref-toggle" onclick={() => showPrefs = !showPrefs} title="Learning preferences">{showPrefs ? 'Hide' : 'Preferences'}</button>
    </div>

    {#if showPrefs}
      <div class="prefs-panel" role="region" aria-label="Learning preferences">
        <div class="pref-row">
          <label>Difficulty preference</label>
          <div class="pref-options">
            <button class="pref-chip" class:active={difficultyPref === 'any'} onclick={() => setDifficultyPref('any')}>Any</button>
            <button class="pref-chip" class:active={difficultyPref === 'easy'} onclick={() => setDifficultyPref('easy')}>Easier first</button>
            <button class="pref-chip" class:active={difficultyPref === 'challenge'} onclick={() => setDifficultyPref('challenge')}>Challenge me</button>
          </div>
        </div>
        <div class="pref-row">
          <label>Daily lesson goal</label>
          <div class="pref-options">
            {#each [1, 2, 3, 5] as g}
              <button class="pref-chip" class:active={dailyGoal === g} onclick={() => setDailyGoal(g)}>{g}</button>
            {/each}
          </div>
        </div>
      </div>
    {/if}

    <!-- Quick nav -->
    <div class="quick-nav">
      <a href="/learn/browse">{tr('tab.browse')}</a>
      <a href="/learn/paths">Paths</a>
      <a href="/learn/streaks">{tr('tab.streaks')}</a>
      <a href="/learn/progress">{tr('tab.skills')}</a>
    </div>

    <!-- Tab bar: New / Review -->
    {#if reviewsDue.length > 0 || reviewsUpcoming.length > 0}
      <div class="tab-bar" role="tablist" aria-label="Lesson categories">
        <button class="tab-btn" class:active={activeTab === 'new'} onclick={() => activeTab = 'new'} role="tab" aria-selected={activeTab === 'new'}>
          {tr('tab.new_lessons')} ({unmastered.length})
        </button>
        <button class="tab-btn" class:active={activeTab === 'review'} onclick={() => activeTab = 'review'} role="tab" aria-selected={activeTab === 'review'}>
          {tr('tab.review')} ({reviewsDue.length} due)
        </button>
      </div>
    {/if}

    <!-- Reviews due -->
    {#if activeTab === 'review' && (reviewsDue.length > 0 || reviewsUpcoming.length > 0)}
      <section class="lesson-section">
        {#if reviewsDue.length > 0}
          <h2>{tr('learn.reviews_due')}</h2>
          <div class="lesson-list">
            {#each reviewsDue as r}
              <a href={lessonUrl(reviewLessonSlug(r.lessonId))} class="lesson-card review-card overdue" target="_blank" rel="noopener">
                <div class="lesson-rank"><span class="rank-badge review-badge">Review</span></div>
                <div class="lesson-info">
                  <strong class="lesson-title">{reviewLessonTitle(r.lessonId)}</strong>
                  <span class="review-meta">Rep #{r.repetition + 1} &middot; Last quality: {r.quality}/5</span>
                </div>
              </a>
            {/each}
          </div>
        {/if}
        {#if reviewsUpcoming.length > 0}
          <h3 class="upcoming-title">{tr('learn.upcoming_reviews')}</h3>
          <div class="lesson-list compact">
            {#each reviewsUpcoming.slice(0, 5) as r}
              <div class="lesson-card review-card upcoming">
                <div class="lesson-info">
                  <strong>{reviewLessonTitle(r.lessonId)}</strong>
                  <span class="review-meta">Due {formatDaysUntil(r.nextReviewAt)}</span>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </section>
    {/if}

    <!-- Recommended lessons -->
    {#if (activeTab === 'new' || reviewsDue.length === 0) && unmastered.length > 0}
      <section class="lesson-section">
        <h2>{tr('learn.recommended')}</h2>
        <div class="lesson-list">
          {#each unmastered as l, i}
            <a href={lessonUrl(l.slug)} class="lesson-card" class:bandit-pick={isBanditPick(l.lessonId)} class:top-pick={i === 0 && !banditPick} target="_blank" rel="noopener">
              <div class="lesson-rank">
                {#if isBanditPick(l.lessonId)}
                  <span class="rank-badge best">{tr('learn.best')}</span>
                {:else}
                  <span class="rank-num">#{i + 1}</span>
                {/if}
              </div>
              <div class="lesson-info">
                <strong class="lesson-title">{l.title}</strong>
                <span class="lesson-slug">{l.slug}</span>
                <div class="lesson-skills">
                  {#each (l.skillsProvided || []).slice(0, 3) as sp}
                    <span class="skill-chip">{sp.skill}</span>
                  {/each}
                </div>
                {#if collabStats[l.lessonId]}
                  <div class="collab-row">
                    {#if collabStats[l.lessonId].activeCount > 0}
                      <span class="collab-indicator active">{tr('collab.classmates', { count: collabStats[l.lessonId].activeCount })}</span>
                    {/if}
                    {#if collabStats[l.lessonId].completedCount > 0}
                      <span class="collab-indicator done">{tr('collab.completed_by', { count: collabStats[l.lessonId].completedCount })}</span>
                    {/if}
                  </div>
                {/if}
              </div>
              <div class="lesson-actions">
                <button class="bookmark-btn" class:bookmarked={bookmarks.has(l.slug)} onclick={(e) => { e.stopPropagation(); e.preventDefault(); toggleBookmark(l.slug); }} title={bookmarks.has(l.slug) ? 'Remove bookmark' : 'Bookmark'}>
                  {bookmarks.has(l.slug) ? '\u2605' : '\u2606'}
                </button>
              </div>
              <div class="lesson-meta">
                {#if l.difficulty}
                  <span class="difficulty-badge" title="Difficulty level {l.difficulty}">{'★'.repeat(Math.min(5, l.difficulty))}</span>
                {/if}
                {#if l.teaching_mode}
                  <span class="mode-chip">{l.teaching_mode}</span>
                {/if}
                <span class="theta">&theta;={l.theta}</span>
                {#if cached.has(l.slug)}
                  <span class="offline-badge">{tr('learn.offline')}</span>
                {/if}
              </div>
            </a>
          {/each}
        </div>
      </section>
    {/if}

    {#if unmastered.length === 0 && reviewsDue.length === 0}
      <div class="card all-done">
        <h2>{tr('learn.all_done')}</h2>
        <p>{tr('learn.all_done_desc')}</p>
      </div>
    {/if}

    <!-- Completed lessons -->
    {#if mastered.length > 0}
      <section class="lesson-section completed-section">
        <h2>{tr('learn.completed')} ({mastered.length})</h2>
        <div class="lesson-list compact">
          {#each mastered as l}
            <div class="lesson-card done">
              <span class="check-mark">✓</span>
              <div class="lesson-info">
                <strong>{l.title}</strong>
                <span class="lesson-slug">{l.slug}</span>
              </div>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <p class="id-note">{tr('learn.student_id')}: <code>{pseudoId}</code></p>
  {/if}
</div>

<style>
  .learn-page { max-width: 700px; }

  .loading-msg { opacity: 0.8; padding: 2rem 0; }
  .setup-box { max-width: 500px; }
  .setup-box h2 { margin-bottom: 0.5rem; }
  .error-box { border-color: #ff6b6b; color: #ff6b6b; }

  .progress-header {
    display: flex; align-items: center; gap: 1.5rem; margin-bottom: 0.75rem;
    flex-wrap: wrap;
  }
  .progress-stat { text-align: center; }
  .stat-value { display: block; font-size: 1.5rem; font-weight: bold; color: var(--accent); }
  .stat-label { font-size: 0.8rem; opacity: 0.7; }
  .progress-link { font-size: 0.9rem; margin-left: auto; }

  .progress-bar-row { margin-bottom: 1.5rem; }
  .progress-bg { height: 10px; background: var(--border); border-radius: 5px; overflow: hidden; }
  .progress-fill { height: 100%; background: var(--accent); transition: width 0.3s; border-radius: 5px; }

  .offline-row {
    display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem;
  }
  .cache-btn {
    padding: 0.4rem 0.8rem; background: #2a2a4a; color: var(--text);
    border: 1px solid var(--border); border-radius: 6px; cursor: pointer;
    font-size: 0.9rem;
  }
  .cache-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .cached-note { font-size: 0.85rem; color: #4ade80; }

  .lesson-section { margin-bottom: 2rem; }
  .lesson-section h2 { margin-bottom: 1rem; }

  .lesson-list { display: flex; flex-direction: column; gap: 0.5rem; }
  .lesson-list.compact { gap: 0.25rem; }

  .lesson-card {
    display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem;
    background: var(--card); border: 1px solid var(--border); border-radius: 10px;
    text-decoration: none; color: var(--text); transition: all 0.15s;
  }
  .lesson-card:hover { border-color: var(--accent); text-decoration: none; transform: translateY(-1px); }
  .lesson-card.top-pick { border-color: var(--accent); background: rgba(0,230,118,0.05); }
  .lesson-card.bandit-pick { border-color: #ffaa00; background: rgba(255,170,0,0.08); }
  .lesson-card.done { opacity: 0.7; cursor: default; }
  .lesson-card.done:hover { transform: none; border-color: var(--border); }

  .lesson-rank { min-width: 40px; text-align: center; }
  .rank-num { font-size: 1.1rem; font-weight: bold; opacity: 0.5; }
  .rank-badge {
    display: inline-block; padding: 0.15rem 0.5rem; border-radius: 10px;
    font-size: 0.75rem; font-weight: bold;
  }
  .rank-badge.best { background: #ffaa00; color: #1a1a2e; }

  .lesson-info { flex: 1; min-width: 0; }
  .lesson-title { display: block; }
  .lesson-slug { font-size: 0.8rem; opacity: 0.5; }
  .lesson-skills { display: flex; gap: 0.3rem; flex-wrap: wrap; margin-top: 0.3rem; }
  .skill-chip {
    font-size: 0.7rem; padding: 0.1rem 0.35rem;
    background: rgba(0,230,118,0.1); color: var(--accent); border-radius: 4px;
  }

  .lesson-meta { text-align: right; min-width: 60px; }
  .theta { font-size: 0.85rem; opacity: 0.6; display: block; }
  .offline-badge {
    font-size: 0.7rem; padding: 0.1rem 0.3rem;
    background: rgba(74,222,128,0.2); color: #4ade80; border-radius: 4px;
  }

  .check-mark { color: #4ade80; font-size: 1.2rem; min-width: 30px; text-align: center; }

  .all-done { text-align: center; padding: 2rem; }
  .all-done h2 { color: #4ade80; margin-bottom: 0.5rem; }

  .completed-section { opacity: 0.8; }

  .id-note { margin-top: 2rem; font-size: 0.8rem; opacity: 0.5; }
  .id-note code { background: rgba(255,255,255,0.1); padding: 0.1rem 0.3rem; border-radius: 4px; }

  .tab-bar { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; }
  .tab-btn {
    padding: 0.4rem 1rem; border-radius: 8px; border: 1px solid var(--border);
    background: transparent; color: var(--text); cursor: pointer; font-size: 0.9rem;
  }
  .tab-btn.active { background: var(--accent); color: #1a1a2e; font-weight: 600; }

  .review-card.overdue { border-color: #fbbf24; background: rgba(251,191,36,0.06); }
  .review-card.upcoming { opacity: 0.65; cursor: default; }
  .review-card.upcoming:hover { transform: none; border-color: var(--border); }
  .review-meta { font-size: 0.8rem; opacity: 0.6; }
  .rank-badge.review-badge { background: #fbbf24; color: #1a1a2e; }
  .upcoming-title { margin-top: 1.5rem; font-size: 1rem; opacity: 0.7; }

  .streak-banner {
    display: flex; align-items: center; gap: 1rem; padding: 0.5rem 1rem;
    background: rgba(0,230,118,0.06); border: 1px solid rgba(0,230,118,0.2);
    border-radius: 10px; margin-bottom: 1rem; flex-wrap: wrap;
  }
  .streak-banner.goal-done { border-color: var(--accent); }
  .streak-fire { font-weight: bold; color: var(--accent); }
  .goal-badge { font-size: 0.8rem; padding: 0.15rem 0.5rem; background: var(--accent); color: #1a1a2e; border-radius: 8px; font-weight: 600; }
  .streak-link { font-size: 0.85rem; margin-left: auto; color: var(--accent); }

  .quick-nav {
    display: flex; gap: 0.5rem; margin-bottom: 1.5rem;
  }
  .quick-nav a {
    padding: 0.35rem 0.8rem; border-radius: 8px; border: 1px solid var(--border);
    color: var(--text); text-decoration: none; font-size: 0.85rem; transition: all 0.15s;
  }
  .quick-nav a:hover { border-color: var(--accent); color: var(--accent); }

  .collab-row { display: flex; gap: 0.4rem; flex-wrap: wrap; margin-top: 0.25rem; }
  .collab-indicator {
    font-size: 0.7rem; padding: 0.1rem 0.3rem; border-radius: 4px;
  }
  .collab-indicator.active { background: rgba(96,165,250,0.12); color: #60a5fa; }
  .collab-indicator.done { background: rgba(0,230,118,0.08); color: var(--accent); opacity: 0.7; }

  .search-row { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
  .search-input {
    flex: 1; padding: 0.5rem 0.75rem;
    background: #1f2b4e; color: var(--text); border: 1px solid var(--border);
    border-radius: 8px; font-size: 0.95rem;
  }
  .search-input:focus { outline: none; border-color: var(--accent); }
  .pref-toggle {
    padding: 0.5rem 0.75rem; background: #2a2a4a; color: var(--text);
    border: 1px solid var(--border); border-radius: 8px; cursor: pointer;
    font-size: 0.85rem; white-space: nowrap;
  }

  .prefs-panel {
    padding: 0.75rem 1rem; background: var(--card); border: 1px solid var(--border);
    border-radius: 10px; margin-bottom: 1rem;
  }
  .pref-row { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem; flex-wrap: wrap; }
  .pref-row:last-child { margin-bottom: 0; }
  .pref-row label { font-size: 0.85rem; opacity: 0.8; min-width: 130px; }
  .pref-options { display: flex; gap: 0.3rem; }
  .pref-chip {
    padding: 0.25rem 0.6rem; border-radius: 6px; border: 1px solid var(--border);
    background: transparent; color: var(--text); cursor: pointer; font-size: 0.8rem;
  }
  .pref-chip.active { background: var(--accent); color: #1a1a2e; font-weight: 600; border-color: var(--accent); }

  .difficulty-badge { font-size: 0.7rem; color: #fbbf24; display: block; letter-spacing: -1px; }
  .mode-chip {
    font-size: 0.65rem; padding: 0.1rem 0.3rem;
    background: rgba(251,191,36,0.15); color: #fbbf24; border-radius: 4px;
    display: inline-block; margin-top: 0.15rem;
  }

  .lesson-actions { display: flex; align-items: center; }
  .bookmark-btn {
    background: none; border: none; cursor: pointer; font-size: 1.2rem;
    color: var(--text); opacity: 0.4; padding: 0.2rem; transition: all 0.15s;
  }
  .bookmark-btn:hover { opacity: 0.8; }
  .bookmark-btn.bookmarked { color: #fbbf24; opacity: 1; }

  .badges-row {
    display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1.5rem;
    padding: 0.75rem; background: var(--card); border: 1px solid var(--border); border-radius: 10px;
  }
  .badge {
    display: flex; flex-direction: column; align-items: center; gap: 0.15rem;
    padding: 0.4rem 0.5rem; border-radius: 8px; min-width: 56px;
    transition: all 0.15s;
  }
  .badge.earned { background: rgba(0,230,118,0.08); }
  .badge.locked { opacity: 0.3; filter: grayscale(1); }
  .badge-icon { font-size: 1.3rem; }
  .badge-name { font-size: 0.6rem; text-align: center; max-width: 60px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .diagnostic-overlay {
    position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center;
    background: rgba(0,0,0,0.7); padding: 1rem;
  }
  .diagnostic-card {
    background: var(--card, #1a1a2e); border: 1px solid var(--border); border-radius: 16px;
    padding: 2rem; max-width: 480px; width: 100%; text-align: center;
  }
  .diagnostic-card h2 { margin-bottom: 0.5rem; }
  .diagnostic-subtitle { opacity: 0.7; font-size: 0.9rem; margin-bottom: 1rem; }
  .diagnostic-progress { height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; margin-bottom: 0.3rem; }
  .diagnostic-bar { height: 100%; background: var(--accent); transition: width 0.3s; border-radius: 3px; }
  .diagnostic-counter { font-size: 0.8rem; opacity: 0.5; margin-bottom: 1.5rem; }
  .probe-question { font-size: 1.1rem; margin-bottom: 1rem; }
  .probe-options { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1.5rem; }
  .probe-btn {
    padding: 0.6rem 1rem; border-radius: 10px; border: 1px solid var(--border);
    background: transparent; color: var(--text); cursor: pointer; font-size: 0.95rem;
    transition: all 0.15s;
  }
  .probe-btn:hover { border-color: var(--accent); }
  .probe-btn.selected { background: var(--accent); color: #1a1a2e; font-weight: 600; border-color: var(--accent); }
  .diagnostic-actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
  .diagnostic-done h2 { color: var(--accent); }
  .diagnostic-done p { opacity: 0.8; }
</style>
