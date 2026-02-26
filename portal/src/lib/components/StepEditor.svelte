<script>
  const STEP_TYPES = [
    { value: 'instruction', label: 'Instruction' },
    { value: 'hardware_trigger', label: 'Hardware trigger' },
    { value: 'quiz', label: 'Quiz' },
    { value: 'completion', label: 'Completion' }
  ];

  const THRESHOLD_TOKEN_RE = /\s*(>=|<=|==|!=|>|<|AND\b|[a-zA-Z_][\w.]*|-?[\d.]+g?|[()])\s*/g;

  function validateThreshold(str) {
    const trimmed = (str || '').trim();
    if (!trimmed) return { valid: true, error: '' };
    try {
      const tokens = [];
      THRESHOLD_TOKEN_RE.lastIndex = 0;
      let m;
      while ((m = THRESHOLD_TOKEN_RE.exec(trimmed)) !== null) {
        const tok = m[1].trim();
        if (tok) tokens.push(tok);
      }
      if (tokens.length === 0) return { valid: false, error: 'No recognizable tokens' };
      let i = 0;
      function parseValue(tok) {
        if (!tok) throw new Error('Expected value, got end of input');
        if (/g$/i.test(tok)) { if (isNaN(parseFloat(tok))) throw new Error('Bad g-value: ' + tok); return; }
        if (isNaN(parseFloat(tok))) throw new Error('Expected number, got: ' + tok);
      }
      function parseCond() {
        const tok = tokens[i];
        if (!tok) throw new Error('Unexpected end');
        if (tok === 'steady' || tok === 'freefall') {
          i++;
          const op = tokens[i]; i++;
          const dur = tokens[i]; i++;
          if (!op) throw new Error('Missing operator after ' + tok);
          if (!dur || isNaN(parseFloat(dur))) throw new Error('Bad duration after ' + tok);
          return;
        }
        if (/^[a-zA-Z_][\w.]*$/.test(tok)) {
          i++;
          const op = tokens[i]; i++;
          const val = tokens[i]; i++;
          if (!op) throw new Error('Missing operator after ' + tok);
          parseValue(val);
          return;
        }
        throw new Error('Unexpected: ' + tok);
      }
      parseCond();
      while (i < tokens.length) {
        if (tokens[i] !== 'AND') throw new Error('Expected AND, got: ' + tokens[i]);
        i++;
        parseCond();
      }
      return { valid: true, error: '' };
    } catch (e) {
      return { valid: false, error: e.message };
    }
  }

  let { steps = $bindable([]), onchange = () => {} } = $props();

  let thresholdErrors = $state({});

  function newStep() {
    const idx = steps.length + 1;
    steps = [...steps, {
      id: `step_${idx}`,
      type: 'instruction',
      content: ''
    }];
    onchange();
  }

  function newStepOfType(type) {
    const idx = steps.length + 1;
    const base = { id: `step_${idx}`, type, content: '' };
    if (type === 'hardware_trigger') {
      base.sensor = '';
      base.threshold = '';
      base.feedback = '';
    }
    if (type === 'quiz') {
      base.answer_options = ['', ''];
      base.correct_index = 0;
      base.feedback = '';
    }
    steps = [...steps, base];
    onchange();
  }

  function removeStep(i) {
    steps = steps.filter((_, idx) => idx !== i);
    const errs = { ...thresholdErrors };
    delete errs[i];
    thresholdErrors = errs;
    onchange();
  }

  function moveUp(i) {
    if (i === 0) return;
    const arr = [...steps];
    [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
    steps = arr;
    onchange();
  }

  function moveDown(i) {
    if (i >= steps.length - 1) return;
    const arr = [...steps];
    [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
    steps = arr;
    onchange();
  }

  function updateField(i, field, value) {
    const arr = [...steps];
    arr[i] = { ...arr[i], [field]: value };
    steps = arr;
    if (field === 'threshold') {
      const result = validateThreshold(value);
      thresholdErrors = { ...thresholdErrors, [i]: result.valid ? '' : result.error };
    }
    onchange();
  }

  function onTypeChange(i, newType) {
    const arr = [...steps];
    const step = { ...arr[i], type: newType };
    if (newType === 'quiz' && !step.answer_options) {
      step.answer_options = ['', ''];
      step.correct_index = 0;
    }
    if (newType === 'hardware_trigger') {
      if (!step.sensor) step.sensor = '';
      if (!step.threshold) step.threshold = '';
    }
    arr[i] = step;
    steps = arr;
    onchange();
  }

  function addAnswerOption(i) {
    const arr = [...steps];
    const opts = [...(arr[i].answer_options || []), ''];
    arr[i] = { ...arr[i], answer_options: opts };
    steps = arr;
  }

  function updateAnswerOption(stepIdx, optIdx, value) {
    const arr = [...steps];
    const opts = [...(arr[stepIdx].answer_options || [])];
    opts[optIdx] = value;
    arr[stepIdx] = { ...arr[stepIdx], answer_options: opts };
    steps = arr;
    onchange();
  }

  function removeAnswerOption(stepIdx, optIdx) {
    const arr = [...steps];
    const opts = (arr[stepIdx].answer_options || []).filter((_, j) => j !== optIdx);
    const step = { ...arr[stepIdx], answer_options: opts };
    if (step.correct_index >= opts.length) step.correct_index = Math.max(0, opts.length - 1);
    arr[stepIdx] = step;
    steps = arr;
    onchange();
  }

  let expandedAdvanced = $state({});
  function toggleAdvanced(i) {
    expandedAdvanced = { ...expandedAdvanced, [i]: !expandedAdvanced[i] };
  }

  let showAddMenu = $state(false);
</script>

<section class="step-editor">
  <div class="step-header-bar">
    <h2>Steps ({steps.length})</h2>
    <div class="add-group">
      <button class="add-btn" onclick={newStep}>+ Add step</button>
      <button class="add-btn add-menu-toggle" onclick={() => showAddMenu = !showAddMenu} title="Add specific type">▾</button>
    </div>
  </div>

  {#if showAddMenu}
    <div class="add-menu">
      {#each STEP_TYPES as t}
        <button onclick={() => { newStepOfType(t.value); showAddMenu = false; }}>{t.label}</button>
      {/each}
    </div>
  {/if}

  {#if steps.length === 0}
    <p class="empty-hint">No steps yet. Add one to get started.</p>
  {/if}

  {#each steps as step, i (step.id + '-' + i)}
    <div class="step-card" class:hw={step.type === 'hardware_trigger'} class:quiz={step.type === 'quiz'} class:completion={step.type === 'completion'}>
      <div class="step-toolbar">
        <span class="step-num">#{i + 1}</span>
        <span class="step-type-badge" class:hw-badge={step.type === 'hardware_trigger'} class:quiz-badge={step.type === 'quiz'} class:comp-badge={step.type === 'completion'}>
          {STEP_TYPES.find(t => t.value === step.type)?.label || step.type}
        </span>
        <span class="spacer"></span>
        <button class="icon-btn" onclick={() => moveUp(i)} disabled={i === 0} title="Move up">↑</button>
        <button class="icon-btn" onclick={() => moveDown(i)} disabled={i === steps.length - 1} title="Move down">↓</button>
        <button class="icon-btn danger" onclick={() => removeStep(i)} title="Remove step">✕</button>
      </div>

      <div class="step-fields">
        <div class="row">
          <div class="form-group id-group">
            <label>ID
              <input type="text" value={step.id} oninput={(e) => updateField(i, 'id', e.target.value)}
                     pattern="^[a-z0-9_-]+$" placeholder="step_id" />
            </label>
          </div>
          <div class="form-group type-group">
            <label>Type
              <select value={step.type} onchange={(e) => onTypeChange(i, e.target.value)}>
                {#each STEP_TYPES as t}
                  <option value={t.value}>{t.label}</option>
                {/each}
              </select>
            </label>
          </div>
        </div>

        {#if step.type === 'completion'}
          <p class="type-hint">Completion steps mark the end of the lesson. Content is optional (e.g. a congratulations message).</p>
        {/if}

        <div class="form-group">
          <label>Content
            <textarea value={step.content || ''} oninput={(e) => updateField(i, 'content', e.target.value)}
                      rows="2" placeholder={step.type === 'completion' ? 'e.g. Congratulations! Lesson complete.' : step.type === 'quiz' ? 'Question shown to the student' : 'Lesson content shown to the student'}></textarea>
          </label>
        </div>

        {#if step.type === 'hardware_trigger'}
          <div class="row">
            <div class="form-group">
              <label>Sensor
                <input type="text" value={step.sensor || ''} oninput={(e) => updateField(i, 'sensor', e.target.value)}
                       placeholder="e.g. accelerometer, thermometer" />
              </label>
            </div>
            <div class="form-group">
              <label>Threshold
                <input type="text" value={step.threshold || ''} oninput={(e) => updateField(i, 'threshold', e.target.value)}
                       placeholder="e.g. accel.total > 2.5g" class:input-error={thresholdErrors[i]} />
              </label>
              {#if thresholdErrors[i]}
                <span class="field-error">{thresholdErrors[i]}</span>
              {/if}
            </div>
          </div>
          <p class="syntax-hint">Syntax: <code>sensorId op value</code> — chain with <code>AND</code>. Values: numbers or g-force (e.g. <code>2.5g</code>). Special: <code>freefall > 0.2s</code>, <code>steady > 3s</code>.</p>
          <div class="form-group">
            <label>Feedback
              <input type="text" value={step.feedback || ''} oninput={(e) => updateField(i, 'feedback', e.target.value)}
                     placeholder="Shown when sensor triggers (e.g. 'Great shake!')" />
            </label>
          </div>
        {/if}

        {#if step.type === 'quiz'}
          <div class="quiz-section">
            <label class="section-label">Answer options</label>
            {#each (step.answer_options || []) as opt, oi}
              <div class="answer-row">
                <input type="radio" name={`correct_${i}`} checked={step.correct_index === oi}
                       onchange={() => updateField(i, 'correct_index', oi)} title="Mark as correct" />
                <input type="text" value={opt} oninput={(e) => updateAnswerOption(i, oi, e.target.value)}
                       placeholder={`Option ${oi + 1}`} class="answer-input" />
                <button class="icon-btn danger small" onclick={() => removeAnswerOption(i, oi)} title="Remove option">✕</button>
              </div>
            {/each}
            <button class="link-btn" onclick={() => addAnswerOption(i)}>+ Add option</button>
            {#if step.correct_index != null && step.correct_index >= 0 && (step.answer_options || []).length > 0}
              <p class="correct-hint">Correct: option {step.correct_index + 1}</p>
            {/if}
            {#if (step.answer_options || []).length < 2}
              <p class="field-warning">Quiz steps need at least 2 answer options.</p>
            {/if}
          </div>
          <div class="form-group">
            <label>Feedback
              <input type="text" value={step.feedback || ''} oninput={(e) => updateField(i, 'feedback', e.target.value)}
                     placeholder="Shown after answering (e.g. 'Correct! Gravity is 9.8 m/s²')" />
            </label>
          </div>
        {/if}

        <button class="link-btn advanced-toggle" onclick={() => toggleAdvanced(i)}>
          {expandedAdvanced[i] ? '▾ Hide advanced' : '▸ Advanced fields'}
        </button>

        {#if expandedAdvanced[i]}
          <div class="advanced-fields">
            {#if step.type !== 'hardware_trigger' && step.type !== 'quiz'}
              <div class="form-group">
                <label>Feedback
                  <input type="text" value={step.feedback || ''} oninput={(e) => updateField(i, 'feedback', e.target.value)}
                         placeholder="Shown after step completes" />
                </label>
              </div>
            {/if}
            <div class="row">
              <div class="form-group">
                <label>Max attempts
                  <input type="number" value={step.max_attempts ?? ''} min="1"
                         oninput={(e) => updateField(i, 'max_attempts', e.target.value ? parseInt(e.target.value) : undefined)} />
                </label>
              </div>
              <div class="form-group">
                <label>Weight (0–1)
                  <input type="number" value={step.weight ?? ''} min="0" max="1" step="0.1"
                         oninput={(e) => updateField(i, 'weight', e.target.value ? parseFloat(e.target.value) : undefined)} />
                </label>
              </div>
              <div class="form-group">
                <label>Expected duration
                  <input type="text" value={step.expected_duration || ''} oninput={(e) => updateField(i, 'expected_duration', e.target.value)}
                         placeholder="e.g. PT5M" />
                </label>
              </div>
            </div>
            <div class="row">
              <div class="form-group">
                <label>On fail
                  <input type="text" value={step.on_fail || ''} oninput={(e) => updateField(i, 'on_fail', e.target.value)}
                         placeholder="redirect:step_id, skip, or hint" />
                </label>
              </div>
              <div class="form-group">
                <label>On success
                  <input type="text" value={step.on_success || ''} oninput={(e) => updateField(i, 'on_success', e.target.value)}
                         placeholder="skip_to:step_id" />
                </label>
              </div>
            </div>
            <div class="row">
              <div class="form-group">
                <label>Condition
                  <input type="text" value={step.condition || ''} oninput={(e) => updateField(i, 'condition', e.target.value)}
                         placeholder="Conditional expression" />
                </label>
              </div>
              <div class="form-group">
                <label>Next if
                  <input type="text" value={step.next_if || ''} oninput={(e) => updateField(i, 'next_if', e.target.value)}
                         placeholder="condition -> step_id" />
                </label>
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/each}

  {#if steps.length > 0}
    <button class="add-btn bottom" onclick={newStep}>+ Add step</button>
  {/if}
</section>

<style>
  .step-editor { margin-top: 0.5rem; }
  .step-header-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
  .step-header-bar h2 { margin: 0; }
  .empty-hint { opacity: 0.7; font-style: italic; }

  .add-group { display: flex; gap: 0; }
  .add-menu-toggle { border-left: 1px solid var(--accent); border-top-left-radius: 0; border-bottom-left-radius: 0; padding: 0.5rem 0.5rem; }
  .add-menu {
    display: flex; gap: 0.4rem; margin-bottom: 0.75rem; flex-wrap: wrap;
  }
  .add-menu button {
    background: rgba(31,43,78,0.7); color: var(--text); border: 1px solid var(--border);
    padding: 0.35rem 0.7rem; border-radius: 5px; cursor: pointer; font-size: 0.85rem;
  }
  .add-menu button:hover { border-color: var(--accent); color: var(--accent); }

  .step-card {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.75rem 1rem;
    margin-bottom: 0.75rem;
    background: rgba(31,43,78,0.5);
  }
  .step-card.hw { border-left: 3px solid #ff9800; }
  .step-card.quiz { border-left: 3px solid #42a5f5; }
  .step-card.completion { border-left: 3px solid #66bb6a; }

  .step-toolbar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .step-num { font-weight: bold; opacity: 0.7; min-width: 2rem; }
  .step-type-badge {
    font-size: 0.8rem;
    padding: 0.15rem 0.5rem;
    border-radius: 10px;
    background: rgba(255,255,255,0.08);
    letter-spacing: 0.03em;
  }
  .step-type-badge.hw-badge { background: rgba(255,152,0,0.15); color: #ff9800; }
  .step-type-badge.quiz-badge { background: rgba(66,165,245,0.15); color: #42a5f5; }
  .step-type-badge.comp-badge { background: rgba(102,187,106,0.15); color: #66bb6a; }
  .spacer { flex: 1; }

  .icon-btn {
    background: none; border: 1px solid var(--border); color: var(--text);
    width: 28px; height: 28px; border-radius: 4px; cursor: pointer;
    display: flex; align-items: center; justify-content: center; font-size: 0.9rem;
  }
  .icon-btn:disabled { opacity: 0.3; cursor: not-allowed; }
  .icon-btn.danger { color: #ff6b6b; border-color: rgba(255,107,107,0.3); }
  .icon-btn.danger.small { width: 24px; height: 24px; font-size: 0.75rem; }

  .step-fields { }
  .form-group { margin-bottom: 0.6rem; }
  .form-group label { display: block; font-weight: 600; font-size: 0.9rem; margin-bottom: 0.2rem; }
  .form-group input,
  .form-group select,
  .form-group textarea {
    width: 100%; padding: 0.45rem; background: #1a2544; color: var(--text);
    border: 1px solid var(--border); border-radius: 5px; font-size: 0.95rem; font-family: inherit;
  }
  .form-group textarea { resize: vertical; }
  .form-group input[type="number"] { max-width: 100px; }
  .form-group input.input-error { border-color: #ff6b6b; }

  .field-error { color: #ff6b6b; font-size: 0.8rem; display: block; margin-top: 0.15rem; }
  .field-warning { color: #ffaa00; font-size: 0.8rem; margin-top: 0.2rem; }

  .type-hint { font-size: 0.85rem; opacity: 0.7; font-style: italic; margin: 0 0 0.5rem; }
  .syntax-hint { font-size: 0.8rem; opacity: 0.65; margin: 0.1rem 0 0.5rem; line-height: 1.5; }
  .syntax-hint code { background: rgba(255,255,255,0.06); padding: 0.1rem 0.3rem; border-radius: 3px; font-size: 0.8rem; }

  .row { display: flex; gap: 0.75rem; flex-wrap: wrap; }
  .row .form-group { flex: 1; min-width: 120px; }
  .id-group { max-width: 200px; }
  .type-group { max-width: 200px; }

  .quiz-section { margin-top: 0.25rem; }
  .section-label { font-weight: 600; font-size: 0.9rem; display: block; margin-bottom: 0.4rem; }
  .answer-row { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.35rem; }
  .answer-row input[type="radio"] { flex-shrink: 0; accent-color: var(--accent); }
  .answer-input { flex: 1; }
  .correct-hint { font-size: 0.85rem; color: var(--accent); margin-top: 0.25rem; }

  .link-btn {
    background: none; border: none; color: var(--accent); cursor: pointer;
    font-size: 0.9rem; padding: 0.2rem 0;
  }
  .link-btn:hover { text-decoration: underline; }
  .advanced-toggle { margin-top: 0.5rem; opacity: 0.8; }
  .advanced-fields { margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px dashed rgba(255,255,255,0.08); }

  .add-btn {
    background: rgba(0,230,118,0.12); color: var(--accent); border: 1px dashed var(--accent);
    padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; font-size: 0.95rem;
  }
  .add-btn:hover { background: rgba(0,230,118,0.2); }
  .add-btn.bottom { width: 100%; margin-top: 0.25rem; }
</style>
