<script>
  import { mockClasses, mockGovernanceMilestones, mockSkills } from '$lib/mockData';

  let selectedClassId = mockClasses[0]?.id || '';
  $: currentClass = mockClasses.find(cls => cls.id === selectedClassId) || null;

  // Reactive heterogeneity calculations
  $: entryMin = currentClass?.entryLevels?.length > 0 ? Math.min(...currentClass.entryLevels) : null;
  $: entryMax = currentClass?.entryLevels?.length > 0 ? Math.max(...currentClass.entryLevels) : null;
  $: cohortCount = currentClass?.arrivalCohorts ? new Set(currentClass.arrivalCohorts).size : 0;
  $: heteroLevel = (cohortCount > 2 || (entryMax !== null && entryMax - entryMin > 5)) ? 'high'
                  : (cohortCount > 1 || (entryMax !== null && entryMax - entryMin > 3)) ? 'medium'
                  : 'low';

  // Override modal state
  let showOverrideModal = false;
  let overrideSkillId = '';
  let overrideScope = 'class'; // 'class', 'subgroup', 'individual'
  let overrideDuration = '1-week';
  let overrideReason = '';

  function openOverrideModal() {
    showOverrideModal = true;
    // Reset form
    overrideSkillId = '';
    overrideScope = 'class';
    overrideDuration = '1-week';
    overrideReason = '';
  }

  function closeOverrideModal() {
    showOverrideModal = false;
  }

  function submitOverride() {
    if (!overrideSkillId) {
      alert('Please select a skill');
      return;
    }
    console.log('Override submitted:', {
      classId: currentClass.id,
      skillId: overrideSkillId,
      scope: overrideScope,
      duration: overrideDuration,
      reason: overrideReason
    });
    // Later: save to localStorage / hub JSON
    alert('Override applied (logged to console for now)');
    closeOverrideModal();
  }
</script>

<!-- Top Navigation Bar -->
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

<main>
  {#if currentClass}
    <h1>AGNI Teacher Hub — {currentClass.name}</h1>

    <!-- Heterogeneity Summary -->
    <div class="heterogeneity">
      {#if entryMin !== null}
        <span class="label">
          Heterogeneity: 
          <strong class={heteroLevel}>
            {heteroLevel === 'high' ? 'High' : heteroLevel === 'medium' ? 'Medium' : 'Low'}
          </strong>
          <span class="detail">
            (Entry levels {entryMin}–{entryMax} • {cohortCount} cohorts)
          </span>
        </span>

        <!-- Visual spread dots -->
        <div class="spread-dots">
          {#each currentClass.entryLevels as level}
            <span 
              class="dot" 
              style="left: {(level - entryMin) / (entryMax - entryMin || 1) * 100}%; background: {level <= 3 ? '#ff5252' : level <= 6 ? '#ffaa00' : 'var(--accent)'};"
            ></span>
          {/each}
        </div>
      {:else}
        <span class="label">Heterogeneity: Unknown (no entry data)</span>
      {/if}
    </div>

    <section class="card">
      <h2>Class Overview</h2>
      <div class="progress-container">
        <div 
          class="progress-bar" 
          style="width: {currentClass.onTrackPercent}%; background: {currentClass.onTrackPercent >= 80 ? 'var(--accent)' : currentClass.onTrackPercent >= 50 ? '#ffaa00' : '#ff5252'};"
        ></div>
        <span>{currentClass.onTrackPercent}% on-track</span>
      </div>
      {#if currentClass.notes}
        <p class="notes">Notes: {currentClass.notes}</p>
      {/if}
    </section>

    {#if currentClass.students?.length}
      <section class="card" style="margin-top: 1.5rem;">
        <h2>Students ({currentClass.students.length})</h2>
        <ul class="student-list">
          {#each currentClass.students as student}
            <li>
              <strong>{student.name}</strong> — Entry: {student.entryLevel}
              {#if student.masteredSkills?.length}
                — Mastered: {student.masteredSkills.join(', ')}
              {:else}
                — No skills mastered yet
              {/if}
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <!-- Recommendation & Override -->
    <section class="card recommendation" style="margin-top: 1.5rem;">
      <h2>AGNI Recommendation (coming soon)</h2>
      <p>Personalized next skill suggestions for this class will appear here.</p>
      <button class="override-btn" on:click={openOverrideModal}>
        Override Recommendation
      </button>
    </section>
  {:else}
    <p>No class selected.</p>
  {/if}

  <!-- Governance Milestones -->
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
</main>

<!-- Override Modal -->
{#if showOverrideModal}
  <div class="modal-overlay" on:click|self={closeOverrideModal}>
    <div class="modal-content">
      <h2>Override Recommendation for {currentClass.name}</h2>

      <label>
        Skill to force:
        <select bind:value={overrideSkillId}>
          <option value="">Select a skill...</option>
          {#each mockSkills as skill}
            <option value={skill.id}>{skill.title}</option>
          {/each}
        </select>
      </label>

      <label>
        Scope:
        <select bind:value={overrideScope}>
          <option value="class">Whole class</option>
          <option value="subgroup">Subgroup (select students)</option>
          <option value="individual">Individual student</option>
        </select>
      </label>

      <label>
        Duration:
        <select bind:value={overrideDuration}>
          <option value="1-day">1 day</option>
          <option value="3-days">3 days</option>
          <option value="1-week">1 week</option>
          <option value="permanent">Permanent (until manual reset)</option>
        </select>
      </label>

      <label>
        Reason:
        <textarea bind:value={overrideReason} placeholder="Why this override? (e.g., group experiment, catch-up needed)" rows="3"></textarea>
      </label>

      {#if overrideScope === 'class'}
        <p class="warning">Warning: This overrides personalization for {currentClass.studentsCount || 'all'} students.</p>
      {/if}

      <div class="modal-buttons">
        <button class="cancel-btn" on:click={closeOverrideModal}>Cancel</button>
        <button class="submit-btn" on:click={submitOverride} disabled={!overrideSkillId}>Apply Override</button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* Existing styles... keep all previous ones */

  .override-btn {
    margin-top: 1rem;
    padding: 0.6rem 1.2rem;
    background: var(--accent);
    color: #1a1a2e;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-weight: bold;
  }

  .override-btn:hover {
    background: #00c96a;
  }

  /* Modal styles */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-content {
    background: var(--card);
    border-radius: 12px;
    padding: 2rem;
    max-width: 500px;
    width: 90%;
    max-height: 90vh;
    overflow-y: auto;
    color: var(--text);
    position: relative;
  }

  .modal-content h2 {
    margin-bottom: 1.5rem;
  }

  label {
    display: block;
    margin: 1rem 0 0.5rem;
    font-weight: bold;
  }

  select, textarea {
    width: 100%;
    padding: 0.6rem;
    background: #1f2b4e;
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  textarea {
    resize: vertical;
  }

  .warning {
    color: #ffaa00;
    font-size: 0.9rem;
    margin: 0.5rem 0;
  }

  .modal-buttons {
    display: flex;
    gap: 1rem;
    margin-top: 2rem;
    justify-content: flex-end;
  }

  .cancel-btn {
    padding: 0.6rem 1.2rem;
    background: #2a2a4a;
    color: var(--text);
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }

  .submit-btn {
    padding: 0.6rem 1.2rem;
    background: var(--accent);
    color: #1a1a2e;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-weight: bold;
  }

  .submit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
