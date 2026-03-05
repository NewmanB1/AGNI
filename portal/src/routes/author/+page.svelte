<script>
  import { hubApiStore } from '$lib/api';
  import { creatorProfile, restoreCreatorSession } from '$lib/creatorAuth';
  import { onMount } from 'svelte';

  const api = $derived($hubApiStore);
  const profile = $derived($creatorProfile);
  let checked = $state(false);
  let savedSlugs = $state([]);

  onMount(async () => {
    await restoreCreatorSession();
    checked = true;
    if (api.baseUrl) {
      try {
        const res = await api.getLessons?.();
        savedSlugs = res?.savedSlugs || [];
      } catch { /* ignore */ }
    }
  });
</script>

<svelte:head>
  <title>Lesson Creator | AGNI Portal</title>
</svelte:head>

<nav class="breadcrumb">
  <a href="/">Home</a> → Lesson Creator
</nav>

<h1>Lesson Creator</h1>
<p class="tagline">Create and edit interactive OLS lessons. Choose your path:</p>

<div class="creator-cards">
  <a href="/author/new" class="card primary">
    <span class="icon">✨</span>
    <h2>Create Lesson</h2>
    <p>Start a new lesson in the portal — metadata, steps, templates, AI draft.</p>
  </a>

  {#if savedSlugs.length > 0}
    <div class="card section">
      <h2>Edit Existing</h2>
      <div class="slug-list">
        {#each savedSlugs as s}
          <a href="/author/{encodeURIComponent(s)}/edit" class="slug-link">{s}</a>
        {/each}
      </div>
    </div>
  {:else if profile}
    <div class="card section">
      <h2>Edit Existing</h2>
      <p class="muted">No saved lessons yet. Create one first.</p>
    </div>
  {/if}

  <div class="card section">
    <h2>Learn How</h2>
    <ul class="learn-links">
      <li><a href="https://github.com/NewmanB1/AGNI/blob/main/docs/guides/LESSON-CREATORS.md" target="_blank" rel="noopener">📘 Lesson Creators Guide</a></li>
      <li><a href="https://github.com/NewmanB1/AGNI/blob/main/docs/tutorials/fork-and-translate-lesson.md" target="_blank" rel="noopener">🌐 Fork & Translate</a></li>
      <li><a href="https://github.com/NewmanB1/AGNI/blob/main/docs/specs/threshold_grammar.md" target="_blank" rel="noopener">📏 Threshold Grammar</a></li>
    </ul>
  </div>

  <div class="card section">
    <h2>CLI & VS Code</h2>
    <p>Edit YAML in your editor with schema validation:</p>
    <code class="cli-hint">cp lessons/hello-world.yaml lessons/my-lesson.yaml</code>
    <p class="small">Install Red Hat YAML extension for autocomplete. Run <code>npm run validate</code>.</p>
  </div>
</div>

{#if !profile}
  <div class="login-cta">
    <a href="/author/login" class="btn primary">Log In or Register as Creator</a>
  </div>
{/if}

<style>
  .breadcrumb { margin-bottom: 1rem; font-size: 0.9rem; opacity: 0.9; }
  .breadcrumb a { color: var(--accent); }
  .tagline { opacity: 0.85; margin-bottom: 1.5rem; }

  .creator-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1.25rem;
  }

  .card {
    padding: 1.25rem;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 10px;
    text-decoration: none;
    color: inherit;
    transition: border-color 0.2s;
  }

  .card:hover { border-color: var(--accent); }

  .card.primary {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .card.primary .icon { font-size: 2rem; }

  .card.primary h2 { color: var(--accent); margin: 0; }

  .card.section h2 { font-size: 1rem; margin: 0 0 0.5rem; color: var(--text); }

  .slug-list { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.5rem; }

  .slug-link {
    display: inline-block;
    padding: 0.3rem 0.6rem;
    background: rgba(31,43,78,0.7);
    border: 1px solid var(--border);
    border-radius: 5px;
    font-size: 0.85rem;
    font-family: monospace;
    text-decoration: none;
    color: var(--text);
  }

  .slug-link:hover { border-color: var(--accent); color: var(--accent); }

  .learn-links { margin: 0; padding-left: 1.25rem; }
  .learn-links li { margin-bottom: 0.35rem; }
  .learn-links a { color: var(--accent); }

  .cli-hint {
    display: block;
    margin: 0.5rem 0;
    padding: 0.5rem;
    background: rgba(0,0,0,0.2);
    border-radius: 5px;
    font-size: 0.82rem;
  }

  .small { font-size: 0.82rem; opacity: 0.7; margin-top: 0.35rem; }
  .muted { opacity: 0.6; font-size: 0.9rem; margin: 0; }

  .login-cta { margin-top: 2rem; text-align: center; }
  .btn.primary {
    display: inline-block;
    padding: 0.65rem 1.5rem;
    background: var(--accent);
    color: #1a1a2e;
    font-weight: 600;
    border-radius: 6px;
    text-decoration: none;
  }
</style>
