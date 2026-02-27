<script>
  import { hubApiStore } from '$lib/api';
  import { onMount } from 'svelte';
  import { getStudentName, hasNickname } from '$lib/studentNames';

  const api = $derived($hubApiStore);

  let groups = $state([]);
  let roster = $state([]);
  let loading = $state(true);
  let error = $state('');
  let success = $state('');
  let hubConnected = $state(false);

  let showCreateForm = $state(false);
  let newGroupName = $state('');
  let selectedStudentIds = $state([]);
  let creating = $state(false);

  let editingGroup = $state(null);
  let editSelectedIds = $state([]);
  let saving = $state(false);

  async function load() {
    if (!api.baseUrl) return;
    loading = true;
    error = '';
    try {
      const [groupsRes, thetaRes] = await Promise.all([
        api.getGroups(),
        api.getThetaAll()
      ]);
      groups = groupsRes.groups || [];
      roster = Object.keys(thetaRes.students || {});
      hubConnected = true;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      hubConnected = false;
    }
    loading = false;
  }

  onMount(load);

  function openCreateForm() {
    showCreateForm = true;
    newGroupName = '';
    selectedStudentIds = [];
    success = '';
  }

  function closeCreateForm() {
    showCreateForm = false;
  }

  function toggleStudent(id) {
    if (selectedStudentIds.includes(id)) {
      selectedStudentIds = selectedStudentIds.filter((s) => s !== id);
    } else {
      selectedStudentIds = [...selectedStudentIds, id];
    }
  }

  async function createGroup() {
    const name = newGroupName.trim();
    if (!name) {
      error = 'Enter a group name.';
      return;
    }
    creating = true;
    error = '';
    try {
      await api.postGroup({ name, studentIds: selectedStudentIds });
      success = `Created "${name}".`;
      closeCreateForm();
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    creating = false;
  }

  function openEdit(g) {
    editingGroup = g;
    editSelectedIds = [...(g.studentIds || [])];
    success = '';
  }

  function closeEdit() {
    editingGroup = null;
  }

  function toggleEditStudent(id) {
    if (editSelectedIds.includes(id)) {
      editSelectedIds = editSelectedIds.filter((s) => s !== id);
    } else {
      editSelectedIds = [...editSelectedIds, id];
    }
  }

  async function saveGroup() {
    if (!editingGroup) return;
    saving = true;
    error = '';
    try {
      await api.putGroup({ id: editingGroup.id, studentIds: editSelectedIds });
      success = `Updated "${editingGroup.name}".`;
      closeEdit();
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    saving = false;
  }
</script>

<h1>Student Groups (T2b)</h1>
<p class="subtitle">Create groups and assign students from the hub roster. Use for reading groups, lab pairs, etc.</p>

{#if loading}
  <p>Loading…</p>
{:else if !hubConnected}
  <div class="card warning-box">
    <p>Configure hub URL in <a href="/settings">Settings</a> to manage groups. The roster comes from the hub's mastery data.</p>
  </div>
{:else}
  {#if error}
    <div class="card error-box">{error}</div>
  {/if}
  {#if success}
    <div class="card success-box">{success}</div>
  {/if}

  <div class="card">
    <div class="actions-row">
      <button class="primary" onclick={openCreateForm} disabled={showCreateForm}>
        + Create group
      </button>
    </div>

    {#if showCreateForm}
      <div class="create-form">
        <h2>New group</h2>
        <label>Name <input type="text" bind:value={newGroupName} placeholder="e.g. Reading Group A" /></label>
        <h3>Add students from roster</h3>
        <div class="roster-checkboxes">
          {#each roster as pseudoId}
            <label class="checkbox-row">
              <input type="checkbox" checked={selectedStudentIds.includes(pseudoId)} onchange={() => toggleStudent(pseudoId)} />
              <span>{getStudentName(pseudoId)}</span>
              {#if hasNickname(pseudoId)}<span class="pseudo-small">({pseudoId})</span>{/if}
            </label>
          {/each}
        </div>
        {#if roster.length === 0}
          <p class="hint">No students in roster. Ensure mastery data exists on the hub.</p>
        {/if}
        <div class="form-actions">
          <button class="secondary" onclick={closeCreateForm}>Cancel</button>
          <button class="primary" onclick={createGroup} disabled={creating || !newGroupName.trim()}>
            {creating ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    {/if}
  </div>

  <div class="card">
    <h2>Groups ({groups.length})</h2>
    {#if groups.length === 0}
      <p class="empty">No groups yet. Create one above.</p>
    {:else}
      <ul class="group-list">
        {#each groups as g}
          <li>
            <strong>{g.name}</strong> — {g.studentIds?.length ?? 0} student(s)
            {#if g.studentIds?.length}
              <span class="ids">{g.studentIds.map(id => getStudentName(id)).join(', ')}</span>
            {/if}
            <button class="small" onclick={() => openEdit(g)}>Edit</button>
            {#if g.studentIds?.length}
              <a href="/groups/{g.id}/assign" class="small accent">Assign lesson</a>
            {:else}
              <span class="small accent disabled">Assign lesson</span>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  {#if editingGroup}
    <div class="modal-overlay" onclick={(e) => e.target === e.currentTarget && closeEdit()} role="dialog">
      <div class="modal-content">
        <h2>Edit "{editingGroup.name}"</h2>
        <p class="hint">Add or remove students from the roster.</p>
        <div class="roster-checkboxes">
          {#each roster as pseudoId}
            <label class="checkbox-row">
              <input type="checkbox" checked={editSelectedIds.includes(pseudoId)} onchange={() => toggleEditStudent(pseudoId)} />
              <span>{getStudentName(pseudoId)}</span>
              {#if hasNickname(pseudoId)}<span class="pseudo-small">({pseudoId})</span>{/if}
            </label>
          {/each}
        </div>
        <div class="form-actions">
          <button class="secondary" onclick={closeEdit}>Cancel</button>
          <button class="primary" onclick={saveGroup} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  {/if}
{/if}

<style>
  .subtitle {
    opacity: 0.9;
    margin-bottom: 1.5rem;
  }

  .warning-box {
    border-color: #ff6b6b;
  }

  .error-box {
    border-color: #ff6b6b;
    color: #ff6b6b;
  }

  .success-box {
    border-color: #4ade80;
    color: #4ade80;
  }

  .actions-row {
    margin-bottom: 1rem;
  }

  .create-form {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border);
  }

  .create-form h2,
  .create-form h3 {
    margin: 1rem 0 0.5rem;
  }

  .create-form h2:first-child {
    margin-top: 0;
  }

  .create-form label {
    display: block;
    margin: 0.5rem 0;
  }

  .create-form input[type='text'] {
    width: 100%;
    max-width: 300px;
    padding: 0.5rem;
    background: #1f2b4e;
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  .roster-checkboxes {
    max-height: 200px;
    overflow-y: auto;
    padding: 0.5rem 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .checkbox-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
  }

  .pseudo-small {
    font-size: 0.8rem;
    opacity: 0.5;
  }

  .checkbox-row input {
    cursor: pointer;
  }

  .form-actions {
    display: flex;
    gap: 1rem;
    margin-top: 1rem;
  }

  button.primary {
    background: var(--accent);
    color: #1a1a2e;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    cursor: pointer;
    font-weight: bold;
  }

  button.secondary {
    background: #2a2a4a;
    color: var(--text);
    border: 1px solid var(--border);
    padding: 0.5rem 1rem;
    border-radius: 6px;
    cursor: pointer;
  }

  a.small.accent {
    display: inline-block;
    background: rgba(0, 230, 118, 0.2);
    color: var(--accent);
    text-decoration: none;
  }

  span.small.accent.disabled {
    display: inline-block;
    margin-left: 0.5rem;
    padding: 0.25rem 0.5rem;
    font-size: 0.85rem;
    opacity: 0.5;
    cursor: not-allowed;
  }

  button.small {
    margin-left: 0.5rem;
    padding: 0.25rem 0.5rem;
    font-size: 0.85rem;
    background: #2a2a4a;
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 4px;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .group-list {
    list-style: none;
    padding: 0;
  }

  .group-list li {
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--border);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem;
  }

  .group-list .ids {
    font-size: 0.9rem;
    opacity: 0.8;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .empty {
    opacity: 0.8;
  }

  .hint {
    font-size: 0.9rem;
    opacity: 0.8;
  }

  .err {
    color: #ff6b6b;
    margin: 0.5rem 0;
  }

  .modal-content label.block {
    display: block;
    margin: 1rem 0 0.5rem;
  }

  .modal-content select {
    width: 100%;
    padding: 0.5rem;
    background: #1f2b4e;
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 1rem;
  }

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
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    border: 1px solid var(--border);
  }
</style>
