<!-- portal/src/routes/+layout.svelte -->
<script>
  import { page } from '$app/stores';
  import '../app.css';
  import HubSetupPrompt from '$lib/components/HubSetupPrompt.svelte';
  import { hubApiStore } from '$lib/api';
  import { t } from '$lib/i18n';
  import { getPseudoId } from '$lib/pseudoId';
  import { restoreCreatorSession } from '$lib/creatorAuth';
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
  let mobileMenuOpen = $state(false);

  async function checkReviews() {
    try {
      const pseudoId = getPseudoId();
      if (!pseudoId || !api.baseUrl) return;
      const reviews = await api.getReviews(pseudoId);
      reviewBadge = (reviews.due || []).length;

      if (reviewBadge > 0 && 'Notification' in window && Notification.permission === 'granted') {
        new Notification(tr('notification.reviews_title'), {
          body: tr('notification.reviews_body', { count: reviewBadge }),
          tag: 'agni-review-reminder'
        });
      }
    } catch { /* ignore */ }
  }

  onMount(() => {
    checkReviews();
    restoreCreatorSession();
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  });
</script>

<a href="#main-content" class="skip-link">Skip to content</a>

<header class="app-header" role="banner">
  <a href="/" class="logo">AGNI Portal</a>
  <button
    class="mobile-menu-toggle"
    aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
    aria-expanded={mobileMenuOpen}
    onclick={() => mobileMenuOpen = !mobileMenuOpen}
  >
    <span class="hamburger" class:open={mobileMenuOpen}></span>
  </button>
  <nav aria-label="Main navigation" class:mobile-open={mobileMenuOpen}>
    <a href="/" onclick={() => mobileMenuOpen = false}>Home</a>
    <a href="/learn" class:active={isLearn} onclick={() => mobileMenuOpen = false}>
      {tr('nav.learn')}
      {#if reviewBadge > 0}<span class="review-badge" aria-label="{reviewBadge} reviews due">{reviewBadge}</span>{/if}
    </a>
    <a href="/hub" class:active={isHub} onclick={() => mobileMenuOpen = false}>{tr('nav.hub')}</a>
    <a href="/groups" class:active={isGroups} onclick={() => mobileMenuOpen = false}>{tr('nav.groups')}</a>
    <a href="/students" class:active={isStudents} onclick={() => mobileMenuOpen = false}>{tr('nav.students')}</a>
    <a href="/author/login" class:active={isAuthor} onclick={() => mobileMenuOpen = false}>{tr('nav.author')}</a>
    <a href="/parent/dashboard" class:active={isParent} onclick={() => mobileMenuOpen = false}>{tr('nav.parent')}</a>
    <a href="/governance/setup" class:active={isGovernance} onclick={() => mobileMenuOpen = false}>{tr('nav.governance')}</a>
    <a href="/admin/hub" class:active={isAdmin} onclick={() => mobileMenuOpen = false}>{tr('nav.admin')}</a>
    <a href="/settings" class:active={isSettings} onclick={() => mobileMenuOpen = false}>{tr('nav.settings')}</a>
  </nav>
</header>

<HubSetupPrompt />

<main id="main-content">
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
    flex-wrap: wrap;
  }

  .logo {
    font-weight: bold;
    color: var(--accent);
    text-decoration: none;
  }

  .mobile-menu-toggle {
    display: none;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.5rem;
  }

  .hamburger {
    display: block;
    width: 24px;
    height: 2px;
    background: var(--text);
    position: relative;
    transition: background 0.2s;
  }
  .hamburger::before, .hamburger::after {
    content: '';
    position: absolute;
    width: 24px;
    height: 2px;
    background: var(--text);
    left: 0;
    transition: transform 0.2s;
  }
  .hamburger::before { top: -7px; }
  .hamburger::after { top: 7px; }
  .hamburger.open { background: transparent; }
  .hamburger.open::before { transform: rotate(45deg); top: 0; }
  .hamburger.open::after { transform: rotate(-45deg); top: 0; }

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
    background: var(--danger); color: #fff; border-radius: 9px;
    font-size: 0.7rem; font-weight: bold; margin-left: 3px;
    vertical-align: super;
  }

  @media (max-width: 768px) {
    .mobile-menu-toggle { display: block; }

    .app-header nav {
      display: none;
      width: 100%;
      flex-direction: column;
      gap: 0;
      padding-top: 0.5rem;
    }

    .app-header nav.mobile-open { display: flex; }

    .app-header nav a {
      padding: 0.6rem 0.5rem;
      border-top: 1px solid var(--border);
    }
  }
</style>
