<!-- Admin account management: creators + students -->
<script>
  import { hubApiStore } from '$lib/api';
  import { onMount } from 'svelte';

  const api = $derived($hubApiStore);

  let tab = $state('creators');
  let creators = $state([]);
  let students = $state([]);
  let loading = $state(true);
  let error = $state('');

  // Bulk student creation
  let bulkNames = $state('');
  let bulkPin = $state('');
  let bulkResult = $state(null);
  let bulkLoading = $state(false);

  // Transfer token
  let transferTarget = $state('');
  let transferResult = $state(null);

  // Edit student
  let editingStudent = $state(null);
  let editName = $state('');
  let editPin = $state('');

  onMount(() => loadAll());

  async function loadAll() {
    loading = true;
    error = '';
    try {
      const [cr, st] = await Promise.all([
        api.getCreators(),
        api.getStudentAccounts()
      ]);
      creators = cr.creators || [];
      students = st.students || [];
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load accounts';
    } finally {
      loading = false;
    }
  }

  async function toggleApproval(creator) {
    try {
      await api.setCreatorApproval(creator.id, !creator.approved);
      creator.approved = !creator.approved;
      creators = [...creators];
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to update';
    }
  }

  async function bulkCreate() {
    const names = bulkNames.split('\n').map(n => n.trim()).filter(Boolean);
    if (names.length === 0) return;
    bulkLoading = true;
    bulkResult = null;
    try {
      const result = await api.createStudentsBulk({ names, pin: bulkPin || undefined });
      bulkResult = result;
      bulkNames = '';
      bulkPin = '';
      const st = await api.getStudentAccounts();
      students = st.students || [];
    } catch (e) {
      error = e instanceof Error ? e.message : 'Bulk creation failed';
    } finally {
      bulkLoading = false;
    }
  }

  async function createSingle() {
    try {
      await api.createStudent({ displayName: 'New Student' });
      const st = await api.getStudentAccounts();
      students = st.students || [];
    } catch (e) {
      error = e instanceof Error ? e.message : 'Creation failed';
    }
  }

  async function generateTransfer(pseudoId) {
    transferTarget = pseudoId;
    transferResult = null;
    try {
      transferResult = await api.generateTransferToken(pseudoId);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Transfer token failed';
    }
  }

  function startEdit(student) {
    editingStudent = student.pseudoId;
    editName = student.displayName || '';
    editPin = '';
  }

  async function saveEdit(pseudoId) {
    try {
      const updates = { displayName: editName };
      if (editPin) updates.pin = editPin;
      await api.updateStudent(pseudoId, updates);
      editingStudent = null;
      const st = await api.getStudentAccounts();
      students = st.students || [];
    } catch (e) {
      error = e instanceof Error ? e.message : 'Update failed';
    }
  }

  async function toggleStudentActive(student) {
    try {
      await api.updateStudent(student.pseudoId, { active: !student.active });
      student.active = !student.active;
      students = [...students];
    } catch (e) {
      error = e instanceof Error ? e.message : 'Update failed';
    }
  }
</script>

<h1>Account Management</h1>

{#if error}<p class="error">{error} <button onclick={() => error = ''}>dismiss</button></p>{/if}

<div class="tabs">
  <button class:active={tab === 'creators'} onclick={() => tab = 'creators'}>
    Lesson Creators ({creators.length})
  </button>
  <button class:active={tab === 'students'} onclick={() => tab = 'students'}>
    Students ({students.length})
  </button>
</div>

{#if loading}
  <p class="muted">Loading accounts...</p>
{:else if tab === 'creators'}
  <section class="section">
    <p class="info">Lesson creators must register and be approved before they can publish lessons. This provides accountability for content quality.</p>

    {#if creators.length === 0}
      <p class="muted">No creator accounts yet. Creators register at <a href="/author/login">/author/login</a>.</p>
    {:else}
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Status</th>
            <th>Lessons</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each creators as cr}
            <tr class:inactive={!cr.approved}>
              <td>{cr.name}</td>
              <td class="mono">{cr.email}</td>
              <td>
                {#if cr.approved}
                  <span class="badge approved">Approved</span>
                {:else}
                  <span class="badge pending">Pending</span>
                {/if}
              </td>
              <td>{cr.lessonsAuthored?.length || 0}</td>
              <td class="muted">{new Date(cr.createdAt).toLocaleDateString()}</td>
              <td>
                <button class="btn-sm" onclick={() => toggleApproval(cr)}>
                  {cr.approved ? 'Revoke' : 'Approve'}
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>

{:else}
  <section class="section">
    <p class="info">Student accounts are device-bound. Teachers can create them in bulk (no ID required). Students can transfer to a new phone using a one-time code.</p>

    <div class="panel">
      <h3>Bulk Create Students</h3>
      <p class="muted">Enter one name per line. All students will receive the same optional PIN.</p>
      <textarea bind:value={bulkNames} rows="5" placeholder={"Alice\nBob\nCharlie"}></textarea>
      <div class="row">
        <label class="inline-label">
          <span>Optional PIN:</span>
          <input type="text" bind:value={bulkPin} maxlength="6" placeholder="e.g. 1234" class="pin-input" />
        </label>
        <button class="btn primary" onclick={bulkCreate} disabled={bulkLoading}>
          {bulkLoading ? 'Creating...' : 'Create Students'}
        </button>
      </div>
      {#if bulkResult}
        <div class="success">
          Created {bulkResult.count} student accounts.
          <table class="compact">
            <thead><tr><th>Name</th><th>Pseudo ID</th></tr></thead>
            <tbody>
              {#each bulkResult.students as s}
                <tr><td>{s.displayName}</td><td class="mono">{s.pseudoId}</td></tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>

    {#if students.length === 0}
      <p class="muted">No student accounts yet.</p>
    {:else}
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Pseudo ID</th>
            <th>PIN</th>
            <th>Active</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each students as s}
            <tr class:inactive={!s.active}>
              {#if editingStudent === s.pseudoId}
                <td><input type="text" bind:value={editName} class="edit-input" /></td>
                <td class="mono">{s.pseudoId}</td>
                <td><input type="password" bind:value={editPin} maxlength="6" class="pin-input" placeholder="unchanged" autocomplete="new-password" /></td>
                <td>{s.active ? 'Yes' : 'No'}</td>
                <td class="muted">{new Date(s.createdAt).toLocaleDateString()}</td>
                <td>
                  <button class="btn-sm" onclick={() => saveEdit(s.pseudoId)}>Save</button>
                  <button class="btn-sm" onclick={() => editingStudent = null}>Cancel</button>
                </td>
              {:else}
                <td>{s.displayName || '(unnamed)'}</td>
                <td class="mono">{s.pseudoId}</td>
                <td>{s.hasPin ? '****' : 'none'}</td>
                <td>{s.active ? 'Yes' : 'No'}</td>
                <td class="muted">{new Date(s.createdAt).toLocaleDateString()}</td>
                <td class="action-cell">
                  <button class="btn-sm" onclick={() => startEdit(s)}>Edit</button>
                  <button class="btn-sm" onclick={() => toggleStudentActive(s)}>
                    {s.active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button class="btn-sm transfer" onclick={() => generateTransfer(s.pseudoId)}>Transfer</button>
                </td>
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}

    {#if transferResult}
      <div class="transfer-panel">
        <h3>Transfer Code for {transferTarget}</h3>
        <p class="transfer-code">{transferResult.token}</p>
        <p class="muted">Give this code to the student. They enter it on their new device at <a href="/student/transfer">/student/transfer</a>. The code expires {new Date(transferResult.expiresAt).toLocaleString()} and can only be used once.</p>
        <button class="btn-sm" onclick={() => transferResult = null}>Close</button>
      </div>
    {/if}
  </section>
{/if}

<style>
  h1 { margin-bottom: 0.5rem; }
  .tabs {
    display: flex;
    gap: 0;
    border-bottom: 2px solid var(--border, #333);
    margin-bottom: 1.5rem;
  }
  .tabs button {
    padding: 0.6rem 1.25rem;
    background: none;
    border: none;
    color: var(--text-muted, #888);
    cursor: pointer;
    border-bottom: 2px solid transparent;
    margin-bottom: -2px;
    font-size: 0.95rem;
  }
  .tabs button.active {
    color: var(--accent, #4fc3f7);
    border-bottom-color: var(--accent, #4fc3f7);
    font-weight: 600;
  }
  .section { margin-bottom: 2rem; }
  .info {
    color: var(--text-muted, #aaa);
    font-size: 0.85rem;
    margin-bottom: 1rem;
    line-height: 1.5;
  }
  .muted { color: var(--text-muted, #888); font-size: 0.85rem; }
  .mono { font-family: monospace; font-size: 0.85rem; }
  .error {
    background: #331111;
    color: #ff5252;
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    font-size: 0.85rem;
  }
  .error button { background: none; border: none; color: #ff8a80; cursor: pointer; text-decoration: underline; margin-left: 0.5rem; }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }
  th, td {
    text-align: left;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--border, #333);
  }
  th { color: var(--text-muted, #aaa); font-weight: 600; font-size: 0.8rem; text-transform: uppercase; }
  tr.inactive { opacity: 0.5; }
  .badge {
    display: inline-block;
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
  }
  .badge.approved { background: #2e7d32; color: #fff; }
  .badge.pending { background: #e65100; color: #fff; }
  .btn-sm {
    padding: 0.25rem 0.6rem;
    background: var(--surface, #2a2a2a);
    border: 1px solid var(--border, #444);
    border-radius: 4px;
    color: var(--text, #eee);
    font-size: 0.8rem;
    cursor: pointer;
  }
  .btn-sm:hover { border-color: var(--accent, #4fc3f7); }
  .btn-sm.transfer { border-color: #66bb6a; color: #66bb6a; }
  .btn {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.9rem;
  }
  .btn.primary { background: var(--accent, #4fc3f7); color: #000; font-weight: 600; }
  .btn.primary:disabled { opacity: 0.5; cursor: wait; }
  .panel {
    background: var(--surface, #1e1e1e);
    border: 1px solid var(--border, #333);
    border-radius: 8px;
    padding: 1.25rem;
    margin-bottom: 1.5rem;
  }
  .panel h3 { margin: 0 0 0.5rem; font-size: 1rem; }
  textarea {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid var(--border, #444);
    border-radius: 6px;
    background: var(--bg, #121212);
    color: var(--text, #eee);
    font-family: monospace;
    font-size: 0.9rem;
    resize: vertical;
    margin-bottom: 0.75rem;
  }
  .row {
    display: flex;
    gap: 1rem;
    align-items: center;
    flex-wrap: wrap;
  }
  .inline-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    color: var(--text-muted, #aaa);
  }
  .pin-input { width: 80px; padding: 0.35rem 0.5rem; border: 1px solid var(--border, #444); border-radius: 4px; background: var(--bg, #121212); color: var(--text, #eee); font-family: monospace; }
  .edit-input { width: 120px; padding: 0.3rem 0.5rem; border: 1px solid var(--accent, #4fc3f7); border-radius: 4px; background: var(--bg, #121212); color: var(--text, #eee); }
  .success {
    background: #1b3a1b;
    border: 1px solid #2e7d32;
    border-radius: 6px;
    padding: 0.75rem;
    margin-top: 0.75rem;
    font-size: 0.85rem;
    color: #a5d6a7;
  }
  .compact { margin-top: 0.5rem; }
  .compact th, .compact td { padding: 0.25rem 0.5rem; font-size: 0.8rem; }
  .transfer-panel {
    background: var(--surface, #1e1e1e);
    border: 2px solid #66bb6a;
    border-radius: 8px;
    padding: 1.25rem;
    margin-top: 1rem;
  }
  .transfer-panel h3 { margin: 0 0 0.5rem; color: #66bb6a; }
  .transfer-code {
    font-family: monospace;
    font-size: 2rem;
    font-weight: bold;
    letter-spacing: 0.3em;
    color: #66bb6a;
    text-align: center;
    padding: 0.75rem;
    background: #0a1a0a;
    border-radius: 6px;
    margin: 0.5rem 0;
  }
  .action-cell { white-space: nowrap; }
  .action-cell button { margin-right: 0.25rem; }
</style>
