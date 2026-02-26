<script>
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  onMount(() => {
    goto('/governance/setup', { replaceState: true });
  });
</script>

<p>Redirecting to Policy setup…</p>
