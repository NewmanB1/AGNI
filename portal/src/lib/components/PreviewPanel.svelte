<script>
  let { ir = null, sidecar = null, loading = false, error = '' } = $props();

  let activeTab = $state('sidecar');
  let expandedSteps = $state({});

  function toggleStep(i) {
    expandedSteps = { ...expandedSteps, [i]: !expandedSteps[i] };
  }

  const irSteps = $derived(
    ir && Array.isArray(ir.steps) ? ir.steps : []
  );

  const sidecarObj = $derived(
    sidecar && typeof sidecar === 'object' ? sidecar : null
  );
</script>

<section class="preview-panel">
  <div class="tab-bar">
    <button class:active={activeTab === 'sidecar'} onclick={() => activeTab = 'sidecar'}>Sidecar</button>
    <button class:active={activeTab === 'ir'} onclick={() => activeTab = 'ir'}>IR (compiled)</button>
    <button class:active={activeTab === 'json'} onclick={() => activeTab = 'json'}>Raw JSON</button>
  </div>

  {#if loading}
    <p class="hint">Compiling preview…</p>
  {:else if error}
    <p class="preview-error">{error}</p>
  {:else if !ir && !sidecar}
    <p class="hint">Click "Preview" to compile and inspect the lesson.</p>
  {:else}

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
