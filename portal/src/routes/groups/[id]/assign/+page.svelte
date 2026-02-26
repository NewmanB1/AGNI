<script>
  import { hubApiStore } from '$lib/api';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';

  const api = $derived($hubApiStore);
  const groupId = $derived($page.params.id);

  let group = $state(null);
  let lessons = $state([]);
  let selectedLessonId = $state('');
  let loading = $state(true);
  let assigning = $state(false);
  let error = $state('');
  let success = $state('');
  let hubConnected = $state(false);

  async function load() {
    if (!api.baseUrl || !groupId) return;
    loading = true;
    error = '';
    try {
      const [groupsRes, thetaRes] = await Promise.all([
        api.getGroups(),
        api.getThetaAll()
      ]);
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
      const thetaRes2 = await api.getTheta(studentIds[0]);
      lessons = thetaRes2.lessons || [];
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
</script>

<svelte:head>
  <title>Assign lesson — {group?.name ?? 'Group'} | AGNI Portal</title>
</svelte:head>

<nav class="breadcrumb">
  <a href="/groups">Groups</a> → Assign lesson
</nav>

<h1>Assign lesson to group</h1>

{#if loading}
  <p>Loading…</p>
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
    <p class="meta">{group.studentIds?.length ?? 0} student(s): {group.studentIds?.join(', ') || '—'}</p>

    <p class="hint">Select a lesson to assign. The recommendation override will be set for all group members for whom this lesson is theta-eligible.</p>

    <label class="block">
      Lesson
      <select bind:value={selectedLessonId}>
        {#each lessons as l}
          <option value={l.lessonId}>{l.title} ({l.slug}) · θ={l.theta}</option>
        {/each}
      </select>
    </label>

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
  .breadcrumb {
    margin-bottom: 1rem;
    font-size: 0.9rem;
    opacity: 0.9;
  }

  .breadcrumb a {
    color: var(--accent);
  }

  .wizard h2 {
    margin-bottom: 0.5rem;
  }

  .meta {
    font-size: 0.95rem;
    opacity: 0.9;
    margin-bottom: 1.5rem;
  }

  .hint {
    font-size: 0.9rem;
    opacity: 0.8;
    margin-bottom: 1rem;
  }

  label.block {
    display: block;
    margin: 1rem 0;
  }

  select {
    width: 100%;
    max-width: 400px;
    padding: 0.6rem;
    background: #1f2b4e;
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 1rem;
  }

  .actions {
    display: flex;
    gap: 1rem;
    align-items: center;
    margin-top: 1.5rem;
  }

  .actions a.secondary {
    padding: 0.5rem 1rem;
    background: #2a2a4a;
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    text-decoration: none;
  }

  button.primary {
    background: var(--accent);
    color: #1a1a2e;
    border: none;
    padding: 0.6rem 1.2rem;
    border-radius: 6px;
    cursor: pointer;
    font-weight: bold;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .success-msg {
    color: #4ade80;
    margin-top: 1rem;
  }

  .warning-box,
  .error-box {
    border-color: #ff6b6b;
  }

  .error-box {
    color: #ff6b6b;
  }
</style>
