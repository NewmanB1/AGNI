<script>
  import { renderMarkdown } from '$lib/renderMarkdown.js';
  import { getFactoryById } from '$lib/svg-catalog.js';
  import SvgPreview from './SvgPreview.svelte';

  let { steps = [], title = '', focusStep = 0 } = $props();

  let viewStep = $state(0);

  $effect(() => {
    if (focusStep >= 0 && focusStep < steps.length) {
      viewStep = focusStep;
    }
  });

  const currentStep = $derived(steps[viewStep] || null);

  function go(delta) {
    const next = viewStep + delta;
    if (next >= 0 && next < steps.length) viewStep = next;
  }

  let quizAnswer = $state(null);
  let quizFeedback = $state('');

  $effect(() => {
    quizAnswer = null;
    quizFeedback = '';
  });

  function pickAnswer(idx) {
    quizAnswer = idx;
    if (currentStep) {
      quizFeedback = idx === currentStep.correct_index
        ? (currentStep.feedback || 'Correct!')
        : 'Try again — that\'s not quite right.';
    }
  }
</script>

<div class="live-preview">
  {#if steps.length === 0}
    <div class="empty-state">
      <div class="empty-icon">👈</div>
      <p>Add steps on the left — they'll appear here as students see them.</p>
    </div>
  {:else}
    <div class="phone-frame">
      <div class="phone-header">
        <span class="phone-title">{title || 'Untitled Lesson'}</span>
      </div>

      <div class="phone-progress">
        <div class="progress-track">
          <div class="progress-fill" style="width: {((viewStep + 1) / steps.length) * 100}%"></div>
        </div>
        <span class="progress-label">{viewStep + 1}/{steps.length}</span>
      </div>

      {#if currentStep}
        <div class="phone-step"
             class:step-instruction={currentStep.type === 'instruction' || !currentStep.type}
             class:step-quiz={currentStep.type === 'quiz'}
             class:step-hw={currentStep.type === 'hardware_trigger'}
             class:step-svg={currentStep.type === 'svg'}
             class:step-completion={currentStep.type === 'completion'}>

          <span class="type-pill">
            {#if currentStep.type === 'hardware_trigger'}Hardware Activity
            {:else if currentStep.type === 'quiz'}Quiz
            {:else if currentStep.type === 'svg'}Visual
            {:else if currentStep.type === 'completion'}Complete
            {:else}Content
            {/if}
          </span>

          {#if currentStep.content}
            <div class="step-content">{@html renderMarkdown(currentStep.content)}</div>
          {:else if currentStep.type !== 'completion'}
            <p class="placeholder-text">No content yet…</p>
          {/if}

          {#if currentStep.type === 'svg' && currentStep.svg_spec}
            {@const desc = getFactoryById(currentStep.svg_spec.factory)}
            {#if desc}
              <div class="svg-card">
                <div class="svg-card-header">
                  <span class="svg-icon">{desc.icon}</span>
                  <div>
                    <strong>{desc.label}</strong>
                    {#if currentStep.svg_spec.opts?.title}
                      <span class="svg-subtitle">{currentStep.svg_spec.opts.title}</span>
                    {/if}
                  </div>
                </div>
                <SvgPreview spec={currentStep.svg_spec}
                  width={currentStep.svg_spec.opts?.w || 320}
                  height={currentStep.svg_spec.opts?.h || 220} />
              </div>
            {:else if currentStep.svg_spec.factory}
              <div class="svg-card">
                <SvgPreview spec={currentStep.svg_spec} width={320} height={220} />
              </div>
            {/if}
          {:else if currentStep.type === 'svg'}
            <div class="svg-card empty-svg">
              <p>No visual configured — pick a factory from the editor.</p>
            </div>
          {/if}

          {#if currentStep.type === 'hardware_trigger'}
            <div class="hw-badge-row">
              {#if currentStep.sensor}
                <span class="hw-sensor">{currentStep.sensor}</span>
              {:else}
                <span class="hw-sensor empty">No sensor set</span>
              {/if}
              {#if currentStep.threshold}
                <code class="hw-thresh">{currentStep.threshold}</code>
              {/if}
            </div>
            <div class="hw-waiting">
              <div class="pulse-ring"></div>
              <span>Waiting for sensor…</span>
            </div>
          {/if}

          {#if currentStep.type === 'quiz' && Array.isArray(currentStep.answer_options)}
            <div class="quiz-opts">
              {#each currentStep.answer_options as opt, oi}
                <button class="quiz-opt"
                  class:selected={quizAnswer === oi}
                  class:correct={quizAnswer != null && oi === currentStep.correct_index}
                  class:wrong={quizAnswer === oi && oi !== currentStep.correct_index}
                  onclick={() => pickAnswer(oi)}
                  disabled={quizAnswer != null}>
                  <span class="opt-letter">{String.fromCharCode(65 + oi)}</span>
                  {opt || '…'}
                </button>
              {/each}
            </div>
            {#if quizFeedback}
              <div class="quiz-fb" class:correct-fb={quizAnswer === currentStep.correct_index}>
                {quizFeedback}
              </div>
            {/if}
          {/if}

          {#if currentStep.type === 'completion'}
            <div class="completion-block">
              <div class="completion-icon">🎉</div>
              <div class="completion-text">Lesson Complete!</div>
            </div>
          {/if}
        </div>
      {/if}

      <div class="phone-nav">
        <button onclick={() => go(-1)} disabled={viewStep === 0}>← Back</button>
        <button onclick={() => go(1)} disabled={viewStep >= steps.length - 1}>Next →</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .live-preview { }

  .empty-state {
    text-align: center; padding: 2.5rem 1rem; opacity: 0.6;
  }
  .empty-icon { font-size: 2.5rem; margin-bottom: 0.5rem; }
  .empty-state p { font-size: 0.9rem; line-height: 1.5; }

  /* Phone-like frame */
  .phone-frame {
    background: #0d1117;
    border: 2px solid rgba(255,255,255,0.1);
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 4px 24px rgba(0,0,0,0.4);
  }

  .phone-header {
    padding: 0.6rem 0.8rem;
    background: rgba(255,255,255,0.03);
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .phone-title {
    font-weight: 700; font-size: 0.9rem;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    display: block;
  }

  .phone-progress {
    display: flex; align-items: center; gap: 0.5rem;
    padding: 0.4rem 0.8rem;
  }
  .progress-track {
    flex: 1; height: 4px; background: rgba(255,255,255,0.08);
    border-radius: 2px; overflow: hidden;
  }
  .progress-fill {
    height: 100%; background: var(--accent); border-radius: 2px;
    transition: width 0.3s ease;
  }
  .progress-label { font-size: 0.7rem; opacity: 0.5; white-space: nowrap; }

  /* Step card */
  .phone-step {
    padding: 0.8rem;
    min-height: 200px;
    position: relative;
  }
  .phone-step.step-quiz { border-left: 3px solid #42a5f5; }
  .phone-step.step-hw { border-left: 3px solid #ff9800; }
  .phone-step.step-svg { border-left: 3px solid #ce93d8; }
  .phone-step.step-completion { border-left: 3px solid #66bb6a; }

  .type-pill {
    display: inline-block; font-size: 0.65rem; text-transform: uppercase;
    letter-spacing: 0.06em; opacity: 0.5; font-weight: 700;
    margin-bottom: 0.5rem;
  }

  .step-content { font-size: 0.88rem; line-height: 1.65; }
  .step-content :global(strong) { color: #e0e0ff; }
  .step-content :global(code) {
    background: rgba(255,255,255,0.08); padding: 0.1rem 0.25rem;
    border-radius: 3px; font-size: 0.82rem;
  }
  .step-content :global(.math-inline) {
    font-family: 'Cambria Math', serif; font-style: italic; color: #90caf9;
  }

  .placeholder-text { opacity: 0.3; font-style: italic; font-size: 0.85rem; }

  /* SVG preview card */
  .svg-card {
    background: rgba(206,147,216,0.06); border: 1px solid rgba(206,147,216,0.2);
    border-radius: 8px; margin-top: 0.5rem; overflow: hidden;
  }
  .svg-card-header {
    display: flex; align-items: center; gap: 0.4rem;
    padding: 0.5rem 0.6rem;
    border-bottom: 1px solid rgba(206,147,216,0.1);
  }
  .svg-icon { font-size: 1.2rem; }
  .svg-card-header strong { font-size: 0.85rem; display: block; }
  .svg-subtitle { font-size: 0.75rem; opacity: 0.6; }
  .svg-placeholder {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; padding: 1.2rem 0.5rem;
    gap: 0.3rem;
  }
  .svg-big-icon { font-size: 2.5rem; opacity: 0.4; }
  .svg-hint { font-size: 0.72rem; opacity: 0.4; text-align: center; }
  .svg-dynamic-tag {
    font-size: 0.6rem; background: rgba(77,171,247,0.15); color: #4dabf7;
    padding: 0.1rem 0.4rem; border-radius: 8px; margin-top: 0.2rem;
  }
  .empty-svg { padding: 1rem; text-align: center; }
  .empty-svg p { font-size: 0.8rem; opacity: 0.4; }

  /* Hardware trigger */
  .hw-badge-row { display: flex; gap: 0.4rem; flex-wrap: wrap; margin-top: 0.5rem; }
  .hw-sensor {
    display: inline-block; background: rgba(255,152,0,0.15); color: #ff9800;
    padding: 0.15rem 0.5rem; border-radius: 10px; font-size: 0.78rem; font-weight: 600;
  }
  .hw-sensor.empty { opacity: 0.4; }
  .hw-thresh {
    background: rgba(255,255,255,0.06); padding: 0.15rem 0.4rem;
    border-radius: 4px; font-size: 0.75rem;
  }
  .hw-waiting {
    display: flex; align-items: center; gap: 0.5rem;
    margin-top: 0.8rem; font-size: 0.82rem; opacity: 0.5; font-style: italic;
  }
  .pulse-ring {
    width: 12px; height: 12px; border-radius: 50%;
    border: 2px solid #ff9800; opacity: 0.6;
    animation: pulse-hw 1.5s ease-in-out infinite;
  }
  @keyframes pulse-hw {
    0%, 100% { transform: scale(1); opacity: 0.6; }
    50% { transform: scale(1.3); opacity: 0.2; }
  }

  /* Quiz */
  .quiz-opts { display: flex; flex-direction: column; gap: 0.35rem; margin-top: 0.6rem; }
  .quiz-opt {
    display: flex; align-items: center; gap: 0.5rem;
    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1);
    border-radius: 7px; padding: 0.5rem 0.6rem; cursor: pointer;
    color: var(--text); font-size: 0.82rem; text-align: left;
    transition: border-color 0.15s;
  }
  .quiz-opt:hover:not(:disabled) { border-color: var(--accent); }
  .quiz-opt.selected { border-color: var(--accent); }
  .quiz-opt.correct { border-color: #4ade80; background: rgba(74,222,128,0.08); }
  .quiz-opt.wrong { border-color: #ff6b6b; background: rgba(255,107,107,0.08); }
  .quiz-opt:disabled { cursor: default; }
  .opt-letter {
    display: inline-flex; align-items: center; justify-content: center;
    width: 22px; height: 22px; border-radius: 50%;
    border: 1px solid rgba(255,255,255,0.15);
    font-weight: 700; font-size: 0.7rem; flex-shrink: 0;
  }
  .quiz-fb {
    margin-top: 0.4rem; padding: 0.4rem 0.5rem; border-radius: 5px;
    font-size: 0.8rem; background: rgba(255,107,107,0.1); color: #ff6b6b;
  }
  .quiz-fb.correct-fb { background: rgba(74,222,128,0.1); color: #4ade80; }

  /* Completion */
  .completion-block { text-align: center; padding: 1.5rem 0; }
  .completion-icon { font-size: 2.5rem; }
  .completion-text {
    font-size: 1.1rem; font-weight: 700; color: var(--accent); margin-top: 0.3rem;
  }

  /* Navigation */
  .phone-nav {
    display: flex; justify-content: space-between;
    padding: 0.5rem 0.8rem; border-top: 1px solid rgba(255,255,255,0.06);
  }
  .phone-nav button {
    background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
    color: var(--text); padding: 0.35rem 0.8rem; border-radius: 5px;
    cursor: pointer; font-size: 0.8rem; transition: border-color 0.15s;
  }
  .phone-nav button:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
  .phone-nav button:disabled { opacity: 0.25; cursor: not-allowed; }
</style>
