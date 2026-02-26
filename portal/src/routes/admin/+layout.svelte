<script>
  import { page } from '$app/stores';

  const isHub = $derived($page.url.pathname === '/admin/hub');
  const isOnboarding = $derived($page.url.pathname === '/admin/onboarding');
  const isDeploy = $derived($page.url.pathname === '/admin/deploy');
  const isSync = $derived($page.url.pathname === '/admin/sync');
</script>

<div class="admin-layout">
  <aside class="admin-nav">
    <a href="/admin/onboarding" class:active={isOnboarding}>First-run</a>
    <a href="/admin/hub" class:active={isHub}>Hub Setup</a>
    <a href="/admin/deploy" class:active={isDeploy}>Deploy</a>
    <a href="/admin/sync" class:active={isSync}>Sync</a>
  </aside>
  <div class="admin-content">
    <slot />
  </div>
</div>

<style>
  .admin-layout {
    display: flex;
    gap: 2rem;
  }

  .admin-nav {
    flex: 0 0 180px;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .admin-nav a {
    color: var(--text);
    text-decoration: none;
    padding: 0.5rem;
    border-radius: 6px;
  }

  .admin-nav a:hover {
    background: var(--card);
  }

  .admin-nav a.active {
    background: var(--border);
    color: var(--accent);
  }

  .admin-content {
    flex: 1;
  }
</style>
