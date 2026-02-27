<script>
  import { hubApiStore } from '$lib/api';
  import { t } from '$lib/i18n';
  import { getPseudoId } from '$lib/pseudoId';
  import { onMount } from 'svelte';

  const api = $derived($hubApiStore);
  const tr = $derived($t);

  let loading = $state(true);
  let nodes = $state(/** @type {any[]} */ ([]));
  let edges = $state(/** @type {any[]} */ ([]));
  let totalSkills = $state(0);

  const masteredNodes = $derived(nodes.filter(n => n.mastery >= 0.6));
  const inProgressNodes = $derived(nodes.filter(n => n.mastery > 0 && n.mastery < 0.6));
  const lockedNodes = $derived(nodes.filter(n => n.mastery === 0));

  // Topological layers for tree layout
  const layers = $derived.by(() => {
    const incoming = new Map();
    const outgoing = new Map();
    for (const n of nodes) {
      incoming.set(n.id, []);
      outgoing.set(n.id, []);
    }
    for (const e of edges) {
      if (incoming.has(e.to)) incoming.get(e.to).push(e.from);
      if (outgoing.has(e.from)) outgoing.get(e.from).push(e.to);
    }

    const assigned = new Map();
    const result = [];
    const nodeIds = new Set(nodes.map(n => n.id));

    // BFS layer assignment
    const roots = nodes.filter(n => (incoming.get(n.id) || []).length === 0);
    const queue = roots.map(n => ({ id: n.id, layer: 0 }));
    const visited = new Set();

    while (queue.length > 0) {
      const { id, layer } = queue.shift();
      if (visited.has(id)) continue;
      visited.add(id);
      assigned.set(id, layer);
      for (const child of (outgoing.get(id) || [])) {
        if (!visited.has(child) && nodeIds.has(child)) {
          queue.push({ id: child, layer: layer + 1 });
        }
      }
    }
    // Assign unvisited nodes to layer 0
    for (const n of nodes) {
      if (!assigned.has(n.id)) assigned.set(n.id, 0);
    }

    const layerMap = new Map();
    for (const [id, layer] of assigned) {
      if (!layerMap.has(layer)) layerMap.set(layer, []);
      layerMap.get(layer).push(nodes.find(n => n.id === id));
    }
    const sorted = [...layerMap.entries()].sort((a, b) => a[0] - b[0]);
    return sorted.map(([_, ns]) => ns);
  });

  function statusClass(mastery) {
    if (mastery >= 0.6) return 'mastered';
    if (mastery > 0) return 'in-progress';
    return 'locked';
  }

  function statusLabel(mastery) {
    if (mastery >= 0.6) return tr('progress.mastered_label');
    if (mastery > 0) return tr('progress.in_progress');
    return 'Locked';
  }

  async function load() {
    if (!api.baseUrl) { loading = false; return; }
    try {
      const pseudoId = getPseudoId();
      const res = await api.getSkillGraph(pseudoId);
      nodes = res.nodes || [];
      edges = res.edges || [];
      totalSkills = res.totalSkills || 0;
    } catch { /* skill graph not available */ }
    loading = false;
  }

  onMount(load);
</script>

<svelte:head>
  <title>Skill Tree | AGNI Portal</title>
</svelte:head>

<nav class="breadcrumb" aria-label="Breadcrumb">
  <a href="/learn">{tr('learn.title')}</a> &rarr; Skill Tree
</nav>

<h1>{tr('progress.skill_map')}</h1>

{#if loading}
  <p aria-live="polite">{tr('learn.loading')}</p>
{:else if nodes.length === 0}
  <div class="card empty">
    <p>{tr('progress.no_skills')}</p>
  </div>
{:else}
  <!-- Summary -->
  <div class="tree-summary" role="region" aria-label="Skill summary">
    <div class="sum-item mastered">
      <span class="sum-num">{masteredNodes.length}</span>
      <span class="sum-label">{tr('progress.mastered_label')}</span>
    </div>
    <div class="sum-item in-progress">
      <span class="sum-num">{inProgressNodes.length}</span>
      <span class="sum-label">{tr('progress.in_progress')}</span>
    </div>
    <div class="sum-item locked">
      <span class="sum-num">{lockedNodes.length}</span>
      <span class="sum-label">Locked</span>
    </div>
    <div class="sum-item total">
      <span class="sum-num">{totalSkills}</span>
      <span class="sum-label">Total</span>
    </div>
  </div>

  <!-- Tree visualization -->
  <div class="skill-tree" role="tree" aria-label="Skill prerequisite tree">
    {#each layers as layer, layerIdx}
      <div class="tree-layer" role="group" aria-label="Level {layerIdx + 1}">
        <span class="layer-label">Level {layerIdx + 1}</span>
        <div class="layer-nodes">
          {#each layer as node}
            {#if node}
              <div
                class="skill-node {statusClass(node.mastery)}"
                role="treeitem"
                aria-label="{node.id}: {statusLabel(node.mastery)}"
                title="{node.id} — Mastery: {Math.round(node.mastery * 100)}%"
              >
                <span class="node-icon">
                  {#if node.mastery >= 0.6}&#10003;{:else if node.mastery > 0}&#9679;{:else}&#9675;{/if}
                </span>
                <span class="node-name">{node.id}</span>
                <span class="node-mastery">{Math.round(node.mastery * 100)}%</span>
              </div>
            {/if}
          {/each}
        </div>
      </div>
      {#if layerIdx < layers.length - 1}
        <div class="tree-connector" aria-hidden="true">
          <svg height="20" width="100%"><line x1="50%" y1="0" x2="50%" y2="20" stroke="var(--border)" stroke-width="2" stroke-dasharray="4,3"/></svg>
        </div>
      {/if}
    {/each}
  </div>

  <!-- Edge list for accessibility -->
  <details class="edge-list">
    <summary>Prerequisite connections ({edges.length})</summary>
    <ul>
      {#each edges as e}
        <li><code>{e.from}</code> &rarr; <code>{e.to}</code> <span class="edge-lesson">via {e.lessonId}</span></li>
      {/each}
    </ul>
  </details>
{/if}

<style>
  .breadcrumb { margin-bottom: 1rem; font-size: 0.9rem; opacity: 0.9; }
  .breadcrumb a { color: var(--accent); }
  .empty { text-align: center; padding: 2rem; }

  .tree-summary {
    display: flex; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap;
  }
  .sum-item {
    text-align: center; padding: 0.75rem 1.25rem;
    background: var(--card); border: 1px solid var(--border); border-radius: 10px; min-width: 80px;
  }
  .sum-item.mastered { border-color: #4ade80; }
  .sum-item.in-progress { border-color: #60a5fa; }
  .sum-item.locked { opacity: 0.6; }
  .sum-num { display: block; font-size: 1.5rem; font-weight: bold; color: var(--accent); }
  .sum-label { font-size: 0.8rem; opacity: 0.7; }

  .skill-tree { margin-bottom: 2rem; }
  .tree-layer { margin-bottom: 0.25rem; }
  .layer-label { font-size: 0.75rem; opacity: 0.5; display: block; margin-bottom: 0.3rem; }
  .layer-nodes { display: flex; gap: 0.5rem; flex-wrap: wrap; }

  .skill-node {
    display: flex; align-items: center; gap: 0.4rem; padding: 0.4rem 0.7rem;
    background: var(--card); border: 1px solid var(--border); border-radius: 8px;
    font-size: 0.85rem; transition: all 0.15s;
  }
  .skill-node.mastered { border-color: #4ade80; background: rgba(74,222,128,0.06); }
  .skill-node.in-progress { border-color: #60a5fa; background: rgba(96,165,250,0.06); }
  .skill-node.locked { opacity: 0.45; }
  .node-icon { font-size: 0.9rem; }
  .skill-node.mastered .node-icon { color: #4ade80; }
  .skill-node.in-progress .node-icon { color: #60a5fa; }
  .node-name { font-weight: 500; }
  .node-mastery { font-size: 0.75rem; opacity: 0.6; }

  .tree-connector { text-align: center; height: 20px; }

  .edge-list { margin-top: 1rem; font-size: 0.85rem; opacity: 0.8; }
  .edge-list summary { cursor: pointer; }
  .edge-list ul { margin-top: 0.5rem; padding-left: 1.2rem; }
  .edge-list li { margin: 0.2rem 0; }
  .edge-lesson { font-size: 0.75rem; opacity: 0.5; }
</style>
