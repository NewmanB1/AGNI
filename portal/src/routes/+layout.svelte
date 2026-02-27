<!-- portal/src/routes/+layout.svelte -->
<script>
  import { page } from '$app/stores';
  import '../app.css';
  import HubSetupPrompt from '$lib/components/HubSetupPrompt.svelte';
  import { hubApiStore } from '$lib/api';
  import { t } from '$lib/i18n';
  import { getPseudoId } from '$lib/pseudoId';
  import { onMount } from 'svelte';

  const tr = $derived($t);
  const api = $derived($hubApiStore);

  const isGovernance = $derived($page.url.pathname.startsWith('/governance'));
  const isHub = $derived($page.url.pathname.startsWith('/hub'));
  const isGroups = $derived($page.url.pathname === '/groups' || $page.url.pathname.startsWith('/groups/'));
  const isStudents = $derived($page.url.pathname.startsWith('/students'));
  const isLearn = $derived($page.url.pathname.startsWith('/learn'));
  const isAdmin = $derived($page.url.pathname.startsWith('/admin'));
  const isSettings = $derived($page.url.pathname === '/settings');
  const isAuthor = $derived($page.url.pathname.startsWith('/author'));
  const isParent = $derived($page.url.pathname.startsWith('/parent'));

  let reviewBadge = $state(0);

  async function checkReviews() {
    try {
      const pseudoId = getPseudoId();
      if (!pseudoId || !api.baseUrl) return;
      const reviews = await api.getReviews(pseudoId);
      reviewBadge = (reviews.due || []).length;

      if (reviewBadge > 0 && 'Notification' in window && Notification.permission === 'granted') {
        new Notification('AGNI: Reviews Due', {
          body: `You have ${reviewBadge} lesson review(s) due. Open the Learn tab to review.`,
          tag: 'agni-review-reminder'
        });
      }
    } catch { /* ignore */ }
  }

  onMount(() => {
    checkReviews();
    // Request notification permission proactively
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  });
</script>

<header class="app-header" role="banner">
  <a href="/" class="logo">AGNI Portal</a>
  <nav aria-label="Main navigation">
    <a href="/">Home</a>
    <a href="/learn" class:active={isLearn}>
      {tr('nav.learn')}
      {#if reviewBadge > 0}<span class="review-badge" aria-label="{reviewBadge} reviews due">{reviewBadge}</span>{/if}
    </a>
    <a href="/hub" class:active={isHub}>{tr('nav.hub')}</a>
    <a href="/groups" class:active={isGroups}>{tr('nav.groups')}</a>
    <a href="/students" class:active={isStudents}>{tr('nav.students')}</a>
    <a href="/author/new" class:active={isAuthor}>Author</a>
    <a href="/parent/dashboard" class:active={isParent}>Parent</a>
    <a href="/governance/setup" class:active={isGovernance}>{tr('nav.governance')}</a>
    <a href="/admin/hub" class:active={isAdmin}>Admin</a>
    <a href="/settings" class:active={isSettings}>{tr('nav.settings')}</a>
  </nav>
</header>

<HubSetupPrompt />

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
    flex-wrap: wrap;
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

  .review-badge {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 18px; height: 18px; padding: 0 4px;
    background: #ff5252; color: #fff; border-radius: 9px;
    font-size: 0.7rem; font-weight: bold; margin-left: 3px;
    vertical-align: super;
  }
</style>
