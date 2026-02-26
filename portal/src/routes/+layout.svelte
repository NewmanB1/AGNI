<!-- portal/src/routes/+layout.svelte -->
<script>
  import { page } from '$app/stores';
  import '../app.css';

  $: isGovernance = $page.url.pathname.startsWith('/governance');
  $: isHub = $page.url.pathname.startsWith('/hub');
</script>

<header class="app-header">
  <a href="/" class="logo">AGNI Portal</a>
  <nav>
    <a href="/">Home</a>
    <a href="/hub" class:active={isHub}>Hub</a>
    <a href="/governance/setup" class:active={isGovernance}>Governance</a>
  </nav>
</header>

<main>
  <slot />
</main>

<style>
  .app-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 1rem;
    margin-bottom: 1rem;
    border-bottom: 1px solid var(--border);
  }

  .logo {
    font-weight: bold;
    color: var(--accent);
    text-decoration: none;
  }

  .app-header nav {
    display: flex;
    gap: 1rem;
  }

  .app-header nav a {
    color: var(--text);
    text-decoration: none;
    padding: 0.25rem 0.5rem;
  }

  .app-header nav a:hover {
    color: var(--accent);
  }

  .app-header nav a.active {
    color: var(--accent);
    font-weight: bold;
  }

  main {
    max-width: 1200px;
    margin: 0 auto;
    padding: 1rem;
  }
</style>

