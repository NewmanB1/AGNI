<script>
  import { hubApiStore } from '$lib/api';
  import { mockClasses, mockGovernanceMilestones } from '$lib/mockData';

  let selectedClassId = $state(mockClasses[0]?.id || '');
  const currentClass = $derived(mockClasses.find(cls => cls.id === selectedClassId) || null);

  // Heterogeneity calculations
  const entryMin = $derived(currentClass?.entryLevels?.length > 0 ? Math.min(...currentClass.entryLevels) : null);
  const entryMax = $derived(currentClass?.entryLevels?.length > 0 ? Math.max(...currentClass.entryLevels) : null);
  const cohortCount = $derived(currentClass?.arrivalCohorts ? new Set(currentClass.arrivalCohorts).size : 0);
  const heteroLevel = $derived((cohortCount > 2 || (entryMax !== null && entryMax - entryMin > 5)) ? 'high'
                  : (cohortCount > 1 || (entryMax !== null && entryMax - entryMin > 3)) ? 'medium'
                  : 'low');

  // Override modal (T1)
  let showOverrideModal = $state(false);
  let overridePseudoId = $state('');
  let overrideLessonId = $state('');
  let thetaStudents = $state({});
  let thetaLessons = $state([]);
  let overrideLoading = $state(false);
  let overrideError = $state('');
  let hubConnected = $state(false);

  async function openOverrideModal() {
    showOverrideModal = true;
    overridePseudoId = '';
    overrideLessonId = '';
    overrideError = '';
    thetaStudents = {};
    thetaLessons = [];
    if ($hubApiStore.baseUrl) {
      hubConnected = true;
      try {
        const all = await $hubApiStore.getThetaAll();
        thetaStudents = all.students || {};
      } catch (e) {
        overrideError = e instanceof Error ? e.message : String(e);
        hubConnected = false;
      }
    } else {
      hubConnected = false;
    }
  }

  async function loadThetaForStudent() {
    if (!overridePseudoId || !$hubApiStore.baseUrl) return;
    overrideLoading = true;
    overrideError = '';
    try {
      const res = await $hubApiStore.getTheta(overridePseudoId);
      thetaLessons = res.lessons || [];
      overrideLessonId = res.override || (thetaLessons[0]?.lessonId || '');
    } catch (e) {
      overrideError = e instanceof Error ? e.message : String(e);
      thetaLessons = [];
    }
    overrideLoading = false;
  }

  function closeOverrideModal() {
    showOverrideModal = false;
  }

  async function submitOverride() {
    if (!$hubApiStore.baseUrl) {
      overrideError = 'Hub not connected.';
      return;
    }
    if (!overridePseudoId) {
      overrideError = 'Select a student.';
      return;
    }
    overrideLoading = true;
    overrideError = '';
    try {
      await $hubApiStore.setRecommendationOverride(overridePseudoId, overrideLessonId || null);
      closeOverrideModal();
    } catch (e) {
      overrideError = e instanceof Error ? e.message : String(e);
    }
    overrideLoading = false;
  }

  async function clearOverride() {
    if (!$hubApiStore.baseUrl || !overridePseudoId) return;
    overrideLoading = true;
    overrideError = '';
    try {
      await $hubApiStore.setRecommendationOverride(overridePseudoId, null);
      overrideLessonId = '';
      await loadThetaForStudent();
    } catch (e) {
      overrideError = e instanceof Error ? e.message : String(e);
    }
    overrideLoading = false;
  }

  const studentIds = $derived(Object.keys(thetaStudents));
  const hasStudents = $derived(studentIds.length > 0);

  function handleKeydown(event) {
    if (event.key === 'Escape' && showOverrideModal) closeOverrideModal();
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<nav class="top-nav">
  <div class="nav-left">
    <select class="class-selector" bind:value={selectedClassId}>
      {#each mockClasses as cls}
        <option value={cls.id}>{cls.name}</option>
      {/each}
    </select>
  </div>
  <div class="nav-right">
    <span class="teacher-name">Teacher: Brian</span>
  </div>
</nav>

<h1>Teacher Hub — {currentClass?.name || 'Classes'}</h1>

{#if currentClass}
  <div class="heterogeneity">
    {#if entryMin !== null}
      <span class="label">
        Heterogeneity:
        <strong class={heteroLevel}>
          {heteroLevel === 'high' ? 'High' : heteroLevel === 'medium' ? 'Medium' : 'Low'}
        </strong>
        <span class="detail">(Entry levels {entryMin}–{entryMax} • {cohortCount} cohorts)</span>
      </span>
      <div class="spread-dots">
        {#each currentClass.entryLevels as level}
          <span class="dot" style="left: {(level - entryMin) / (entryMax - entryMin || 1) * 100}%; background: {level <= 3 ? '#ff5252' : level <= 6 ? '#ffaa00' : 'var(--accent)'};"></span>
        {/each}
      </div>
    {:else}
      <span class="label">Heterogeneity: Unknown (no entry data)</span>
    {/if}
  </div>

  <section class="card">
    <h2>Class Overview</h2>
    <div class="progress-container">
      <div class="progress-bar" style="width: {currentClass.onTrackPercent}%; background: {currentClass.onTrackPercent >= 80 ? 'var(--accent)' : currentClass.onTrackPercent >= 50 ? '#ffaa00' : '#ff5252'};"></div>
      <span>{currentClass.onTrackPercent}% on-track</span>
    </div>
    {#if currentClass.notes}<p class="notes">Notes: {currentClass.notes}</p>{/if}
  </section>

  {#if currentClass.students?.length}
    <section class="card" style="margin-top: 1.5rem;">
      <h2>Students ({currentClass.students.length})</h2>
      <ul class="student-list">
        {#each currentClass.students as student}
          <li>
            <strong>{student.name}</strong> — Entry: {student.entryLevel}
            {#if student.masteredSkills?.length}— Mastered: {student.masteredSkills.join(', ')}
            {:else}— No skills mastered yet{/if}
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  <section class="card recommendation" style="margin-top: 1.5rem;">
    <h2>AGNI Recommendation (coming soon)</h2>
    <p>Personalized next skill suggestions for this class will appear here.</p>
    <button class="override-btn" on:click={openOverrideModal}>Override Recommendation</button>
    <p class="hub-hint">Configure hub URL in <a href="/settings">Settings</a> to manage overrides.</p>
  </section>
{:else}
  <p>No class selected.</p>
{/if}

<section class="card" style="margin-top: 2rem;">
  <h2>Governance Milestones</h2>
  <ul>
    {#each mockGovernanceMilestones as milestone}
      <li>
        <strong>{milestone.description}</strong><br />
        Due: {milestone.targetDate} — {milestone.requiredPercent}% required ({milestone.level})
      </li>
    {/each}
  </ul>
</section>

{#if showOverrideModal}
  <div class="modal-overlay" on:click|self={closeOverrideModal} role="dialog" aria-modal="true">
    <div class="modal-content">
      <h2>Override Recommendation</h2>
      {#if !hubConnected}
        <p class="hub-required">Configure hub URL in <a href="/settings">Settings</a> to set overrides.</p>
      {:else if !hasStudents}
        <p class="no-students">No students in hub. Ensure mastery data exists.</p>
      {:else}
        <label>Student:
          <select bind:value={overridePseudoId} on:change={loadThetaForStudent} disabled={overrideLoading}>
            <option value="">Select student...</option>
            {#each studentIds as id}
              <option value={id}>{id}</option>
            {/each}
          </select>
        </label>
        {#if overridePseudoId}
          <label>Override lesson:
            <select bind:value={overrideLessonId} disabled={overrideLoading}>
              <option value="">— Use theta order (no override) —</option>
              {#each thetaLessons as l}
                <option value={l.lessonId}>{l.title} ({l.slug}) · θ={l.theta}</option>
              {/each}
            </select>
          </label>
        {/if}
        {#if overrideError}
          <p class="override-error">{overrideError}</p>
        {/if}
        <div class="modal-actions">
          <button class="cancel" on:click={closeOverrideModal} disabled={overrideLoading}>Cancel</button>
          {#if overridePseudoId}
            <button class="clear" on:click={clearOverride} disabled={overrideLoading}>Clear Override</button>
            <button class="submit" on:click={submitOverride} disabled={overrideLoading || !overrideLessonId}>Apply Override</button>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .top-nav { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
  .class-selector { padding: 0.5rem; background: #1f2b4e; color: var(--text); border: 1px solid var(--border); border-radius: 6px; }
  .teacher-name { opacity: 0.9; }
  .heterogeneity { margin: 1rem 0; }
  .heterogeneity .label { display: block; margin-bottom: 0.5rem; }
  .heterogeneity .detail { opacity: 0.8; font-size: 0.9rem; }
  .spread-dots { position: relative; height: 8px; background: var(--border); border-radius: 4px; margin-top: 0.5rem; }
  .spread-dots .dot { position: absolute; width: 10px; height: 10px; border-radius: 50%; top: -1px; transform: translateX(-50%); }
  .progress-container { position: relative; height: 24px; background: var(--border); border-radius: 6px; overflow: hidden; }
  .progress-bar { height: 100%; transition: width 0.3s; }
  .progress-container span { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); font-size: 0.85rem; font-weight: bold; }
  .notes { margin-top: 0.5rem; opacity: 0.9; }
  .student-list { list-style: none; padding: 0; }
  .student-list li { padding: 0.4rem 0; border-bottom: 1px solid var(--border); }
  .override-btn { margin-top: 1rem; padding: 0.6rem 1.2rem; background: var(--accent); color: #1a1a2e; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; }
  .modal-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.7); display: flex; align-items: center; justify-content: center; z-index: 1000; }
  .modal-content { background: var(--card); border-radius: 12px; padding: 2rem; max-width: 500px; width: 90%; max-height: 90vh; overflow-y: auto; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
  .modal-content h2 { margin-bottom: 0.5rem; }
  .modal-content p { margin-bottom: 1.5rem; opacity: 0.9; }
  .modal-content label { display: block; margin: 1rem 0 0.5rem; font-weight: bold; }
  .modal-content select, .modal-content textarea { width: 100%; padding: 0.6rem; background: #1f2b4e; color: var(--text); border: 1px solid var(--border); border-radius: 6px; font-size: 1rem; }
  .modal-content textarea { resize: vertical; min-height: 80px; }
  .warning { color: #ffaa00; font-size: 0.9rem; margin: 0.8rem 0; padding: 0.6rem; background: rgba(255,170,0,0.1); border-radius: 6px; }
  .hub-hint { margin-top: 0.5rem; font-size: 0.9rem; opacity: 0.7; }
  .hub-required, .no-students { color: var(--text); opacity: 0.9; }
  .override-error { color: #ff6b6b; font-size: 0.9rem; margin: 0.5rem 0; }
  .modal-actions { display: flex; gap: 1rem; justify-content: flex-end; margin-top: 2rem; flex-wrap: wrap; }
  .cancel { padding: 0.6rem 1.2rem; background: #2a2a4a; color: var(--text); border: none; border-radius: 6px; cursor: pointer; }
  .clear { padding: 0.6rem 1.2rem; background: #3a3a5a; color: var(--text); border: 1px solid var(--border); border-radius: 6px; cursor: pointer; }
  .submit { padding: 0.6rem 1.2rem; background: var(--accent); color: #1a1a2e; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; }
  .submit:disabled, .clear:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
