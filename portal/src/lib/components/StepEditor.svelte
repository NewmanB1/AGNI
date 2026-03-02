<script>
  import SvgSpecEditor from './SvgSpecEditor.svelte';
  import { getFactoryById, EXPERIMENT_PRESETS, getExperimentById } from '$lib/svg-catalog.js';

  const STEP_TYPES = [
    { value: 'instruction', label: 'Instruction' },
    { value: 'hardware_trigger', label: 'Hardware trigger' },
    { value: 'quiz', label: 'Quiz' },
    { value: 'fill_blank', label: 'Fill in the blank' },
    { value: 'matching', label: 'Matching' },
    { value: 'ordering', label: 'Ordering' },
    { value: 'svg', label: 'SVG Visual' },
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

  const STEP_TEMPLATES = [
    { label: 'Instruction', type: 'instruction', content: 'Explain the concept here.', icon: 'I' },
    { label: 'Quiz (MCQ)', type: 'quiz', content: 'What is the correct answer?', icon: 'Q',
      answer_options: ['Option A', 'Option B', 'Option C'], correct_index: 0, feedback: 'Well done!' },
    { label: 'Hardware Activity', type: 'hardware_trigger', content: 'Perform the physical activity.', icon: 'H',
      sensor: 'accelerometer', threshold: '', feedback: '' },
    { label: 'Completion', type: 'completion', content: 'Congratulations, you finished the lesson!', icon: 'C' },
    { label: 'Reflection', type: 'instruction', content: 'Take a moment to think about what you learned.\n\nWrite your thoughts below.', icon: 'R' },
    { label: 'Worked Example', type: 'instruction', content: '**Example:** ...\n\n**Step 1:** ...\n**Step 2:** ...\n**Answer:** ...', icon: 'E' },
    { label: 'SVG Visual', type: 'svg', content: 'Observe the diagram below.', icon: 'V',
      svg_spec: null },
    { label: 'Fill in the blank', type: 'fill_blank', content: 'The force of ___ pulls objects toward the Earth.', icon: 'F',
      blanks: [{ answer: 'gravity', accept: ['Gravity', 'GRAVITY'] }] },
    { label: 'Matching', type: 'matching', content: 'Match each term to its definition.', icon: 'M',
      pairs: [{ left: 'Force', right: 'A push or pull' }, { left: 'Mass', right: 'Amount of matter' }] },
    { label: 'Ordering', type: 'ordering', content: 'Put the steps in the correct order.', icon: 'O',
      items: ['Step 1', 'Step 2', 'Step 3'], correct_order: [0, 1, 2] },
  ];

  const PHYSICS_TEMPLATES = [
    {
      label: 'Freefall Experiment',
      icon: '🍎',
      description: 'Calibration → drop → graph → quiz',
      steps: [
        { type: 'instruction', content: '**Freefall Experiment**\n\nHold the phone flat in your hand, screen up, about 30–50 cm above a soft surface.\n\n⚠️ **Safety:** Use a pillow or soft mat to catch the phone!' },
        { type: 'hardware_trigger', content: 'Hold the phone **flat and still** until the sensor confirms it is level.', sensor: 'accelerometer', threshold: 'accel.z > 7.5', feedback: 'Phone is level — ready to drop!', max_attempts: 999, on_fail: 'skip_to:freefall_drop' },
        { type: 'hardware_trigger', content: 'Now **drop the phone** onto the soft surface.\n\nThe sensor will detect when it is in freefall (weightless).', sensor: 'accelerometer', threshold: 'freefall > 0.35s', feedback: 'Freefall detected!', max_attempts: 5, on_fail: 'skip_to:freefall_explanation' },
        { type: 'svg', content: 'Here is what the acceleration looked like during your experiment:', svg_spec: { factory: 'timeGraph', opts: { title: 'Freefall Acceleration', w: 420, h: 280, windowSeconds: 5, xLabel: 'Time (s)', streams: [{ sensor: 'accel.total', label: 'Total Accel (m/s²)', color: '#ff6b35', yMin: 0, yMax: 15 }] } } },
        { type: 'quiz', content: 'Why did the phone read **nearly zero** acceleration during the drop?', answer_options: ['The sensor broke momentarily', 'Air resistance cancelled gravity', 'The phone was falling at the same rate as gravity — no relative force', 'The phone was too light to measure'], correct_index: 2, feedback: 'Correct! During freefall, the phone and its sensor fall together at 9.8 m/s², so no force is felt — just like astronauts in orbit.' },
        { type: 'completion', content: '🎉 You just demonstrated weightlessness with your phone!\n\nAt rest: ~9.8 m/s² (gravity). In freefall: ~0 m/s² (weightless).' }
      ]
    },
    {
      label: 'Pendulum Lab',
      icon: '🔄',
      description: 'Build a pendulum, measure swing period',
      steps: [
        { type: 'instruction', content: '**Pendulum Lab**\n\nTie your phone to a string (use a sock or soft pouch for safety). The string should be about 30–50 cm long.\n\nYou will swing it gently and measure the period.' },
        { type: 'svg', content: 'Watch the pendulum tracker as you swing the phone gently left and right:', svg_spec: { factory: 'numberLineDynamic', opts: { title: 'Pendulum Angle', w: 420, h: 120, min: -90, max: 90, step: 15, sensor: 'rotation.gamma', sensorMin: -90, sensorMax: 90, ballColor: '#4dabf7', marks: [{ value: 0, label: 'rest', color: '#4ade80' }] } } },
        { type: 'svg', content: 'And here is the gyroscope graph showing the rotation rate:', svg_spec: { factory: 'timeGraph', opts: { title: 'Swing Rate', w: 420, h: 280, windowSeconds: 10, xLabel: 'Time (s)', streams: [{ sensor: 'gyro.x', label: 'Rotation (deg/s)', color: '#c084fc', yMin: -200, yMax: 200 }] } } },
        { type: 'fill_blank', content: 'A pendulum swings back and forth at a regular rate called its ___.', blanks: [{ answer: 'period', accept: ['Period', 'frequency', 'Frequency'] }] },
        { type: 'completion', content: '🎉 You measured a real pendulum!\n\nFun fact: Galileo discovered that a pendulum\'s period depends on its **length**, not its weight.' }
      ]
    },
    {
      label: 'Tilt & Trigonometry',
      icon: '📐',
      description: 'Explore sin/cos/tan by tilting the phone',
      steps: [
        { type: 'instruction', content: '**Tilt & Trigonometry**\n\nHold the phone flat, then slowly tilt it left and right. Watch how sine, cosine, and tangent change on the unit circle.' },
        { type: 'svg', content: 'Tilt the phone to move the point around the unit circle:', svg_spec: { factory: 'unitCircle', opts: { title: 'Tilt to Explore', w: 320, h: 300, angleDeg: 0, sensor: 'rotation.gamma', sensorMin: -90, sensorMax: 90, showSine: true, showCosine: true, showTangent: true, showValues: true } } },
        { type: 'quiz', content: 'At what angle are sine and cosine **equal**?', answer_options: ['0°', '30°', '45°', '90°'], correct_index: 2, feedback: 'At 45°, sin(45°) = cos(45°) ≈ 0.707. You can verify by tilting the phone to 45° and checking the readout!' },
        { type: 'completion', content: '🎉 You just explored trigonometry with your body!\n\nTry finding the angle where tangent goes to infinity (hint: tilt to 90°).' }
      ]
    },
    {
      label: 'Force & Motion Dashboard',
      icon: '🚀',
      description: 'Multi-sensor display + shake challenge',
      steps: [
        { type: 'instruction', content: '**Force & Motion Dashboard**\n\nYour phone can measure forces in three dimensions. Let\'s explore what different motions look like on the sensors.' },
        { type: 'svg', content: 'Watch the G-force meter as you move the phone:', svg_spec: { factory: 'gauge', opts: { title: 'G-Force', min: 0, max: 3, unit: 'g', w: 260, h: 200, ticks: 6, sensor: 'accel.total', sensorMin: 0, sensorMax: 29.43, zones: [{ from: 0, to: 0.1, color: '#60a5fa' }, { from: 0.1, to: 0.7, color: '#4ade80' }, { from: 0.7, to: 0.9, color: '#facc15' }, { from: 0.9, to: 1.0, color: '#f87171' }] } } },
        { type: 'svg', content: 'Now look at all three axes on this live graph:', svg_spec: { factory: 'timeGraph', opts: { title: 'Acceleration (3-axis)', w: 420, h: 300, windowSeconds: 5, xLabel: 'Time (s)', streams: [{ sensor: 'accel.x', label: 'X', color: '#f87171', yMin: -15, yMax: 15 }, { sensor: 'accel.y', label: 'Y', color: '#4ade80', yMin: -15, yMax: 15 }, { sensor: 'accel.z', label: 'Z', color: '#60a5fa', yMin: -15, yMax: 15 }] } } },
        { type: 'hardware_trigger', content: 'Challenge: **Shake the phone hard** to exceed 2g!', sensor: 'accelerometer', threshold: 'accel.total > 2.5g AND steady > 0.3s', feedback: 'Wow, that was a strong shake!', max_attempts: 10 },
        { type: 'quiz', content: 'When you held the phone still, which axis showed ~9.8 m/s²?', answer_options: ['X (left-right)', 'Y (up-down)', 'Z (toward/away)', 'It depends on phone orientation'], correct_index: 3, feedback: 'Correct! The axis reading ~9.8 m/s² depends on which way the phone points — gravity always pulls downward.' },
        { type: 'completion', content: '🎉 You explored Newton\'s laws with your phone as a lab instrument!' }
      ]
    },
    {
      label: 'Geometry Explorer',
      icon: '⬡',
      description: 'Tilt to rotate and scale shapes',
      steps: [
        { type: 'instruction', content: '**Geometry Explorer**\n\nHold the phone flat. Tilt it to rotate and scale the polygon. Observe how interior angles and side lengths change as you interact.' },
        { type: 'svg', content: 'Tilt the phone to rotate and scale the shape:', svg_spec: { factory: 'polygonDynamic', opts: { title: 'Tilt Me!', w: 300, h: 300, sides: 6, r: 90, color: '#4dabf7', fillOpacity: 0.25, showAngles: true, showVertexLabels: true, rotateSensor: 'rotation.gamma', rotateSensorMin: -90, rotateSensorMax: 90, scaleSensor: 'rotation.beta', scaleMin: 0.5, scaleMax: 1.5 } } },
        { type: 'quiz', content: 'What is the sum of interior angles in a hexagon (6 sides)?', answer_options: ['360°', '540°', '720°', '900°'], correct_index: 2, feedback: 'Correct! The formula is (n-2) × 180° = (6-2) × 180° = 720°. Each interior angle of a regular hexagon is 120°.' },
        { type: 'completion', content: '🎉 You explored polygon geometry through physical interaction!' }
      ]
    }
  ];

  let showPhysicsMenu = $state(false);

  let { steps = $bindable([]), onchange = () => {}, onfocus = () => {} } = $props();

  let thresholdErrors = $state({});
  let contentPreview = $state({});
  let showRefSuggestions = $state({});

  function nextStepId() {
    let max = 0;
    for (const s of steps) {
      const m = (s.id || '').match(/^step_(\d+)$/);
      if (m) max = Math.max(max, parseInt(m[1]));
    }
    return `step_${max + 1}`;
  }

  function newStep() {
    steps = [...steps, { id: nextStepId(), type: 'instruction', content: '' }];
    onchange();
  }

  function newStepOfType(type) {
    const base = { id: nextStepId(), type, content: '' };
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
    if (type === 'svg') {
      base.svg_spec = null;
    }
    steps = [...steps, base];
    onchange();
  }

  function removeStep(i) {
    const sid = steps[i]?.id;
    steps = steps.filter((_, idx) => idx !== i);
    if (sid) {
      const errs = { ...thresholdErrors }; delete errs[sid]; thresholdErrors = errs;
      const cp = { ...contentPreview }; delete cp[sid]; contentPreview = cp;
      const ea = { ...expandedAdvanced }; delete ea[sid]; expandedAdvanced = ea;
    }
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
      const sid = arr[i].id || i;
      const result = validateThreshold(value);
      thresholdErrors = { ...thresholdErrors, [sid]: result.valid ? '' : result.error };
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
    if (newType === 'fill_blank' && !step.blanks) {
      step.blanks = [{ answer: '', accept: [] }];
    }
    if (newType === 'matching' && !step.pairs) {
      step.pairs = [{ left: '', right: '' }];
    }
    if (newType === 'ordering' && !step.items) {
      step.items = [];
      step.correct_order = [];
    }
    if (newType === 'hardware_trigger') {
      if (!step.sensor) step.sensor = '';
      if (!step.threshold) step.threshold = '';
    }
    if (newType === 'svg') {
      if (!step.svg_spec) step.svg_spec = null;
    }
    arr[i] = step;
    steps = arr;
    onchange();
  }

  function duplicateStep(i) {
    const src = steps[i];
    const clone = JSON.parse(JSON.stringify(src));
    clone.id = nextStepId();
    const arr = [...steps];
    arr.splice(i + 1, 0, clone);
    steps = arr;
    onchange();
  }

  function addFromTemplate(tpl) {
    const step = { id: nextStepId(), type: tpl.type, content: tpl.content };
    if (tpl.answer_options) step.answer_options = [...tpl.answer_options];
    if (tpl.correct_index != null) step.correct_index = tpl.correct_index;
    if (tpl.feedback != null) step.feedback = tpl.feedback;
    if (tpl.sensor != null) step.sensor = tpl.sensor;
    if (tpl.threshold != null) step.threshold = tpl.threshold;
    if (tpl.svg_spec !== undefined) step.svg_spec = tpl.svg_spec;
    if (tpl.blanks) step.blanks = JSON.parse(JSON.stringify(tpl.blanks));
    if (tpl.pairs) step.pairs = JSON.parse(JSON.stringify(tpl.pairs));
    if (tpl.items) { step.items = [...tpl.items]; step.correct_order = [...(tpl.correct_order || [])]; }
    steps = [...steps, step];
    onchange();
  }

  import { renderMarkdown } from '$lib/renderMarkdown.js';

  function toggleContentPreview(step) {
    const sid = step.id || '??';
    contentPreview = { ...contentPreview, [sid]: !contentPreview[sid] };
  }

  const allStepIds = $derived(steps.map(s => s.id).filter(Boolean));

  function getRefSuggestions(currentId, fieldValue) {
    const prefix = (fieldValue || '').replace(/^redirect:|^skip_to:/i, '').trim().toLowerCase();
    return allStepIds.filter(id => id !== currentId && id.toLowerCase().startsWith(prefix));
  }

  function applyRefSuggestion(stepIdx, field, value) {
    updateField(stepIdx, field, value);
    showRefSuggestions = { ...showRefSuggestions, [`${stepIdx}_${field}`]: false };
  }

  function addAnswerOption(i) {
    const arr = [...steps];
    const opts = [...(arr[i].answer_options || []), ''];
    arr[i] = { ...arr[i], answer_options: opts };
    steps = arr;
    onchange();
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
  function toggleAdvanced(step) {
    const sid = step.id || '??';
    expandedAdvanced = { ...expandedAdvanced, [sid]: !expandedAdvanced[sid] };
  }

  function addPhysicsTemplate(tpl) {
    const newSteps = tpl.steps.map(s => {
      const step = { id: nextStepId(), ...JSON.parse(JSON.stringify(s)) };
      return step;
    });
    steps = [...steps, ...newSteps];
    showPhysicsMenu = false;
    showAddMenu = false;
    onchange();
  }

  let showAddMenu = $state(false);

  let dragIdx = $state(null);
  let dragOverIdx = $state(null);

  function onDragStart(e, i) {
    dragIdx = i;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(i));
  }

  function onDragOver(e, i) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    dragOverIdx = i;
  }

  function onDragLeave() {
    dragOverIdx = null;
  }

  function onDragEnd() {
    dragIdx = null;
    dragOverIdx = null;
  }

  function onDrop(e, i) {
    e.preventDefault();
    if (dragIdx == null || dragIdx === i) { onDragEnd(); return; }
    const arr = [...steps];
    const [moved] = arr.splice(dragIdx, 1);
    arr.splice(i, 0, moved);
    steps = arr;
    onDragEnd();
    onchange();
  }
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
      <div class="add-menu-section">
        <span class="menu-label">Type:</span>
        {#each STEP_TYPES as t}
          <button onclick={() => { newStepOfType(t.value); showAddMenu = false; }}>{t.label}</button>
        {/each}
      </div>
      <div class="add-menu-section">
        <span class="menu-label">Template:</span>
        {#each STEP_TEMPLATES as tpl}
          <button class="template-btn" onclick={() => { addFromTemplate(tpl); showAddMenu = false; }} title={tpl.content.slice(0, 60)}>
            <span class="tpl-icon">{tpl.icon}</span> {tpl.label}
          </button>
        {/each}
      </div>
      <div class="add-menu-section physics-section">
        <span class="menu-label">🔬 Physics Experiments:</span>
        {#each PHYSICS_TEMPLATES as ptpl}
          <button class="template-btn physics-tpl-btn" onclick={() => addPhysicsTemplate(ptpl)} title={ptpl.description}>
            <span class="tpl-icon physics-icon">{ptpl.icon}</span>
            <span class="ptpl-text">
              <strong>{ptpl.label}</strong>
              <small>{ptpl.steps.length} steps</small>
            </span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  {#if steps.length === 0}
    <p class="empty-hint">No steps yet. Add one to get started.</p>
  {/if}

  {#each steps as step, i (step.id + '-' + i)}
    <div class="step-card"
         class:hw={step.type === 'hardware_trigger'}
         class:quiz={step.type === 'quiz'}
         class:fill-blank={step.type === 'fill_blank'}
         class:matching={step.type === 'matching'}
         class:ordering={step.type === 'ordering'}
         class:svg={step.type === 'svg'}
         class:completion={step.type === 'completion'}
         class:drag-over={dragOverIdx === i && dragIdx !== i}
         class:dragging={dragIdx === i}
         draggable="true"
         ondragstart={(e) => onDragStart(e, i)}
         ondragover={(e) => onDragOver(e, i)}
         ondragleave={onDragLeave}
         ondragend={onDragEnd}
         ondrop={(e) => onDrop(e, i)}
         onfocusin={() => onfocus(i)}
         onclick={() => onfocus(i)}>
      <div class="step-toolbar">
        <span class="drag-handle" title="Drag to reorder">⠿</span>
        <span class="step-num">#{i + 1}</span>
        <span class="step-type-badge" class:hw-badge={step.type === 'hardware_trigger'} class:quiz-badge={step.type === 'quiz'} class:svg-badge={step.type === 'svg'} class:comp-badge={step.type === 'completion'}>
          {STEP_TYPES.find(t => t.value === step.type)?.label || step.type}
        </span>
        {#if step.type === 'svg' && step.svg_spec?.factory}
          {@const fd = getFactoryById(step.svg_spec.factory)}
          {#if fd}
            <span class="svg-inline-tag">{fd.icon} {fd.label}</span>
          {/if}
        {/if}
        <span class="spacer"></span>
        <button class="icon-btn" onclick={() => moveUp(i)} disabled={i === 0} title="Move up">↑</button>
        <button class="icon-btn" onclick={() => moveDown(i)} disabled={i === steps.length - 1} title="Move down">↓</button>
        <button class="icon-btn" onclick={() => duplicateStep(i)} title="Duplicate step">⧉</button>
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

        <div class="form-group content-group">
          <div class="content-label-row">
            <label>Content</label>
            <div class="content-tools">
              <button class="micro-btn" onclick={() => { const v = (step.content || '') + '**bold**'; updateField(i, 'content', v); }} title="Bold">B</button>
              <button class="micro-btn" onclick={() => { const v = (step.content || '') + '*italic*'; updateField(i, 'content', v); }} title="Italic">I</button>
              <button class="micro-btn" onclick={() => { const v = (step.content || '') + '\\\\(x^2\\\\)'; updateField(i, 'content', v); }} title="Inline math">∑</button>
              <button class="micro-btn" onclick={() => toggleContentPreview(step)} title="Toggle preview">
                {contentPreview[step.id] ? 'Edit' : 'Preview'}
              </button>
            </div>
          </div>
          {#if contentPreview[step.id]}
            <div class="content-preview">{@html renderMarkdown(step.content || '')}</div>
          {:else}
            <textarea value={step.content || ''} oninput={(e) => updateField(i, 'content', e.target.value)}
                      rows="3" placeholder={step.type === 'completion' ? 'e.g. Congratulations! Lesson complete.' : step.type === 'quiz' ? 'Question shown to the student' : 'Lesson content — supports **bold**, *italic*, `code`, \\(math\\)'}></textarea>
          {/if}
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
                       placeholder="e.g. accel.total > 2.5g" class:input-error={thresholdErrors[step.id]} />
              </label>
              {#if thresholdErrors[step.id]}
                <span class="field-error">{thresholdErrors[step.id]}</span>
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

        {#if step.type === 'fill_blank'}
          <div class="quiz-section">
            <label class="section-label">Blanks</label>
            <p class="type-hint">Use <code>___</code> in the content for each blank. Define accepted answers below.</p>
            {#each (step.blanks || []) as blank, bi}
              <div class="answer-row">
                <input type="text" value={blank.answer}
                       oninput={(e) => {
                         const arr = [...steps]; const blanks = [...(arr[i].blanks || [])];
                         blanks[bi] = { ...blanks[bi], answer: e.target.value };
                         arr[i] = { ...arr[i], blanks }; steps = arr; onchange();
                       }}
                       placeholder="Correct answer" class="answer-input" />
                <input type="text" value={(blank.accept || []).join(', ')}
                       oninput={(e) => {
                         const arr = [...steps]; const blanks = [...(arr[i].blanks || [])];
                         blanks[bi] = { ...blanks[bi], accept: e.target.value.split(',').map(s => s.trim()).filter(Boolean) };
                         arr[i] = { ...arr[i], blanks }; steps = arr; onchange();
                       }}
                       placeholder="Also accept (comma-separated)" class="answer-input" />
                <button class="icon-btn danger small" onclick={() => {
                  const arr = [...steps]; const blanks = (arr[i].blanks || []).filter((_, j) => j !== bi);
                  arr[i] = { ...arr[i], blanks }; steps = arr; onchange();
                }} title="Remove blank">✕</button>
              </div>
            {/each}
            <button class="link-btn" onclick={() => {
              const arr = [...steps]; const blanks = [...(arr[i].blanks || []), { answer: '', accept: [] }];
              arr[i] = { ...arr[i], blanks }; steps = arr; onchange();
            }}>+ Add blank</button>
          </div>
        {/if}

        {#if step.type === 'matching'}
          <div class="quiz-section">
            <label class="section-label">Matching pairs</label>
            {#each (step.pairs || []) as pair, pi}
              <div class="answer-row">
                <input type="text" value={pair.left}
                       oninput={(e) => {
                         const arr = [...steps]; const pairs = [...(arr[i].pairs || [])];
                         pairs[pi] = { ...pairs[pi], left: e.target.value };
                         arr[i] = { ...arr[i], pairs }; steps = arr; onchange();
                       }}
                       placeholder="Left item" class="answer-input" />
                <span style="opacity:0.5">→</span>
                <input type="text" value={pair.right}
                       oninput={(e) => {
                         const arr = [...steps]; const pairs = [...(arr[i].pairs || [])];
                         pairs[pi] = { ...pairs[pi], right: e.target.value };
                         arr[i] = { ...arr[i], pairs }; steps = arr; onchange();
                       }}
                       placeholder="Right item" class="answer-input" />
                <button class="icon-btn danger small" onclick={() => {
                  const arr = [...steps]; const pairs = (arr[i].pairs || []).filter((_, j) => j !== pi);
                  arr[i] = { ...arr[i], pairs }; steps = arr; onchange();
                }} title="Remove pair">✕</button>
              </div>
            {/each}
            <button class="link-btn" onclick={() => {
              const arr = [...steps]; const pairs = [...(arr[i].pairs || []), { left: '', right: '' }];
              arr[i] = { ...arr[i], pairs }; steps = arr; onchange();
            }}>+ Add pair</button>
            {#if (step.pairs || []).length < 2}
              <p class="field-warning">Matching steps need at least 2 pairs.</p>
            {/if}
          </div>
        {/if}

        {#if step.type === 'ordering'}
          <div class="quiz-section">
            <label class="section-label">Items (in correct order)</label>
            <p class="type-hint">Enter items in the correct order. The player will shuffle them for the student.</p>
            {#each (step.items || []) as item, oi}
              <div class="answer-row">
                <span style="opacity:0.5; font-weight:600; min-width:1.5rem">{oi + 1}.</span>
                <input type="text" value={item}
                       oninput={(e) => {
                         const arr = [...steps]; const items = [...(arr[i].items || [])];
                         items[oi] = e.target.value;
                         arr[i] = { ...arr[i], items, correct_order: items.map((_, idx) => idx) };
                         steps = arr; onchange();
                       }}
                       placeholder={`Item ${oi + 1}`} class="answer-input" />
                <button class="icon-btn danger small" onclick={() => {
                  const arr = [...steps]; const items = (arr[i].items || []).filter((_, j) => j !== oi);
                  arr[i] = { ...arr[i], items, correct_order: items.map((_, idx) => idx) };
                  steps = arr; onchange();
                }} title="Remove item">✕</button>
              </div>
            {/each}
            <button class="link-btn" onclick={() => {
              const arr = [...steps]; const items = [...(arr[i].items || []), ''];
              arr[i] = { ...arr[i], items, correct_order: items.map((_, idx) => idx) };
              steps = arr; onchange();
            }}>+ Add item</button>
            {#if (step.items || []).length < 2}
              <p class="field-warning">Ordering steps need at least 2 items.</p>
            {/if}
          </div>
        {/if}

        {#if step.type === 'svg'}
          <div class="svg-section">
            <label class="section-label">SVG Visual</label>
            <p class="type-hint">Pick a factory from the library and configure its parameters. The edge device renders the SVG from this spec at runtime.</p>
            <SvgSpecEditor bind:spec={step.svg_spec} onchange={() => { updateField(i, 'svg_spec', step.svg_spec); }} />
          </div>
        {/if}

        <button class="link-btn advanced-toggle" onclick={() => toggleAdvanced(step)}>
          {expandedAdvanced[step.id] ? '▾ Hide advanced' : '▸ Advanced fields'}
        </button>

        {#if expandedAdvanced[step.id]}
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
              <div class="form-group ref-group">
                <label>On fail
                  <input type="text" value={step.on_fail || ''}
                         oninput={(e) => { updateField(i, 'on_fail', e.target.value); showRefSuggestions = { ...showRefSuggestions, [`${step.id}_on_fail`]: true }; }}
                         onfocus={() => { showRefSuggestions = { ...showRefSuggestions, [`${step.id}_on_fail`]: true }; }}
                         onblur={() => setTimeout(() => { showRefSuggestions = { ...showRefSuggestions, [`${step.id}_on_fail`]: false }; }, 150)}
                         placeholder="redirect:step_id, skip, or hint" />
                </label>
                {#if showRefSuggestions[`${step.id}_on_fail`] && getRefSuggestions(step.id, step.on_fail).length > 0}
                  <div class="ref-suggestions">
                    {#each getRefSuggestions(step.id, step.on_fail) as sid}
                      <button onmousedown={() => applyRefSuggestion(i, 'on_fail', 'redirect:' + sid)}>{sid}</button>
                    {/each}
                  </div>
                {/if}
              </div>
              <div class="form-group ref-group">
                <label>On success
                  <input type="text" value={step.on_success || ''}
                         oninput={(e) => { updateField(i, 'on_success', e.target.value); showRefSuggestions = { ...showRefSuggestions, [`${step.id}_on_success`]: true }; }}
                         onfocus={() => { showRefSuggestions = { ...showRefSuggestions, [`${step.id}_on_success`]: true }; }}
                         onblur={() => setTimeout(() => { showRefSuggestions = { ...showRefSuggestions, [`${step.id}_on_success`]: false }; }, 150)}
                         placeholder="skip_to:step_id" />
                </label>
                {#if showRefSuggestions[`${step.id}_on_success`] && getRefSuggestions(step.id, step.on_success).length > 0}
                  <div class="ref-suggestions">
                    {#each getRefSuggestions(step.id, step.on_success) as sid}
                      <button onmousedown={() => applyRefSuggestion(i, 'on_success', 'skip_to:' + sid)}>{sid}</button>
                    {/each}
                  </div>
                {/if}
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
    transition: opacity 0.15s, border-color 0.15s;
  }
  .step-card.hw { border-left: 3px solid #ff9800; }
  .step-card.quiz { border-left: 3px solid #42a5f5; }
  .step-card.fill-blank { border-left: 3px solid #26c6da; }
  .step-card.matching { border-left: 3px solid #ffca28; }
  .step-card.ordering { border-left: 3px solid #ef5350; }
  .step-card.svg { border-left: 3px solid #ce93d8; }
  .step-card.completion { border-left: 3px solid #66bb6a; }
  .step-card.drag-over { border-color: var(--accent); background: rgba(0,230,118,0.06); }
  .step-card.dragging { opacity: 0.4; }

  .step-toolbar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .drag-handle {
    cursor: grab; font-size: 1.1rem; opacity: 0.4; user-select: none;
    letter-spacing: -1px; padding-right: 0.15rem;
  }
  .drag-handle:hover { opacity: 0.8; }
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
  .step-type-badge.svg-badge { background: rgba(206,147,216,0.15); color: #ce93d8; }
  .step-type-badge.comp-badge { background: rgba(102,187,106,0.15); color: #66bb6a; }
  .svg-inline-tag {
    font-size: 0.75rem; padding: 0.1rem 0.45rem; border-radius: 8px;
    background: rgba(206,147,216,0.08); color: #ce93d8; opacity: 0.8;
    white-space: nowrap;
  }
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
  .svg-section { margin-top: 0.25rem; }
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

  /* Templates panel */
  .add-menu-section { display: flex; gap: 0.4rem; flex-wrap: wrap; align-items: center; margin-bottom: 0.5rem; }
  .add-menu-section:last-child { margin-bottom: 0; }
  .menu-label { font-size: 0.8rem; font-weight: 600; opacity: 0.65; margin-right: 0.2rem; }
  .template-btn { display: flex; align-items: center; gap: 0.3rem; }
  .tpl-icon {
    display: inline-flex; align-items: center; justify-content: center;
    width: 20px; height: 20px; border-radius: 3px; background: rgba(0,230,118,0.12);
    font-size: 0.7rem; font-weight: 700; color: var(--accent);
  }

  /* Content preview & tools */
  .content-group { position: relative; }
  .content-label-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.2rem; }
  .content-label-row label { font-weight: 600; font-size: 0.9rem; margin-bottom: 0; }
  .content-tools { display: flex; gap: 0.25rem; }
  .micro-btn {
    background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
    color: var(--text); padding: 0.15rem 0.4rem; border-radius: 3px; cursor: pointer;
    font-size: 0.75rem; font-weight: 600; opacity: 0.7;
  }
  .micro-btn:hover { opacity: 1; border-color: var(--accent); }
  .content-preview {
    background: #1a2544; border: 1px solid var(--border); border-radius: 5px;
    padding: 0.6rem 0.8rem; min-height: 60px; font-size: 0.95rem; line-height: 1.6;
  }
  .content-preview :global(code) {
    background: rgba(255,255,255,0.08); padding: 0.1rem 0.3rem; border-radius: 3px;
    font-size: 0.85rem;
  }
  .content-preview :global(.math-inline) {
    font-family: 'Cambria Math', 'Times New Roman', serif; font-style: italic;
    color: #90caf9;
  }
  .content-preview :global(.math-block) {
    display: block; text-align: center; margin: 0.5rem 0;
    font-family: 'Cambria Math', 'Times New Roman', serif; font-style: italic;
    color: #90caf9; font-size: 1.1rem;
  }

  /* Step ID reference autocomplete */
  .ref-group { position: relative; }
  .ref-suggestions {
    position: absolute; top: 100%; left: 0; right: 0; z-index: 10;
    background: #1a2544; border: 1px solid var(--border); border-radius: 5px;
    max-height: 120px; overflow-y: auto; box-shadow: 0 4px 12px rgba(0,0,0,0.4);
  }
  .ref-suggestions button {
    display: block; width: 100%; text-align: left; background: none; border: none;
    color: var(--text); padding: 0.35rem 0.6rem; cursor: pointer; font-size: 0.85rem;
    font-family: monospace;
  }
  .ref-suggestions button:hover { background: rgba(0,230,118,0.1); color: var(--accent); }

  .physics-section {
    border-top: 1px solid rgba(77,171,247,0.2);
    padding-top: 0.4rem;
    margin-top: 0.2rem;
  }
  .physics-tpl-btn {
    border-color: rgba(77,171,247,0.25) !important;
    background: rgba(77,171,247,0.06) !important;
    display: flex !important;
    align-items: center !important;
    gap: 0.4rem !important;
    padding: 0.4rem 0.7rem !important;
  }
  .physics-tpl-btn:hover {
    border-color: #4dabf7 !important;
    background: rgba(77,171,247,0.12) !important;
  }
  .physics-icon {
    background: rgba(77,171,247,0.15) !important;
    color: #4dabf7 !important;
  }
  .ptpl-text { display: flex; flex-direction: column; text-align: left; line-height: 1.2; }
  .ptpl-text strong { font-size: 0.82rem; }
  .ptpl-text small { font-size: 0.68rem; opacity: 0.6; }
</style>
