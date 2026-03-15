/**
 * Student Groups page - create groups, add students, assign lessons
 * Ported from Svelte (T2b)
 */
import { getHubUrl, createHubApi } from '../api.js';
import { navigateTo } from '../router.js';

function escapeHtml(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

export function renderGroups(main) {
  const baseUrl = getHubUrl();
  if (!baseUrl) {
    main.innerHTML = `
      <div class="top-page card warning-box">
        <h1>Student Groups</h1>
        <p>Configure hub URL in <a href="#/settings">Settings</a> to manage groups. The roster comes from the hub's mastery data.</p>
      </div>
    `;
    return;
  }

  const api = createHubApi(baseUrl);
  let state = {
    groups: [],
    roster: [],
    loading: true,
    error: '',
    success: '',
    showCreateForm: false,
    newGroupName: '',
    selectedStudentIds: [],
    creating: false,
    editingGroup: null,
    editSelectedIds: [],
    saving: false
  };

  async function load() {
    state.loading = true;
    state.error = '';
    try {
      const [groupsRes, thetaRes] = await Promise.all([
        api.getGroups(),
        api.getPathfinderAll()
      ]);
      state.groups = groupsRes.groups || [];
      state.roster = Object.keys(thetaRes.students || {});
      state.loading = false;
      render();
    } catch (e) {
      state.error = e instanceof Error ? e.message : String(e);
      state.loading = false;
      render();
    }
  }

  function openCreateForm() {
    state.showCreateForm = true;
    state.newGroupName = '';
    state.selectedStudentIds = [];
    state.success = '';
    render();
  }

  function closeCreateForm() {
    state.showCreateForm = false;
    render();
  }

  function toggleStudent(id) {
    if (state.selectedStudentIds.includes(id)) {
      state.selectedStudentIds = state.selectedStudentIds.filter(s => s !== id);
    } else {
      state.selectedStudentIds = [...state.selectedStudentIds, id];
    }
    render();
  }

  async function createGroup() {
    const name = state.newGroupName.trim();
    if (!name) {
      state.error = 'Enter a group name.';
      render();
      return;
    }
    state.creating = true;
    state.error = '';
    render();
    try {
      await api.postGroup({ name, studentIds: state.selectedStudentIds });
      state.success = `Created "${name}".`;
      closeCreateForm();
      await load();
    } catch (e) {
      state.error = e instanceof Error ? e.message : String(e);
    }
    state.creating = false;
    render();
  }

  function openEdit(g) {
    state.editingGroup = g;
    state.editSelectedIds = [...(g.studentIds || [])];
    state.success = '';
    render();
  }

  function closeEdit() {
    state.editingGroup = null;
    render();
  }

  function toggleEditStudent(id) {
    if (state.editSelectedIds.includes(id)) {
      state.editSelectedIds = state.editSelectedIds.filter(s => s !== id);
    } else {
      state.editSelectedIds = [...state.editSelectedIds, id];
    }
    render();
  }

  async function saveGroup() {
    if (!state.editingGroup) return;
    state.saving = true;
    state.error = '';
    render();
    try {
      await api.putGroup({ id: state.editingGroup.id, studentIds: state.editSelectedIds });
      state.success = `Updated "${state.editingGroup.name}".`;
      closeEdit();
      await load();
    } catch (e) {
      state.error = e instanceof Error ? e.message : String(e);
    }
    state.saving = false;
    render();
  }

  function render() {
    const s = state;
    let html = `
      <div class="top-page">
        <h1>Student Groups</h1>
        <p class="subtitle">Create groups and assign students from the hub roster. Use for reading groups, lab pairs, etc.</p>
    `;

    if (s.loading) {
      html += '<p>Loading…</p></div>';
      main.innerHTML = html;
      return;
    }

    if (s.error) {
      html += `<div class="card error-box">${escapeHtml(s.error)}</div>`;
    }
    if (s.success) {
      html += `<div class="card success-box">${escapeHtml(s.success)}</div>`;
    }

    html += `
      <div class="card">
        <div class="actions-row">
          <button type="button" class="btn btn-primary" id="groups-create-btn" ${s.showCreateForm ? 'disabled' : ''}>+ Create group</button>
        </div>
    `;

    if (s.showCreateForm) {
      html += `
        <div class="create-form">
          <h2>New group</h2>
          <label>Name <input type="text" id="new-group-name" value="${escapeHtml(s.newGroupName)}" placeholder="e.g. Reading Group A" /></label>
          <h3>Add students from roster</h3>
          <div class="roster-checkboxes">
            ${s.roster.length === 0
              ? '<p class="hint">No students in roster. Ensure mastery data exists on the hub.</p>'
              : s.roster.map(pseudoId => `
                <label class="checkbox-row">
                  <input type="checkbox" ${s.selectedStudentIds.includes(pseudoId) ? 'checked' : ''} data-student="${escapeHtml(pseudoId)}" class="create-student-cb" />
                  ${escapeHtml(pseudoId)}
                </label>
              `).join('')}
          </div>
          <div class="form-actions">
            <button type="button" class="btn" id="groups-create-cancel">Cancel</button>
            <button type="button" class="btn btn-primary" id="groups-create-submit" ${s.creating || !s.newGroupName.trim() ? 'disabled' : ''}>
              ${s.creating ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      `;
    }

    html += `
      </div>
      <div class="card">
        <h2>Groups (${s.groups.length})</h2>
    `;

    if (s.groups.length === 0) {
      html += '<p class="empty">No groups yet. Create one above.</p>';
    } else {
      html += `
        <ul class="group-list">
          ${s.groups.map(g => `
            <li>
              <strong>${escapeHtml(g.name)}</strong> — ${(g.studentIds || []).length} student(s)
              ${(g.studentIds || []).length ? `<span class="ids">${escapeHtml((g.studentIds || []).join(', '))}</span>` : ''}
              <button type="button" class="btn btn-sm" data-edit-id="${escapeHtml(g.id)}">Edit</button>
              ${(g.studentIds || []).length
                ? `<a href="#/groups/${encodeURIComponent(g.id)}/assign" class="btn btn-sm btn-accent">Assign lesson</a>`
                : '<span class="btn btn-sm btn-accent disabled">Assign lesson</span>'}
            </li>
          `).join('')}
        </ul>
      `;
    }

    html += '</div>';

    if (s.editingGroup) {
      const g = s.editingGroup;
      html += `
        <div class="modal-overlay" id="edit-modal-overlay" role="dialog">
          <div class="modal-content">
            <h2>Edit "${escapeHtml(g.name)}"</h2>
            <p class="hint">Add or remove students from the roster.</p>
            <div class="roster-checkboxes">
              ${s.roster.map(pseudoId => `
                <label class="checkbox-row">
                  <input type="checkbox" ${s.editSelectedIds.includes(pseudoId) ? 'checked' : ''} data-edit-student="${escapeHtml(pseudoId)}" class="edit-student-cb" />
                  ${escapeHtml(pseudoId)}
                </label>
              `).join('')}
            </div>
            <div class="form-actions">
              <button type="button" class="btn" id="groups-edit-cancel">Cancel</button>
              <button type="button" class="btn btn-primary" id="groups-edit-save" ${s.saving ? 'disabled' : ''}>${s.saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      `;
    }

    html += '</div>';
    main.innerHTML = html;

    // Event bindings
    main.querySelector('#groups-create-btn')?.addEventListener('click', openCreateForm);
    main.querySelector('#groups-create-cancel')?.addEventListener('click', closeCreateForm);
    main.querySelector('#groups-create-submit')?.addEventListener('click', createGroup);
    main.querySelector('#new-group-name')?.addEventListener('input', (e) => {
      state.newGroupName = e.target.value;
      const btn = main.querySelector('#groups-create-submit');
      if (btn) btn.disabled = state.creating || !state.newGroupName.trim();
    });

    main.querySelectorAll('.create-student-cb').forEach(cb => {
      cb.addEventListener('change', () => toggleStudent(cb.dataset.student));
    });

    main.querySelectorAll('[data-edit-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const g = state.groups.find(x => x.id === btn.dataset.editId);
        if (g) openEdit(g);
      });
    });

    main.querySelectorAll('.edit-student-cb').forEach(cb => {
      cb.addEventListener('change', () => toggleEditStudent(cb.dataset.editStudent));
    });

    main.querySelector('#groups-edit-cancel')?.addEventListener('click', closeEdit);
    main.querySelector('#groups-edit-save')?.addEventListener('click', saveGroup);

    main.querySelector('#edit-modal-overlay')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeEdit();
    });
  }

  load();
}

export function renderGroupsAssign(main, ctx) {
  const groupId = ctx.id;
  const baseUrl = getHubUrl();

  if (!baseUrl || !groupId) {
    main.innerHTML = `
      <div class="top-page card warning-box">
        <p>Configure hub URL in <a href="#/settings">Settings</a>.</p>
        <p><a href="#/groups">← Back to Groups</a></p>
      </div>
    `;
    return;
  }

  const api = createHubApi(baseUrl);
  let state = {
    group: null,
    lessons: [],
    selectedLessonId: '',
    loading: true,
    assigning: false,
    error: '',
    success: ''
  };

  async function load() {
    state.loading = true;
    state.error = '';
    main.innerHTML = '<div class="top-page"><p>Loading…</p></div>';

    try {
      const [groupsRes, thetaRes] = await Promise.all([api.getGroups(), api.getPathfinderAll()]);
      const found = (groupsRes.groups || []).find(g => g.id === groupId);
      if (!found) {
        state.error = 'Group not found.';
        state.loading = false;
        render();
        return;
      }
      state.group = found;
      const studentIds = found.studentIds || [];
      if (studentIds.length === 0) {
        state.error = 'Group has no students. Add students on the Groups page first.';
        state.loading = false;
        render();
        return;
      }
      const studentsTheta = thetaRes.students || {};
      const firstStudentLessons = studentsTheta[studentIds[0]] || [];
      state.lessons = firstStudentLessons;
      state.selectedLessonId = state.lessons[0]?.lessonId || '';
      state.loading = false;
      render();
    } catch (e) {
      state.error = e instanceof Error ? e.message : String(e);
      state.loading = false;
      render();
    }
  }

  async function assign() {
    if (!state.group || !state.selectedLessonId) return;
    state.assigning = true;
    state.error = '';
    render();
    try {
      const res = await api.assignGroupLesson(state.group.id, state.selectedLessonId);
      state.success =
        `Assigned to ${res.assigned} student(s).` +
        (res.skipped ? ` (${res.skipped} skipped: lesson not eligible for them)` : '');
      setTimeout(() => navigateTo('#/groups'), 2000);
    } catch (e) {
      state.error = e instanceof Error ? e.message : String(e);
    }
    state.assigning = false;
    render();
  }

  function render() {
    const s = state;
    if (s.loading) return;

    let html = `
      <div class="top-page">
        <nav class="breadcrumb">
          <a href="#/groups">Groups</a> → Assign lesson
        </nav>
        <h1>Assign lesson to group</h1>
    `;

    if (s.error) {
      html += `
        <div class="card error-box">
          <p>${escapeHtml(s.error)}</p>
          <a href="#/groups">← Back to Groups</a>
        </div>
      `;
      main.innerHTML = html + '</div>';
      return;
    }

    if (s.group) {
      html += `
        <div class="card wizard">
          <h2>${escapeHtml(s.group.name)}</h2>
          <p class="meta">${(s.group.studentIds || []).length} student(s): ${escapeHtml((s.group.studentIds || []).join(', ') || '—')}</p>
          <p class="hint">Select a lesson to assign. The recommendation override will be set for all group members for whom this lesson is theta-eligible.</p>
          <label class="block">
            Lesson
            <select id="assign-lesson-select">
              ${s.lessons.map(l => `<option value="${escapeHtml(l.lessonId)}" ${l.lessonId === s.selectedLessonId ? 'selected' : ''}>${escapeHtml(l.title || l.slug || l.lessonId)} (${escapeHtml(l.slug || '')}) · θ=${l.theta != null ? l.theta : '?'}</option>`).join('')}
            </select>
          </label>
      `;

      if (s.success) {
        html += `
          <p class="success-msg">${escapeHtml(s.success)}</p>
          <p class="hint">Redirecting to Groups…</p>
        `;
      } else {
        html += `
          <div class="form-actions">
            <a href="#/groups" class="btn">Cancel</a>
            <button type="button" class="btn btn-primary" id="assign-submit" ${s.assigning || !s.selectedLessonId ? 'disabled' : ''}>
              ${s.assigning ? 'Assigning…' : 'Assign lesson'}
            </button>
          </div>
        `;
      }
      html += '</div>';
    }

    main.innerHTML = html + '</div>';

    const select = main.querySelector('#assign-lesson-select');
    if (select) {
      select.addEventListener('change', () => {
        state.selectedLessonId = select.value;
      });
    }
    main.querySelector('#assign-submit')?.addEventListener('click', assign);
  }

  load();
}
