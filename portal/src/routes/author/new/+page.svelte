<script>
  import LessonEditorCore from '$lib/components/LessonEditorCore.svelte';
</script>

<svelte:head>
  <title>New Lesson | AGNI Portal</title>
</svelte:head>

<nav class="breadcrumb">
  <a href="/">Home</a> → New Lesson
</nav>

<h1>New Lesson</h1>
<p class="subtitle">Define metadata, add steps, then validate and save.</p>

<LessonEditorCore mode="new" />

<style>
  .breadcrumb { margin-bottom: 1rem; font-size: 0.9rem; opacity: 0.9; }
  .breadcrumb a { color: var(--accent); }
  .subtitle { opacity: 0.9; margin-bottom: 1.5rem; }
</style>
