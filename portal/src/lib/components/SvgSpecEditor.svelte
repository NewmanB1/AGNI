<script>
  import { FACTORIES, CATEGORIES, getFactoryById, getDefaults, serializeSpec,
    EXPERIMENT_PRESETS, EXPERIMENT_CATEGORIES, SENSOR_GROUPS, ALL_SENSORS, getSensorById
  } from '$lib/svg-catalog.js';
  import SvgPreview from './SvgPreview.svelte';

  let { spec = $bindable(null), onchange = () => {} } = $props();

  let selectedFactory = $state(null);
  let opts = $state({});
  let browseCategory = $state(null);
  let showBrowser = $state(false);
  let browserTab = $state('factories');
  let zoom = $state(1);
  let showGrid = $state(false);
  let sidebarCollapsed = $state(false);

  const SIMPLE_LIST_TYPES = new Set(['nodeList', 'edgeList', 'arrowList', 'markList', 'streamList', 'setList', 'dataTable']);

  function initFromSpec() {
    if (spec && spec.factory) {
      const desc = getFactoryById(spec.factory);
      if (desc) {
        selectedFactory = desc;
        opts = { ...getDefaults(desc.id), ...(spec.opts || {}) };
        return;
      }
    }
    selectedFactory = null;
    opts = {};
  }

  $effect(() => {
    initFromSpec();
  });

  let experimentFilter = $state(null);

  const filteredExperiments = $derived(
    experimentFilter
      ? EXPERIMENT_PRESETS.filter(e => e.category === experimentFilter)
      : EXPERIMENT_PRESETS
  );

  function pickFactory(desc) {
    selectedFactory = desc;
    opts = { ...getDefaults(desc.id), ...(desc.previewDefaults || {}) };
    showBrowser = false;
    emitChange();
  }

  function pickExperiment(preset) {
    const desc = getFactoryById(preset.factory);
    if (!desc) return;
    selectedFactory = desc;
    opts = { ...getDefaults(desc.id), ...JSON.parse(JSON.stringify(preset.opts)) };
    showBrowser = false;
    emitChange();
  }

  function clearFactory() {
    selectedFactory = null;
    opts = {};
    spec = null;
    onchange();
  }

  function emitChange() {
    if (!selectedFactory) return;
    spec = serializeSpec(selectedFactory.id, opts);
    onchange();
  }

  function setOpt(name, value) {
    opts = { ...opts, [name]: value };
    emitChange();
  }

  function setNestedOpt(parentName, childName, value) {
    const parent = { ...(opts[parentName] || {}) };
    parent[childName] = value;
    opts = { ...opts, [parentName]: parent };
    emitChange();
  }

  function addListItem(propName, template) {
    const arr = [...(opts[propName] || []), template];
    opts = { ...opts, [propName]: arr };
    emitChange();
  }

  function removeListItem(propName, idx) {
    const arr = (opts[propName] || []).filter((_, j) => j !== idx);
    opts = { ...opts, [propName]: arr };
    emitChange();
  }

  function updateListItem(propName, idx, field, value) {
    const arr = [...(opts[propName] || [])];
    arr[idx] = { ...arr[idx], [field]: value };
    opts = { ...opts, [propName]: arr };
    emitChange();
  }

  function updateSimpleListItem(propName, idx, value) {
    const arr = [...(opts[propName] || [])];
    arr[idx] = value;
    opts = { ...opts, [propName]: arr };
    emitChange();
  }

  const filteredFactories = $derived(
    browseCategory ? FACTORIES.filter(f => f.category === browseCategory) : FACTORIES
  );

  function listItemTemplate(p) {
    if (p.type === 'dataTable') return { label: '', value: 0 };
    if (p.type === 'markList') return { value: 0, label: '' };
    if (p.type === 'nodeList') return { id: '', label: '', shape: 'rect', color: '#4dabf7' };
    if (p.type === 'edgeList') return { from: '', to: '', label: '' };
    if (p.type === 'streamList') return { sensor: null, label: '', color: '#ff6b35', yMin: 0, yMax: 10 };
    if (p.type === 'setList') return { label: '', items: [], color: '#4dabf7' };
    if (p.type === 'arrowList') return { id: '', from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, label: '', color: '#4dabf7', width: 2 };
    if (p.type === 'array' && p.itemType === 'string') return '';
    if (p.type === 'array' && p.itemSchema) {
      const item = {};
      for (const sp of p.itemSchema) {
        item[sp.name] = sp.default ?? '';
      }
      return item;
    }
    return {};
  }

  function zoomIn() { zoom = Math.min(zoom + 0.25, 3); }
  function zoomOut() { zoom = Math.max(zoom - 0.25, 0.25); }
  function zoomFit() { zoom = 1; }

  function handleCanvasWheel(e) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      if (e.deltaY < 0) zoomIn(); else zoomOut();
    }
  }

  function resetOpts() {
    if (!selectedFactory) return;
    opts = { ...getDefaults(selectedFactory.id), ...(selectedFactory.previewDefaults || {}) };
    emitChange();
  }
</script>

<div class="svg-design-tool" class:has-factory={selectedFactory}>
  {#if selectedFactory}
    <!-- ── Toolbar ──────────────────────────────────────────────────────── -->
    <div class="toolbar">
      <div class="toolbar-left">
        <button class="tool-factory-btn" onclick={() => showBrowser = true} title="Change factory">
          <span class="tf-icon">{selectedFactory.icon}</span>
          <span class="tf-label">{selectedFactory.label}</span>
          <span class="tf-arrow">▾</span>
        </button>
        {#if selectedFactory.dynamic}
          <span class="dynamic-pill">dynamic</span>
        {/if}
      </div>

      <div class="toolbar-center">
        <button class="tool-btn" onclick={zoomOut} title="Zoom out (Ctrl+Scroll)">−</button>
        <button class="zoom-display" onclick={zoomFit} title="Reset zoom">{Math.round(zoom * 100)}%</button>
        <button class="tool-btn" onclick={zoomIn} title="Zoom in (Ctrl+Scroll)">+</button>
        <span class="tool-sep"></span>
        <button class="tool-btn" class:active={showGrid} onclick={() => showGrid = !showGrid} title="Toggle grid">▦</button>
        <button class="tool-btn" onclick={resetOpts} title="Reset to defaults">↻</button>
      </div>

      <div class="toolbar-right">
        <button class="tool-btn" class:active={!sidebarCollapsed}
          onclick={() => sidebarCollapsed = !sidebarCollapsed}
          title={sidebarCollapsed ? 'Show inspector' : 'Hide inspector'}>☰</button>
        <button class="tool-btn danger" onclick={clearFactory} title="Remove visual">✕</button>
      </div>
    </div>

    {#if showBrowser}
      <div class="browser-overlay">
        {@render factoryBrowser()}
      </div>
    {/if}

    <!-- ── Canvas + Sidebar ─────────────────────────────────────────────── -->
    <div class="design-body">
      <div class="canvas-area" onwheel={handleCanvasWheel}>
        <div class="artboard" class:show-grid={showGrid}
          style="transform:scale({zoom});width:{opts.w || 420}px;height:{opts.h || 280}px;">
          <SvgPreview spec={serializeSpec(selectedFactory.id, opts)}
            width={opts.w || 420} height={opts.h || 280} />
        </div>
        <div class="canvas-dims">{opts.w || 420} × {opts.h || 280}</div>
      </div>

      {#if !sidebarCollapsed}
        <div class="inspector">
          <div class="inspector-header">
            <h4>Properties</h4>
          </div>
          <div class="inspector-scroll">
            {#each selectedFactory.props as p}
              {@render propWidget(p)}
            {/each}
          </div>
          <details class="spec-debug">
            <summary>Spec JSON</summary>
            <pre class="json-out">{JSON.stringify(serializeSpec(selectedFactory.id, opts), null, 2)}</pre>
          </details>
        </div>
      {/if}
    </div>

  {:else}
    <!-- ── Empty state — experiment presets + factory picker ──────── -->
    <div class="empty-canvas">
      <div class="exp-hero">
        <div class="exp-hero-icon">🔬</div>
        <p class="empty-title">Physics Lab — Visual Builder</p>
        <p class="empty-sub">Pick a ready-made sensor experiment or build from scratch with the factory library.</p>
      </div>

      <div class="quick-experiments">
        <h5 class="section-label">Quick Experiments</h5>
        <div class="exp-quick-grid">
          {#each EXPERIMENT_PRESETS.slice(0, 6) as exp}
            <button class="exp-quick-card" onclick={() => pickExperiment(exp)}>
              <span class="eqc-icon">{exp.icon}</span>
              <span class="eqc-label">{exp.label}</span>
            </button>
          {/each}
        </div>
        <button class="see-all-btn" onclick={() => { showBrowser = true; browserTab = 'experiments'; }}>
          See all {EXPERIMENT_PRESETS.length} experiments →
        </button>
      </div>

      <div class="or-divider"><span>or</span></div>

      <button class="browse-btn" onclick={() => { showBrowser = true; browserTab = 'factories'; }}>
        Browse Factory Library ({FACTORIES.length} factories)
      </button>
    </div>

    {#if showBrowser}
      {@render factoryBrowser()}
    {/if}
  {/if}
</div>

{#snippet factoryBrowser()}
  <div class="factory-browser">
    <div class="browser-header">
      <div class="browser-tabs">
        <button class="btab" class:active={browserTab === 'experiments'} onclick={() => browserTab = 'experiments'}>
          🔬 Experiments
        </button>
        <button class="btab" class:active={browserTab === 'factories'} onclick={() => browserTab = 'factories'}>
          🧩 Factories
        </button>
      </div>
      <button class="close-browser" onclick={() => showBrowser = false}>✕</button>
    </div>

    {#if browserTab === 'experiments'}
      <p class="browser-intro">Pre-wired sensor + visual combos. One click to start a physics experiment.</p>
      <div class="cat-filter">
        <button class:active={experimentFilter === null} onclick={() => experimentFilter = null}>All</button>
        {#each EXPERIMENT_CATEGORIES as cat}
          <button class:active={experimentFilter === cat.id} onclick={() => experimentFilter = cat.id}>
            {cat.icon} {cat.label}
          </button>
        {/each}
      </div>
      <div class="factory-grid">
        {#each filteredExperiments as exp}
          <button class="factory-card experiment-card" onclick={() => pickExperiment(exp)}>
            <span class="card-icon">{exp.icon}</span>
            <span class="card-label">{exp.label}</span>
            <span class="card-desc">{exp.description}</span>
            <span class="exp-factory-tag">{exp.factory}</span>
          </button>
        {/each}
      </div>
    {:else}
      <div class="cat-filter">
        <button class:active={browseCategory === null} onclick={() => browseCategory = null}>All</button>
        {#each CATEGORIES as cat}
          <button class:active={browseCategory === cat.id} onclick={() => browseCategory = cat.id}>
            {cat.icon} {cat.label}
          </button>
        {/each}
      </div>
      <div class="factory-grid">
        {#each filteredFactories as f}
          <button class="factory-card" class:current={selectedFactory?.id === f.id} onclick={() => pickFactory(f)}>
            <span class="card-icon">{f.icon}</span>
            <span class="card-label">{f.label}</span>
            <span class="card-desc">{f.description}</span>
            {#if f.dynamic}<span class="dynamic-tag">dynamic</span>{/if}
          </button>
        {/each}
      </div>
    {/if}
  </div>
{/snippet}

{#snippet propWidget(p)}
  <div class="prop-row">
    {#if p.type === 'integer' || p.type === 'float'}
      <label class="prop-label">{p.label}
        <div class="slider-row">
          <input type="range"
            min={p.min ?? 0} max={p.max ?? 100} step={p.type === 'float' ? (p.step || 0.01) : 1}
            value={opts[p.name] ?? p.default ?? 0}
            oninput={(e) => setOpt(p.name, p.type === 'integer' ? parseInt(e.target.value) : parseFloat(e.target.value))} />
          <input type="number" class="num-input"
            min={p.min} max={p.max} step={p.type === 'float' ? (p.step || 0.01) : 1}
            value={opts[p.name] ?? p.default ?? 0}
            oninput={(e) => setOpt(p.name, p.type === 'integer' ? parseInt(e.target.value) : parseFloat(e.target.value))} />
        </div>
      </label>

    {:else if p.type === 'boolean'}
      <label class="prop-label toggle-label">
        <input type="checkbox"
          checked={opts[p.name] ?? p.default ?? false}
          onchange={(e) => setOpt(p.name, e.target.checked)} />
        {p.label}
      </label>

    {:else if p.type === 'string'}
      <label class="prop-label">{p.label}
        <input type="text" value={opts[p.name] ?? p.default ?? ''}
          oninput={(e) => setOpt(p.name, e.target.value)} placeholder={p.placeholder || ''} />
      </label>

    {:else if p.type === 'color'}
      <label class="prop-label">{p.label}
        <div class="color-row">
          <input type="color" value={opts[p.name] ?? p.default ?? '#4dabf7'}
            oninput={(e) => setOpt(p.name, e.target.value)} />
          <input type="text" class="color-hex" value={opts[p.name] ?? p.default ?? '#4dabf7'}
            oninput={(e) => setOpt(p.name, e.target.value)} />
        </div>
      </label>

    {:else if p.type === 'enum'}
      <label class="prop-label">{p.label}
        <select value={opts[p.name] ?? p.default ?? ''} onchange={(e) => setOpt(p.name, e.target.value)}>
          {#each (p.values || []) as v}
            <option value={v}>{v}</option>
          {/each}
        </select>
      </label>

    {:else if p.type === 'fn'}
      <label class="prop-label">{p.label}
        <input type="text" class="code-input" value={opts[p.name] ?? ''}
          placeholder={p.placeholder || 'Math.sin(x)'}
          oninput={(e) => setOpt(p.name, e.target.value)} />
      </label>

    {:else if p.type === 'sensor'}
      <label class="prop-label">{p.label}
        <select class="sensor-select"
          value={opts[p.name] ?? ''}
          onchange={(e) => setOpt(p.name, e.target.value || null)}>
          <option value="">— none —</option>
          {#each SENSOR_GROUPS as group}
            <optgroup label={group.label}>
              {#each group.sensors as s}
                <option value={s.id}>{s.label} ({s.unit})</option>
              {/each}
            </optgroup>
          {/each}
        </select>
        {#if opts[p.name]}
          {@const sInfo = getSensorById(opts[p.name])}
          {#if sInfo}
            <span class="sensor-hint">{sInfo.desc}</span>
          {/if}
        {/if}
      </label>

    {:else if p.type === 'object' && p.schema}
      <fieldset class="prop-object">
        <legend>{p.label}</legend>
        {#each p.schema as sp}
          {@render objectPropWidget(p.name, sp)}
        {/each}
      </fieldset>

    {:else if p.type === 'array' && p.itemType === 'string'}
      <div class="list-section">
        <span class="prop-label">{p.label}</span>
        {#each (opts[p.name] || []) as item, li}
          <div class="list-row">
            <input type="text" value={item}
              oninput={(e) => updateSimpleListItem(p.name, li, e.target.value)} />
            <button class="rm-btn" onclick={() => removeListItem(p.name, li)}>✕</button>
          </div>
        {/each}
        <button class="add-list-btn" onclick={() => addListItem(p.name, '')}>+ Add</button>
      </div>

    {:else if p.type === 'array' && p.itemSchema}
      <div class="list-section">
        <span class="prop-label">{p.label}</span>
        {#each (opts[p.name] || []) as item, li}
          <div class="list-item-card">
            <div class="list-item-header">
              <span class="li-num">#{li + 1}</span>
              <button class="rm-btn" onclick={() => removeListItem(p.name, li)}>✕</button>
            </div>
            {#each p.itemSchema as sp}
              <div class="list-item-field">
                {#if sp.type === 'float' || sp.type === 'integer'}
                  <label class="mini-label">{sp.label}
                    <input type="number" step={sp.type === 'float' ? (sp.step || 0.01) : 1}
                      value={item[sp.name] ?? sp.default ?? 0}
                      oninput={(e) => updateListItem(p.name, li, sp.name, sp.type === 'integer' ? parseInt(e.target.value) : parseFloat(e.target.value))} />
                  </label>
                {:else if sp.type === 'color'}
                  <label class="mini-label">{sp.label}
                    <input type="color" value={item[sp.name] ?? sp.default ?? '#4dabf7'}
                      oninput={(e) => updateListItem(p.name, li, sp.name, e.target.value)} />
                  </label>
                {:else if sp.type === 'boolean'}
                  <label class="mini-label toggle-label">
                    <input type="checkbox" checked={item[sp.name] ?? sp.default ?? false}
                      onchange={(e) => updateListItem(p.name, li, sp.name, e.target.checked)} />
                    {sp.label}
                  </label>
                {:else if sp.type === 'fn'}
                  <label class="mini-label">{sp.label}
                    <input type="text" class="code-input" value={item[sp.name] ?? ''}
                      placeholder={sp.placeholder || ''} oninput={(e) => updateListItem(p.name, li, sp.name, e.target.value)} />
                  </label>
                {:else}
                  <label class="mini-label">{sp.label}
                    <input type="text" value={item[sp.name] ?? sp.default ?? ''}
                      oninput={(e) => updateListItem(p.name, li, sp.name, e.target.value)} />
                  </label>
                {/if}
              </div>
            {/each}
          </div>
        {/each}
        <button class="add-list-btn" onclick={() => addListItem(p.name, listItemTemplate(p))}>+ Add {p.label.replace(/s$/, '')}</button>
      </div>

    {:else if SIMPLE_LIST_TYPES.has(p.type)}
      <div class="list-section">
        <span class="prop-label">{p.label}</span>
        <span class="columns-hint">{(p.columns || []).join(', ')}</span>
        {#each (opts[p.name] || []) as item, li}
          <div class="list-item-card">
            <div class="list-item-header">
              <span class="li-num">#{li + 1}</span>
              <button class="rm-btn" onclick={() => removeListItem(p.name, li)}>✕</button>
            </div>
            <div class="columns-row">
              {#each (p.columns || Object.keys(item)) as col}
                {@const cleanCol = col.replace('?', '')}
                <label class="mini-label">
                  {cleanCol}
                  {#if cleanCol === 'color'}
                    <input type="color" value={item[cleanCol] ?? '#4dabf7'}
                      oninput={(e) => updateListItem(p.name, li, cleanCol, e.target.value)} />
                  {:else if cleanCol === 'value' || cleanCol === 'x' || cleanCol === 'y' || cleanCol === 'yMin' || cleanCol === 'yMax' || cleanCol === 'width'}
                    <input type="number" step="any" value={item[cleanCol] ?? 0}
                      oninput={(e) => updateListItem(p.name, li, cleanCol, parseFloat(e.target.value) || 0)} />
                  {:else if cleanCol === 'arrow' || cleanCol === 'pulse'}
                    <input type="checkbox" checked={item[cleanCol] ?? false}
                      onchange={(e) => updateListItem(p.name, li, cleanCol, e.target.checked)} />
                  {:else if cleanCol === 'items'}
                    <input type="text" value={(item[cleanCol] || []).join(', ')}
                      placeholder="comma-separated"
                      oninput={(e) => updateListItem(p.name, li, cleanCol, e.target.value.split(',').map(s => s.trim()).filter(Boolean))} />
                  {:else if cleanCol === 'from' || cleanCol === 'to'}
                    {#if typeof item[cleanCol] === 'object' && item[cleanCol]}
                      <span class="coord-inputs">
                        x:<input type="number" step="0.01" value={item[cleanCol].x ?? 0} class="coord"
                          oninput={(e) => updateListItem(p.name, li, cleanCol, { ...item[cleanCol], x: parseFloat(e.target.value) || 0 })} />
                        y:<input type="number" step="0.01" value={item[cleanCol].y ?? 0} class="coord"
                          oninput={(e) => updateListItem(p.name, li, cleanCol, { ...item[cleanCol], y: parseFloat(e.target.value) || 0 })} />
                      </span>
                    {:else}
                      <input type="text" value={item[cleanCol] ?? ''}
                        oninput={(e) => updateListItem(p.name, li, cleanCol, e.target.value)} />
                    {/if}
                  {:else}
                    <input type="text" value={item[cleanCol] ?? ''}
                      oninput={(e) => updateListItem(p.name, li, cleanCol, e.target.value)} />
                  {/if}
                </label>
              {/each}
            </div>
          </div>
        {/each}
        <button class="add-list-btn" onclick={() => addListItem(p.name, listItemTemplate(p))}>+ Add</button>
      </div>

    {:else}
      <label class="prop-label">{p.label} <span class="type-tag">({p.type})</span>
        <textarea rows="3" value={JSON.stringify(opts[p.name] ?? p.default ?? '', null, 2)}
          oninput={(e) => { try { setOpt(p.name, JSON.parse(e.target.value)); } catch {} }}></textarea>
      </label>
    {/if}
  </div>

{/snippet}

{#snippet objectPropWidget(parentName, sp)}
  <div class="prop-row">
    {#if sp.type === 'integer' || sp.type === 'float'}
      <label class="prop-label">{sp.label}
        <div class="slider-row">
          <input type="range"
            min={sp.min ?? 0} max={sp.max ?? 100} step={sp.type === 'float' ? (sp.step || 0.01) : 1}
            value={(opts[parentName] || {})[sp.name] ?? sp.default ?? 0}
            oninput={(e) => setNestedOpt(parentName, sp.name, sp.type === 'integer' ? parseInt(e.target.value) : parseFloat(e.target.value))} />
          <input type="number" class="num-input"
            min={sp.min} max={sp.max} step={sp.type === 'float' ? (sp.step || 0.01) : 1}
            value={(opts[parentName] || {})[sp.name] ?? sp.default ?? 0}
            oninput={(e) => setNestedOpt(parentName, sp.name, sp.type === 'integer' ? parseInt(e.target.value) : parseFloat(e.target.value))} />
        </div>
      </label>
    {:else if sp.type === 'color'}
      <label class="prop-label">{sp.label}
        <div class="color-row">
          <input type="color" value={(opts[parentName] || {})[sp.name] ?? sp.default ?? '#4dabf7'}
            oninput={(e) => setNestedOpt(parentName, sp.name, e.target.value)} />
          <input type="text" class="color-hex" value={(opts[parentName] || {})[sp.name] ?? sp.default ?? '#4dabf7'}
            oninput={(e) => setNestedOpt(parentName, sp.name, e.target.value)} />
        </div>
      </label>
    {:else if sp.type === 'boolean'}
      <label class="prop-label toggle-label">
        <input type="checkbox"
          checked={(opts[parentName] || {})[sp.name] ?? sp.default ?? false}
          onchange={(e) => setNestedOpt(parentName, sp.name, e.target.checked)} />
        {sp.label}
      </label>
    {:else}
      <label class="prop-label">{sp.label}
        <input type="text" value={(opts[parentName] || {})[sp.name] ?? sp.default ?? ''}
          oninput={(e) => setNestedOpt(parentName, sp.name, e.target.value)} />
      </label>
    {/if}
  </div>
{/snippet}

<style>
  /* ── Design tool shell ─────────────────────────────────────────────────── */
  .svg-design-tool {
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 8px;
    overflow: hidden;
    background: #0d1117;
  }
  .svg-design-tool.has-factory {
    min-height: 420px;
  }

  /* ── Toolbar ────────────────────────────────────────────────────────────── */
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.35rem 0.6rem;
    background: rgba(255,255,255,0.03);
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }
  .toolbar-left, .toolbar-center, .toolbar-right {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .tool-factory-btn {
    display: flex; align-items: center; gap: 0.35rem;
    background: rgba(206,147,216,0.08); border: 1px solid rgba(206,147,216,0.2);
    color: var(--text); padding: 0.25rem 0.6rem; border-radius: 6px;
    cursor: pointer; font-size: 0.82rem;
  }
  .tool-factory-btn:hover { border-color: #ce93d8; }
  .tf-icon { font-size: 1rem; }
  .tf-label { font-weight: 600; }
  .tf-arrow { opacity: 0.5; font-size: 0.7rem; }
  .dynamic-pill {
    font-size: 0.6rem; background: rgba(77,171,247,0.15); color: #4dabf7;
    padding: 0.1rem 0.4rem; border-radius: 8px;
  }

  .tool-btn {
    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
    color: var(--text); width: 28px; height: 28px; border-radius: 4px;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    font-size: 0.85rem; transition: border-color 0.1s;
  }
  .tool-btn:hover { border-color: var(--accent); color: var(--accent); }
  .tool-btn.active { background: rgba(0,230,118,0.1); border-color: var(--accent); color: var(--accent); }
  .tool-btn.danger { color: #ff6b6b; }
  .tool-btn.danger:hover { border-color: #ff6b6b; }

  .zoom-display {
    background: none; border: none; color: var(--text); font-size: 0.75rem;
    font-weight: 600; cursor: pointer; padding: 0 0.2rem; opacity: 0.7;
    min-width: 36px; text-align: center;
  }
  .zoom-display:hover { opacity: 1; color: var(--accent); }

  .tool-sep {
    width: 1px; height: 18px; background: rgba(255,255,255,0.1); margin: 0 0.15rem;
  }

  /* ── Canvas + Sidebar split ─────────────────────────────────────────────── */
  .design-body {
    display: flex;
    min-height: 340px;
  }

  .canvas-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    position: relative;
    background:
      radial-gradient(circle at center, rgba(255,255,255,0.015) 0%, transparent 70%);
    overflow: hidden;
    padding: 1.5rem;
    min-height: 300px;
  }

  .artboard {
    transform-origin: center center;
    transition: transform 0.15s ease;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 4px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    background: #F4F1E8;
    position: relative;
    overflow: hidden;
  }

  .artboard.show-grid {
    background:
      linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px),
      #F4F1E8;
    background-size: 20px 20px;
  }

  .canvas-dims {
    position: absolute;
    bottom: 0.5rem;
    right: 0.75rem;
    font-size: 0.65rem;
    color: rgba(255,255,255,0.3);
    font-family: monospace;
    pointer-events: none;
  }

  /* ── Inspector sidebar ──────────────────────────────────────────────────── */
  .inspector {
    width: 260px;
    min-width: 260px;
    border-left: 1px solid rgba(255,255,255,0.08);
    display: flex;
    flex-direction: column;
    background: rgba(13,17,23,0.95);
  }
  .inspector-header {
    padding: 0.5rem 0.7rem;
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .inspector-header h4 {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 700;
    opacity: 0.8;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .inspector-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem 0.6rem;
    max-height: 400px;
  }

  /* ── Empty state ────────────────────────────────────────────────────────── */
  .empty-canvas {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 1.5rem 1rem 2rem;
    gap: 0.6rem;
    min-height: 320px;
  }
  .exp-hero { text-align: center; }
  .exp-hero-icon { font-size: 2.5rem; margin-bottom: 0.3rem; }
  .empty-title { font-size: 1.05rem; font-weight: 700; margin: 0; opacity: 0.85; }
  .empty-sub { font-size: 0.82rem; opacity: 0.45; margin: 0; text-align: center; max-width: 360px; }

  .quick-experiments { width: 100%; max-width: 480px; margin-top: 0.5rem; }
  .section-label {
    font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em;
    opacity: 0.5; margin: 0 0 0.4rem; font-weight: 700;
  }
  .exp-quick-grid {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.4rem;
  }
  .exp-quick-card {
    background: rgba(77,171,247,0.06); border: 1px solid rgba(77,171,247,0.18);
    border-radius: 8px; padding: 0.5rem 0.4rem; cursor: pointer;
    display: flex; flex-direction: column; align-items: center; gap: 0.2rem;
    color: var(--text); transition: border-color 0.15s, background 0.15s;
  }
  .exp-quick-card:hover { border-color: #4dabf7; background: rgba(77,171,247,0.12); }
  .eqc-icon { font-size: 1.4rem; }
  .eqc-label { font-size: 0.72rem; font-weight: 600; text-align: center; line-height: 1.2; }

  .see-all-btn {
    background: none; border: none; color: #4dabf7; font-size: 0.78rem;
    cursor: pointer; padding: 0.35rem 0; opacity: 0.8;
  }
  .see-all-btn:hover { opacity: 1; text-decoration: underline; }

  .or-divider {
    width: 100%; max-width: 200px; display: flex; align-items: center; gap: 0.5rem;
    margin: 0.3rem 0;
  }
  .or-divider::before, .or-divider::after {
    content: ''; flex: 1; border-bottom: 1px solid rgba(255,255,255,0.1);
  }
  .or-divider span { font-size: 0.72rem; opacity: 0.35; }

  .browse-btn {
    background: rgba(206,147,216,0.12); color: #ce93d8; border: 1px dashed rgba(206,147,216,0.4);
    padding: 0.5rem 1rem; border-radius: 8px; cursor: pointer; font-size: 0.88rem;
    transition: background 0.15s;
  }
  .browse-btn:hover { background: rgba(206,147,216,0.2); }

  /* ── Factory browser ────────────────────────────────────────────────────── */
  .factory-browser {
    background: rgba(13,17,23,0.98); border: 1px solid var(--border);
    border-radius: 10px; padding: 0.8rem; margin: 0.5rem;
    position: relative; z-index: 10;
  }
  .browser-overlay { position: relative; z-index: 5; }
  .browser-header {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 0.5rem;
  }
  .browser-tabs { display: flex; gap: 0.2rem; }
  .btab {
    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1);
    color: var(--text); padding: 0.35rem 0.8rem; border-radius: 6px;
    cursor: pointer; font-size: 0.82rem; font-weight: 600;
    transition: background 0.12s, border-color 0.12s;
  }
  .btab:hover { border-color: var(--accent); }
  .btab.active { background: rgba(0,230,118,0.1); border-color: var(--accent); color: var(--accent); }
  .browser-intro { font-size: 0.78rem; opacity: 0.5; margin: 0 0 0.5rem; }
  .experiment-card { border-color: rgba(77,171,247,0.25); background: rgba(77,171,247,0.04); }
  .experiment-card:hover { border-color: #4dabf7; background: rgba(77,171,247,0.1); }
  .exp-factory-tag {
    font-size: 0.58rem; background: rgba(206,147,216,0.15); color: #ce93d8;
    padding: 0.08rem 0.35rem; border-radius: 6px; margin-top: 0.1rem;
  }
  .close-browser {
    background: none; border: none; color: var(--text); cursor: pointer;
    font-size: 1.1rem; opacity: 0.6; padding: 0.2rem 0.4rem;
  }
  .close-browser:hover { opacity: 1; }

  .cat-filter {
    display: flex; gap: 0.3rem; flex-wrap: wrap; margin-bottom: 0.75rem;
    padding-bottom: 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .cat-filter button {
    background: rgba(255,255,255,0.06); border: 1px solid var(--border);
    color: var(--text); padding: 0.25rem 0.6rem; border-radius: 12px;
    cursor: pointer; font-size: 0.8rem; white-space: nowrap;
  }
  .cat-filter button:hover { border-color: var(--accent); }
  .cat-filter button.active { background: rgba(0,230,118,0.12); border-color: var(--accent); color: var(--accent); font-weight: 600; }

  .factory-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 0.5rem;
  }
  .factory-card {
    background: rgba(31,43,78,0.6); border: 1px solid var(--border);
    border-radius: 8px; padding: 0.6rem; cursor: pointer; text-align: center;
    display: flex; flex-direction: column; align-items: center; gap: 0.25rem;
    transition: border-color 0.15s, background 0.15s; color: var(--text);
  }
  .factory-card:hover { border-color: var(--accent); background: rgba(0,230,118,0.04); }
  .factory-card.current { border-color: #ce93d8; background: rgba(206,147,216,0.08); }
  .card-icon { font-size: 1.6rem; }
  .card-label { font-size: 0.82rem; font-weight: 600; }
  .card-desc { font-size: 0.68rem; opacity: 0.6; line-height: 1.3; }
  .dynamic-tag {
    font-size: 0.6rem; background: rgba(77,171,247,0.15); color: #4dabf7;
    padding: 0.1rem 0.4rem; border-radius: 8px; margin-top: 0.1rem;
  }

  /* ── Property panel (reused in inspector sidebar) ──────────────────────── */
  .prop-row { margin-bottom: 0.4rem; }
  .prop-label { display: block; font-weight: 600; font-size: 0.78rem; margin-bottom: 0.1rem; }
  .prop-label input[type="text"],
  .prop-label input[type="number"],
  .prop-label select,
  .prop-label textarea {
    width: 100%; padding: 0.3rem; background: #1a2544; color: var(--text);
    border: 1px solid var(--border); border-radius: 4px; font-size: 0.82rem;
    font-family: inherit; margin-top: 0.05rem;
  }
  .prop-label textarea { resize: vertical; font-family: monospace; font-size: 0.75rem; }
  .type-tag { font-weight: 400; opacity: 0.5; font-size: 0.65rem; }

  .slider-row { display: flex; gap: 0.4rem; align-items: center; margin-top: 0.05rem; }
  .slider-row input[type="range"] { flex: 1; accent-color: var(--accent); height: 16px; }
  .num-input {
    width: 55px !important; padding: 0.25rem; background: #1a2544; color: var(--text);
    border: 1px solid var(--border); border-radius: 4px; font-size: 0.78rem; text-align: right;
  }

  .toggle-label { display: flex; align-items: center; gap: 0.35rem; font-weight: 600; font-size: 0.78rem; cursor: pointer; }
  .toggle-label input[type="checkbox"] { accent-color: var(--accent); }

  .color-row { display: flex; gap: 0.35rem; align-items: center; margin-top: 0.05rem; }
  .color-row input[type="color"] { width: 30px; height: 26px; border: none; padding: 0; cursor: pointer; background: none; }
  .color-hex {
    width: 75px !important; padding: 0.25rem; background: #1a2544; color: var(--text);
    border: 1px solid var(--border); border-radius: 4px; font-family: monospace; font-size: 0.78rem;
  }

  .code-input { font-family: monospace !important; font-size: 0.78rem !important; }

  .sensor-select {
    width: 100%; padding: 0.3rem; background: #1a2544; color: var(--text);
    border: 1px solid var(--border); border-radius: 4px; font-size: 0.82rem;
    margin-top: 0.05rem;
  }
  .sensor-select optgroup { font-weight: 700; color: #4dabf7; }
  .sensor-hint {
    display: block; font-size: 0.68rem; opacity: 0.5; font-weight: 400;
    margin-top: 0.1rem; font-style: italic;
  }

  .prop-object {
    border: 1px solid rgba(255,255,255,0.08); border-radius: 6px;
    padding: 0.4rem 0.5rem; margin: 0.3rem 0;
  }
  .prop-object legend { font-weight: 600; font-size: 0.78rem; padding: 0 0.2rem; }

  .list-section { margin: 0.3rem 0 0.5rem; }
  .columns-hint { font-size: 0.65rem; opacity: 0.5; display: block; margin-bottom: 0.2rem; }
  .list-item-card {
    background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
    border-radius: 5px; padding: 0.3rem 0.4rem; margin-bottom: 0.3rem;
  }
  .list-item-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.2rem; }
  .li-num { font-size: 0.65rem; font-weight: 600; opacity: 0.5; }
  .rm-btn {
    background: none; border: 1px solid rgba(255,107,107,0.3); color: #ff6b6b;
    width: 20px; height: 20px; border-radius: 3px; cursor: pointer; font-size: 0.65rem;
    display: flex; align-items: center; justify-content: center;
  }
  .rm-btn:hover { background: rgba(255,107,107,0.1); }
  .list-row { display: flex; gap: 0.25rem; margin-bottom: 0.2rem; }
  .list-row input { flex: 1; }
  .columns-row { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .columns-row label { flex: 1; min-width: 55px; }

  .mini-label { display: block; font-size: 0.7rem; font-weight: 600; opacity: 0.85; }
  .mini-label input,
  .mini-label select {
    width: 100%; padding: 0.2rem; background: #1a2544; color: var(--text);
    border: 1px solid var(--border); border-radius: 3px; font-size: 0.75rem;
    margin-top: 0.03rem;
  }
  .mini-label input[type="color"] { width: 100%; height: 22px; border: none; padding: 0; cursor: pointer; }
  .mini-label input[type="checkbox"] { width: auto; }
  .list-item-field { margin-bottom: 0.15rem; }

  .coord-inputs { display: flex; gap: 0.2rem; align-items: center; font-size: 0.72rem; }
  .coord { width: 48px !important; }

  .add-list-btn {
    background: none; border: 1px dashed rgba(77,171,247,0.3); color: #4dabf7;
    padding: 0.2rem 0.5rem; border-radius: 4px; cursor: pointer; font-size: 0.75rem;
    margin-top: 0.15rem;
  }
  .add-list-btn:hover { background: rgba(77,171,247,0.08); }

  .spec-debug { margin: 0.4rem 0.6rem 0.6rem; }
  .spec-debug summary {
    cursor: pointer; font-size: 0.7rem; opacity: 0.5; user-select: none;
  }
  .spec-debug summary:hover { opacity: 1; }
  .json-out {
    background: #121830; border: 1px solid var(--border); border-radius: 4px;
    padding: 0.3rem 0.5rem; font-size: 0.65rem; max-height: 150px; overflow: auto;
    white-space: pre-wrap;
  }
</style>
