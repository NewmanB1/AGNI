<script>
  let { ir = null, sidecar = null, loading = false, error = '', steps = [], title = '' } = $props();

  let activeTab = $state('student');
  let expandedSteps = $state({});
  let studentStep = $state(0);
  let studentAnswer = $state(null);
  let studentFeedback = $state('');

  function toggleStep(i) {
    expandedSteps = { ...expandedSteps, [i]: !expandedSteps[i] };
  }

  const irSteps = $derived(
    ir && Array.isArray(ir.steps) ? ir.steps : []
  );

  const sidecarObj = $derived(
    sidecar && typeof sidecar === 'object' ? sidecar : null
  );

  const previewSteps = $derived(
    steps && steps.length > 0 ? steps : irSteps
  );

  const currentStep = $derived(
    previewSteps[studentStep] || null
  );

  function goStep(delta) {
    const next = studentStep + delta;
    if (next >= 0 && next < previewSteps.length) {
      studentStep = next;
      studentAnswer = null;
      studentFeedback = '';
    }
  }

  function pickAnswer(idx) {
    studentAnswer = idx;
    if (currentStep) {
      if (idx === currentStep.correct_index) {
        studentFeedback = currentStep.feedback || 'Correct!';
      } else {
        studentFeedback = 'Try again — that\'s not quite right.';
      }
    }
  }

  function resetStudentView() {
    studentStep = 0;
    studentAnswer = null;
    studentFeedback = '';
  }

  import { renderMarkdown } from '$lib/renderMarkdown.js';
  import { getFactoryById } from '$lib/svg-catalog.js';

  function renderContent(text) {
    return renderMarkdown(text);
  }
</script>

<section class="preview-panel">
  <div class="tab-bar">
    <button class:active={activeTab === 'student'} onclick={() => { activeTab = 'student'; resetStudentView(); }}>Student View</button>
    <button class:active={activeTab === 'sidecar'} onclick={() => activeTab = 'sidecar'}>Sidecar</button>
    <button class:active={activeTab === 'ir'} onclick={() => activeTab = 'ir'}>IR (compiled)</button>
    <button class:active={activeTab === 'json'} onclick={() => activeTab = 'json'}>Raw JSON</button>
  </div>

  {#if loading}
    <p class="hint">Compiling preview…</p>
  {:else if error}
    <p class="preview-error">{error}</p>
  {:else}

    {#if activeTab === 'student'}
      <div class="student-view">
        {#if previewSteps.length === 0}
          <p class="hint">No steps to preview. Add steps in the Steps tab.</p>
        {:else}
          <div class="student-header">
            <h3 class="student-title">{title || 'Untitled Lesson'}</h3>
            <span class="step-counter">Step {studentStep + 1} of {previewSteps.length}</span>
          </div>
          <div class="student-progress">
            <div class="progress-fill" style="width: {((studentStep + 1) / previewSteps.length) * 100}%"></div>
          </div>

          {#if currentStep}
            <div class="student-step" class:quiz-step={currentStep.type === 'quiz'} class:hw-step={currentStep.type === 'hardware_trigger'} class:svg-step={currentStep.type === 'svg'} class:completion-step={currentStep.type === 'completion'}>
              <span class="step-type-label">
                {currentStep.type === 'hardware_trigger' ? 'Hardware Activity' : currentStep.type === 'quiz' ? 'Quiz Question' : currentStep.type === 'svg' ? 'Visual' : currentStep.type === 'completion' ? 'Complete' : 'Lesson Content'}
              </span>

              {#if currentStep.content}
                <div class="student-content">{@html renderContent(currentStep.content)}</div>
              {/if}

              {#if currentStep.type === 'hardware_trigger'}
                <div class="hw-info">
                  {#if currentStep.sensor}
                    <div class="sensor-badge">Sensor: {currentStep.sensor}</div>
                  {/if}
                  {#if currentStep.threshold}
                    <div class="threshold-info">Trigger: <code>{currentStep.threshold}</code></div>
                  {/if}
                  <p class="hw-prompt">Waiting for sensor data…</p>
                </div>
              {/if}

              {#if currentStep.type === 'quiz' && Array.isArray(currentStep.answer_options)}
                <div class="quiz-options">
                  {#each currentStep.answer_options as opt, oi}
                    <button
                      class="quiz-option"
                      class:selected={studentAnswer === oi}
                      class:correct={studentAnswer != null && oi === currentStep.correct_index}
                      class:wrong={studentAnswer === oi && oi !== currentStep.correct_index}
                      onclick={() => pickAnswer(oi)}
                      disabled={studentAnswer != null}
                    >
                      <span class="option-letter">{String.fromCharCode(65 + oi)}</span>
                      {opt}
                    </button>
                  {/each}
                </div>
                {#if studentFeedback}
                  <div class="student-feedback" class:correct-fb={studentAnswer === currentStep.correct_index}>
                    {studentFeedback}
                  </div>
                {/if}
              {/if}

              {#if currentStep.type === 'svg' && currentStep.svg_spec}
                {@const factoryDesc = getFactoryById(currentStep.svg_spec.factory)}
                <div class="svg-preview-card">
                  {#if factoryDesc}
                    <div class="svg-preview-header">
                      <span class="svg-icon">{factoryDesc.icon}</span>
                      <span class="svg-name">{factoryDesc.label}</span>
                      {#if factoryDesc.dynamic}<span class="svg-dynamic">dynamic</span>{/if}
                    </div>
                    <div class="svg-params">
                      {#each Object.entries(currentStep.svg_spec.opts || {}) as [key, val]}
                        {#if val != null && val !== '' && typeof val !== 'object'}
                          <span class="svg-param"><strong>{key}:</strong> {val}</span>
                        {/if}
                      {/each}
                    </div>
                    <p class="svg-runtime-note">SVG rendered by edge device at runtime</p>
                  {:else}
                    <p class="svg-runtime-note">Unknown factory: {currentStep.svg_spec.factory}</p>
                  {/if}
                </div>
              {/if}

              {#if currentStep.type === 'completion'}
                <div class="completion-msg">Lesson complete!</div>
              {/if}

              {#if currentStep.expected_duration}
                <span class="duration-hint">Expected: {currentStep.expected_duration}</span>
              {/if}
            </div>
          {/if}

          <div class="student-nav">
            <button onclick={() => goStep(-1)} disabled={studentStep === 0}>Back</button>
            <button onclick={() => goStep(1)} disabled={studentStep >= previewSteps.length - 1}>Next</button>
          </div>
        {/if}
      </div>
    {/if}

    {#if activeTab === 'sidecar' && sidecarObj}
      <div class="sidecar-view">
        <table class="meta-table">
          <tbody>
            {#if sidecarObj.identifier}<tr><td class="key">Identifier</td><td>{sidecarObj.identifier}</td></tr>{/if}
            {#if sidecarObj.title}<tr><td class="key">Title</td><td>{sidecarObj.title}</td></tr>{/if}
            {#if sidecarObj.language}<tr><td class="key">Language</td><td>{sidecarObj.language}</td></tr>{/if}
            {#if sidecarObj.difficulty != null}<tr><td class="key">Difficulty</td><td>{sidecarObj.difficulty}</td></tr>{/if}
            {#if sidecarObj.teaching_mode}<tr><td class="key">Teaching mode</td><td>{sidecarObj.teaching_mode}</td></tr>{/if}
            {#if sidecarObj.utu}
              <tr><td class="key">UTU class</td><td>{sidecarObj.utu.class || '—'}</td></tr>
              <tr><td class="key">UTU band</td><td>{sidecarObj.utu.band ?? '—'}</td></tr>
              {#if sidecarObj.utu.protocol}<tr><td class="key">UTU protocol</td><td>P{sidecarObj.utu.protocol}</td></tr>{/if}
            {/if}
            {#if sidecarObj.stepCount != null}<tr><td class="key">Step count</td><td>{sidecarObj.stepCount}</td></tr>{/if}
          </tbody>
        </table>

        {#if sidecarObj.ontology}
          <h4>Ontology</h4>
          <div class="ont-row">
            {#if sidecarObj.ontology.requires?.length}
              <div><strong>Requires:</strong> {sidecarObj.ontology.requires.map(r => r.skill || JSON.stringify(r)).join(', ')}</div>
            {/if}
            {#if sidecarObj.ontology.provides?.length}
              <div><strong>Provides:</strong> {sidecarObj.ontology.provides.map(p => p.skill || JSON.stringify(p)).join(', ')}</div>
            {/if}
          </div>
        {/if}
      </div>
    {/if}

    {#if activeTab === 'ir' && ir}
      <div class="ir-view">
        {#if ir.meta}
          <h4>Meta</h4>
          <pre class="json-block">{JSON.stringify(ir.meta, null, 2)}</pre>
        {/if}
        {#if irSteps.length}
          <h4>Steps ({irSteps.length})</h4>
          {#each irSteps as step, i}
            <div class="ir-step">
              <button class="step-toggle" onclick={() => toggleStep(i)}>
                {expandedSteps[i] ? '▾' : '▸'} #{i + 1} <span class="step-id">{step.id || '?'}</span>
                <span class="step-type">{step.type}</span>
              </button>
              {#if expandedSteps[i]}
                <pre class="json-block">{JSON.stringify(step, null, 2)}</pre>
              {/if}
            </div>
          {/each}
        {/if}
        {#if ir.gate}
          <h4>Gate</h4>
          <pre class="json-block">{JSON.stringify(ir.gate, null, 2)}</pre>
        {/if}
      </div>
    {/if}

    {#if activeTab === 'json'}
      <div class="raw-view">
        <h4>Sidecar</h4>
        <pre class="json-block">{JSON.stringify(sidecar, null, 2)}</pre>
        <h4>IR</h4>
        <pre class="json-block">{JSON.stringify(ir, null, 2)}</pre>
      </div>
    {/if}

  {/if}
</section>

<style>
  .preview-panel { margin-top: 0.5rem; }

  .tab-bar { display: flex; gap: 0; margin-bottom: 0.75rem; border-bottom: 1px solid var(--border); }
  .tab-bar button {
    background: none; border: none; color: var(--text); padding: 0.5rem 1rem;
    cursor: pointer; font-size: 0.9rem; border-bottom: 2px solid transparent;
    opacity: 0.7; transition: opacity 0.15s, border-color 0.15s;
  }
  .tab-bar button:hover { opacity: 1; }
  .tab-bar button.active { opacity: 1; border-bottom-color: var(--accent); color: var(--accent); font-weight: 600; }

  .hint { opacity: 0.7; font-style: italic; font-size: 0.9rem; }
  .preview-error { color: #ff6b6b; }

  /* Student View */
  .student-view { max-width: 600px; margin: 0 auto; }
  .student-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.5rem; }
  .student-title { margin: 0; font-size: 1.15rem; }
  .step-counter { font-size: 0.85rem; opacity: 0.7; white-space: nowrap; }

  .student-progress {
    height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px;
    margin-bottom: 1.25rem; overflow: hidden;
  }
  .progress-fill {
    height: 100%; background: var(--accent); border-radius: 2px;
    transition: width 0.3s ease;
  }

  .student-step {
    background: rgba(31,43,78,0.6); border: 1px solid var(--border);
    border-radius: 10px; padding: 1.25rem; min-height: 180px;
    position: relative;
  }
  .student-step.quiz-step { border-left: 3px solid #42a5f5; }
  .student-step.hw-step { border-left: 3px solid #ff9800; }
  .student-step.svg-step { border-left: 3px solid #ce93d8; }
  .student-step.completion-step { border-left: 3px solid #66bb6a; }

  .step-type-label {
    display: inline-block; font-size: 0.75rem; text-transform: uppercase;
    letter-spacing: 0.06em; opacity: 0.6; margin-bottom: 0.75rem; font-weight: 600;
  }

  .student-content { font-size: 1rem; line-height: 1.7; }
  .student-content :global(code) {
    background: rgba(255,255,255,0.08); padding: 0.1rem 0.35rem; border-radius: 3px;
    font-size: 0.9rem;
  }

  .hw-info { margin-top: 1rem; }
  .sensor-badge {
    display: inline-block; background: rgba(255,152,0,0.15); color: #ff9800;
    padding: 0.2rem 0.6rem; border-radius: 12px; font-size: 0.85rem; font-weight: 600;
  }
  .threshold-info { margin-top: 0.5rem; font-size: 0.9rem; opacity: 0.85; }
  .threshold-info code { background: rgba(255,255,255,0.06); padding: 0.1rem 0.3rem; border-radius: 3px; }
  .hw-prompt { font-style: italic; opacity: 0.6; margin-top: 0.75rem; }

  .quiz-options { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 1rem; }
  .quiz-option {
    display: flex; align-items: center; gap: 0.75rem;
    background: rgba(255,255,255,0.05); border: 1px solid var(--border);
    border-radius: 8px; padding: 0.7rem 1rem; cursor: pointer; color: var(--text);
    font-size: 0.95rem; text-align: left; transition: border-color 0.15s, background 0.15s;
  }
  .quiz-option:hover:not(:disabled) { border-color: var(--accent); background: rgba(0,230,118,0.06); }
  .quiz-option.selected { border-color: var(--accent); }
  .quiz-option.correct { border-color: #4ade80; background: rgba(74,222,128,0.1); }
  .quiz-option.wrong { border-color: #ff6b6b; background: rgba(255,107,107,0.1); }
  .quiz-option:disabled { cursor: default; }
  .option-letter {
    display: inline-flex; align-items: center; justify-content: center;
    width: 26px; height: 26px; border-radius: 50%; border: 1px solid var(--border);
    font-weight: 700; font-size: 0.8rem; flex-shrink: 0;
  }

  .student-feedback {
    margin-top: 0.75rem; padding: 0.6rem 0.8rem; border-radius: 6px;
    font-size: 0.9rem; background: rgba(255,107,107,0.1); color: #ff6b6b;
  }
  .student-feedback.correct-fb { background: rgba(74,222,128,0.1); color: #4ade80; }

  .svg-preview-card {
    background: rgba(206,147,216,0.06); border: 1px solid rgba(206,147,216,0.2);
    border-radius: 8px; padding: 0.8rem; margin-top: 0.75rem;
  }
  .svg-preview-header {
    display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.4rem;
  }
  .svg-icon { font-size: 1.3rem; }
  .svg-name { font-weight: 600; font-size: 0.95rem; }
  .svg-dynamic {
    font-size: 0.65rem; background: rgba(77,171,247,0.15); color: #4dabf7;
    padding: 0.1rem 0.4rem; border-radius: 8px;
  }
  .svg-params {
    display: flex; flex-wrap: wrap; gap: 0.3rem 0.6rem; font-size: 0.82rem; opacity: 0.8;
  }
  .svg-param strong { font-weight: 600; }
  .svg-runtime-note {
    font-size: 0.8rem; opacity: 0.5; font-style: italic; margin-top: 0.4rem;
  }

  .completion-msg {
    font-size: 1.3rem; font-weight: 700; color: var(--accent); text-align: center;
    padding: 2rem 0;
  }

  .duration-hint {
    display: block; margin-top: 0.75rem; font-size: 0.8rem; opacity: 0.5;
  }

  .student-nav {
    display: flex; justify-content: space-between; margin-top: 1rem;
  }
  .student-nav button {
    background: rgba(255,255,255,0.08); border: 1px solid var(--border); color: var(--text);
    padding: 0.5rem 1.5rem; border-radius: 6px; cursor: pointer; font-size: 0.9rem;
    transition: border-color 0.15s;
  }
  .student-nav button:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
  .student-nav button:disabled { opacity: 0.3; cursor: not-allowed; }

  /* Sidecar / IR / JSON views */
  .meta-table { width: 100%; border-collapse: collapse; }
  .meta-table td { padding: 0.3rem 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 0.95rem; }
  .meta-table .key { font-weight: 600; opacity: 0.85; width: 140px; }

  h4 { margin: 1rem 0 0.4rem; font-size: 0.95rem; opacity: 0.9; }
  .ont-row { font-size: 0.9rem; line-height: 1.6; }

  .ir-step { margin-bottom: 0.25rem; }
  .step-toggle {
    background: none; border: none; color: var(--text); cursor: pointer;
    font-size: 0.9rem; padding: 0.3rem 0; display: flex; gap: 0.5rem; align-items: center;
  }
  .step-toggle:hover { color: var(--accent); }
  .step-id { font-family: monospace; opacity: 0.8; }
  .step-type { font-size: 0.8rem; background: rgba(255,255,255,0.08); padding: 0.1rem 0.4rem; border-radius: 8px; }

  .json-block {
    background: #121830; border: 1px solid var(--border); border-radius: 6px;
    padding: 0.6rem 0.8rem; overflow-x: auto; font-size: 0.85rem;
    line-height: 1.5; max-height: 400px; overflow-y: auto; white-space: pre-wrap;
  }

  .raw-view { }
</style>
