<script>
  import { hubApiStore } from '$lib/api';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import StepEditor from '$lib/components/StepEditor.svelte';
  import PreviewPanel from '$lib/components/PreviewPanel.svelte';
  import GateEditor from '$lib/components/GateEditor.svelte';
  import OntologyEditor from '$lib/components/OntologyEditor.svelte';

  const api = $derived($hubApiStore);

  const TEACHING_MODES = ['socratic', 'didactic', 'guided_discovery', 'narrative', 'constructivist', 'direct'];
  const LANGUAGES = ['en', 'fr', 'es', 'pt', 'sw', 'ar', 'zh', 'hi'];

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

  let lesson = $state({
    identifier: '',
    title: '',
    description: '',
    language: 'en',
    difficulty: 3,
    subject: '',
    tags: '',
    audience: '',
    time_required: '',
    license: 'CC-BY-SA-4.0',
    authors: '',
    teaching_mode: '',
    utu: { class: '', band: 1 },
    ontology: { requires: [], provides: [] },
    gate: null,
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

  let savedLessons = $state([]);

  onMount(async () => {
    if (api.baseUrl) {
      try {
        utuConstants = await api.getUtuConstants();
      } catch {}
      try {
        const res = await api.getLessons();
        savedLessons = res.savedSlugs || [];
      } catch {}
    }
    loading = false;
  });

  let autoValidateTimer = $state(null);

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
      identifier: lesson.identifier.trim() || undefined,
      title: lesson.title.trim(),
      description: lesson.description.trim() || undefined,
      language: lesson.language,
      difficulty: lesson.difficulty,
      license: lesson.license || undefined,
      subject: lesson.subject.trim() || undefined,
      tags: lesson.tags ? lesson.tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
      audience: lesson.audience.trim() || undefined,
      time_required: lesson.time_required.trim() || undefined,
      authors: lesson.authors ? lesson.authors.split(',').map(a => a.trim()).filter(Boolean) : undefined,
      teaching_mode: lesson.teaching_mode || undefined,
      steps: cleanedSteps.length ? cleanedSteps : [{ id: 'step_1', type: 'instruction', content: 'Hello, world.' }]
    };
    if (lesson.utu.class) {
      out.utu = { class: lesson.utu.class, band: lesson.utu.band || 1 };
    }
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
    const ont = lesson.ontology;
    if (ont.requires.length || ont.provides.length) {
      out.ontology = {
        requires: ont.requires.filter(n => n.skill).map(n => ({ skill: n.skill, level: n.level || 1 })),
        provides: ont.provides.filter(n => n.skill).map(n => ({ skill: n.skill, level: n.level || 1 }))
      };
    }
    return out;
  }

  function debouncedValidate() {
    if (autoValidateTimer) clearTimeout(autoValidateTimer);
    autoValidateTimer = setTimeout(() => { validate(); }, 800);
  }

  function onStepsChange() { debouncedValidate(); }
  function onGateChange() { debouncedValidate(); }
  function onOntologyChange() { debouncedValidate(); }

  async function validate() {
    if (!api.baseUrl) { error = 'Hub not connected.'; return; }
    validating = true;
    error = '';
    validationErrors = [];
    validationWarnings = [];
    try {
      const payload = buildPayload();
      const res = await fetch(api.baseUrl + 'api/author/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
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
      success = `Saved as "${res.slug}" at ${time}.`;
      if (res.warnings?.length) validationWarnings = res.warnings;
      setTimeout(() => goto(`/author/${encodeURIComponent(res.slug)}/edit`), 1200);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    saving = false;
  }
</script>

<svelte:head>
  <title>New Lesson | AGNI Portal</title>
</svelte:head>

<nav class="breadcrumb">
  <a href="/">Home</a> → New Lesson
</nav>

<h1>New Lesson</h1>
<p class="subtitle">Define metadata, add steps, then validate and save.</p>

{#if savedLessons.length > 0}
  <details class="load-existing">
    <summary>Edit an existing lesson ({savedLessons.length} saved)</summary>
    <div class="slug-list">
      {#each savedLessons as s}
        <a href="/author/{encodeURIComponent(s)}/edit" class="slug-link">{s}</a>
      {/each}
    </div>
  </details>
{/if}

{#if loading}
  <p>Loading…</p>
{:else}
  {#if error}
    <div class="card error-box">{error}</div>
  {/if}
  {#if success}
    <div class="card success-box">{success}</div>
  {/if}

  <div class="card wizard">
    <h2>Identity</h2>
    <div class="form-group">
      <label>Identifier <input type="text" bind:value={lesson.identifier} placeholder="e.g. gravity_v1" /></label>
    </div>
    <div class="form-group">
      <label>Title <input type="text" bind:value={lesson.title} placeholder="e.g. Gravity: Why Things Fall" /></label>
    </div>
    <div class="form-group">
      <label>Description <textarea bind:value={lesson.description} rows="2" placeholder="Short description of the lesson"></textarea></label>
    </div>

    <h2>Classification</h2>
    <div class="row">
      <div class="form-group">
        <label>Language
          <select bind:value={lesson.language}>
            {#each LANGUAGES as lang}
              <option value={lang}>{lang}</option>
            {/each}
          </select>
        </label>
      </div>
      <div class="form-group">
        <label>Difficulty (1–5)
          <input type="number" bind:value={lesson.difficulty} min="1" max="5" />
        </label>
      </div>
      <div class="form-group">
        <label>Teaching mode
          <select bind:value={lesson.teaching_mode}>
            <option value="">— none —</option>
            {#each TEACHING_MODES as mode}
              <option value={mode}>{mode}</option>
            {/each}
          </select>
        </label>
      </div>
    </div>

    <div class="row">
      <div class="form-group">
        <label>Subject <input type="text" bind:value={lesson.subject} placeholder="e.g. Physics" /></label>
      </div>
      <div class="form-group">
        <label>Audience <input type="text" bind:value={lesson.audience} placeholder="e.g. Grade 6–8" /></label>
      </div>
      <div class="form-group">
        <label>Time required <input type="text" bind:value={lesson.time_required} placeholder="e.g. 30 minutes" /></label>
      </div>
    </div>

    <div class="form-group">
      <label>Tags (comma-separated) <input type="text" bind:value={lesson.tags} placeholder="e.g. gravity, forces, motion" /></label>
    </div>
    <div class="form-group">
      <label>Authors (comma-separated) <input type="text" bind:value={lesson.authors} placeholder="e.g. Jane Doe, John Smith" /></label>
    </div>
    <div class="form-group">
      <label>License <input type="text" bind:value={lesson.license} placeholder="e.g. CC-BY-SA-4.0" /></label>
    </div>

    <h2>UTU Coordinates</h2>
    <div class="row">
      <div class="form-group">
        <label>Spine (class)
          <select bind:value={lesson.utu.class}>
            <option value="">— none —</option>
            {#each spineIds as sid}
              <option value={sid}>{sid}</option>
            {/each}
          </select>
        </label>
      </div>
      <div class="form-group">
        <label>Band
          <select bind:value={lesson.utu.band}>
            {#each bands as b}
              <option value={b.id}>{b.id} — {b.phase}</option>
            {/each}
          </select>
        </label>
      </div>
    </div>

    <StepEditor bind:steps={lesson.steps} onchange={onStepsChange} />

    <GateEditor bind:gate={lesson.gate} onchange={onGateChange} />

    <OntologyEditor bind:ontology={lesson.ontology} spineIds={spineIds} onchange={onOntologyChange} />

    <h2>Protocol reference</h2>
    <div class="protocol-chips">
      {#each protocols as p}
        <span class="chip">{p.short} — {p.name}</span>
      {/each}
    </div>

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
    </div>

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
  .breadcrumb {
    margin-bottom: 1rem;
    font-size: 0.9rem;
    opacity: 0.9;
  }
  .breadcrumb a { color: var(--accent); }
  .subtitle { opacity: 0.9; margin-bottom: 1.5rem; }

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

  .row { display: flex; gap: 1rem; flex-wrap: wrap; }
  .row .form-group { flex: 1; min-width: 140px; }

  .protocol-chips { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin-bottom: 0.5rem; }
  .chip {
    background: rgba(0,230,118,0.15);
    color: var(--accent);
    padding: 0.25rem 0.6rem;
    border-radius: 12px;
    font-size: 0.85rem;
  }

  .hint { font-size: 0.9rem; opacity: 0.8; margin-top: 0.5rem; }

  .validation-list { margin: 1rem 0; padding: 0.75rem; border-radius: 6px; }
  .validation-list ul { margin: 0.5rem 0 0 1.5rem; }
  .validation-list.errors { background: rgba(255,107,107,0.1); color: #ff6b6b; }
  .validation-list.warnings { background: rgba(255,170,0,0.1); color: #ffaa00; }

  .actions { display: flex; gap: 1rem; margin-top: 1.5rem; }
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
</style>
