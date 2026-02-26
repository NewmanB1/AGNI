<script>
  import { page } from '$app/stores';

  $: isSetup = $page.url.pathname.includes('/governance/setup');
  $: isCatalog = $page.url.pathname.includes('/governance/catalog') && !$page.url.pathname.endsWith('/import');
  $: isImport = $page.url.pathname.endsWith('/import');
</script>

<div class="governance-layout">
  <nav class="gov-nav">
    <a href="/" class="back">← Back</a>
    <div class="tabs">
      <a href="/governance/setup" class:active={isSetup}>Policy</a>
      <a href="/governance/catalog" class:active={isCatalog}>Catalog</a>
      <a href="/governance/catalog/import" class:active={isImport}>Import</a>
    </div>
  </nav>
  <slot />
</div>

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

  .back:hover {
    text-decoration: underline;
  }

  .tabs {
    display: flex;
    gap: 0.5rem;
  }

  .tabs a {
    padding: 0.5rem 1rem;
    color: var(--text);
    text-decoration: none;
    border-radius: 6px;
  }

  .tabs a:hover {
    background: var(--border);
  }

  .tabs a.active {
    background: var(--accent);
    color: #1a1a2e;
    font-weight: bold;
  }
</style>
