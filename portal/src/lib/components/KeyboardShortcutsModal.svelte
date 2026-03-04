<script>
  let { open = false, onclose = () => {} } = $props();

  const shortcuts = [
    { keys: ['Ctrl', 'S'], action: 'Save lesson' },
    { keys: ['Ctrl', 'Shift', 'V'], action: 'Validate' },
    { keys: ['Ctrl', 'Shift', 'P'], action: 'Preview' }
  ];
</script>

{#if open}
  <div class="modal-backdrop" onclick={onclose} role="presentation">
    <div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="shortcuts-title">
      <div class="modal-header">
        <h2 id="shortcuts-title">Keyboard shortcuts</h2>
        <button class="close-btn" onclick={onclose} aria-label="Close">×</button>
      </div>
      <div class="shortcuts-list">
        {#each shortcuts as s}
          <div class="shortcut-row">
            <span class="keys">
              {#each s.keys as k}
                <kbd>{k}</kbd>
                {#if k !== s.keys[s.keys.length - 1]}<span class="plus">+</span>{/if}
              {/each}
            </span>
            <span class="action">{s.action}</span>
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.5);
    display: flex; align-items: center; justify-content: center;
    z-index: 1000;
  }
  .modal {
    background: var(--surface, #1e1e2e);
    border: 1px solid var(--border, #333);
    border-radius: 12px;
    padding: 1.25rem;
    max-width: 420px;
    width: 90%;
  }
  .modal-header {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 1rem;
  }
  .modal-header h2 { margin: 0; font-size: 1.2rem; }
  .close-btn {
    background: none; border: none; color: var(--text);
    font-size: 1.5rem; cursor: pointer; padding: 0 0.25rem;
    opacity: 0.7; line-height: 1;
  }
  .close-btn:hover { opacity: 1; }
  .shortcuts-list { display: flex; flex-direction: column; gap: 0.75rem; }
  .shortcut-row {
    display: flex; align-items: center; gap: 1rem;
  }
  .keys {
    display: flex; align-items: center; gap: 0.2rem;
    min-width: 140px;
  }
  .keys kbd {
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 4px;
    padding: 0.2rem 0.5rem;
    font-size: 0.85rem;
    font-family: inherit;
  }
  .plus { font-size: 0.8rem; opacity: 0.6; }
  .action { font-size: 0.95rem; opacity: 0.9; }
</style>
