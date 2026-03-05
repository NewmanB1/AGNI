<script>
  const COMMON_SKILL_IDS = [
    'ols:physics:gravity', 'ols:physics:newtons_laws', 'ols:physics:forces',
    'ols:math:algebra', 'ols:math:geometry', 'ols:math:arithmetic',
    'ols:science:biology_basics', 'ols:science:chemistry_basics',
  ];

  let { ontology = $bindable({ requires: [], provides: [] }), spineIds = [], onchange = () => {} } = $props();

  let showSpineRef = $state(false);

  function addSkill(list) {
    if (list === 'requires') {
      ontology = { ...ontology, requires: [...ontology.requires, { skill: '', level: 1 }] };
    } else {
      ontology = { ...ontology, provides: [...ontology.provides, { skill: '', level: 1 }] };
    }
    onchange();
  }

  function removeSkill(list, i) {
    if (list === 'requires') {
      ontology = { ...ontology, requires: ontology.requires.filter((_, idx) => idx !== i) };
    } else {
      ontology = { ...ontology, provides: ontology.provides.filter((_, idx) => idx !== i) };
    }
    onchange();
  }

  function updateSkill(list, i, field, value) {
    const arr = [...(list === 'requires' ? ontology.requires : ontology.provides)];
    arr[i] = { ...arr[i], [field]: value };
    if (list === 'requires') {
      ontology = { ...ontology, requires: arr };
    } else {
      ontology = { ...ontology, provides: arr };
    }
    onchange();
  }

  function pickSpine(list, i, sid) {
    updateSkill(list, i, 'skill', sid);
  }
</script>

<section class="ontology-editor">
  <div class="ont-header">
    <h2>Ontology</h2>
    <button class="link-btn" onclick={() => showSpineRef = !showSpineRef}>
      {showSpineRef ? '▾ Hide spine reference' : '▸ UTU Spine reference'}
    </button>
  </div>

  {#if showSpineRef}
    <div class="spine-ref">
      <p class="hint">Click a spine ID to copy it into a skill field.</p>
      <div class="spine-chips">
        {#each spineIds as sid}
          <button class="spine-chip" onclick={() => navigator.clipboard.writeText(sid)} title="Copy {sid}">{sid}</button>
        {/each}
      </div>
    </div>
  {/if}

  <div class="ont-section">
    <div class="ont-section-header">
      <h3>Requires</h3>
      <button class="add-btn" onclick={() => addSkill('requires')}>+ Add</button>
    </div>
    {#if ontology.requires.length === 0}
      <p class="empty-hint">No prerequisites. This lesson has no skill requirements.</p>
    {/if}
    {#each ontology.requires as node, i}
      <div class="skill-row">
        <input type="text" value={node.skill} oninput={(e) => updateSkill('requires', i, 'skill', e.target.value)}
               placeholder="Skill ID (e.g. MAC-2, gravity_basics)" class="skill-input" list="spine-datalist" />
        <label class="level-label">Lv
          <input type="number" value={node.level} min="1" max="10"
                 oninput={(e) => updateSkill('requires', i, 'level', parseInt(e.target.value) || 1)} class="level-input" />
        </label>
        <button class="icon-btn danger" onclick={() => removeSkill('requires', i)} title="Remove">✕</button>
      </div>
    {/each}
  </div>

  <div class="ont-section">
    <div class="ont-section-header">
      <h3>Provides</h3>
      <button class="add-btn" onclick={() => addSkill('provides')}>+ Add</button>
    </div>
    {#if ontology.provides.length === 0}
      <p class="empty-hint">No outputs. This lesson doesn't declare skills it teaches.</p>
    {/if}
    {#each ontology.provides as node, i}
      <div class="skill-row">
        <input type="text" value={node.skill} oninput={(e) => updateSkill('provides', i, 'skill', e.target.value)}
               placeholder="Skill ID (e.g. MAC-2, gravity_basics)" class="skill-input" list="spine-datalist" />
        <label class="level-label">Lv
          <input type="number" value={node.level} min="1" max="10"
                 oninput={(e) => updateSkill('provides', i, 'level', parseInt(e.target.value) || 1)} class="level-input" />
        </label>
        <button class="icon-btn danger" onclick={() => removeSkill('provides', i)} title="Remove">✕</button>
      </div>
    {/each}
  </div>
</section>

<datalist id="spine-datalist">
  {#each spineIds as sid}
    <option value={sid}></option>
  {/each}
  {#each COMMON_SKILL_IDS as skill}
    <option value={skill}></option>
  {/each}
</datalist>

<style>
  .ontology-editor { margin-top: 0.5rem; }
  .ont-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
  .ont-header h2 { margin: 0; }

  .link-btn { background: none; border: none; color: var(--accent); cursor: pointer; font-size: 0.9rem; }
  .link-btn:hover { text-decoration: underline; }

  .spine-ref {
    background: rgba(31,43,78,0.5); border: 1px solid var(--border); border-radius: 8px;
    padding: 0.6rem 0.8rem; margin-bottom: 0.75rem;
  }
  .spine-chips { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.4rem; }
  .spine-chip {
    background: rgba(0,230,118,0.1); color: var(--accent); border: 1px solid rgba(0,230,118,0.25);
    padding: 0.2rem 0.5rem; border-radius: 10px; font-size: 0.8rem; cursor: pointer; font-family: monospace;
  }
  .spine-chip:hover { background: rgba(0,230,118,0.2); }

  .hint { font-size: 0.85rem; opacity: 0.7; margin: 0; }
  .empty-hint { opacity: 0.6; font-style: italic; font-size: 0.9rem; margin: 0.25rem 0; }

  .ont-section { margin-bottom: 0.75rem; }
  .ont-section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem; }
  .ont-section-header h3 { margin: 0; font-size: 1rem; }

  .add-btn {
    background: rgba(0,230,118,0.1); color: var(--accent); border: 1px dashed var(--accent);
    padding: 0.25rem 0.7rem; border-radius: 5px; cursor: pointer; font-size: 0.85rem;
  }
  .add-btn:hover { background: rgba(0,230,118,0.2); }

  .skill-row {
    display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.35rem;
  }
  .skill-input {
    flex: 1; padding: 0.4rem; background: #1a2544; color: var(--text);
    border: 1px solid var(--border); border-radius: 5px; font-size: 0.95rem; font-family: inherit;
  }
  .level-label {
    display: flex; align-items: center; gap: 0.25rem; font-weight: 600; font-size: 0.85rem; white-space: nowrap;
  }
  .level-input {
    width: 52px; padding: 0.4rem; background: #1a2544; color: var(--text);
    border: 1px solid var(--border); border-radius: 5px; font-size: 0.9rem; text-align: center;
  }

  .icon-btn {
    background: none; border: 1px solid var(--border); color: var(--text);
    width: 28px; height: 28px; border-radius: 4px; cursor: pointer;
    display: flex; align-items: center; justify-content: center; font-size: 0.9rem;
  }
  .icon-btn.danger { color: #ff6b6b; border-color: rgba(255,107,107,0.3); }
</style>
