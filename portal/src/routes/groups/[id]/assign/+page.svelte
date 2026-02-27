<script>
  import { hubApiStore } from '$lib/api';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { getStudentName } from '$lib/studentNames';

  const api = $derived($hubApiStore);
  const groupId = $derived($page.params.id);

  let group = $state(null);
  let lessons = $state(/** @type {any[]} */ ([]));
  let eligibilityMap = $state(/** @type {Record<string, Set<string>>} */ ({}));
  let selectedLessonId = $state('');
  let loading = $state(true);
  let assigning = $state(false);
  let error = $state('');
  let success = $state('');
  let hubConnected = $state(false);

  const lessonEligibility = $derived.by(() => {
    if (!group || lessons.length === 0) return [];
    const studentIds = group.studentIds || [];
    return lessons.map(l => {
      const eligibleFor = studentIds.filter(id => {
        const set = eligibilityMap[id];
        return set && set.has(l.lessonId);
      });
      return { ...l, eligibleCount: eligibleFor.length, totalStudents: studentIds.length };
    });
  });

  async function load() {
    if (!api.baseUrl || !groupId) return;
    loading = true;
    error = '';
    try {
      const groupsRes = await api.getGroups();
      hubConnected = true;
      const found = (groupsRes.groups || []).find((g) => g.id === groupId);
      if (!found) {
        error = 'Group not found.';
        loading = false;
        return;
      }
      group = found;
      const studentIds = group.studentIds || [];
      if (studentIds.length === 0) {
        error = 'Group has no students. Add students on the Groups page first.';
        loading = false;
        return;
      }

      const thetaPromises = studentIds.map(id => api.getTheta(id).catch(() => ({ lessons: [] })));
      const thetaResults = await Promise.all(thetaPromises);

      const allLessonMap = /** @type {Map<string, any>} */ (new Map());
      const eligMap = /** @type {Record<string, Set<string>>} */ ({});

      thetaResults.forEach((res, idx) => {
        const sid = studentIds[idx];
        const eligible = new Set();
        for (const l of (res.lessons || [])) {
          if (!l.alreadyMastered) {
            allLessonMap.set(l.lessonId, l);
            eligible.add(l.lessonId);
          }
        }
        eligMap[sid] = eligible;
      });

      eligibilityMap = eligMap;

      const merged = [...allLessonMap.values()];
      merged.sort((a, b) => {
        const aCount = studentIds.filter(id => eligMap[id]?.has(a.lessonId)).length;
        const bCount = studentIds.filter(id => eligMap[id]?.has(b.lessonId)).length;
        if (bCount !== aCount) return bCount - aCount;
        return a.theta - b.theta;
      });

      lessons = merged;
      if (lessons.length) selectedLessonId = lessons[0].lessonId;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      hubConnected = false;
    }
    loading = false;
  }

  $effect(() => {
    if (groupId && api.baseUrl) load();
  });

  async function assign() {
    if (!group || !selectedLessonId) return;
    assigning = true;
    error = '';
    try {
      const res = await api.assignGroupLesson(group.id, selectedLessonId);
      success = `Assigned to ${res.assigned} student(s).` +
        (res.skipped ? ` (${res.skipped} skipped: lesson not eligible for them)` : '');
      setTimeout(() => goto('/groups'), 2000);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    assigning = false;
  }

  function selectedLessonInfo(lessonId) {
    return lessonEligibility.find(l => l.lessonId === lessonId);
  }
</script>

<svelte:head>
  <title>Assign lesson — {group?.name ?? 'Group'} | AGNI Portal</title>
</svelte:head>

<nav class="breadcrumb">
  <a href="/groups">Groups</a> → Assign lesson
</nav>

<h1>Assign lesson to group</h1>

{#if loading}
  <p>Loading eligible lessons for all group members…</p>
{:else if !hubConnected}
  <div class="card warning-box">
    <p>Configure hub URL in <a href="/settings">Settings</a>.</p>
  </div>
{:else if error}
  <div class="card error-box">
    <p>{error}</p>
    <a href="/groups">← Back to Groups</a>
  </div>
{:else if group}
  <div class="card wizard">
    <h2>{group.name}</h2>
    <p class="meta">
      {group.studentIds?.length ?? 0} student(s):
      {(group.studentIds || []).map(id => getStudentName(id)).join(', ') || '—'}
    </p>

    <p class="hint">
      Lessons are sorted by eligibility across all group members. The override will be set for every member for whom the lesson is theta-eligible.
    </p>

    <label class="block">
      Lesson
      <select bind:value={selectedLessonId}>
        {#each lessonEligibility as l}
          <option value={l.lessonId}>
            {l.title} ({l.slug}) · θ={l.theta} — eligible for {l.eligibleCount}/{l.totalStudents}
          </option>
        {/each}
      </select>
    </label>

    {#if selectedLessonId}
      {@const info = selectedLessonInfo(selectedLessonId)}
      {#if info}
        <div class="eligibility-note" class:full={info.eligibleCount === info.totalStudents} class:partial={info.eligibleCount < info.totalStudents}>
          {#if info.eligibleCount === info.totalStudents}
            All {info.totalStudents} students are eligible for this lesson.
          {:else}
            {info.eligibleCount} of {info.totalStudents} students are eligible. {info.totalStudents - info.eligibleCount} will be skipped (lesson not in their theta list).
          {/if}
        </div>
      {/if}
    {/if}

    {#if success}
      <p class="success-msg">{success}</p>
      <p class="hint">Redirecting to Groups…</p>
    {:else}
      <div class="actions">
        <a href="/groups" class="secondary">Cancel</a>
        <button class="primary" onclick={assign} disabled={assigning || !selectedLessonId}>
          {assigning ? 'Assigning…' : 'Assign lesson'}
        </button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .breadcrumb { margin-bottom: 1rem; font-size: 0.9rem; opacity: 0.9; }
  .breadcrumb a { color: var(--accent); }

  .wizard h2 { margin-bottom: 0.5rem; }
  .meta { font-size: 0.95rem; opacity: 0.9; margin-bottom: 1.5rem; }
  .hint { font-size: 0.9rem; opacity: 0.8; margin-bottom: 1rem; }

  label.block { display: block; margin: 1rem 0; }
  select {
    width: 100%; max-width: 600px; padding: 0.6rem;
    background: #1f2b4e; color: var(--text);
    border: 1px solid var(--border); border-radius: 6px; font-size: 1rem;
  }

  .eligibility-note {
    padding: 0.6rem 0.8rem; border-radius: 6px; font-size: 0.9rem; margin: 0.5rem 0;
  }
  .eligibility-note.full { background: rgba(74,222,128,0.1); color: #4ade80; }
  .eligibility-note.partial { background: rgba(255,170,0,0.1); color: #ffaa00; }

  .actions { display: flex; gap: 1rem; align-items: center; margin-top: 1.5rem; }
  .actions a.secondary {
    padding: 0.5rem 1rem; background: #2a2a4a; color: var(--text);
    border: 1px solid var(--border); border-radius: 6px; text-decoration: none;
  }
  button.primary {
    background: var(--accent); color: #1a1a2e; border: none;
    padding: 0.6rem 1.2rem; border-radius: 6px; cursor: pointer; font-weight: bold;
  }
  button:disabled { opacity: 0.5; cursor: not-allowed; }

  .success-msg { color: #4ade80; margin-top: 1rem; }
  .warning-box, .error-box { border-color: #ff6b6b; }
  .error-box { color: #ff6b6b; }
</style>
