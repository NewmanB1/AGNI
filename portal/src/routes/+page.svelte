<script>
  import { mockClasses, mockGovernanceMilestones } from '$lib/mockData';
</script>

<h1>AGNI Teacher Hub — Prototype</h1>

<section class="card">
  <h2>Your Classes</h2>
  {#each mockClasses as cls}
    <div class="class-item">
      <h3>{cls.name}</h3>
      <p>Students: {cls.studentsCount}</p>
      <p>On-track to targets: {cls.onTrackPercent}%</p>
      <p>Notes: {cls.notes || 'No notes'}</p>
    </div>
  {/each}
</section>

<section class="card" style="margin-top: 2rem;">
  <h2>Governance Milestones</h2>
  <ul>
    {#each mockGovernanceMilestones as milestone}
      <li>
        <strong>{milestone.description}</strong><br />
        Due: {milestone.targetDate} ({milestone.requiredPercent}% required)
      </li>
    {/each}
  </ul>
</section>

<style>
  .class-item {
    margin: 1rem 0;
    padding: 1rem;
    background: #1f2b4e;
    border-radius: 8px;
    border: 1px solid #2a2a4a;
  }
  ul {
    list-style: none;
    padding: 0;
  }
  li {
    margin: 1rem 0;
    padding: 0.75rem;
    background: #0f1626;
    border-radius: 6px;
  }
</style>
