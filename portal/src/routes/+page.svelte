<script>
  import { mockClasses, mockGovernanceMilestones } from '$lib/mockData';
</script>

<h1>AGNI Teacher Hub — Prototype</h1>

<section class="card">
  <h2>Your Classes ({mockClasses.length})</h2>
  {#each mockClasses as cls}
    <div class="class-item">
      <h3>{cls.name}</h3>
      <div class="progress-container">
        <div 
          class="progress-bar" 
          style="width: {cls.onTrackPercent}%; background: {cls.onTrackPercent >= 80 ? 'var(--accent)' : cls.onTrackPercent >= 50 ? '#ffaa00' : '#ff5252'};"
        ></div>
        <span>{cls.onTrackPercent}% on-track</span>
      </div>
      <p>Students: {cls.students?.length || cls.studentsCount || 'N/A'}</p>
      {#if cls.notes}
        <p class="notes">Notes: {cls.notes}</p>
      {/if}
      {#if cls.students?.length}
        <details>
          <summary>View students ({cls.students.length})</summary>
          <ul>
            {#each cls.students as student}
              <li>
                {student.name} — Entry level: {student.entryLevel}
                {#if student.masteredSkills?.length}
                  — Mastered: {student.masteredSkills.join(', ')}
                {:else}
                  — No skills mastered yet
                {/if}
              </li>
            {/each}
          </ul>
        </details>
      {/if}
    </div>
  {/each}
</section>

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

<style>
  .class-item {
    margin: 1.2rem 0;
    padding: 1.2rem;
    background: #1f2b4e;
    border-radius: 8px;
    border: 1px solid #2a2a4a;
  }
  .progress-container {
    margin: 0.5rem 0;
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
  .notes {
    font-size: 0.9rem;
    opacity: 0.8;
    margin-top: 0.5rem;
  }
  details {
    margin-top: 1rem;
  }
  summary {
    cursor: pointer;
    font-weight: bold;
    color: var(--accent);
  }
  ul {
    list-style: none;
    padding-left: 1.2rem;
    margin-top: 0.5rem;
  }
  li {
    margin: 0.5rem 0;
  }
</style>
