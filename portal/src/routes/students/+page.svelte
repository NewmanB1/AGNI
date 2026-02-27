<script>
  import { hubApiStore } from '$lib/api';
  import { onMount } from 'svelte';
  import { getStudentName, hasNickname } from '$lib/studentNames';
  import { computeStatus, statusColor } from '$lib/studentStatus';

  const api = $derived($hubApiStore);

  let allStudents = $state(/** @type {Record<string, any[]>} */ ({}));
  let loading = $state(true);
  let error = $state('');
  let hubConnected = $state(false);
  let search = $state('');

  const studentList = $derived.by(() => {
    const ids = Object.keys(allStudents);
    return ids.map(id => {
      const lessons = allStudents[id] || [];
      const mastered = lessons.filter(l => l.alreadyMastered).length;
      const total = lessons.length;
      const pct = total > 0 ? Math.round((mastered / total) * 100) : 0;
      const topRec = lessons.find(l => !l.alreadyMastered) || null;
      const status = computeStatus(pct, total > 0);
      return { id, name: getStudentName(id), mastered, total, pct, topRec, status };
    });
  });

  const filtered = $derived.by(() => {
    if (!search.trim()) return studentList;
    const q = search.toLowerCase();
    return studentList.filter(s => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q));
  });

  async function load() {
    if (!api.baseUrl) { loading = false; return; }
    loading = true;
    error = '';
    try {
      const thetaRes = await api.getThetaAll();
      allStudents = thetaRes.students || {};
      hubConnected = true;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      hubConnected = false;
    }
    loading = false;
  }

  onMount(load);

</script>

<svelte:head>
  <title>Students | AGNI Portal</title>
</svelte:head>

<h1>Students</h1>
<p class="subtitle">View all students from the hub roster. Click a student for their full detail page.</p>

{#if loading}
  <p>Loading…</p>
{:else if !hubConnected}
  <div class="card warning-box">
    <p>Configure hub URL in <a href="/settings">Settings</a> to view students.</p>
  </div>
{:else}
  {#if error}
    <div class="card error-box">{error}</div>
  {/if}

  <div class="search-row">
    <input type="text" class="search-input" bind:value={search} placeholder="Search by name or ID…" />
    <span class="count">{filtered.length} of {studentList.length} students</span>
  </div>

  <div class="student-table">
    {#each filtered as student}
      <a href="/students/{student.id}" class="student-row">
        <span class="status-dot" style="background: {statusColor(student.status)};"></span>
        <span class="student-name">{student.name}</span>
        {#if hasNickname(student.id)}
          <span class="student-pseudo">{student.id}</span>
        {/if}
        <span class="mastery-pct">{student.pct}%</span>
        <span class="mastery-detail">{student.mastered}/{student.total}</span>
        {#if student.topRec}
          <span class="next-lesson">Next: {student.topRec.title}</span>
        {:else}
          <span class="next-lesson done">All mastered</span>
        {/if}
      </a>
    {/each}
    {#if filtered.length === 0}
      <p class="empty">No students found.</p>
    {/if}
  </div>
{/if}

<style>
  .subtitle { opacity: 0.9; margin-bottom: 1.5rem; }
  .warning-box { border-color: #ff6b6b; max-width: 500px; }
  .error-box { border-color: #ff6b6b; color: #ff6b6b; }

  .search-row {
    display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;
  }
  .search-input {
    padding: 0.5rem 0.75rem; background: #1f2b4e; color: var(--text);
    border: 1px solid var(--border); border-radius: 6px; font-size: 1rem;
    flex: 1; max-width: 350px;
  }
  .count { opacity: 0.7; font-size: 0.9rem; }

  .student-table { display: flex; flex-direction: column; gap: 2px; }
  .student-row {
    display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem;
    background: var(--card); border: 1px solid var(--border); border-radius: 8px;
    text-decoration: none; color: var(--text); transition: border-color 0.15s;
  }
  .student-row:hover { border-color: var(--accent); text-decoration: none; }

  .status-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .student-name { font-weight: bold; min-width: 140px; }
  .student-pseudo { font-size: 0.8rem; opacity: 0.5; min-width: 100px; overflow: hidden; text-overflow: ellipsis; }
  .mastery-pct { font-weight: bold; min-width: 45px; text-align: right; }
  .mastery-detail { font-size: 0.85rem; opacity: 0.7; min-width: 60px; }
  .next-lesson { font-size: 0.85rem; color: var(--accent); flex: 1; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .next-lesson.done { color: #4ade80; }
  .empty { opacity: 0.7; padding: 1rem; }
</style>
