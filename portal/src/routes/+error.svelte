<script>
  import { page } from '$app/stores';
</script>

<div class="error-page">
  <div class="card error-card">
    <h1>Something went wrong</h1>
    <p class="error-status">Error {$page.status}</p>
    <p class="error-message">{$page.error?.message || 'An unexpected error occurred.'}</p>
    <div class="error-actions">
      <a href="/" class="btn btn-primary">Go Home</a>
      <button class="btn btn-secondary" onclick={() => window.location.reload()}>
        Reload Page
      </button>
    </div>
  </div>
</div>

<style>
  .error-page {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    padding: 2rem;
  }
  .error-card {
    max-width: 500px;
    text-align: center;
  }
  .error-status {
    font-size: 1.5rem;
    color: var(--danger);
    margin: 0.5rem 0;
  }
  .error-message {
    margin: 1rem 0 1.5rem;
    color: var(--muted, #999);
  }
  .error-actions {
    display: flex;
    gap: 1rem;
    justify-content: center;
    flex-wrap: wrap;
  }
</style>
