<script>
  import { mockClasses, mockGovernanceMilestones } from '$lib/mockData';

  // Selected class ID (starts with first class)
  let selectedClassId = mockClasses[0]?.id || '';

  // Reactive: current class object
  $: currentClass = mockClasses.find(cls => cls.id === selectedClassId) || null;
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

    <section class="card">
      <h2>Class Overview</h2>
      <div class="progress-container">
        <div 
          class="progress-bar" 
          style="width: {currentClass.onTrackPercent}%; background: {currentClass.onTrackPercent >= 80 ? 'var(--accent)' : currentClass.onTrackPercent >= 50 ? '#ffaa00' : '#ff5252'};"
        ></div>
        <span>{currentClass.onTrackPercent}% on-track to governance targets</span>
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

    <!-- Placeholder for future recommendations -->
    <section class="card recommendation" style="margin-top: 1.5rem;">
      <h2>AGNI Recommendation (coming soon)</h2>
      <p>Personalized next skill suggestions for this class will appear here.</p>
    </section>
  {:else}
    <p>No class selected.</p>
  {/if}

  <!-- Governance Milestones (always visible, class-agnostic for now) -->
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

<style>
  .top-nav {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.5rem;
    background: #0f1626;
    border-bottom: 1px solid #2a2a4a;
    margin-bottom: 1.5rem;
    border-radius: 0 0 8px 8px;
  }

  .nav-left, .nav-right {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .class-selector {
    padding: 0.6rem 1rem;
    background: #1f2b4e;
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 1rem;
    min-width: 280px;
    cursor: pointer;
  }

  .teacher-name {
    font-weight: bold;
    color: var(--accent);
  }

  .progress-container {
    margin: 0.8rem 0;
    background: #0f1626;
    border-radius: 4px;
    height: 24px;
    position: relative;
    overflow: hidden;
  }

  .progress-bar {
    height: 100%;
    transition: width 0.4s ease;
  }

  .progress-container span {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 0.9rem;
    font-weight: bold;
    color: #fff;
    text-shadow: 0 0 3px #000;
  }

  .student-list {
    list-style: none;
    padding: 0;
    margin: 0.5rem 0 0 0;
  }

  .student-list li {
    padding: 0.6rem 0;
    border-bottom: 1px solid #2a2a4a;
  }

  .student-list li:last-child {
    border-bottom: none;
  }

  .recommendation {
    background: #0f1626;
    border: 1px dashed var(--accent);
  }
</style>
