<script>
  import { getArchetypeById, getDesignHints } from '$lib/archetypes';

  let { archetypeId = null } = $props();

  const arch = $derived(getArchetypeById(archetypeId ?? ''));
  const hints = $derived(getDesignHints(archetypeId ?? ''));
</script>

{#if arch && hints}
  <details class="design-hints">
    <summary>Design tips for {arch.name}</summary>
    <div class="hints-content">
      {#if hints.opening}
        <div class="hint-block">
          <strong>Opening</strong>
          <p>{hints.opening}</p>
        </div>
      {/if}
      {#if hints.assessment}
        <div class="hint-block">
          <strong>Assessment</strong>
          <p>{hints.assessment}</p>
        </div>
      {/if}
      {#if hints.visual}
        <div class="hint-block">
          <strong>Visuals</strong>
          <p>{hints.visual}</p>
        </div>
      {/if}
      {#if hints.antipatterns}
        <div class="hint-block antipatterns">
          <strong>Avoid</strong>
          <p>{hints.antipatterns}</p>
        </div>
      {/if}
    </div>
  </details>
{/if}

<style>
  .design-hints {
    margin: 0.75rem 0;
    border: 1px solid var(--border, #333);
    border-radius: 8px;
    overflow: hidden;
  }
  .design-hints summary {
    cursor: pointer; padding: 0.5rem 0.75rem;
    background: rgba(79,195,247,0.06);
    font-weight: 600; font-size: 0.9rem;
  }
  .hints-content { padding: 0.75rem 1rem; font-size: 0.9rem; line-height: 1.5; }
  .hint-block { margin-bottom: 0.75rem; }
  .hint-block:last-child { margin-bottom: 0; }
  .hint-block strong { display: block; margin-bottom: 0.25rem; font-size: 0.8rem; text-transform: uppercase; opacity: 0.8; }
  .hint-block p { margin: 0; opacity: 0.9; }
  .hint-block.antipatterns { border-left: 3px solid #ff9800; padding-left: 0.5rem; }
</style>
