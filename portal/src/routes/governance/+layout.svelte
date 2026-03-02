<script>
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { isCreatorLoggedIn, creatorLoading } from '$lib/creatorAuth';
  import { onMount } from 'svelte';

  const loggedIn = $derived($isCreatorLoggedIn);
  const loading = $derived($creatorLoading);

  onMount(() => {
    const unsub = isCreatorLoggedIn.subscribe((val) => {
      if (!val && !$creatorLoading) {
        goto('/author/login?redirect=' + encodeURIComponent($page.url.pathname));
      }
    });
    return unsub;
  });

  const isSetup = $derived($page.url.pathname.includes('/governance/setup'));
  const isCatalog = $derived($page.url.pathname.includes('/governance/catalog') && !$page.url.pathname.endsWith('/import'));
  const isImport = $derived($page.url.pathname.endsWith('/import'));
  const isReport = $derived($page.url.pathname.includes('/governance/report'));
</script>

{#if loading}
  <p>Checking authentication...</p>
{:else if !loggedIn}
  <p>Redirecting to login...</p>
{:else}
<div class="governance-layout">
  <nav class="gov-nav">
    <a href="/" class="back">← Back</a>
    <div class="tabs">
      <a href="/governance/setup" class:active={isSetup}>Policy</a>
      <a href="/governance/catalog" class:active={isCatalog}>Catalog</a>
      <a href="/governance/catalog/import" class:active={isImport}>Import</a>
      <a href="/governance/report" class:active={isReport}>Report</a>
    </div>
  </nav>
  <slot />
</div>
{/if}

<style>
  .governance-layout {
    max-width: 800px;
    margin: 0 auto;
  }

  .gov-nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 2rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--border);
  }

  .back {
    color: var(--accent);
    text-decoration: none;
    font-size: 0.95rem;
  }
  .back:hover { text-decoration: underline; }

  .tabs {
    display: flex;
    gap: 0.5rem;
  }

  .tabs a {
    padding: 0.5rem 1rem;
    color: var(--text);
    text-decoration: none;
    border-radius: 6px;
    font-size: 0.9rem;
  }
  .tabs a:hover { background: var(--border); }
  .tabs a.active {
    background: var(--accent);
    color: #1a1a2e;
    font-weight: bold;
  }

  /* Shared governance child styles */
  .governance-layout :global(.subtitle) { opacity: 0.9; margin-bottom: 1.5rem; }
  .governance-layout :global(.hint) { font-size: 0.9rem; opacity: 0.8; margin-bottom: 0.5rem; }
  .governance-layout :global(.error-banner) {
    background: rgba(255,82,82,0.15); color: #ff5252;
    padding: 0.75rem; border-radius: 6px; margin-bottom: 1rem;
  }
  .governance-layout :global(.success-banner) {
    background: rgba(0,230,118,0.15); color: var(--accent);
    padding: 0.75rem; border-radius: 6px; margin-bottom: 1rem;
  }
  .governance-layout :global(.warning-box) { border-color: #ffaa00; }
  .governance-layout :global(.btn-primary) {
    padding: 0.6rem 1.2rem; background: var(--accent); color: #1a1a2e;
    border: none; border-radius: 6px; font-weight: bold; cursor: pointer;
  }
  .governance-layout :global(.btn-primary:disabled) { opacity: 0.5; cursor: not-allowed; }
  .governance-layout :global(.btn-secondary) {
    padding: 0.5rem 1rem; background: var(--border); color: var(--text);
    border: none; border-radius: 6px; cursor: pointer;
  }
  .governance-layout :global(.btn-small) {
    padding: 0.3rem 0.6rem; font-size: 0.85rem; border: none;
    border-radius: 5px; cursor: pointer;
  }
  .governance-layout :global(.gov-form-row) {
    display: flex; gap: 0.75rem; align-items: center; margin-bottom: 0.5rem;
  }
  .governance-layout :global(.gov-form-row input),
  .governance-layout :global(.gov-form-row select) {
    padding: 0.5rem; background: #1f2b4e; color: var(--text);
    border: 1px solid var(--border); border-radius: 6px;
  }
  .governance-layout :global(.checkbox-grid) {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 0.5rem;
  }
  .governance-layout :global(.checkbox-label) {
    display: flex; align-items: center; gap: 0.5rem; font-weight: normal; cursor: pointer;
  }
</style>
