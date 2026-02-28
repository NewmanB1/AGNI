<script>
  import { renderMarkdown } from '$lib/renderMarkdown.js';
  import { getFactoryById, FACTORIES, CATEGORIES } from '$lib/svg-catalog.js';
  import SvgSpecEditor from './SvgSpecEditor.svelte';

  let { steps = $bindable([]), onchange = () => {} } = $props();

  let editingContent = $state(null);
  let editingQuizOpt = $state(null);
  let editingField = $state(null);
  let svgPanelFor = $state(null);
  let hoverIdx = $state(null);
  let addMenuAt = $state(null);

  function nextStepId() {
    let max = 0;
    for (const s of steps) {
      const m = (s.id || '').match(/^step_(\d+)$/);
      if (m) max = Math.max(max, parseInt(m[1]));
    }
    return `step_${max + 1}`;
  }

  function insertStep(atIdx, type) {
    const base = { id: nextStepId(), type: type || 'instruction', content: '' };
    if (type === 'quiz') { base.answer_options = ['Option A', 'Option B']; base.correct_index = 0; }
    if (type === 'hardware_trigger') { base.sensor = 'accelerometer'; base.threshold = ''; }
    if (type === 'svg') { base.svg_spec = null; }
    const arr = [...steps];
    arr.splice(atIdx, 0, base);
    steps = arr;
    addMenuAt = null;
    onchange();
  }

  function removeStep(i) {
    steps = steps.filter((_, idx) => idx !== i);
    editingContent = null;
    editingField = null;
    svgPanelFor = null;
    onchange();
  }

  function moveStep(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const arr = [...steps];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    steps = arr;
    onchange();
  }

  function duplicateStep(i) {
    const clone = JSON.parse(JSON.stringify(steps[i]));
    clone.id = nextStepId();
    const arr = [...steps];
    arr.splice(i + 1, 0, clone);
    steps = arr;
    onchange();
  }

  function updateStep(i, field, value) {
    const arr = [...steps];
    arr[i] = { ...arr[i], [field]: value };
    steps = arr;
    onchange();
  }

  function onContentBlur(i, e) {
    const text = e.target.innerText || '';
    updateStep(i, 'content', text);
    editingContent = null;
  }

  function onContentKeydown(i, e) {
    if (e.key === 'Escape') {
      e.target.blur();
    }
  }

  function startEditContent(i) {
    editingContent = i;
  }

  function updateQuizOption(stepIdx, optIdx, value) {
    const arr = [...steps];
    const opts = [...(arr[stepIdx].answer_options || [])];
    opts[optIdx] = value;
    arr[stepIdx] = { ...arr[stepIdx], answer_options: opts };
    steps = arr;
    onchange();
  }

  function addQuizOption(stepIdx) {
    const arr = [...steps];
    const opts = [...(arr[stepIdx].answer_options || []), ''];
    arr[stepIdx] = { ...arr[stepIdx], answer_options: opts };
    steps = arr;
    onchange();
  }

  function removeQuizOption(stepIdx, optIdx) {
    const arr = [...steps];
    const opts = (arr[stepIdx].answer_options || []).filter((_, j) => j !== optIdx);
    const step = { ...arr[stepIdx], answer_options: opts };
    if (step.correct_index >= opts.length) step.correct_index = Math.max(0, opts.length - 1);
    arr[stepIdx] = step;
    steps = arr;
    onchange();
  }

  function setCorrectAnswer(stepIdx, optIdx) {
    updateStep(stepIdx, 'correct_index', optIdx);
  }

  function openSvgPanel(i) {
    svgPanelFor = svgPanelFor === i ? null : i;
  }

  function onSvgSpecChange(i) {
    const arr = [...steps];
    steps = arr;
    onchange();
  }

  function startEditField(i, field) {
    editingField = { step: i, field };
  }

  function onFieldBlur(i, field, e) {
    updateStep(i, field, e.target.value);
    editingField = null;
  }

  const ADD_TYPES = [
    { type: 'instruction', label: 'Text', icon: '📝' },
    { type: 'quiz', label: 'Quiz', icon: '❓' },
    { type: 'hardware_trigger', label: 'Sensor', icon: '📡' },
    { type: 'svg', label: 'Visual', icon: '🎨' },
    { type: 'completion', label: 'Finish', icon: '🏁' },
  ];
</script>

<div class="wysiwyg">
  {#if steps.length === 0}
    <div class="empty-canvas">
      <p class="empty-big">Start building your lesson</p>
      <p class="empty-sub">Click a block type to add your first step</p>
      <div class="block-picker">
        {#each ADD_TYPES as at}
          <button class="block-btn" onclick={() => insertStep(0, at.type)}>
            <span class="block-icon">{at.icon}</span>
            <span>{at.label}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  {#each steps as step, i (step.id + '-' + i)}
    <!-- Insert-between handle -->
    <div class="insert-between" class:insert-open={addMenuAt === i}>
      <button class="insert-line-btn" onclick={() => addMenuAt = addMenuAt === i ? null : i} title="Insert step here">+</button>
      {#if addMenuAt === i}
        <div class="insert-picker">
          {#each ADD_TYPES as at}
            <button onclick={() => insertStep(i, at.type)}>{at.icon} {at.label}</button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Rendered step block -->
    <div class="step-block"
         class:focused={editingContent === i || svgPanelFor === i}
         class:type-instruction={step.type === 'instruction' || !step.type}
         class:type-quiz={step.type === 'quiz'}
         class:type-hw={step.type === 'hardware_trigger'}
         class:type-svg={step.type === 'svg'}
         class:type-completion={step.type === 'completion'}
         onmouseenter={() => hoverIdx = i}
         onmouseleave={() => hoverIdx = null}>

      <!-- Floating controls (visible on hover) -->
      {#if hoverIdx === i || editingContent === i || svgPanelFor === i}
        <div class="block-controls">
          <span class="block-type-label">
            {step.type === 'hardware_trigger' ? 'Sensor' : step.type === 'quiz' ? 'Quiz' : step.type === 'svg' ? 'Visual' : step.type === 'completion' ? 'Finish' : 'Text'}
          </span>
          <button class="ctrl-btn" onclick={() => moveStep(i, -1)} disabled={i === 0} title="Move up">↑</button>
          <button class="ctrl-btn" onclick={() => moveStep(i, 1)} disabled={i === steps.length - 1} title="Move down">↓</button>
          <button class="ctrl-btn" onclick={() => duplicateStep(i)} title="Duplicate">⧉</button>
          <button class="ctrl-btn danger" onclick={() => removeStep(i)} title="Delete">✕</button>
        </div>
      {/if}

      <!-- Content area — click to edit inline -->
      {#if step.type === 'completion'}
        <div class="completion-display">
          <div class="completion-icon">🎉</div>
          {#if editingContent === i}
            <div class="inline-edit" contenteditable="true"
                 onblur={(e) => onContentBlur(i, e)}
                 onkeydown={(e) => onContentKeydown(i, e)}>{step.content || 'Congratulations!'}</div>
          {:else}
            <div class="completion-text" onclick={() => startEditContent(i)}>
              {#if step.content}
                {@html renderMarkdown(step.content)}
              {:else}
                <span class="click-hint">Congratulations! Click to edit…</span>
              {/if}
            </div>
          {/if}
        </div>

      {:else}
        <!-- Text content — inline editable -->
        {#if editingContent === i}
          <div class="inline-edit"
               contenteditable="true"
               onblur={(e) => onContentBlur(i, e)}
               onkeydown={(e) => onContentKeydown(i, e)}>{step.content || ''}</div>
        {:else}
          <div class="rendered-content" onclick={() => startEditContent(i)}>
            {#if step.content}
              {@html renderMarkdown(step.content)}
            {:else}
              <span class="click-hint">Click to type…</span>
            {/if}
          </div>
        {/if}
      {/if}

      <!-- SVG visual block -->
      {#if step.type === 'svg'}
        {#if step.svg_spec?.factory}
          {@const fd = getFactoryById(step.svg_spec.factory)}
          <div class="svg-block" onclick={() => openSvgPanel(i)}>
            {#if fd}
              <span class="svg-big">{fd.icon}</span>
              <strong>{fd.label}</strong>
              {#if step.svg_spec.opts?.title}
                <span class="svg-title-sub">{step.svg_spec.opts.title}</span>
              {/if}
              <span class="svg-edit-hint">Click to edit parameters</span>
            {/if}
          </div>
        {:else}
          <div class="svg-block empty" onclick={() => openSvgPanel(i)}>
            <span class="svg-big">🎨</span>
            <strong>Add a visual</strong>
            <span class="svg-edit-hint">Click to browse SVG factories</span>
          </div>
        {/if}

        {#if svgPanelFor === i}
          <div class="svg-overlay-panel">
            <div class="svg-panel-header">
              <span>Configure Visual</span>
              <button class="close-panel" onclick={() => svgPanelFor = null}>✕</button>
            </div>
            <SvgSpecEditor bind:spec={step.svg_spec} onchange={() => onSvgSpecChange(i)} />
          </div>
        {/if}
      {/if}

      <!-- Hardware trigger block -->
      {#if step.type === 'hardware_trigger'}
        <div class="hw-block">
          <div class="hw-row">
            {#if editingField?.step === i && editingField?.field === 'sensor'}
              <input class="inline-field" type="text" value={step.sensor || ''}
                     onblur={(e) => onFieldBlur(i, 'sensor', e)}
                     autofocus />
            {:else}
              <span class="hw-sensor-pill" onclick={() => startEditField(i, 'sensor')}>
                {step.sensor || 'Click to set sensor'}
              </span>
            {/if}
            {#if editingField?.step === i && editingField?.field === 'threshold'}
              <input class="inline-field code" type="text" value={step.threshold || ''}
                     onblur={(e) => onFieldBlur(i, 'threshold', e)}
                     placeholder="e.g. accel.total > 2.5g"
                     autofocus />
            {:else}
              <code class="hw-thresh-pill" onclick={() => startEditField(i, 'threshold')}>
                {step.threshold || 'Click to set threshold'}
              </code>
            {/if}
          </div>
          <div class="hw-waiting-anim">
            <div class="hw-pulse"></div>
            <span>Waiting for sensor data…</span>
          </div>
          {#if editingField?.step === i && editingField?.field === 'feedback'}
            <input class="inline-field" type="text" value={step.feedback || ''}
                   onblur={(e) => onFieldBlur(i, 'feedback', e)}
                   placeholder="Feedback when triggered"
                   autofocus />
          {:else if step.feedback}
            <div class="hw-feedback" onclick={() => startEditField(i, 'feedback')}>
              {step.feedback}
            </div>
          {:else}
            <div class="hw-feedback placeholder" onclick={() => startEditField(i, 'feedback')}>
              Click to add feedback…
            </div>
          {/if}
        </div>
      {/if}

      <!-- Quiz block -->
      {#if step.type === 'quiz'}
        <div class="quiz-block">
          {#each (step.answer_options || []) as opt, oi}
            <div class="quiz-option-row" class:is-correct={step.correct_index === oi}>
              <button class="correct-toggle" onclick={() => setCorrectAnswer(i, oi)}
                      title={step.correct_index === oi ? 'Correct answer' : 'Click to mark correct'}>
                {step.correct_index === oi ? '✓' : String.fromCharCode(65 + oi)}
              </button>
              {#if editingQuizOpt?.step === i && editingQuizOpt?.opt === oi}
                <input class="inline-field" type="text" value={opt}
                       onblur={(e) => { updateQuizOption(i, oi, e.target.value); editingQuizOpt = null; }}
                       autofocus />
              {:else}
                <span class="quiz-opt-text" onclick={() => { editingQuizOpt = { step: i, opt: oi }; }}>
                  {opt || 'Click to type option…'}
                </span>
              {/if}
              <button class="opt-remove" onclick={() => removeQuizOption(i, oi)} title="Remove">✕</button>
            </div>
          {/each}
          <button class="add-opt-btn" onclick={() => addQuizOption(i)}>+ Add option</button>
          {#if editingField?.step === i && editingField?.field === 'feedback'}
            <input class="inline-field" type="text" value={step.feedback || ''}
                   onblur={(e) => onFieldBlur(i, 'feedback', e)}
                   placeholder="Feedback shown after answering"
                   autofocus />
          {:else if step.feedback}
            <div class="quiz-feedback" onclick={() => startEditField(i, 'feedback')}>{step.feedback}</div>
          {:else}
            <div class="quiz-feedback placeholder" onclick={() => startEditField(i, 'feedback')}>Click to add feedback…</div>
          {/if}
        </div>
      {/if}
    </div>
  {/each}

  <!-- Insert at end -->
  {#if steps.length > 0}
    <div class="insert-between insert-end" class:insert-open={addMenuAt === steps.length}>
      <button class="insert-line-btn" onclick={() => addMenuAt = addMenuAt === steps.length ? null : steps.length}>+</button>
      {#if addMenuAt === steps.length}
        <div class="insert-picker">
          {#each ADD_TYPES as at}
            <button onclick={() => insertStep(steps.length, at.type)}>{at.icon} {at.label}</button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .wysiwyg {
    max-width: 640px;
    margin: 0 auto;
  }

  /* Empty canvas */
  .empty-canvas {
    text-align: center; padding: 3rem 1rem;
  }
  .empty-big { font-size: 1.3rem; font-weight: 700; margin-bottom: 0.3rem; }
  .empty-sub { font-size: 0.9rem; opacity: 0.5; margin-bottom: 1.5rem; }
  .block-picker {
    display: flex; gap: 0.6rem; justify-content: center; flex-wrap: wrap;
  }
  .block-btn {
    display: flex; flex-direction: column; align-items: center; gap: 0.2rem;
    background: rgba(31,43,78,0.6); border: 1px solid var(--border);
    border-radius: 10px; padding: 0.8rem 1.2rem; cursor: pointer;
    color: var(--text); transition: border-color 0.15s, transform 0.1s;
    min-width: 80px;
  }
  .block-btn:hover { border-color: var(--accent); transform: translateY(-2px); }
  .block-icon { font-size: 1.5rem; }
  .block-btn span:last-child { font-size: 0.8rem; font-weight: 600; }

  /* Insert-between controls */
  .insert-between {
    display: flex; align-items: center; justify-content: center;
    height: 24px; position: relative;
    margin: 0.15rem 0;
    opacity: 0;
    transition: opacity 0.15s;
  }
  .wysiwyg:hover .insert-between,
  .insert-between.insert-open {
    opacity: 1;
  }
  .insert-end { margin-top: 0.5rem; height: 36px; }
  .insert-line-btn {
    width: 24px; height: 24px; border-radius: 50%;
    background: rgba(0,230,118,0.12); border: 1px dashed var(--accent);
    color: var(--accent); font-size: 1rem; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    z-index: 2;
  }
  .insert-line-btn:hover { background: rgba(0,230,118,0.25); }
  .insert-picker {
    position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
    z-index: 10; display: flex; gap: 0.3rem;
    background: #121830; border: 1px solid var(--border);
    border-radius: 8px; padding: 0.4rem; box-shadow: 0 6px 20px rgba(0,0,0,0.5);
  }
  .insert-picker button {
    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
    color: var(--text); padding: 0.35rem 0.6rem; border-radius: 6px;
    cursor: pointer; font-size: 0.8rem; white-space: nowrap;
    transition: border-color 0.1s;
  }
  .insert-picker button:hover { border-color: var(--accent); color: var(--accent); }

  /* Step block */
  .step-block {
    position: relative;
    background: rgba(18,24,48,0.6);
    border: 1.5px solid transparent;
    border-radius: 12px;
    padding: 1rem 1.2rem;
    margin: 0.25rem 0;
    transition: border-color 0.15s, box-shadow 0.15s;
    cursor: default;
  }
  .step-block:hover { border-color: rgba(255,255,255,0.1); }
  .step-block.focused { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(0,230,118,0.15); }
  .step-block.type-quiz { border-left: 3px solid #42a5f5; }
  .step-block.type-hw { border-left: 3px solid #ff9800; }
  .step-block.type-svg { border-left: 3px solid #ce93d8; }
  .step-block.type-completion { border-left: 3px solid #66bb6a; }

  /* Floating controls */
  .block-controls {
    position: absolute; top: -14px; right: 8px;
    display: flex; align-items: center; gap: 0.2rem;
    background: #1a2040; border: 1px solid var(--border);
    border-radius: 6px; padding: 0.15rem 0.3rem;
    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    z-index: 5;
  }
  .block-type-label {
    font-size: 0.65rem; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.05em; opacity: 0.5; padding: 0 0.3rem;
  }
  .ctrl-btn {
    background: none; border: 1px solid transparent; color: var(--text);
    width: 24px; height: 24px; border-radius: 4px; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    font-size: 0.8rem; opacity: 0.6;
  }
  .ctrl-btn:hover { opacity: 1; border-color: rgba(255,255,255,0.15); }
  .ctrl-btn:disabled { opacity: 0.2; cursor: not-allowed; }
  .ctrl-btn.danger:hover { color: #ff6b6b; border-color: rgba(255,107,107,0.3); }

  /* Inline content editing */
  .rendered-content {
    font-size: 0.95rem; line-height: 1.7; cursor: text;
    min-height: 1.5em; padding: 0.1rem 0;
    border-radius: 4px; transition: background 0.1s;
  }
  .rendered-content:hover { background: rgba(255,255,255,0.03); }
  .rendered-content :global(strong) { color: #e0e0ff; }
  .rendered-content :global(code) {
    background: rgba(255,255,255,0.08); padding: 0.1rem 0.3rem;
    border-radius: 3px; font-size: 0.87rem;
  }
  .rendered-content :global(.math-inline) {
    font-family: 'Cambria Math', serif; font-style: italic; color: #90caf9;
  }

  .inline-edit {
    font-size: 0.95rem; line-height: 1.7;
    background: rgba(0,230,118,0.04); border: 1px solid rgba(0,230,118,0.2);
    border-radius: 6px; padding: 0.4rem 0.5rem;
    outline: none; min-height: 2em; white-space: pre-wrap;
  }

  .inline-field {
    width: 100%; padding: 0.35rem 0.5rem;
    background: rgba(0,230,118,0.04); border: 1px solid rgba(0,230,118,0.2);
    border-radius: 5px; color: var(--text); font-size: 0.88rem;
    font-family: inherit; outline: none;
  }
  .inline-field.code { font-family: monospace; font-size: 0.85rem; }

  .click-hint {
    opacity: 0.3; font-style: italic;
  }

  /* SVG block */
  .svg-block {
    display: flex; flex-direction: column; align-items: center;
    background: rgba(206,147,216,0.05); border: 1px dashed rgba(206,147,216,0.2);
    border-radius: 10px; padding: 1.2rem; margin-top: 0.6rem;
    cursor: pointer; transition: border-color 0.15s, background 0.15s;
    gap: 0.2rem;
  }
  .svg-block:hover { border-color: rgba(206,147,216,0.4); background: rgba(206,147,216,0.08); }
  .svg-block.empty { border-style: dashed; }
  .svg-big { font-size: 2.5rem; }
  .svg-block strong { font-size: 0.9rem; }
  .svg-title-sub { font-size: 0.78rem; opacity: 0.5; }
  .svg-edit-hint { font-size: 0.72rem; opacity: 0.35; margin-top: 0.2rem; }

  .svg-overlay-panel {
    margin-top: 0.6rem;
    background: rgba(18,24,48,0.95); border: 1px solid var(--border);
    border-radius: 10px; padding: 0.75rem;
  }
  .svg-panel-header {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 0.5rem; font-weight: 600; font-size: 0.9rem;
  }
  .close-panel {
    background: none; border: none; color: var(--text); cursor: pointer;
    font-size: 1.1rem; opacity: 0.5; padding: 0.1rem 0.3rem;
  }
  .close-panel:hover { opacity: 1; }

  /* Hardware trigger block */
  .hw-block { margin-top: 0.5rem; }
  .hw-row { display: flex; gap: 0.4rem; flex-wrap: wrap; align-items: center; }
  .hw-sensor-pill {
    display: inline-block; background: rgba(255,152,0,0.15); color: #ff9800;
    padding: 0.2rem 0.6rem; border-radius: 12px; font-size: 0.82rem;
    font-weight: 600; cursor: pointer; transition: background 0.1s;
  }
  .hw-sensor-pill:hover { background: rgba(255,152,0,0.25); }
  .hw-thresh-pill {
    display: inline-block; background: rgba(255,255,255,0.06);
    padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.8rem;
    cursor: pointer; transition: background 0.1s;
  }
  .hw-thresh-pill:hover { background: rgba(255,255,255,0.1); }
  .hw-waiting-anim {
    display: flex; align-items: center; gap: 0.5rem;
    margin-top: 0.6rem; font-size: 0.82rem; opacity: 0.4; font-style: italic;
  }
  .hw-pulse {
    width: 12px; height: 12px; border-radius: 50%;
    border: 2px solid #ff9800; animation: pulse-ring 1.5s ease-in-out infinite;
  }
  @keyframes pulse-ring {
    0%, 100% { transform: scale(1); opacity: 0.6; }
    50% { transform: scale(1.3); opacity: 0.15; }
  }
  .hw-feedback { margin-top: 0.4rem; font-size: 0.85rem; cursor: pointer; padding: 0.2rem 0; border-radius: 4px; }
  .hw-feedback:hover { background: rgba(255,255,255,0.03); }
  .hw-feedback.placeholder { opacity: 0.25; font-style: italic; }

  /* Quiz block */
  .quiz-block { margin-top: 0.5rem; }
  .quiz-option-row {
    display: flex; align-items: center; gap: 0.4rem;
    padding: 0.4rem 0.5rem; margin-bottom: 0.3rem;
    background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
    border-radius: 8px; transition: border-color 0.1s;
  }
  .quiz-option-row:hover { border-color: rgba(255,255,255,0.15); }
  .quiz-option-row.is-correct { border-color: rgba(74,222,128,0.3); background: rgba(74,222,128,0.04); }
  .correct-toggle {
    width: 26px; height: 26px; border-radius: 50%;
    border: 1.5px solid rgba(255,255,255,0.2); background: none;
    color: var(--text); font-size: 0.75rem; font-weight: 700;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; transition: border-color 0.1s, background 0.1s;
  }
  .is-correct .correct-toggle {
    border-color: #4ade80; background: rgba(74,222,128,0.15); color: #4ade80;
  }
  .correct-toggle:hover { border-color: var(--accent); }
  .quiz-opt-text {
    flex: 1; font-size: 0.88rem; cursor: text; padding: 0.1rem 0;
    min-height: 1.2em;
  }
  .quiz-opt-text:hover { opacity: 0.8; }
  .opt-remove {
    background: none; border: none; color: #ff6b6b; cursor: pointer;
    font-size: 0.7rem; opacity: 0; padding: 0.2rem;
    transition: opacity 0.15s;
  }
  .quiz-option-row:hover .opt-remove { opacity: 0.6; }
  .opt-remove:hover { opacity: 1; }
  .add-opt-btn {
    background: none; border: 1px dashed rgba(66,165,245,0.3); color: #42a5f5;
    padding: 0.25rem 0.6rem; border-radius: 6px; cursor: pointer;
    font-size: 0.78rem; margin-top: 0.2rem;
  }
  .add-opt-btn:hover { background: rgba(66,165,245,0.08); }
  .quiz-feedback {
    margin-top: 0.4rem; font-size: 0.85rem; cursor: pointer; padding: 0.2rem 0;
    border-radius: 4px;
  }
  .quiz-feedback:hover { background: rgba(255,255,255,0.03); }
  .quiz-feedback.placeholder { opacity: 0.25; font-style: italic; }

  /* Completion */
  .completion-display { text-align: center; padding: 1rem 0; }
  .completion-icon { font-size: 2.5rem; margin-bottom: 0.3rem; }
  .completion-text {
    font-size: 1.1rem; font-weight: 700; color: var(--accent); cursor: text;
  }
  .completion-text:hover { opacity: 0.8; }
</style>
