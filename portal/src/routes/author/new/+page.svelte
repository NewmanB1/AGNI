<script>
  import LessonEditorCore from '$lib/components/LessonEditorCore.svelte';
  import { creatorProfile, restoreCreatorSession } from '$lib/creatorAuth';
  import { onMount } from 'svelte';

  const profile = $derived($creatorProfile);
  let checked = $state(false);

  onMount(async () => {
    await restoreCreatorSession();
    checked = true;
  });
</script>

<svelte:head>
  <title>New Lesson | AGNI Portal</title>
</svelte:head>

<nav class="breadcrumb">
  <a href="/">Home</a> → New Lesson
</nav>

{#if !checked}
  <p>Loading...</p>
{:else if !profile}
  <div class="login-prompt">
    <h2>Creator Login Required</h2>
    <p>You must be logged in as a lesson creator to author lessons. This ensures accountability for lesson content.</p>
    <a href="/author/login" class="btn primary">Log In or Register</a>
  </div>
{:else}
  {#if !profile.approved}
    <div class="approval-notice">
      Your account is pending admin approval. You can draft lessons, but saving will be limited until approved.
    </div>
  {/if}
  <h1>New Lesson</h1>
  <p class="subtitle">Define metadata, add steps, then validate and save. Authoring as <strong>{profile.name}</strong>.</p>
  <LessonEditorCore mode="new" creatorId={profile.id} creatorName={profile.name} />
{/if}

<style>
  .breadcrumb { margin-bottom: 1rem; font-size: 0.9rem; opacity: 0.9; }
  .breadcrumb a { color: var(--accent); }
  .subtitle { opacity: 0.9; margin-bottom: 1.5rem; }
  .login-prompt {
    text-align: center;
    padding: 3rem 1rem;
    background: var(--surface, #1e1e1e);
    border: 1px solid var(--border, #333);
    border-radius: 12px;
    max-width: 500px;
    margin: 2rem auto;
  }
  .login-prompt h2 { margin-bottom: 0.75rem; }
  .login-prompt p { color: var(--text-muted, #aaa); line-height: 1.5; margin-bottom: 1.5rem; }
  .btn.primary {
    display: inline-block;
    padding: 0.65rem 1.5rem;
    background: var(--accent, #4fc3f7);
    color: #000;
    font-weight: 600;
    border-radius: 6px;
    text-decoration: none;
  }
  .approval-notice {
    background: #332200;
    border: 1px solid #e65100;
    border-radius: 6px;
    padding: 0.6rem 0.75rem;
    font-size: 0.85rem;
    color: #ffab40;
    margin-bottom: 1rem;
  }
</style>
