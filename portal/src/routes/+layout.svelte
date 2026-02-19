<!-- portal/src/routes/+layout.svelte -->
<script>
  import '../app.css';
</script>

<main>
  <slot />
</main>

<style>
  main {
    max-width: 1200px;
    margin: 0 auto;
    padding: 1rem;
  }
</style>
