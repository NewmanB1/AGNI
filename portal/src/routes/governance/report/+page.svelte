<script>
  import { hubApiStore } from '$lib/api';
  import { onMount } from 'svelte';

  const api = $derived($hubApiStore);

  let report = $state(null);
  let policy = $state({});
  let catalog = $state({ lessonIds: [] });
  let loading = $state(true);
  let error = $state('');

  const utuEntries = $derived(
    report ? Object.entries(report.byUtu).sort((a, b) => b[1].lessons - a[1].lessons) : []
  );

  const skillEntries = $derived(
    report ? Object.entries(report.bySkill).sort((a, b) => b[1].lessons - a[1].lessons) : []
  );

  const policyTargetKeys = $derived(
    (policy.utuTargets || []).map(t => t.class + (typeof t.band === 'number' ? '-B' + t.band : ''))
  );

  const coverageGaps = $derived(
    policyTargetKeys.filter(key => {
      const entry = report?.byUtu?.[key];
      return !entry || entry.lessons === 0;
    })
  );

  const coveredTargets = $derived(
    policyTargetKeys.filter(key => {
      const entry = report?.byUtu?.[key];
      return entry && entry.lessons > 0;
    })
  );

  const catalogLessonCount = $derived(catalog.lessonIds?.length || 0);

  onMount(async () => {
    if (!api.baseUrl) {
      error = 'Configure hub URL in Settings.';
      loading = false;
      return;
    }
    try {
      const [r, p, c] = await Promise.all([
        api.getGovernanceReport(),
        api.getGovernancePolicy().catch(() => ({})),
        api.getGovernanceCatalog().catch(() => ({ lessonIds: [] }))
      ]);
      report = r;
      policy = p || {};
      catalog = c || { lessonIds: [] };
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    loading = false;
  });
</script>

<h1>Governance Report</h1>
<p class="subtitle">Coverage dashboard, policy compliance, and gap analysis.</p>

{#if loading}
  <p>Loading report…</p>
{:else if error}
  <div class="card warning-box"><p>{error}</p></div>
{:else if report}
  <div class="summary-cards">
    <div class="card stat-card">
      <div class="stat-value">{report.lessonCount}</div>
      <div class="stat-label">Lessons indexed</div>
    </div>
    <div class="card stat-card">
      <div class="stat-value">{catalogLessonCount}</div>
      <div class="stat-label">Approved in catalog</div>
    </div>
    <div class="card stat-card">
      <div class="stat-value">{report.studentCount}</div>
      <div class="stat-label">Students tracked</div>
    </div>
    <div class="card stat-card">
      <div class="stat-value">{utuEntries.length}</div>
      <div class="stat-label">UTU buckets</div>
    </div>
  </div>

  {#if policyTargetKeys.length > 0}
    <div class="card section">
      <h2>Policy Target Coverage</h2>
      <p class="hint">
        {coveredTargets.length} of {policyTargetKeys.length} policy targets covered.
        {#if coverageGaps.length > 0}
          <strong class="gap-warn">{coverageGaps.length} gap(s) found.</strong>
        {:else}
          <strong class="gap-ok">All targets covered.</strong>
        {/if}
      </p>

      <div class="target-grid">
        {#each policyTargetKeys as key}
          {@const entry = report.byUtu[key]}
          {@const hasGap = !entry || entry.lessons === 0}
          <div class="target-card" class:gap={hasGap} class:covered={!hasGap}>
            <div class="target-key">{key}</div>
            {#if entry}
              <div class="target-stats">
                {entry.lessons} lesson{entry.lessons !== 1 ? 's' : ''}
                · {entry.skills.length} skill{entry.skills.length !== 1 ? 's' : ''}
                · {entry.studentMasteryCount} student{entry.studentMasteryCount !== 1 ? 's' : ''} mastered
              </div>
            {:else}
              <div class="target-stats gap-text">No lessons cover this target</div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {:else}
    <div class="card section">
      <h2>Policy Target Coverage</h2>
      <p class="hint">No UTU targets configured in policy. <a href="/governance/setup">Add targets</a> to see gap analysis.</p>
    </div>
  {/if}

  <div class="card section">
    <h2>Coverage by UTU Bucket</h2>
    {#if utuEntries.length === 0}
      <p class="hint">No UTU data available.</p>
    {:else}
      <table class="report-table">
        <thead>
          <tr>
            <th>UTU Bucket</th>
            <th>Lessons</th>
            <th>Skills</th>
            <th>Students Mastered</th>
            <th>Target?</th>
          </tr>
        </thead>
        <tbody>
          {#each utuEntries as [key, data]}
            <tr class:target-row={policyTargetKeys.includes(key)}>
              <td class="bucket-key">{key}</td>
              <td>{data.lessons}</td>
              <td>{data.skills.length}</td>
              <td>
                <div class="mastery-bar-cell">
                  <span>{data.studentMasteryCount}</span>
                  {#if report.studentCount > 0}
                    <div class="mastery-bar">
                      <div class="mastery-fill" style="width: {Math.round(data.studentMasteryCount / report.studentCount * 100)}%"></div>
                    </div>
                  {/if}
                </div>
              </td>
              <td>
                {#if policyTargetKeys.includes(key)}
                  <span class="target-badge">Target</span>
                {:else}
                  —
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>

  <div class="card section">
    <h2>Skill Mastery Breakdown</h2>
    {#if skillEntries.length === 0}
      <p class="hint">No skill data available.</p>
    {:else}
      <table class="report-table">
        <thead>
          <tr>
            <th>Skill</th>
            <th>Lessons</th>
            <th>Students Mastered</th>
          </tr>
        </thead>
        <tbody>
          {#each skillEntries.slice(0, 30) as [skillId, data]}
            <tr>
              <td class="skill-id">{skillId}</td>
              <td>{data.lessons}</td>
              <td>
                <div class="mastery-bar-cell">
                  <span>{data.studentMasteryCount}</span>
                  {#if report.studentCount > 0}
                    <div class="mastery-bar">
                      <div class="mastery-fill" style="width: {Math.round(data.studentMasteryCount / report.studentCount * 100)}%"></div>
                    </div>
                  {/if}
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
      {#if skillEntries.length > 30}
        <p class="hint">Showing top 30 of {skillEntries.length} skills.</p>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .summary-cards {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 1rem; margin-bottom: 1.5rem;
  }
  .stat-card { text-align: center; padding: 1rem; }
  .stat-value { font-size: 2rem; font-weight: bold; color: var(--accent); }
  .stat-label { font-size: 0.85rem; opacity: 0.7; margin-top: 0.25rem; }

  .section { margin-bottom: 1.5rem; }
  .section h2 { margin-top: 0; margin-bottom: 0.5rem; }

  .gap-warn { color: #ff5252; }
  .gap-ok { color: var(--accent); }

  .target-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 0.75rem; margin-top: 0.75rem;
  }
  .target-card {
    border: 1px solid var(--border); border-radius: 8px;
    padding: 0.75rem; background: rgba(31,43,78,0.4);
  }
  .target-card.covered { border-left: 3px solid var(--accent); }
  .target-card.gap { border-left: 3px solid #ff5252; background: rgba(255,82,82,0.05); }
  .target-key { font-weight: bold; font-size: 0.95rem; margin-bottom: 0.25rem; }
  .target-stats { font-size: 0.8rem; opacity: 0.7; }
  .gap-text { color: #ff5252; opacity: 1; font-weight: 600; }

  .report-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
  .report-table th {
    text-align: left; padding: 0.5rem; border-bottom: 2px solid var(--border);
    font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.7;
  }
  .report-table td { padding: 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.05); }
  .report-table tr.target-row { background: rgba(0,230,118,0.04); }

  .bucket-key { font-family: monospace; font-weight: 600; }
  .skill-id { font-family: monospace; }

  .target-badge {
    background: rgba(0,230,118,0.15); color: var(--accent);
    padding: 0.1rem 0.4rem; border-radius: 8px; font-size: 0.75rem; font-weight: 600;
  }

  .mastery-bar-cell { display: flex; align-items: center; gap: 0.5rem; }
  .mastery-bar {
    flex: 1; height: 6px; background: rgba(255,255,255,0.08);
    border-radius: 3px; min-width: 40px; max-width: 80px;
  }
  .mastery-fill {
    height: 100%; background: var(--accent); border-radius: 3px;
    min-width: 1px;
  }

  a { color: var(--accent); }
</style>
