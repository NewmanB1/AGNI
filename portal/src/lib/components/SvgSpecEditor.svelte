<script>
  import { FACTORIES, CATEGORIES, getFactoryById, getDefaults, serializeSpec } from '$lib/svg-catalog.js';

  let { spec = $bindable(null), onchange = () => {} } = $props();

  let selectedFactory = $state(null);
  let opts = $state({});
  let browseCategory = $state(null);
  let showBrowser = $state(false);

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

  function pickFactory(desc) {
    selectedFactory = desc;
    opts = { ...getDefaults(desc.id), ...(desc.previewDefaults || {}) };
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
</script>

<div class="svg-spec-editor">
  {#if selectedFactory}
    <div class="factory-selected-bar">
      <span class="factory-icon">{selectedFactory.icon}</span>
      <div class="factory-info">
        <strong>{selectedFactory.label}</strong>
        <span class="factory-cat">{selectedFactory.category}{selectedFactory.dynamic ? ' · dynamic' : ''}</span>
      </div>
      <button class="change-btn" onclick={() => showBrowser = true}>Change</button>
      <button class="clear-btn" onclick={clearFactory} title="Remove SVG">✕</button>
    </div>

    {#if showBrowser}
      <div class="browser-overlay">
        {@render factoryBrowser()}
      </div>
    {/if}

    <div class="prop-panel">
      {#each selectedFactory.props as p}
        {@render propWidget(p)}
      {/each}
    </div>

    <details class="spec-debug">
      <summary>Spec JSON</summary>
      <pre class="json-out">{JSON.stringify(serializeSpec(selectedFactory.id, opts), null, 2)}</pre>
    </details>

  {:else}
    <div class="no-factory">
      <p>Add a visual element from the SVG factory library.</p>
      <button class="browse-btn" onclick={() => showBrowser = true}>Browse SVG Factories</button>
    </div>

    {#if showBrowser}
      {@render factoryBrowser()}
    {/if}
  {/if}
</div>

{#snippet factoryBrowser()}
  <div class="factory-browser">
    <div class="browser-header">
      <h4>SVG Factory Library</h4>
      <button class="close-browser" onclick={() => showBrowser = false}>✕</button>
    </div>

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
        <button class="factory-card" onclick={() => pickFactory(f)}>
          <span class="card-icon">{f.icon}</span>
          <span class="card-label">{f.label}</span>
          <span class="card-desc">{f.description}</span>
          {#if f.dynamic}<span class="dynamic-tag">dynamic</span>{/if}
        </button>
      {/each}
    </div>
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
        <input type="text" value={opts[p.name] ?? ''}
          placeholder="e.g. accelerometer, accel.magnitude"
          oninput={(e) => setOpt(p.name, e.target.value || null)} />
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
  .svg-spec-editor { margin-top: 0.25rem; }

  /* Factory selected bar */
  .factory-selected-bar {
    display: flex; align-items: center; gap: 0.6rem;
    background: rgba(77,171,247,0.08); border: 1px solid rgba(77,171,247,0.3);
    border-radius: 8px; padding: 0.6rem 0.8rem; margin-bottom: 0.75rem;
  }
  .factory-icon { font-size: 1.4rem; }
  .factory-info { flex: 1; }
  .factory-info strong { display: block; font-size: 0.95rem; }
  .factory-cat { font-size: 0.8rem; opacity: 0.6; }
  .change-btn {
    background: rgba(255,255,255,0.08); border: 1px solid var(--border); color: var(--text);
    padding: 0.3rem 0.7rem; border-radius: 5px; cursor: pointer; font-size: 0.85rem;
  }
  .change-btn:hover { border-color: var(--accent); color: var(--accent); }
  .clear-btn {
    background: none; border: 1px solid rgba(255,107,107,0.3); color: #ff6b6b;
    width: 28px; height: 28px; border-radius: 4px; cursor: pointer; display: flex;
    align-items: center; justify-content: center; font-size: 0.9rem;
  }
  .clear-btn:hover { background: rgba(255,107,107,0.1); }

  /* No factory state */
  .no-factory { text-align: center; padding: 1rem 0; opacity: 0.8; }
  .browse-btn {
    background: rgba(77,171,247,0.12); color: #4dabf7; border: 1px dashed rgba(77,171,247,0.4);
    padding: 0.6rem 1.2rem; border-radius: 8px; cursor: pointer; font-size: 0.95rem;
    margin-top: 0.3rem;
  }
  .browse-btn:hover { background: rgba(77,171,247,0.2); }

  /* Factory browser */
  .factory-browser {
    background: rgba(18,24,48,0.98); border: 1px solid var(--border);
    border-radius: 10px; padding: 0.8rem; margin-bottom: 0.75rem;
  }
  .browser-overlay { position: relative; z-index: 5; }
  .browser-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
  .browser-header h4 { margin: 0; font-size: 1rem; }
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
    display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 0.5rem;
  }
  .factory-card {
    background: rgba(31,43,78,0.6); border: 1px solid var(--border);
    border-radius: 8px; padding: 0.6rem; cursor: pointer; text-align: center;
    display: flex; flex-direction: column; align-items: center; gap: 0.25rem;
    transition: border-color 0.15s, background 0.15s; color: var(--text);
  }
  .factory-card:hover { border-color: var(--accent); background: rgba(0,230,118,0.04); }
  .card-icon { font-size: 1.6rem; }
  .card-label { font-size: 0.85rem; font-weight: 600; }
  .card-desc { font-size: 0.72rem; opacity: 0.6; line-height: 1.3; }
  .dynamic-tag {
    font-size: 0.65rem; background: rgba(77,171,247,0.15); color: #4dabf7;
    padding: 0.1rem 0.4rem; border-radius: 8px; margin-top: 0.1rem;
  }

  /* Property panel */
  .prop-panel { display: flex; flex-direction: column; gap: 0.1rem; }
  .prop-row { margin-bottom: 0.4rem; }
  .prop-label { display: block; font-weight: 600; font-size: 0.85rem; margin-bottom: 0.15rem; }
  .prop-label input[type="text"],
  .prop-label input[type="number"],
  .prop-label select,
  .prop-label textarea {
    width: 100%; padding: 0.35rem; background: #1a2544; color: var(--text);
    border: 1px solid var(--border); border-radius: 4px; font-size: 0.9rem;
    font-family: inherit; margin-top: 0.1rem;
  }
  .prop-label textarea { resize: vertical; font-family: monospace; font-size: 0.8rem; }
  .type-tag { font-weight: 400; opacity: 0.5; font-size: 0.75rem; }

  /* Slider row */
  .slider-row { display: flex; gap: 0.5rem; align-items: center; margin-top: 0.1rem; }
  .slider-row input[type="range"] { flex: 1; accent-color: var(--accent); }
  .num-input {
    width: 70px !important; padding: 0.3rem; background: #1a2544; color: var(--text);
    border: 1px solid var(--border); border-radius: 4px; font-size: 0.85rem; text-align: right;
  }

  /* Toggle */
  .toggle-label { display: flex; align-items: center; gap: 0.4rem; font-weight: 600; font-size: 0.85rem; cursor: pointer; }
  .toggle-label input[type="checkbox"] { accent-color: var(--accent); }

  /* Color */
  .color-row { display: flex; gap: 0.4rem; align-items: center; margin-top: 0.1rem; }
  .color-row input[type="color"] { width: 36px; height: 30px; border: none; padding: 0; cursor: pointer; background: none; }
  .color-hex {
    width: 90px !important; padding: 0.3rem; background: #1a2544; color: var(--text);
    border: 1px solid var(--border); border-radius: 4px; font-family: monospace; font-size: 0.85rem;
  }

  /* Code input */
  .code-input { font-family: monospace !important; font-size: 0.85rem !important; }

  /* Object fieldset */
  .prop-object {
    border: 1px solid rgba(255,255,255,0.08); border-radius: 6px;
    padding: 0.5rem 0.6rem; margin: 0.3rem 0;
  }
  .prop-object legend { font-weight: 600; font-size: 0.85rem; padding: 0 0.3rem; }

  /* List sections */
  .list-section { margin: 0.3rem 0 0.5rem; }
  .columns-hint { font-size: 0.75rem; opacity: 0.5; display: block; margin-bottom: 0.3rem; }
  .list-item-card {
    background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
    border-radius: 6px; padding: 0.4rem 0.5rem; margin-bottom: 0.35rem;
  }
  .list-item-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem; }
  .li-num { font-size: 0.75rem; font-weight: 600; opacity: 0.5; }
  .rm-btn {
    background: none; border: 1px solid rgba(255,107,107,0.3); color: #ff6b6b;
    width: 22px; height: 22px; border-radius: 3px; cursor: pointer; font-size: 0.75rem;
    display: flex; align-items: center; justify-content: center;
  }
  .rm-btn:hover { background: rgba(255,107,107,0.1); }
  .list-row { display: flex; gap: 0.3rem; margin-bottom: 0.25rem; }
  .list-row input { flex: 1; }
  .columns-row { display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .columns-row label { flex: 1; min-width: 70px; }

  .mini-label { display: block; font-size: 0.78rem; font-weight: 600; opacity: 0.85; }
  .mini-label input,
  .mini-label select {
    width: 100%; padding: 0.25rem; background: #1a2544; color: var(--text);
    border: 1px solid var(--border); border-radius: 3px; font-size: 0.82rem;
    margin-top: 0.05rem;
  }
  .mini-label input[type="color"] { width: 100%; height: 26px; border: none; padding: 0; cursor: pointer; }
  .mini-label input[type="checkbox"] { width: auto; }
  .list-item-field { margin-bottom: 0.2rem; }

  .coord-inputs { display: flex; gap: 0.2rem; align-items: center; font-size: 0.8rem; }
  .coord { width: 55px !important; }

  .add-list-btn {
    background: none; border: 1px dashed rgba(77,171,247,0.3); color: #4dabf7;
    padding: 0.3rem 0.6rem; border-radius: 5px; cursor: pointer; font-size: 0.82rem;
    margin-top: 0.2rem;
  }
  .add-list-btn:hover { background: rgba(77,171,247,0.08); }

  /* Spec debug */
  .spec-debug { margin-top: 0.5rem; }
  .spec-debug summary {
    cursor: pointer; font-size: 0.8rem; opacity: 0.6; user-select: none;
  }
  .spec-debug summary:hover { opacity: 1; }
  .json-out {
    background: #121830; border: 1px solid var(--border); border-radius: 5px;
    padding: 0.4rem 0.6rem; font-size: 0.75rem; max-height: 200px; overflow: auto;
    white-space: pre-wrap;
  }
</style>
