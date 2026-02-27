<script>
  import { hubApiStore } from '$lib/api';
  import { goto } from '$app/navigation';
  import { onMount, onDestroy } from 'svelte';
  import StepEditor from './StepEditor.svelte';
  import PreviewPanel from './PreviewPanel.svelte';
  import GateEditor from './GateEditor.svelte';
  import OntologyEditor from './OntologyEditor.svelte';
  import ForkEditor from './ForkEditor.svelte';

  let { mode = 'new', slug = null } = $props();

  const api = $derived($hubApiStore);

  const TEACHING_MODES = ['socratic', 'didactic', 'guided_discovery', 'narrative', 'constructivist', 'direct'];
  const LANGUAGES = ['en', 'fr', 'es', 'pt', 'sw', 'ar', 'zh', 'hi'];
  const EDUCATIONAL_ROLES = ['student', 'teacher', 'parent'];
  const DURATION_PRESETS = [
    { label: '5 min', value: 'PT5M' },
    { label: '10 min', value: 'PT10M' },
    { label: '15 min', value: 'PT15M' },
    { label: '20 min', value: 'PT20M' },
    { label: '30 min', value: 'PT30M' },
    { label: '45 min', value: 'PT45M' },
    { label: '1 hour', value: 'PT1H' },
  ];
  const ISO_DURATION_RE = /^P(?!$)(T(?=\d)(\d+H)?(\d+M)?(\d+S)?)?$/;

  let utuConstants = $state({});
  let loading = $state(true);
  let saving = $state(false);
  let validating = $state(false);
  let error = $state('');
  let success = $state('');
  let validationErrors = $state([]);
  let validationWarnings = $state([]);
  let previewing = $state(false);
  let previewIr = $state(null);
  let previewSidecar = $state(null);
  let previewError = $state('');
  let showPreview = $state(false);
  let savedLessons = $state([]);
  let lastSavedAt = $state('');
  let dirty = $state(false);
  let draftRestored = $state(false);
  let durationError = $state('');

  let lesson = $state({
    identifier: '',
    title: '',
    description: '',
    language: 'en',
    difficulty: 3,
    subject: '',
    tags: '',
    audience_role: '',
    audience_age: '',
    time_required: '',
    license: 'CC-BY-SA-4.0',
    authors: '',
    teaching_mode: '',
    utu: { class: '', band: 1, protocol: null },
    ontology: { requires: [], provides: [] },
    gate: null,
    fork: null,
    steps: []
  });

  const spineIds = $derived((utuConstants.spineIds || []).length
    ? utuConstants.spineIds
    : ['MAC-1','MAC-2','MAC-3','MAC-4','MAC-5','MAC-6','MAC-7','MAC-8',
       'SCI-1','SCI-2','SCI-3','SCI-4','SCI-5','SCI-6','SCI-7',
       'SOC-1','SOC-2','SOC-3','SOC-4','SOC-5','SOC-6','SOC-7']);

  const protocols = $derived((utuConstants.protocols || []).length
    ? utuConstants.protocols
    : [
        { id: 1, name: 'Transmission', short: 'P1' },
        { id: 2, name: 'Guided Construction', short: 'P2' },
        { id: 3, name: 'Apprenticeship', short: 'P3' },
        { id: 4, name: 'Dev. Sequencing', short: 'P4' },
        { id: 5, name: 'Meaning Activation', short: 'P5' }
      ]);

  const bands = $derived((utuConstants.bands || []).length
    ? utuConstants.bands
    : [
        { id: 1, phase: 'Embodied/Representational' },
        { id: 2, phase: 'Embodied/Representational' },
        { id: 3, phase: 'Operational/Structural' },
        { id: 4, phase: 'Operational/Structural' },
        { id: 5, phase: 'Hypothetical/Formal' },
        { id: 6, phase: 'Hypothetical/Formal' }
      ]);

  // ─── Draft persistence (#5) ─────────────────────────────────────────────────

  const draftKey = $derived(`agni_draft_${mode === 'edit' && slug ? slug : 'new'}`);

  let draftTimer = null;

  function saveDraft() {
    if (draftTimer) clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      try { localStorage.setItem(draftKey, JSON.stringify(lesson)); } catch {}
    }, 2000);
  }

  function clearDraft() {
    try { localStorage.removeItem(draftKey); } catch {}
  }

  function loadDraft() {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) return JSON.parse(raw);
    } catch {}
    return null;
  }

  function dismissDraft() {
    draftRestored = false;
    clearDraft();
  }

  // ─── Change tracking (#4) ──────────────────────────────────────────────────

  let autoValidateTimer = null;

  function markDirty() {
    dirty = true;
    saveDraft();
    debouncedValidate();
  }

  function debouncedValidate() {
    if (autoValidateTimer) clearTimeout(autoValidateTimer);
    autoValidateTimer = setTimeout(() => { validate(); }, 800);
  }

  function onStepsChange() { markDirty(); }
  function onGateChange() { markDirty(); }
  function onOntologyChange() { markDirty(); }
  function onForkChange() { markDirty(); }

  // ─── Unsaved-changes guard (#4) ────────────────────────────────────────────

  function handleBeforeUnload(e) {
    if (dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  }

  // ─── Keyboard shortcuts (#9) ───────────────────────────────────────────────

  function handleKeydown(e) {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key === 's') {
      e.preventDefault();
      if (!saving && lesson.title.trim()) save();
    }
    if (mod && e.shiftKey && (e.key === 'v' || e.key === 'V')) {
      e.preventDefault();
      if (!validating && lesson.title.trim()) validate();
    }
    if (mod && e.shiftKey && (e.key === 'p' || e.key === 'P')) {
      e.preventDefault();
      if (!previewing && lesson.title.trim()) preview();
    }
  }

  // ─── Time-required validation (#3) ─────────────────────────────────────────

  function validateDuration(val) {
    if (!val) { durationError = ''; return; }
    if (ISO_DURATION_RE.test(val)) { durationError = ''; return; }
    durationError = 'Must be ISO 8601 duration (e.g. PT30M, PT1H, PT5M30S)';
  }

  // ─── Populate from loaded data ─────────────────────────────────────────────

  function populateFromData(d) {
    lesson.identifier = d.identifier || d.slug || slug || '';
    lesson.title = d.title || '';
    lesson.description = d.description || '';
    lesson.language = d.language || 'en';
    lesson.difficulty = d.difficulty || 3;
    lesson.teaching_mode = d.teaching_mode || '';
    lesson.license = d.license || '';
    lesson.subject = Array.isArray(d.subject) ? d.subject.join(', ') : (d.subject || '');
    lesson.tags = Array.isArray(d.tags) ? d.tags.join(', ') : (d.tags || '');
    lesson.authors = Array.isArray(d.authors)
      ? d.authors.map(a => typeof a === 'object' ? a.name : a).join(', ')
      : (d.authors || '');
    lesson.time_required = d.time_required || '';

    if (d.audience && typeof d.audience === 'object') {
      lesson.audience_role = d.audience.educational_role || '';
      lesson.audience_age = d.audience.typical_age_range || '';
    } else if (typeof d.audience === 'string') {
      lesson.audience_role = '';
      lesson.audience_age = d.audience;
    }

    if (d.utu && typeof d.utu === 'object') {
      lesson.utu = {
        class: d.utu.class || d.utu.spineId || '',
        band: d.utu.band || 1,
        protocol: d.utu.protocol || null
      };
    }
    if (Array.isArray(d.steps)) {
      lesson.steps = d.steps;
    }
    if (d.gate && typeof d.gate === 'object') {
      lesson.gate = d.gate;
    }
    if (d.ontology && typeof d.ontology === 'object') {
      lesson.ontology = {
        requires: d.ontology.requires || [],
        provides: d.ontology.provides || []
      };
    }
    if (d.fork && typeof d.fork === 'object') {
      lesson.fork = d.fork;
    }
  }

  // ─── Build payload (schema-correct) ────────────────────────────────────────

  function cleanStep(s) {
    const out = { id: s.id, type: s.type };
    if (s.content) out.content = s.content;
    if (s.type === 'hardware_trigger') {
      if (s.sensor) out.sensor = s.sensor;
      if (s.threshold) out.threshold = s.threshold;
    }
    if (s.type === 'quiz') {
      if (s.answer_options?.length) out.answer_options = s.answer_options;
      if (s.correct_index != null) out.correct_index = s.correct_index;
    }
    if (s.feedback) out.feedback = s.feedback;
    if (s.max_attempts) out.max_attempts = s.max_attempts;
    if (s.weight != null) out.weight = s.weight;
    if (s.expected_duration) out.expected_duration = s.expected_duration;
    if (s.on_fail) out.on_fail = s.on_fail;
    if (s.on_success) out.on_success = s.on_success;
    if (s.condition) out.condition = s.condition;
    if (s.next_if) out.next_if = s.next_if;
    return out;
  }

  function buildPayload() {
    const cleanedSteps = lesson.steps.map(cleanStep);
    const out = {
      identifier: lesson.identifier.trim() || (mode === 'edit' ? slug : undefined),
      title: lesson.title.trim(),
      description: lesson.description.trim() || undefined,
      language: lesson.language,
      difficulty: lesson.difficulty,
      license: lesson.license || undefined,
      subject: lesson.subject ? lesson.subject.split(',').map(s => s.trim()).filter(Boolean) : undefined,
      tags: lesson.tags ? lesson.tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
      authors: lesson.authors ? lesson.authors.split(',').map(a => a.trim()).filter(Boolean) : undefined,
      teaching_mode: lesson.teaching_mode || undefined,
      time_required: lesson.time_required.trim() || undefined,
      steps: cleanedSteps.length ? cleanedSteps : [{ id: 'step_1', type: 'instruction', content: 'Hello, world.' }]
    };

    if (mode === 'edit' && slug) {
      out.slug = slug;
    }

    // Audience as object (#3)
    if (lesson.audience_role || lesson.audience_age) {
      out.audience = {};
      if (lesson.audience_role) out.audience.educational_role = lesson.audience_role;
      if (lesson.audience_age) out.audience.typical_age_range = lesson.audience_age;
    }

    // UTU with protocol (#2)
    if (lesson.utu.class) {
      out.utu = { class: lesson.utu.class, band: lesson.utu.band || 1 };
      if (lesson.utu.protocol) out.utu.protocol = lesson.utu.protocol;
    }

    // Gate
    if (lesson.gate) {
      const g = { type: lesson.gate.type };
      if (lesson.gate.skill_target) g.skill_target = lesson.gate.skill_target;
      if (lesson.gate.question) g.question = lesson.gate.question;
      if (lesson.gate.expected_answer) g.expected_answer = lesson.gate.expected_answer;
      if (lesson.gate.on_fail) g.on_fail = lesson.gate.on_fail;
      if (lesson.gate.passing_score != null) g.passing_score = lesson.gate.passing_score;
      if (lesson.gate.retry_delay) g.retry_delay = lesson.gate.retry_delay;
      out.gate = g;
    }

    // Ontology
    const ont = lesson.ontology;
    if (ont.requires.length || ont.provides.length) {
      out.ontology = {
        requires: ont.requires.filter(n => n.skill).map(n => ({ skill: n.skill, level: n.level || 1 })),
        provides: ont.provides.filter(n => n.skill).map(n => ({ skill: n.skill, level: n.level || 1 }))
      };
    }

    // Fork provenance (#8)
    if (lesson.fork) {
      const f = {};
      if (lesson.fork.source_identifier) f.source_identifier = lesson.fork.source_identifier;
      if (lesson.fork.source_version) f.source_version = lesson.fork.source_version;
      if (lesson.fork.source_hash) f.source_hash = lesson.fork.source_hash;
      if (lesson.fork.fork_type) f.fork_type = lesson.fork.fork_type;
      if (lesson.fork.changes) f.changes = lesson.fork.changes;
      if (f.source_identifier && f.source_version) out.fork = f;
    }

    return out;
  }

  // ─── API actions ───────────────────────────────────────────────────────────

  async function validate() {
    if (!api.baseUrl) { error = 'Hub not connected.'; return; }
    validating = true;
    error = '';
    validationErrors = [];
    validationWarnings = [];
    try {
      const payload = buildPayload();
      const data = await api.postAuthorValidate(payload);
      validationErrors = data.errors || [];
      validationWarnings = data.warnings || [];
      if (data.valid) success = 'Validation passed.';
      else error = 'Validation failed.';
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    validating = false;
  }

  async function preview() {
    if (!api.baseUrl) { error = 'Hub not connected.'; return; }
    previewing = true;
    previewError = '';
    previewIr = null;
    previewSidecar = null;
    showPreview = true;
    try {
      const payload = buildPayload();
      const res = await api.postAuthorPreview(payload);
      previewIr = res.ir;
      previewSidecar = res.sidecar;
    } catch (e) {
      previewError = e instanceof Error ? e.message : String(e);
    }
    previewing = false;
  }

  async function save() {
    if (!api.baseUrl) { error = 'Hub not connected.'; return; }
    saving = true;
    error = '';
    success = '';
    try {
      const payload = buildPayload();
      const res = await api.postAuthorSave(payload);
      const time = new Date().toLocaleTimeString();
      lastSavedAt = time;
      success = `Saved as "${res.slug}" at ${time}.`;
      if (res.warnings?.length) validationWarnings = res.warnings;
      dirty = false;
      clearDraft();
      if (mode === 'new') {
        setTimeout(() => goto(`/author/${encodeURIComponent(res.slug)}/edit`), 1200);
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    saving = false;
  }

  // ─── Load ──────────────────────────────────────────────────────────────────

  onMount(async () => {
    if (!api.baseUrl) { loading = false; return; }

    try { utuConstants = await api.getUtuConstants(); } catch {}

    if (mode === 'new') {
      try {
        const res = await api.getLessons();
        savedLessons = res.savedSlugs || [];
      } catch {}

      const draft = loadDraft();
      if (draft && draft.title) {
        populateFromData(draft);
        draftRestored = true;
      }
    }

    if (mode === 'edit' && slug) {
      const draft = loadDraft();
      if (draft && draft.title) {
        populateFromData(draft);
        draftRestored = true;
      } else {
        try {
          try {
            const res = await api.getAuthorLesson(slug);
            populateFromData(res.lessonData);
          } catch {
            const sidecar = await api.getLessonSidecar(slug);
            populateFromData(sidecar);
          }
        } catch (e) {
          error = e instanceof Error ? e.message : String(e);
        }
      }
    }

    loading = false;
  });

  onDestroy(() => {
    if (draftTimer) clearTimeout(draftTimer);
    if (autoValidateTimer) clearTimeout(autoValidateTimer);
  });
</script>

<svelte:window onbeforeunload={handleBeforeUnload} onkeydown={handleKeydown} />

{#if loading}
  <p>Loading…</p>
{:else}
  {#if draftRestored}
    <div class="card draft-box">
      Recovered unsaved draft.
      <button class="link-btn" onclick={dismissDraft}>Discard draft and reload</button>
    </div>
  {/if}

  {#if error}
    <div class="card error-box">{error}</div>
  {/if}
  {#if success}
    <div class="card success-box">{success}</div>
  {/if}

  {#if mode === 'new' && savedLessons.length > 0}
    <details class="load-existing">
      <summary>Edit an existing lesson ({savedLessons.length} saved)</summary>
      <div class="slug-list">
        {#each savedLessons as s}
          <a href="/author/{encodeURIComponent(s)}/edit" class="slug-link">{s}</a>
        {/each}
      </div>
    </details>
  {/if}

  <div class="card wizard">
    <h2>Identity</h2>
    <div class="form-group">
      <label>Identifier <input type="text" bind:value={lesson.identifier} oninput={markDirty} placeholder="e.g. gravity_v1" /></label>
    </div>
    <div class="form-group">
      <label>Title <input type="text" bind:value={lesson.title} oninput={markDirty} placeholder="e.g. Gravity: Why Things Fall" /></label>
    </div>
    <div class="form-group">
      <label>Description <textarea bind:value={lesson.description} oninput={markDirty} rows="2" placeholder="Short description of the lesson"></textarea></label>
    </div>

    <h2>Classification</h2>
    <div class="row">
      <div class="form-group">
        <label>Language
          <select bind:value={lesson.language} onchange={markDirty}>
            {#each LANGUAGES as lang}
              <option value={lang}>{lang}</option>
            {/each}
          </select>
        </label>
      </div>
      <div class="form-group">
        <label>Difficulty (1–5)
          <input type="number" bind:value={lesson.difficulty} min="1" max="5" oninput={markDirty} />
        </label>
      </div>
      <div class="form-group">
        <label>Teaching mode
          <select bind:value={lesson.teaching_mode} onchange={markDirty}>
            <option value="">— none —</option>
            {#each TEACHING_MODES as m}
              <option value={m}>{m}</option>
            {/each}
          </select>
        </label>
      </div>
    </div>

    <div class="row">
      <div class="form-group">
        <label>Subject (comma-separated) <input type="text" bind:value={lesson.subject} oninput={markDirty} placeholder="e.g. Physics, Classical Mechanics" /></label>
      </div>
      <div class="form-group">
        <label>Time required
          <div class="duration-row">
            <input type="text" bind:value={lesson.time_required}
                   oninput={(e) => { markDirty(); validateDuration(e.target.value); }}
                   placeholder="e.g. PT30M"
                   class:input-error={durationError} />
            <select onchange={(e) => { if (e.target.value) { lesson.time_required = e.target.value; markDirty(); validateDuration(e.target.value); } e.target.value = ''; }}>
              <option value="">Presets…</option>
              {#each DURATION_PRESETS as p}
                <option value={p.value}>{p.label} ({p.value})</option>
              {/each}
            </select>
          </div>
          {#if durationError}
            <span class="field-error">{durationError}</span>
          {/if}
        </label>
      </div>
    </div>

    <div class="row">
      <div class="form-group">
        <label>Audience role
          <select bind:value={lesson.audience_role} onchange={markDirty}>
            <option value="">— none —</option>
            {#each EDUCATIONAL_ROLES as r}
              <option value={r}>{r}</option>
            {/each}
          </select>
        </label>
      </div>
      <div class="form-group">
        <label>Typical age range <input type="text" bind:value={lesson.audience_age} oninput={markDirty} placeholder="e.g. 10-14" /></label>
      </div>
    </div>

    <div class="form-group">
      <label>Tags (comma-separated) <input type="text" bind:value={lesson.tags} oninput={markDirty} placeholder="e.g. gravity, forces, motion" /></label>
    </div>
    <div class="form-group">
      <label>Authors (comma-separated) <input type="text" bind:value={lesson.authors} oninput={markDirty} placeholder="e.g. Jane Doe, John Smith" /></label>
    </div>
    <div class="form-group">
      <label>License <input type="text" bind:value={lesson.license} oninput={markDirty} placeholder="e.g. CC-BY-SA-4.0" /></label>
    </div>

    <h2>UTU Coordinates</h2>
    <div class="row">
      <div class="form-group">
        <label>Spine (class)
          <select bind:value={lesson.utu.class} onchange={markDirty}>
            <option value="">— none —</option>
            {#each spineIds as sid}
              <option value={sid}>{sid}</option>
            {/each}
          </select>
        </label>
      </div>
      <div class="form-group">
        <label>Band
          <select bind:value={lesson.utu.band} onchange={markDirty}>
            {#each bands as b}
              <option value={b.id}>{b.id} — {b.phase}</option>
            {/each}
          </select>
        </label>
      </div>
      <div class="form-group">
        <label>Protocol
          <select bind:value={lesson.utu.protocol} onchange={markDirty}>
            <option value={null}>— none —</option>
            {#each protocols as p}
              <option value={p.id}>P{p.id} — {p.name}</option>
            {/each}
          </select>
        </label>
      </div>
    </div>

    <StepEditor bind:steps={lesson.steps} onchange={onStepsChange} />

    <GateEditor bind:gate={lesson.gate} onchange={onGateChange} />

    <OntologyEditor bind:ontology={lesson.ontology} spineIds={spineIds} onchange={onOntologyChange} />

    <ForkEditor bind:fork={lesson.fork} onchange={onForkChange} />

    {#if validationErrors.length}
      <div class="validation-list errors">
        <strong>Errors:</strong>
        <ul>{#each validationErrors as e}<li>{e}</li>{/each}</ul>
      </div>
    {/if}
    {#if validationWarnings.length}
      <div class="validation-list warnings">
        <strong>Warnings:</strong>
        <ul>{#each validationWarnings as w}<li>{w}</li>{/each}</ul>
      </div>
    {/if}

    <div class="actions">
      <button class="secondary" onclick={validate} disabled={validating || !lesson.title.trim()}>
        {validating ? 'Validating…' : 'Validate'}
      </button>
      <button class="preview-btn" onclick={preview} disabled={previewing || !lesson.title.trim()}>
        {previewing ? 'Compiling…' : 'Preview'}
      </button>
      <button class="primary" onclick={save} disabled={saving || !lesson.title.trim()}>
        {saving ? 'Saving…' : 'Save lesson'}
      </button>
      {#if dirty}
        <span class="dirty-indicator">Unsaved changes</span>
      {/if}
      {#if lastSavedAt}
        <span class="last-saved">Saved {lastSavedAt}</span>
      {/if}
    </div>
    <p class="shortcut-hint">
      <kbd>Ctrl+S</kbd> Save &nbsp; <kbd>Ctrl+Shift+V</kbd> Validate &nbsp; <kbd>Ctrl+Shift+P</kbd> Preview
    </p>

    {#if showPreview}
      <div class="card preview-card">
        <div class="preview-header">
          <h2>Preview</h2>
          <button class="link-btn" onclick={() => showPreview = false}>Close</button>
        </div>
        <PreviewPanel ir={previewIr} sidecar={previewSidecar} loading={previewing} error={previewError} />
      </div>
    {/if}

    {#if !api.baseUrl}
      <p class="hint">Configure hub URL in <a href="/settings">Settings</a> to validate and save.</p>
    {/if}
  </div>
{/if}

<style>
  .wizard h2 { margin-top: 1.5rem; margin-bottom: 0.5rem; }
  .wizard h2:first-child { margin-top: 0; }

  .form-group { margin-bottom: 0.75rem; }
  .form-group label { display: block; font-weight: bold; margin-bottom: 0.25rem; }
  .form-group input,
  .form-group select,
  .form-group textarea {
    width: 100%;
    padding: 0.5rem;
    background: #1f2b4e;
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 1rem;
    font-family: inherit;
  }
  .form-group textarea { resize: vertical; }
  .form-group input[type="number"] { max-width: 100px; }
  .form-group input.input-error { border-color: #ff6b6b; }

  .field-error { color: #ff6b6b; font-size: 0.8rem; display: block; margin-top: 0.15rem; }

  .row { display: flex; gap: 1rem; flex-wrap: wrap; }
  .row .form-group { flex: 1; min-width: 140px; }

  .duration-row { display: flex; gap: 0.5rem; }
  .duration-row input { flex: 1; }
  .duration-row select { width: auto; min-width: 110px; flex-shrink: 0; }

  .hint { font-size: 0.9rem; opacity: 0.8; margin-top: 0.5rem; }

  .validation-list { margin: 1rem 0; padding: 0.75rem; border-radius: 6px; }
  .validation-list ul { margin: 0.5rem 0 0 1.5rem; }
  .validation-list.errors { background: rgba(255,107,107,0.1); color: #ff6b6b; }
  .validation-list.warnings { background: rgba(255,170,0,0.1); color: #ffaa00; }

  .actions { display: flex; gap: 1rem; margin-top: 1.5rem; align-items: center; flex-wrap: wrap; }
  button.primary {
    background: var(--accent); color: #1a1a2e; border: none;
    padding: 0.6rem 1.2rem; border-radius: 6px; cursor: pointer; font-weight: bold;
  }
  button.secondary {
    background: #2a2a4a; color: var(--text); border: 1px solid var(--border);
    padding: 0.6rem 1.2rem; border-radius: 6px; cursor: pointer;
  }
  button:disabled { opacity: 0.5; cursor: not-allowed; }

  button.preview-btn {
    background: #1a3a6a; color: var(--text); border: 1px solid #2563eb;
    padding: 0.6rem 1.2rem; border-radius: 6px; cursor: pointer; font-weight: bold;
  }
  button.preview-btn:hover:not(:disabled) { background: #1e4a8a; }

  .dirty-indicator { font-size: 0.85rem; color: #ffaa00; font-weight: 600; }
  .last-saved { font-size: 0.85rem; color: var(--accent); font-weight: 600; }

  .shortcut-hint {
    font-size: 0.8rem; opacity: 0.5; margin-top: 0.5rem;
  }
  .shortcut-hint kbd {
    background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15);
    border-radius: 3px; padding: 0.1rem 0.35rem; font-size: 0.75rem; font-family: inherit;
  }

  .preview-card { margin-top: 1.5rem; }
  .preview-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
  .preview-header h2 { margin: 0; }
  .link-btn { background: none; border: none; color: var(--accent); cursor: pointer; font-size: 0.9rem; }
  .link-btn:hover { text-decoration: underline; }

  .load-existing { margin-bottom: 1.5rem; }
  .load-existing summary {
    cursor: pointer; color: var(--accent); font-size: 0.95rem; font-weight: 600;
  }
  .slug-list { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.5rem; }
  .slug-link {
    background: rgba(31,43,78,0.7); color: var(--text); border: 1px solid var(--border);
    padding: 0.3rem 0.7rem; border-radius: 5px; text-decoration: none; font-size: 0.9rem;
    font-family: monospace;
  }
  .slug-link:hover { border-color: var(--accent); color: var(--accent); }

  .error-box { border-color: #ff6b6b; color: #ff6b6b; }
  .success-box { border-color: #4ade80; color: #4ade80; }

  .draft-box {
    border-color: #ffaa00; color: #ffaa00;
    display: flex; align-items: center; gap: 1rem;
    font-weight: 600; font-size: 0.95rem;
  }
</style>
