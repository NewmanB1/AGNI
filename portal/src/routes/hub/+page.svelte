<script>
  import { hubApiStore } from '$lib/api';
  import { onMount } from 'svelte';
  import { getStudentName, setStudentName, hasNickname } from '$lib/studentNames';
  import { computeStatus, statusColor, statusLabel } from '$lib/studentStatus';

  const api = $derived($hubApiStore);

  /** @typedef {{ lessonId: string; slug: string; title: string; theta: number; alreadyMastered: boolean; skillsProvided: any[]; skillsRequired: string[] }} ThetaLesson */

  let groups = $state([]);
  let selectedGroupId = $state('');
  let allStudents = $state(/** @type {Record<string, ThetaLesson[]>} */ ({}));
  let loading = $state(true);
  let error = $state('');
  let hubConnected = $state(false);

  let selectedStudents = $state(/** @type {Set<string>} */ (new Set()));
  let showOverridePanel = $state(false);
  let overrideTargetId = $state('');
  let overrideTargetLessons = $state(/** @type {ThetaLesson[]} */ ([]));
  let overrideLessonId = $state('');
  let overrideLoading = $state(false);
  let overrideError = $state('');
  let overrideSuccess = $state('');

  let batchLessonId = $state('');
  let batchAssigning = $state(false);
  let batchResult = $state('');

  let editingNickname = $state('');
  let nicknameInput = $state('');

  let governanceReport = $state(/** @type {{ studentCount: number; lessonCount: number; bySkill: Record<string, any> } | null} */ (null));

  const selectedGroup = $derived(groups.find(g => g.id === selectedGroupId) || null);

  const groupStudentData = $derived.by(() => {
    if (!selectedGroup) return [];
    return (selectedGroup.studentIds || []).map((/** @type {string} */ id) => {
      const lessons = allStudents[id] || [];
      const mastered = lessons.filter(l => l.alreadyMastered).length;
      const total = lessons.length;
      const pct = total > 0 ? Math.round((mastered / total) * 100) : 0;
      const topRec = lessons.find(l => !l.alreadyMastered) || null;
      const avgTheta = lessons.length > 0
        ? lessons.reduce((s, l) => s + l.theta, 0) / lessons.length
        : 0;
      const status = computeStatus(pct, total > 0);
      return { id, lessons, mastered, total, pct, topRec, avgTheta, status };
    });
  });

  const allGroupStudentData = $derived.by(() => {
    const ids = Object.keys(allStudents);
    return ids.map(id => {
      const lessons = allStudents[id] || [];
      const mastered = lessons.filter(l => l.alreadyMastered).length;
      const total = lessons.length;
      const pct = total > 0 ? Math.round((mastered / total) * 100) : 0;
      const topRec = lessons.find(l => !l.alreadyMastered) || null;
      const status = computeStatus(pct, total > 0);
      return { id, lessons, mastered, total, pct, topRec, status };
    });
  });

  const displayStudents = $derived(selectedGroupId === '__all__' ? allGroupStudentData : groupStudentData);

  const summaryStats = $derived.by(() => {
    const list = displayStudents;
    const onTrack = list.filter(s => s.status === 'on-track').length;
    const moderate = list.filter(s => s.status === 'moderate').length;
    const struggling = list.filter(s => s.status === 'struggling').length;
    const avgPct = list.length > 0 ? Math.round(list.reduce((s, st) => s + st.pct, 0) / list.length) : 0;
    return { total: list.length, onTrack, moderate, struggling, avgPct };
  });

  const commonLessons = $derived.by(() => {
    if (selectedStudents.size === 0) return [];
    const ids = [...selectedStudents];
    const lessonSets = ids.map(id => new Set((allStudents[id] || []).filter(l => !l.alreadyMastered).map(l => l.lessonId)));
    if (lessonSets.length === 0) return [];
    const intersection = [...lessonSets[0]].filter(lid => lessonSets.every(s => s.has(lid)));
    const firstStudentLessons = allStudents[ids[0]] || [];
    return intersection.map(lid => firstStudentLessons.find(l => l.lessonId === lid)).filter(Boolean);
  });

  async function load() {
    if (!api.baseUrl) { loading = false; return; }
    loading = true;
    error = '';
    try {
      const [groupsRes, thetaRes] = await Promise.all([
        api.getGroups(),
        api.getThetaAll()
      ]);
      groups = groupsRes.groups || [];
      allStudents = thetaRes.students || {};
      hubConnected = true;
      if (!selectedGroupId) {
        selectedGroupId = groups.length > 0 ? groups[0].id : '__all__';
      }

      try {
        governanceReport = await api.getGovernanceReport();
      } catch { /* governance report optional */ }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      hubConnected = false;
    }
    loading = false;
  }

  onMount(load);

  function toggleSelectStudent(id) {
    const next = new Set(selectedStudents);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedStudents = next;
  }

  function selectAll() {
    selectedStudents = new Set(displayStudents.map(s => s.id));
  }

  function selectNone() {
    selectedStudents = new Set();
  }

  async function openInlineOverride(studentId) {
    overrideTargetId = studentId;
    showOverridePanel = true;
    overrideLessonId = '';
    overrideError = '';
    overrideSuccess = '';
    overrideLoading = true;
    try {
      const res = await api.getTheta(studentId);
      overrideTargetLessons = res.lessons || [];
      overrideLessonId = res.override || '';
    } catch (e) {
      overrideError = e instanceof Error ? e.message : String(e);
    }
    overrideLoading = false;
  }

  function closeOverridePanel() {
    showOverridePanel = false;
    overrideTargetId = '';
  }

  async function applyOverride() {
    if (!overrideTargetId) return;
    overrideLoading = true;
    overrideError = '';
    try {
      await api.setRecommendationOverride(overrideTargetId, overrideLessonId || null);
      overrideSuccess = overrideLessonId ? 'Override applied.' : 'Override cleared.';
      setTimeout(() => { closeOverridePanel(); load(); }, 800);
    } catch (e) {
      overrideError = e instanceof Error ? e.message : String(e);
    }
    overrideLoading = false;
  }

  async function batchAssign() {
    if (!selectedGroup || selectedStudents.size === 0 || !batchLessonId) return;
    batchAssigning = true;
    batchResult = '';
    overrideError = '';
    try {
      let assigned = 0, skipped = 0;
      for (const pseudoId of selectedStudents) {
        try {
          await api.setRecommendationOverride(pseudoId, batchLessonId);
          assigned++;
        } catch {
          skipped++;
        }
      }
      batchResult = `Override applied to ${assigned} student(s)` + (skipped ? `, ${skipped} skipped.` : '.');
      selectedStudents = new Set();
      batchLessonId = '';
      await load();
    } catch (e) {
      overrideError = e instanceof Error ? e.message : String(e);
    }
    batchAssigning = false;
  }

  function startEditNickname(pseudoId) {
    editingNickname = pseudoId;
    nicknameInput = hasNickname(pseudoId) ? getStudentName(pseudoId) : '';
  }

  function saveNickname() {
    if (editingNickname) {
      setStudentName(editingNickname, nicknameInput);
      editingNickname = '';
      nicknameInput = '';
    }
  }

  function handleKeydown(event) {
    if (event.key === 'Escape' && showOverridePanel) closeOverridePanel();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<h1>Teacher Hub</h1>

{#if loading}
  <p class="loading">Loading hub data…</p>
{:else if !hubConnected}
  <div class="card warning-box">
    <h2>Hub not connected</h2>
    <p>Configure hub URL in <a href="/settings">Settings</a> to see live student data, recommendations, and governance information.</p>
  </div>
{:else}
  {#if error}
    <div class="card error-box">{error}</div>
  {/if}

  <!-- Group selector -->
  <nav class="top-nav">
    <div class="nav-left">
      <select class="group-selector" bind:value={selectedGroupId}>
        <option value="__all__">All Students ({Object.keys(allStudents).length})</option>
        {#each groups as g}
          <option value={g.id}>{g.name} ({g.studentIds?.length ?? 0})</option>
        {/each}
      </select>
      {#if groups.length === 0}
        <a href="/groups" class="create-link">Create a group</a>
      {/if}
    </div>
    <div class="nav-right">
      <button class="refresh-btn" onclick={load}>Refresh</button>
    </div>
  </nav>

  <!-- Summary cards -->
  <div class="summary-cards">
    <div class="summary-card">
      <span class="summary-value">{summaryStats.total}</span>
      <span class="summary-label">Students</span>
    </div>
    <div class="summary-card on-track">
      <span class="summary-value">{summaryStats.onTrack}</span>
      <span class="summary-label">On Track</span>
    </div>
    <div class="summary-card moderate">
      <span class="summary-value">{summaryStats.moderate}</span>
      <span class="summary-label">Moderate</span>
    </div>
    <div class="summary-card struggling">
      <span class="summary-value">{summaryStats.struggling}</span>
      <span class="summary-label">Struggling</span>
    </div>
    <div class="summary-card avg">
      <span class="summary-value">{summaryStats.avgPct}%</span>
      <span class="summary-label">Avg Mastery</span>
    </div>
  </div>

  <!-- Progress bar -->
  {#if summaryStats.total > 0}
    <div class="progress-container">
      <div class="progress-bar" style="width: {summaryStats.avgPct}%; background: {statusColor(computeStatus(summaryStats.avgPct, summaryStats.total > 0))};"></div>
      <span>{summaryStats.avgPct}% average mastery</span>
    </div>
  {/if}

  <!-- Batch controls -->
  {#if displayStudents.length > 0}
    <div class="batch-controls">
      <button class="small" onclick={selectAll}>Select all</button>
      <button class="small" onclick={selectNone}>Clear selection</button>
      {#if selectedStudents.size > 0}
        <span class="selection-count">{selectedStudents.size} selected</span>
        {#if commonLessons.length > 0}
          <select class="batch-lesson-select" bind:value={batchLessonId}>
            <option value="">Batch override lesson…</option>
            {#each commonLessons as l}
              <option value={l.lessonId}>{l.title} ({l.slug}) · θ={l.theta}</option>
            {/each}
          </select>
          <button class="primary small" onclick={batchAssign} disabled={batchAssigning || !batchLessonId}>
            {batchAssigning ? 'Applying…' : 'Batch Override'}
          </button>
        {:else}
          <span class="hint">No common eligible lessons for selected students</span>
        {/if}
      {/if}
      {#if batchResult}
        <span class="batch-result">{batchResult}</span>
      {/if}
    </div>
  {/if}

  <!-- Student list -->
  <section class="card student-section">
    <h2>Students {selectedGroup ? `— ${selectedGroup.name}` : ''}</h2>
    {#if displayStudents.length === 0}
      <p class="empty">No students in this view. {selectedGroupId !== '__all__' ? 'Add students to this group or select "All Students".' : 'Ensure mastery data exists on the hub.'}</p>
    {:else}
      <div class="student-grid">
        {#each displayStudents as student}
          <div class="student-card" class:selected={selectedStudents.has(student.id)}>
            <div class="student-header">
              <label class="checkbox-label">
                <input type="checkbox" checked={selectedStudents.has(student.id)} onchange={() => toggleSelectStudent(student.id)} />
              </label>
              <span class="status-dot" style="background: {statusColor(student.status)};" title={statusLabel(student.status)}></span>

              <div class="student-identity">
                {#if editingNickname === student.id}
                  <input class="nickname-input" type="text" bind:value={nicknameInput}
                         placeholder="Enter nickname…"
                         onkeydown={(e) => e.key === 'Enter' && saveNickname()}
                         onblur={saveNickname} />
                {:else}
                  <strong class="student-name" onclick={() => startEditNickname(student.id)} title="Click to set nickname">
                    {getStudentName(student.id)}
                  </strong>
                  {#if hasNickname(student.id)}
                    <span class="pseudo-id-small">{student.id}</span>
                  {/if}
                {/if}
              </div>
            </div>

            <div class="student-mastery">
              <div class="mini-progress">
                <div class="mini-bar" style="width: {student.pct}%; background: {statusColor(student.status)};"></div>
              </div>
              <span class="mastery-text">{student.mastered}/{student.total} mastered ({student.pct}%)</span>
            </div>

            {#if student.topRec}
              <div class="student-rec">
                <span class="rec-label">Next:</span>
                <span class="rec-title">{student.topRec.title}</span>
                <span class="rec-theta">θ={student.topRec.theta}</span>
              </div>
            {:else}
              <div class="student-rec all-done">All available lessons mastered</div>
            {/if}

            <div class="student-actions">
              <a href="/students/{student.id}" class="action-link">Details</a>
              <button class="action-btn" onclick={() => openInlineOverride(student.id)}>Override</button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <!-- Governance snapshot -->
  {#if governanceReport}
    <section class="card" style="margin-top: 1.5rem;">
      <h2>Governance Snapshot</h2>
      <div class="gov-stats">
        <span><strong>{governanceReport.studentCount}</strong> students tracked</span>
        <span><strong>{governanceReport.lessonCount}</strong> lessons indexed</span>
        <span><strong>{Object.keys(governanceReport.bySkill || {}).length}</strong> skills covered</span>
      </div>
      <a href="/governance/report" class="action-link">View full report →</a>
    </section>
  {/if}
{/if}

<!-- Inline override panel (slide-in) -->
{#if showOverridePanel}
  <div class="override-overlay" onclick={(e) => e.target === e.currentTarget && closeOverridePanel()} role="dialog" aria-modal="true">
    <div class="override-panel">
      <h2>Override — {getStudentName(overrideTargetId)}</h2>
      {#if hasNickname(overrideTargetId)}
        <p class="pseudo-hint">{overrideTargetId}</p>
      {/if}

      {#if overrideLoading}
        <p>Loading recommendations…</p>
      {:else}
        <label class="block">
          Override lesson
          <select bind:value={overrideLessonId}>
            <option value="">— Use theta order (no override) —</option>
            {#each overrideTargetLessons as l}
              <option value={l.lessonId}>
                {l.title} ({l.slug}) · θ={l.theta}
                {l.alreadyMastered ? ' ✓' : ''}
              </option>
            {/each}
          </select>
        </label>

        {#if overrideError}
          <p class="err">{overrideError}</p>
        {/if}
        {#if overrideSuccess}
          <p class="success">{overrideSuccess}</p>
        {/if}

        <div class="panel-actions">
          <button class="secondary" onclick={closeOverridePanel}>Cancel</button>
          <button class="primary" onclick={applyOverride} disabled={overrideLoading}>
            {overrideLessonId ? 'Apply Override' : 'Clear Override'}
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .loading { opacity: 0.8; padding: 2rem 0; }
  .warning-box { border-color: #ff6b6b; max-width: 500px; }
  .warning-box h2 { margin-bottom: 0.5rem; }
  .error-box { border-color: #ff6b6b; color: #ff6b6b; }

  .top-nav {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 1.5rem; gap: 1rem; flex-wrap: wrap;
  }
  .nav-left { display: flex; align-items: center; gap: 1rem; }
  .group-selector {
    padding: 0.5rem 1rem; background: #1f2b4e; color: var(--text);
    border: 1px solid var(--border); border-radius: 6px; font-size: 1rem;
  }
  .create-link { font-size: 0.9rem; }
  .refresh-btn {
    padding: 0.4rem 0.8rem; background: #2a2a4a; color: var(--text);
    border: 1px solid var(--border); border-radius: 6px; cursor: pointer;
  }

  .summary-cards {
    display: flex; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap;
  }
  .summary-card {
    background: var(--card); border: 1px solid var(--border); border-radius: 10px;
    padding: 1rem 1.25rem; min-width: 120px; text-align: center;
    display: flex; flex-direction: column; gap: 0.25rem;
  }
  .summary-value { font-size: 1.5rem; font-weight: bold; color: #fff; }
  .summary-label { font-size: 0.85rem; opacity: 0.8; }
  .summary-card.on-track { border-color: #4ade80; }
  .summary-card.on-track .summary-value { color: #4ade80; }
  .summary-card.moderate { border-color: #ffaa00; }
  .summary-card.moderate .summary-value { color: #ffaa00; }
  .summary-card.struggling { border-color: #ff5252; }
  .summary-card.struggling .summary-value { color: #ff5252; }
  .summary-card.avg { border-color: var(--accent); }
  .summary-card.avg .summary-value { color: var(--accent); }

  .progress-container {
    position: relative; height: 24px; background: var(--border);
    border-radius: 6px; overflow: hidden; margin-bottom: 1.5rem;
  }
  .progress-bar { height: 100%; transition: width 0.3s; }
  .progress-container span {
    position: absolute; left: 50%; top: 50%;
    transform: translate(-50%, -50%); font-size: 0.85rem; font-weight: bold;
  }

  .batch-controls {
    display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem;
    flex-wrap: wrap; padding: 0.75rem; background: rgba(255,255,255,0.03);
    border: 1px solid var(--border); border-radius: 8px;
  }
  .selection-count { font-weight: bold; color: var(--accent); }
  .batch-lesson-select {
    padding: 0.4rem; background: #1f2b4e; color: var(--text);
    border: 1px solid var(--border); border-radius: 6px; max-width: 300px;
  }
  .batch-result { color: #4ade80; font-size: 0.9rem; }
  .hint { font-size: 0.85rem; opacity: 0.7; }

  .student-section h2 { margin-bottom: 1rem; }

  .student-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 1rem;
  }

  .student-card {
    background: rgba(255,255,255,0.03); border: 1px solid var(--border);
    border-radius: 10px; padding: 1rem; transition: border-color 0.15s;
  }
  .student-card:hover { border-color: rgba(0,230,118,0.3); }
  .student-card.selected { border-color: var(--accent); background: rgba(0,230,118,0.05); }

  .student-header {
    display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem;
  }
  .checkbox-label { display: flex; cursor: pointer; }
  .checkbox-label input { cursor: pointer; }
  .status-dot {
    width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
  }
  .student-identity { flex: 1; min-width: 0; }
  .student-name {
    cursor: pointer; display: block; overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap;
  }
  .student-name:hover { color: var(--accent); }
  .pseudo-id-small { font-size: 0.75rem; opacity: 0.5; display: block; overflow: hidden; text-overflow: ellipsis; }
  .nickname-input {
    width: 100%; padding: 0.25rem 0.4rem; background: #1f2b4e;
    color: var(--text); border: 1px solid var(--accent); border-radius: 4px;
    font-size: 0.9rem;
  }

  .student-mastery { margin-bottom: 0.5rem; }
  .mini-progress {
    height: 6px; background: var(--border); border-radius: 3px;
    overflow: hidden; margin-bottom: 0.25rem;
  }
  .mini-bar { height: 100%; transition: width 0.3s; border-radius: 3px; }
  .mastery-text { font-size: 0.8rem; opacity: 0.8; }

  .student-rec {
    font-size: 0.85rem; margin-bottom: 0.5rem; display: flex;
    align-items: baseline; gap: 0.4rem; flex-wrap: wrap;
  }
  .rec-label { opacity: 0.7; }
  .rec-title { color: var(--accent); }
  .rec-theta { opacity: 0.6; font-size: 0.8rem; }
  .all-done { color: #4ade80; opacity: 0.9; }

  .student-actions {
    display: flex; gap: 0.5rem; margin-top: 0.25rem;
  }
  .action-link {
    font-size: 0.85rem; color: var(--accent); text-decoration: none;
    padding: 0.25rem 0.5rem; border: 1px solid rgba(0,230,118,0.3);
    border-radius: 4px;
  }
  .action-link:hover { background: rgba(0,230,118,0.1); text-decoration: none; }
  .action-btn {
    font-size: 0.85rem; padding: 0.25rem 0.5rem; background: #2a2a4a;
    color: var(--text); border: 1px solid var(--border); border-radius: 4px;
    cursor: pointer;
  }
  .action-btn:hover { border-color: var(--accent); color: var(--accent); }

  .gov-stats {
    display: flex; gap: 1.5rem; flex-wrap: wrap; margin-bottom: 0.75rem;
    font-size: 0.95rem;
  }

  button.small {
    padding: 0.3rem 0.6rem; font-size: 0.85rem; background: #2a2a4a;
    color: var(--text); border: 1px solid var(--border); border-radius: 4px;
    cursor: pointer;
  }
  button.primary.small {
    background: var(--accent); color: #1a1a2e; border: none; font-weight: bold;
  }
  button:disabled { opacity: 0.5; cursor: not-allowed; }

  .override-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.7);
    display: flex; align-items: center; justify-content: center; z-index: 1000;
  }
  .override-panel {
    background: var(--card); border: 1px solid var(--border);
    border-radius: 12px; padding: 2rem; max-width: 500px; width: 90%;
    max-height: 85vh; overflow-y: auto; box-shadow: 0 10px 30px rgba(0,0,0,0.5);
  }
  .override-panel h2 { margin-bottom: 0.5rem; }
  .pseudo-hint { font-size: 0.85rem; opacity: 0.5; margin-bottom: 1rem; }
  .override-panel label.block { display: block; margin: 1rem 0 0.5rem; font-weight: bold; }
  .override-panel select {
    width: 100%; padding: 0.6rem; background: #1f2b4e; color: var(--text);
    border: 1px solid var(--border); border-radius: 6px; font-size: 0.95rem;
    margin-top: 0.25rem;
  }
  .panel-actions { display: flex; gap: 1rem; justify-content: flex-end; margin-top: 1.5rem; }
  button.secondary {
    padding: 0.5rem 1rem; background: #2a2a4a; color: var(--text);
    border: 1px solid var(--border); border-radius: 6px; cursor: pointer;
  }
  button.primary {
    padding: 0.5rem 1rem; background: var(--accent); color: #1a1a2e;
    border: none; border-radius: 6px; cursor: pointer; font-weight: bold;
  }
  .err { color: #ff6b6b; margin: 0.5rem 0; font-size: 0.9rem; }
  .success { color: #4ade80; margin: 0.5rem 0; font-size: 0.9rem; }
  .empty { opacity: 0.7; }
</style>
