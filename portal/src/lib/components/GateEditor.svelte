<script>
  const GATE_TYPES = ['quiz', 'manual_verification'];

  let { gate = $bindable(null), onchange = () => {} } = $props();

  let enabled = $state(gate != null);

  function toggle() {
    enabled = !enabled;
    if (enabled) {
      gate = { type: 'quiz', question: '', expected_answer: '', on_fail: '', skill_target: '', passing_score: 1.0, retry_delay: '' };
    } else {
      gate = null;
    }
    onchange();
  }

  function update(field, value) {
    gate = { ...gate, [field]: value };
    onchange();
  }

  $effect(() => {
    enabled = gate != null;
  });
</script>

<section class="gate-editor">
  <div class="gate-header">
    <h2>Gate</h2>
    <label class="toggle-label">
      <input type="checkbox" checked={enabled} onchange={toggle} />
      {enabled ? 'Enabled' : 'Disabled'}
    </label>
  </div>

  {#if !enabled}
    <p class="hint">No gate. Students proceed without a final check. Toggle on to add one.</p>
  {:else if gate}
    <div class="gate-fields">
      <div class="row">
        <div class="form-group">
          <label>Type
            <select value={gate.type} onchange={(e) => update('type', e.target.value)}>
              {#each GATE_TYPES as t}
                <option value={t}>{t.replace('_', ' ')}</option>
              {/each}
            </select>
          </label>
        </div>
        <div class="form-group">
          <label>Skill target
            <input type="text" value={gate.skill_target || ''} oninput={(e) => update('skill_target', e.target.value)}
                   placeholder="e.g. gravity_basics" />
          </label>
        </div>
      </div>

      <div class="form-group">
        <label>Question
          <textarea value={gate.question || ''} oninput={(e) => update('question', e.target.value)}
                    rows="2" placeholder="Gate question shown to the student"></textarea>
        </label>
      </div>

      {#if gate.type === 'quiz'}
        <div class="form-group">
          <label>Expected answer
            <input type="text" value={gate.expected_answer || ''} oninput={(e) => update('expected_answer', e.target.value)}
                   placeholder="Correct answer text" />
          </label>
        </div>
      {/if}

      <div class="row">
        <div class="form-group">
          <label>Passing score (0–1)
            <input type="number" value={gate.passing_score ?? 1.0} min="0" max="1" step="0.1"
                   oninput={(e) => update('passing_score', e.target.value ? parseFloat(e.target.value) : 1.0)} />
          </label>
        </div>
        <div class="form-group">
          <label>Retry delay
            <input type="text" value={gate.retry_delay || ''} oninput={(e) => update('retry_delay', e.target.value)}
                   placeholder="e.g. PT5M (ISO 8601)" />
          </label>
        </div>
      </div>

      <div class="form-group">
        <label>On fail
          <input type="text" value={gate.on_fail || ''} oninput={(e) => update('on_fail', e.target.value)}
                 placeholder="e.g. redirect:step_review, retry, or skip" />
        </label>
      </div>
    </div>
  {/if}
</section>

<style>
  .gate-editor { margin-top: 0.5rem; }
  .gate-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
  .gate-header h2 { margin: 0; }
  .toggle-label {
    display: flex; align-items: center; gap: 0.4rem; cursor: pointer;
    font-size: 0.9rem; font-weight: 600;
  }
  .toggle-label input[type="checkbox"] { accent-color: var(--accent); }

  .hint { opacity: 0.7; font-style: italic; font-size: 0.9rem; }

  .gate-fields {
    border: 1px solid var(--border);
    border-left: 3px solid #ab47bc;
    border-radius: 8px;
    padding: 0.75rem 1rem;
    background: rgba(31,43,78,0.5);
  }

  .form-group { margin-bottom: 0.6rem; }
  .form-group label { display: block; font-weight: 600; font-size: 0.9rem; margin-bottom: 0.2rem; }
  .form-group input,
  .form-group select,
  .form-group textarea {
    width: 100%; padding: 0.45rem; background: #1a2544; color: var(--text);
    border: 1px solid var(--border); border-radius: 5px; font-size: 0.95rem; font-family: inherit;
  }
  .form-group textarea { resize: vertical; }
  .form-group input[type="number"] { max-width: 120px; }

  .row { display: flex; gap: 0.75rem; flex-wrap: wrap; }
  .row .form-group { flex: 1; min-width: 140px; }
</style>
