<script>
  import { hubApiStore } from '$lib/api';
  import { goto } from '$app/navigation';
  import { onMount, onDestroy } from 'svelte';
  import StepEditor from './StepEditor.svelte';
  import PreviewPanel from './PreviewPanel.svelte';
  import LivePreview from './LivePreview.svelte';
  import WysiwygEditor from './WysiwygEditor.svelte';
  import GateEditor from './GateEditor.svelte';
  import OntologyEditor from './OntologyEditor.svelte';
  import ForkEditor from './ForkEditor.svelte';

  let { mode = 'new', slug = null, creatorId = null, creatorName = null } = $props();

  const api = $derived($hubApiStore);

  const TEACHING_MODES = ['socratic', 'didactic', 'guided_discovery', 'narrative', 'constructivist', 'direct'];
  const LANGUAGES = ['en', 'fr', 'es', 'pt', 'sw', 'ar', 'zh', 'hi', 'bn', 'de', 'ja', 'ko', 'ru', 'tr', 'vi'];
  const EDUCATIONAL_ROLES = ['student', 'teacher', 'parent'];
  const LICENSE_PRESETS = [
    { label: 'CC BY-SA 4.0', value: 'CC-BY-SA-4.0' },
    { label: 'CC BY 4.0', value: 'CC-BY-4.0' },
    { label: 'CC BY-NC 4.0', value: 'CC-BY-NC-4.0' },
    { label: 'CC BY-NC-SA 4.0', value: 'CC-BY-NC-SA-4.0' },
    { label: 'CC0 (Public Domain)', value: 'CC0-1.0' },
    { label: 'MIT', value: 'MIT' },
    { label: 'All Rights Reserved', value: 'All-Rights-Reserved' },
  ];
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
  let activeEditorTab = $state('meta');
  let livePreviewStep = $state(0);
  let stepsMode = $state('wysiwyg');
  let compileOnSave = $state(false);
  let customLangMode = $state(false);
  let customLicenseMode = $state(false);

  let lesson = $state({
    identifier: '',
    title: '',
    description: '',
    language: 'en',
    locale: '',
    difficulty: 3,
    subject: '',
    tags: '',
    audience_role: '',
    audience_age: '',
    time_required: '',
    license: 'CC-BY-SA-4.0',
    authors: '',
    teaching_mode: '',
    is_group: false,
    utu: { class: '', band: 1, protocol: '' },
    ontology: { requires: [], provides: [] },
    gate: null,
    fork: null,
    steps: [],
    _version: '',
    _created: '',
    _updated: '',
    _content_hash: '',
    _parent_hash: '',
    _uri: ''
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
    const m = (d.meta && typeof d.meta === 'object') ? d.meta : d;

    lesson.identifier = m.identifier || d.identifier || d.slug || slug || '';
    lesson.title = m.title || d.title || '';
    lesson.description = m.description || d.description || '';
    lesson.language = m.language || d.language || 'en';
    lesson.locale = m.locale || d.locale || '';
    lesson.difficulty = m.difficulty ?? d.difficulty ?? 3;
    lesson.teaching_mode = m.teaching_mode || d.teaching_mode || '';
    lesson.is_group = !!(m.is_group ?? d.is_group ?? false);
    lesson.license = m.license || d.license || '';
    lesson.subject = Array.isArray(m.subject || d.subject)
      ? (m.subject || d.subject).join(', ')
      : (m.subject || d.subject || '');
    lesson.tags = Array.isArray(m.tags || d.tags)
      ? (m.tags || d.tags).join(', ')
      : (m.tags || d.tags || '');
    const rawAuthors = m.authors || d.authors;
    lesson.authors = Array.isArray(rawAuthors)
      ? rawAuthors.map(a => typeof a === 'object' ? a.name : a).join(', ')
      : (rawAuthors || '');
    lesson.time_required = m.time_required || d.time_required || '';

    const aud = m.audience || d.audience;
    if (aud && typeof aud === 'object') {
      lesson.audience_role = aud.educational_role || '';
      lesson.audience_age = aud.typical_age_range || '';
    } else if (typeof aud === 'string') {
      lesson.audience_role = '';
      lesson.audience_age = aud;
    }

    const utuSrc = d.utu || m.utu;
    if (utuSrc && typeof utuSrc === 'object') {
      lesson.utu = {
        class: utuSrc.class || utuSrc.spineId || '',
        band: utuSrc.band || 1,
        protocol: utuSrc.protocol || ''
      };
    }
    if (Array.isArray(d.steps)) {
      lesson.steps = d.steps;
    }
    if (d.gate && typeof d.gate === 'object') {
      lesson.gate = d.gate;
    }
    const ont = d.ontology || m.ontology;
    if (ont && typeof ont === 'object') {
      lesson.ontology = {
        requires: ont.requires || [],
        provides: ont.provides || []
      };
    }
    if (d.fork && typeof d.fork === 'object') {
      lesson.fork = d.fork;
    }

    if (d.version) lesson._version = d.version;
    if (m.created) lesson._created = m.created;
    if (m.updated) lesson._updated = m.updated;
    if (m.content_hash) lesson._content_hash = m.content_hash;
    if (m.parent_hash) lesson._parent_hash = m.parent_hash;
    if (m.uri) lesson._uri = m.uri;

    if (lesson.language && !LANGUAGES.includes(lesson.language)) {
      customLangMode = true;
    }
    if (lesson.license && !LICENSE_PRESETS.some(p => p.value === lesson.license)) {
      customLicenseMode = true;
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
    if (s.type === 'svg' && s.svg_spec) {
      out.svg_spec = s.svg_spec;
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

    const authorsList = lesson.authors
      ? lesson.authors.split(',').map(a => a.trim()).filter(Boolean).map(name => ({ name }))
      : undefined;

    // Auto-generate the lesson identifier as a URI when creator is logged in.
    // Format: agni:<creator_id>/<slug>
    // The slug derives from the title. Human-set identifiers are preserved but
    // the URI is canonical and always includes the creator ID.
    const titleSlug = lesson.title.trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'untitled';
    const autoUri = creatorId ? `agni:${creatorId}/${titleSlug}` : '';
    const identifier = autoUri || lesson.identifier.trim() || (mode === 'edit' ? slug : undefined);

    const meta = {
      identifier,
      title: lesson.title.trim(),
      description: lesson.description.trim() || undefined,
      language: lesson.language,
      locale: lesson.locale.trim() || undefined,
      difficulty: lesson.difficulty,
      license: lesson.license || 'CC-BY-SA-4.0',
      subject: lesson.subject ? lesson.subject.split(',').map(s => s.trim()).filter(Boolean) : undefined,
      tags: lesson.tags ? lesson.tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
      authors: authorsList,
      teaching_mode: lesson.teaching_mode || undefined,
      is_group: lesson.is_group || undefined,
      time_required: lesson.time_required.trim() || undefined,
      created: lesson._created || new Date().toISOString(),
      updated: new Date().toISOString(),
      creator_id: creatorId || undefined,
      uri: autoUri || lesson._uri || undefined,
    };

    if (lesson.audience_role || lesson.audience_age) {
      meta.audience = {};
      if (lesson.audience_role) meta.audience.educational_role = lesson.audience_role;
      if (lesson.audience_age) meta.audience.typical_age_range = lesson.audience_age;
    }

    if (lesson._content_hash) meta.content_hash = lesson._content_hash;

    if (lesson.utu.class) {
      meta.utu = { class: lesson.utu.class, band: lesson.utu.band || 1 };
      const proto = lesson.utu.protocol;
      if (proto != null && proto !== '' && proto !== 'null') meta.utu.protocol = Number(proto);
    }

    const out = {
      version: lesson._version || '1.7.0',
      meta: meta,
      steps: cleanedSteps.length ? cleanedSteps : [{ id: 'step_1', type: 'instruction', content: 'Hello, world.' }]
    };

    if (mode === 'edit' && slug) {
      out.slug = slug;
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

  // ─── Client-side pre-flight validation ──────────────────────────────────────

  let preflightErrors = $state([]);

  function runPreflightValidation() {
    const errs = [];
    if (!lesson.title.trim()) errs.push('Title is required');
    if (!creatorId && !lesson.identifier.trim() && mode === 'new') errs.push('Identifier is recommended for new lessons');
    if (lesson.difficulty < 1 || lesson.difficulty > 5) errs.push('Difficulty must be 1–5');
    if (lesson.steps.length === 0) errs.push('At least one step is required');
    const ids = new Set();
    for (const s of lesson.steps) {
      if (s.id && ids.has(s.id)) errs.push(`Duplicate step ID "${s.id}"`);
      if (s.id) ids.add(s.id);
      if (s.type === 'quiz') {
        if (!Array.isArray(s.answer_options) || s.answer_options.length < 2) errs.push(`Step "${s.id}": quiz needs 2+ options`);
        if (s.correct_index != null && s.correct_index >= (s.answer_options?.length || 0)) errs.push(`Step "${s.id}": correct_index out of bounds`);
      }
      if (s.type === 'svg' && !s.svg_spec) {
        errs.push(`Step "${s.id}": SVG step has no visual configured`);
      }
    }
    if (durationError) errs.push('Invalid time_required duration');
    preflightErrors = errs;
    return errs;
  }

  // ─── YAML import/export ──────────────────────────────────────────────────────

  function exportYaml() {
    const payload = buildPayload();
    const yamlStr = JSON.stringify(payload, null, 2);
    const blob = new Blob([yamlStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${lesson.identifier || lesson.title || 'lesson'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  let showImport = $state(false);
  let importText = $state('');
  let importError = $state('');

  function importFromText() {
    importError = '';
    const trimmed = importText.trim();
    if (!trimmed) { importError = 'Paste JSON or YAML content'; return; }
    try {
      let parsed;
      if (trimmed.startsWith('{')) {
        parsed = JSON.parse(trimmed);
      } else {
        importError = 'Only JSON import is supported in the browser. Paste the JSON payload.';
        return;
      }
      populateFromData(parsed);
      dirty = true;
      showImport = false;
      importText = '';
      success = 'Lesson imported successfully.';
    } catch (e) {
      importError = 'Parse error: ' + (e instanceof Error ? e.message : String(e));
    }
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

  async function deleteCurrentLesson() {
    if (!api.baseUrl || !slug) return;
    if (!confirm(`Delete lesson "${slug}"? This cannot be undone.`)) return;
    try {
      await api.deleteAuthorLesson(slug);
      success = `Lesson "${slug}" deleted.`;
      dirty = false;
      clearDraft();
      setTimeout(() => goto('/author'), 800);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  async function save() {
    if (!api.baseUrl) { error = 'Hub not connected.'; return; }
    const pfErrors = runPreflightValidation();
    if (pfErrors.length > 0) {
      error = 'Fix issues before saving: ' + pfErrors[0];
      return;
    }
    saving = true;
    error = '';
    success = '';
    try {
      const payload = buildPayload();
      const res = await api.postAuthorSave(payload, { compile: compileOnSave });
      const time = new Date().toLocaleTimeString();
      lastSavedAt = time;
      let msg = `Saved as "${res.slug}" at ${time}.`;
      if (res.compiled) msg += ' Compiled IR + sidecar generated.';
      if (res.contentHash) {
        lesson._content_hash = res.contentHash;
        lesson._parent_hash = res.parentHash || '';
      }
      if (res.uri) lesson._uri = res.uri;
      success = msg;
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
    <div class="editor-tabs">
      <button class:active={activeEditorTab === 'meta'} onclick={() => activeEditorTab = 'meta'}>Meta</button>
      <button class:active={activeEditorTab === 'steps'} onclick={() => activeEditorTab = 'steps'}>
        Steps{lesson.steps.length ? ` (${lesson.steps.length})` : ''}
      </button>
      <button class:active={activeEditorTab === 'advanced'} onclick={() => activeEditorTab = 'advanced'}>Advanced</button>
      <button class:active={activeEditorTab === 'preview'} onclick={() => { activeEditorTab = 'preview'; if (!previewIr && !previewing) preview(); }}>Preview</button>
    </div>

    {#if activeEditorTab === 'meta'}
    <h2>Identity</h2>
    {#if creatorId}
      <div class="uri-display">
        <span class="uri-label">Lesson URI</span>
        <code class="uri-value">{`agni:${creatorId}/${(lesson.title || 'untitled').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')}`}</code>
        <span class="uri-hint">Auto-generated from your creator ID + title. Immutable once published.</span>
      </div>
      {#if lesson._content_hash}
        <div class="chain-info">
          <span class="chain-label">Content Hash</span>
          <code class="chain-hash">{lesson._content_hash}</code>
          {#if lesson._parent_hash}
            <span class="chain-label">Parent Hash</span>
            <code class="chain-hash">{lesson._parent_hash}</code>
          {/if}
        </div>
      {/if}
    {:else}
      <div class="form-group">
        <label>Identifier <input type="text" bind:value={lesson.identifier} oninput={markDirty} placeholder="e.g. gravity_v1" /></label>
      </div>
    {/if}
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
          {#if customLangMode}
            <div class="lang-custom-row">
              <input type="text" bind:value={lesson.language} oninput={markDirty} placeholder="e.g. yo, ig, am" />
              <button class="link-btn" onclick={() => { customLangMode = false; if (!LANGUAGES.includes(lesson.language)) lesson.language = 'en'; }}>Presets</button>
            </div>
          {:else}
            <div class="lang-custom-row">
              <select bind:value={lesson.language} onchange={markDirty}>
                {#each LANGUAGES as lang}
                  <option value={lang}>{lang}</option>
                {/each}
              </select>
              <button class="link-btn" onclick={() => { customLangMode = true; }} title="Enter a custom ISO 639-1 code">Other…</button>
            </div>
          {/if}
        </label>
      </div>
      <div class="form-group">
        <label>Locale
          <input type="text" bind:value={lesson.locale} oninput={markDirty} placeholder="e.g. en-KE, fr-SN, pt-BR" />
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
        <label class="group-toggle">
          <input type="checkbox" bind:checked={lesson.is_group} onchange={markDirty} />
          Group / collaborative lesson
        </label>
        <span class="field-hint">When enabled, teachers can assign this lesson to student groups for collaborative work.</span>
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
      <label>License
        {#if customLicenseMode}
          <div class="lang-custom-row">
            <input type="text" bind:value={lesson.license} oninput={markDirty} placeholder="e.g. AGPL-3.0, custom" />
            <button class="link-btn" onclick={() => { customLicenseMode = false; if (!LICENSE_PRESETS.some(p => p.value === lesson.license)) lesson.license = 'CC-BY-SA-4.0'; }}>Presets</button>
          </div>
        {:else}
          <div class="lang-custom-row">
            <select bind:value={lesson.license} onchange={markDirty}>
              {#each LICENSE_PRESETS as lp}
                <option value={lp.value}>{lp.label}</option>
              {/each}
            </select>
            <button class="link-btn" onclick={() => { customLicenseMode = true; }} title="Enter a custom license identifier">Other…</button>
          </div>
        {/if}
      </label>
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
            <option value="">— none —</option>
            {#each protocols as p}
              <option value={p.id}>P{p.id} — {p.name}</option>
            {/each}
          </select>
        </label>
      </div>
    </div>
    {/if}

    {#if activeEditorTab === 'steps'}
    <div class="steps-mode-toggle">
      <button class:active={stepsMode === 'wysiwyg'} onclick={() => stepsMode = 'wysiwyg'}>Visual</button>
      <button class:active={stepsMode === 'form'} onclick={() => stepsMode = 'form'}>Form</button>
    </div>
    {#if stepsMode === 'wysiwyg'}
      <WysiwygEditor bind:steps={lesson.steps} onchange={onStepsChange} />
    {:else}
      <StepEditor bind:steps={lesson.steps} onchange={onStepsChange} />
    {/if}
    {/if}

    {#if activeEditorTab === 'advanced'}
    <GateEditor bind:gate={lesson.gate} onchange={onGateChange} />

    <OntologyEditor bind:ontology={lesson.ontology} spineIds={spineIds} onchange={onOntologyChange} />

    <ForkEditor bind:fork={lesson.fork} onchange={onForkChange} />
    {/if}

    {#if activeEditorTab === 'preview'}
      <PreviewPanel ir={previewIr} sidecar={previewSidecar} loading={previewing} error={previewError} steps={lesson.steps} title={lesson.title} />
    {/if}

    {#if validationErrors.length}
      <div class="validation-list errors">
        <strong>Errors ({validationErrors.length}):</strong>
        <ul>{#each validationErrors as e}<li>{e}</li>{/each}</ul>
      </div>
    {/if}
    {#if validationWarnings.length}
      <div class="validation-list warnings">
        <strong>Warnings ({validationWarnings.length}):</strong>
        <ul>{#each validationWarnings as w}<li>{w}</li>{/each}</ul>
      </div>
    {/if}

    {#if preflightErrors.length > 0}
      <div class="validation-list errors">
        <strong>Pre-flight ({preflightErrors.length}):</strong>
        <ul>{#each preflightErrors as pe}<li>{pe}</li>{/each}</ul>
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
      <label class="compile-toggle">
        <input type="checkbox" bind:checked={compileOnSave} />
        Compile on save
      </label>
      {#if dirty}
        <span class="dirty-indicator">Unsaved changes</span>
      {/if}
      {#if lastSavedAt}
        <span class="last-saved">Saved {lastSavedAt}</span>
      {/if}
    </div>
    <div class="actions secondary-actions">
      <button class="secondary" onclick={exportYaml} title="Download lesson as JSON">Export JSON</button>
      <button class="secondary" onclick={() => showImport = !showImport}>Import</button>
      {#if mode === 'edit' && slug}
        <button class="danger-btn" onclick={deleteCurrentLesson}>Delete lesson</button>
      {/if}
    </div>

    {#if showImport}
      <div class="import-box">
        <textarea bind:value={importText} rows="5" placeholder="Paste lesson JSON here…"></textarea>
        {#if importError}
          <span class="field-error">{importError}</span>
        {/if}
        <div class="import-actions">
          <button class="primary" onclick={importFromText}>Import</button>
          <button class="secondary" onclick={() => { showImport = false; importText = ''; importError = ''; }}>Cancel</button>
        </div>
      </div>
    {/if}

    <p class="shortcut-hint">
      <kbd>Ctrl+S</kbd> Save &nbsp; <kbd>Ctrl+Shift+V</kbd> Validate &nbsp; <kbd>Ctrl+Shift+P</kbd> Preview
    </p>

    {#if !api.baseUrl}
      <p class="hint">Configure hub URL in <a href="/settings">Settings</a> to validate and save.</p>
    {/if}
  </div>
{/if}

<style>
  .uri-display {
    background: var(--surface, #1e1e1e);
    border: 1px solid var(--border, #333);
    border-left: 3px solid var(--accent, #4fc3f7);
    border-radius: 6px;
    padding: 0.75rem 1rem;
    margin-bottom: 1rem;
  }
  .uri-label { font-size: 0.8rem; color: var(--text-muted, #aaa); display: block; margin-bottom: 0.25rem; font-weight: 600; text-transform: uppercase; }
  .uri-value {
    font-family: monospace; font-size: 1rem; color: var(--accent, #4fc3f7);
    word-break: break-all; display: block; margin-bottom: 0.25rem;
  }
  .uri-hint { font-size: 0.75rem; color: var(--text-muted, #666); }
  .chain-info {
    background: var(--surface, #1e1e1e);
    border: 1px solid var(--border, #333);
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
    margin-bottom: 1rem;
    font-size: 0.8rem;
  }
  .chain-label { color: var(--text-muted, #aaa); font-weight: 600; text-transform: uppercase; font-size: 0.7rem; display: block; margin-top: 0.25rem; }
  .chain-hash { font-family: monospace; font-size: 0.75rem; color: var(--text-muted, #888); word-break: break-all; display: block; }

  .editor-tabs {
    display: flex; gap: 0; margin-bottom: 1.25rem; border-bottom: 1px solid var(--border);
  }
  .editor-tabs button {
    background: none; border: none; color: var(--text); padding: 0.6rem 1.2rem;
    cursor: pointer; font-size: 0.95rem; border-bottom: 2px solid transparent;
    opacity: 0.65; transition: opacity 0.15s, border-color 0.15s; font-weight: 500;
  }
  .editor-tabs button:hover { opacity: 1; }
  .editor-tabs button.active {
    opacity: 1; border-bottom-color: var(--accent); color: var(--accent); font-weight: 700;
  }

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

  .lang-custom-row { display: flex; gap: 0.4rem; align-items: center; }
  .lang-custom-row select,
  .lang-custom-row input[type="text"] { flex: 1; }

  .compile-toggle {
    display: flex; align-items: center; gap: 0.35rem;
    font-size: 0.85rem; opacity: 0.85; cursor: pointer; font-weight: 500;
  }
  .compile-toggle input[type="checkbox"] { accent-color: var(--accent); }

  .group-toggle {
    display: flex; align-items: center; gap: 0.4rem;
    cursor: pointer; font-weight: bold;
  }
  .group-toggle input[type="checkbox"] { accent-color: var(--accent); width: 18px; height: 18px; }
  .field-hint { display: block; font-size: 0.8rem; opacity: 0.55; margin-top: 0.15rem; }

  .secondary-actions { margin-top: 0.5rem; gap: 0.5rem; }

  .danger-btn {
    background: rgba(255,107,107,0.12); color: #ff6b6b; border: 1px solid rgba(255,107,107,0.3);
    padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; font-size: 0.9rem;
  }
  .danger-btn:hover { background: rgba(255,107,107,0.25); }

  .import-box {
    margin-top: 0.75rem; padding: 0.75rem; border: 1px solid var(--border);
    border-radius: 6px; background: rgba(31,43,78,0.4);
  }
  .import-box textarea {
    width: 100%; padding: 0.5rem; background: #1a2544; color: var(--text);
    border: 1px solid var(--border); border-radius: 5px; font-family: monospace;
    font-size: 0.85rem; resize: vertical;
  }
  .import-actions { display: flex; gap: 0.5rem; margin-top: 0.5rem; }

  .steps-mode-toggle {
    display: flex; gap: 0; margin-bottom: 0.75rem;
    border: 1px solid var(--border); border-radius: 6px;
    overflow: hidden; width: fit-content;
  }
  .steps-mode-toggle button {
    background: none; border: none; color: var(--text);
    padding: 0.35rem 0.8rem; cursor: pointer; font-size: 0.82rem;
    font-weight: 500; opacity: 0.6; transition: all 0.15s;
  }
  .steps-mode-toggle button:hover { opacity: 1; }
  .steps-mode-toggle button.active {
    background: rgba(0,230,118,0.12); color: var(--accent);
    font-weight: 700; opacity: 1;
  }

  /* Split-pane WYSIWYG layout */
  .split-pane {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    min-height: 500px;
  }
  @media (max-width: 900px) {
    .split-pane { grid-template-columns: 1fr; }
  }
  .split-editor {
    overflow-y: auto;
    max-height: 75vh;
    padding-right: 0.5rem;
  }
  .split-preview {
    position: sticky;
    top: 0;
    overflow-y: auto;
    max-height: 75vh;
    background: rgba(18,24,48,0.5);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 0.75rem;
  }
  .live-preview-header {
    display: flex; align-items: center; gap: 0.4rem;
    font-size: 0.8rem; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.06em; opacity: 0.6; margin-bottom: 0.5rem;
    padding-bottom: 0.4rem; border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .live-dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: #4ade80; display: inline-block;
    animation: pulse-dot 2s ease-in-out infinite;
  }
  @keyframes pulse-dot {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
</style>
