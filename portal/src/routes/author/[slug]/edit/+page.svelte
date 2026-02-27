<script>
  import { page } from '$app/stores';
  import LessonEditorCore from '$lib/components/LessonEditorCore.svelte';

  const slug = $derived($page.params.slug);
</script>

<svelte:head>
  <title>Edit {slug} | AGNI Portal</title>
</svelte:head>

<nav class="breadcrumb">
  <a href="/">Home</a> → <a href="/author/new">Author</a> → Edit: {slug}
</nav>

<h1>Edit Lesson: {slug}</h1>
<p class="subtitle">Edit metadata and steps, then save back as YAML.</p>

<LessonEditorCore mode="edit" {slug} />

<style>
  .breadcrumb { margin-bottom: 1rem; font-size: 0.9rem; opacity: 0.9; }
  .breadcrumb a { color: var(--accent); }
  .subtitle { opacity: 0.9; margin-bottom: 1.5rem; }
</style>
