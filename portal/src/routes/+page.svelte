<!-- portal/src/routes/+page.svelte -->
<script>
  import { mockClasses, mockGovernanceMilestones, mockSkills } from '$lib/mockData';
</script>

<h1>AGNI Teacher Hub — Prototype</h1>

<section class="card">
  <h2>Your Classes</h2>
  {#each mockClasses as classGroup}
    <div class="class-item">
      <h3>{classGroup.name}</h3>
      <p>Students: {classGroup.students.length}</p>
      <p>On-track to governance targets: {Object.values(classGroup.governanceTargetStatus).reduce((a, b) => a + b, 0) / Object.keys(classGroup.governanceTargetStatus).length}% average</p>
    </div>
  {/each}
</section>

<section class="card" style="margin-top: 2rem;">
  <h2>Governance Milestones</h2>
  <ul>
    {#each mockGovernanceMilestones as milestone}
      <li>
        <strong>{milestone.description}</strong> — Due {milestone.targetDate} ({milestone.requiredPercent}% required)
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
  }
  ul {
    list-style: none;
    padding: 0;
  }
  li {
    margin: 0.75rem 0;
  }
</style>
