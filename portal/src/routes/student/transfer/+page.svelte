<!-- Student device transfer: enter a code to move your account to a new phone -->
<script>
  import { hubApiStore } from '$lib/api';
  import { onMount } from 'svelte';

  const api = $derived($hubApiStore);

  let code = $state('');
  let loading = $state(false);
  let error = $state('');
  let result = $state(null);
  let existingId = $state('');

  onMount(() => {
    if (typeof localStorage !== 'undefined') {
      existingId = localStorage.getItem('agni_pseudo_id') || '';
    }
  });

  async function handleClaim() {
    error = '';
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 6) { error = 'Enter the full transfer code'; return; }
    loading = true;
    try {
      const r = await api.claimTransferToken(trimmed);
      result = r;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('agni_pseudo_id', r.pseudoId);
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Transfer failed';
    } finally {
      loading = false;
    }
  }
</script>

<div class="transfer-page">
  <div class="card">
    <h2>Transfer Your Account</h2>
    <p class="desc">Got a new phone? Enter the transfer code your teacher gave you to move your learning progress to this device.</p>

    {#if result}
      <div class="success">
        <h3>Transfer Complete!</h3>
        <p>Welcome back{result.displayName ? `, ${result.displayName}` : ''}!</p>
        <p class="mono">Your ID: {result.pseudoId}</p>
        <p>Your learning progress is now linked to this device. You can continue where you left off.</p>
        <a href="/learn" class="btn primary">Start Learning</a>
      </div>
    {:else}
      {#if existingId}
        <div class="warning">
          This device already has a student account ({existingId}). Claiming a transfer code will replace it.
        </div>
      {/if}

      <form onsubmit={(e) => { e.preventDefault(); handleClaim(); }}>
        <label>
          <span>Transfer Code</span>
          <input
            type="text"
            bind:value={code}
            placeholder="e.g. A3K7P2XY"
            maxlength="10"
            class="code-input"
            autocomplete="off"
          />
        </label>
        {#if error}<p class="error">{error}</p>{/if}
        <button type="submit" class="btn primary" disabled={loading}>
          {loading ? 'Transferring...' : 'Transfer Account'}
        </button>
      </form>

      <p class="note">Don't have a code? Ask your teacher to generate one from the Accounts page.</p>
    {/if}
  </div>
</div>

<style>
  .transfer-page {
    display: flex;
    justify-content: center;
    padding: 2rem 1rem;
  }
  .card {
    width: 100%;
    max-width: 440px;
    background: var(--surface, #1e1e1e);
    border: 1px solid var(--border, #333);
    border-radius: 12px;
    padding: 2rem;
  }
  h2 { margin: 0 0 0.5rem; }
  .desc {
    color: var(--text-muted, #aaa);
    line-height: 1.5;
    margin-bottom: 1.5rem;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  label span {
    font-size: 0.85rem;
    color: var(--text-muted, #aaa);
  }
  .code-input {
    padding: 0.75rem 1rem;
    border: 2px solid var(--border, #444);
    border-radius: 8px;
    background: var(--bg, #121212);
    color: var(--text, #eee);
    font-family: monospace;
    font-size: 1.5rem;
    text-align: center;
    letter-spacing: 0.25em;
    text-transform: uppercase;
  }
  .code-input:focus {
    outline: none;
    border-color: var(--accent, #4fc3f7);
  }
  .btn {
    padding: 0.65rem 1.25rem;
    border: none;
    border-radius: 6px;
    font-size: 1rem;
    cursor: pointer;
    text-decoration: none;
    display: inline-block;
    text-align: center;
  }
  .btn.primary {
    background: var(--accent, #4fc3f7);
    color: #000;
    font-weight: 600;
  }
  .btn.primary:disabled { opacity: 0.5; cursor: wait; }
  .error { color: #ff5252; font-size: 0.85rem; margin: 0; }
  .warning {
    background: #332200;
    border: 1px solid #e65100;
    border-radius: 6px;
    padding: 0.6rem 0.75rem;
    font-size: 0.85rem;
    color: #ffab40;
    margin-bottom: 1rem;
  }
  .success {
    background: #1b3a1b;
    border: 1px solid #2e7d32;
    border-radius: 8px;
    padding: 1.25rem;
    color: #a5d6a7;
  }
  .success h3 { margin: 0 0 0.5rem; color: #66bb6a; }
  .success .mono {
    font-family: monospace;
    background: #0a1a0a;
    padding: 0.3rem 0.6rem;
    border-radius: 4px;
    display: inline-block;
    margin: 0.25rem 0;
  }
  .note {
    font-size: 0.8rem;
    color: var(--text-muted, #666);
    margin-top: 1.25rem;
    line-height: 1.4;
  }
</style>
