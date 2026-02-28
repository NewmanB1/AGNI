<!-- Creator login / registration page -->
<script>
  import { hubApiStore } from '$lib/api';
  import { setCreatorSession, creatorProfile, clearCreatorSession } from '$lib/creatorAuth';
  import { goto } from '$app/navigation';

  const api = $derived($hubApiStore);
  const profile = $derived($creatorProfile);

  let mode = $state('login'); // 'login' | 'register'
  let email = $state('');
  let password = $state('');
  let name = $state('');
  let confirmPassword = $state('');
  let error = $state('');
  let loading = $state(false);
  let registered = $state(false);

  async function handleLogin() {
    error = '';
    if (!email.trim() || !password) { error = 'Email and password are required'; return; }
    loading = true;
    try {
      const result = await api.loginCreator({ email: email.trim(), password });
      setCreatorSession(result.token, result.creator);
      goto('/author/new');
    } catch (e) {
      error = e instanceof Error ? e.message : 'Login failed';
    } finally {
      loading = false;
    }
  }

  async function handleRegister() {
    error = '';
    if (!name.trim()) { error = 'Name is required'; return; }
    if (!email.trim()) { error = 'Email is required'; return; }
    if (password.length < 6) { error = 'Password must be at least 6 characters'; return; }
    if (password !== confirmPassword) { error = 'Passwords do not match'; return; }
    loading = true;
    try {
      await api.registerCreator({ name: name.trim(), email: email.trim(), password });
      registered = true;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Registration failed';
    } finally {
      loading = false;
    }
  }

  function handleLogout() {
    api.logoutCreator().catch(() => {});
    clearCreatorSession();
  }
</script>

<div class="auth-page">
  {#if profile}
    <div class="profile-card">
      <h2>Welcome, {profile.name}</h2>
      <p class="email">{profile.email}</p>
      <p class="status">
        {#if profile.approved}
          <span class="badge approved">Approved Creator</span>
        {:else}
          <span class="badge pending">Pending Approval</span>
        {/if}
      </p>
      {#if profile.lessonsAuthored?.length}
        <p class="stat">{profile.lessonsAuthored.length} lesson{profile.lessonsAuthored.length !== 1 ? 's' : ''} authored</p>
      {/if}
      <div class="actions">
        <a href="/author/new" class="btn primary">Create Lesson</a>
        <button class="btn secondary" onclick={handleLogout}>Log Out</button>
      </div>
    </div>
  {:else if registered}
    <div class="success-card">
      <h2>Registration Complete</h2>
      <p>Your account has been created. A hub administrator must approve your account before you can author lessons.</p>
      <p>You can log in now, but lesson saving will be restricted until approval.</p>
      <button class="btn primary" onclick={() => { registered = false; mode = 'login'; }}>Go to Login</button>
    </div>
  {:else}
    <div class="auth-card">
      <div class="tabs">
        <button class:active={mode === 'login'} onclick={() => { mode = 'login'; error = ''; }}>Log In</button>
        <button class:active={mode === 'register'} onclick={() => { mode = 'register'; error = ''; }}>Register</button>
      </div>

      {#if mode === 'login'}
        <form onsubmit={(e) => { e.preventDefault(); handleLogin(); }}>
          <label>
            <span>Email</span>
            <input type="email" bind:value={email} placeholder="you@example.com" required />
          </label>
          <label>
            <span>Password</span>
            <input type="password" bind:value={password} placeholder="Your password" required />
          </label>
          {#if error}<p class="error">{error}</p>{/if}
          <button type="submit" class="btn primary" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      {:else}
        <form onsubmit={(e) => { e.preventDefault(); handleRegister(); }}>
          <label>
            <span>Full Name</span>
            <input type="text" bind:value={name} placeholder="Your full name" required />
          </label>
          <label>
            <span>Email</span>
            <input type="email" bind:value={email} placeholder="you@example.com" required />
          </label>
          <label>
            <span>Password</span>
            <input type="password" bind:value={password} placeholder="At least 6 characters" required />
          </label>
          <label>
            <span>Confirm Password</span>
            <input type="password" bind:value={confirmPassword} placeholder="Repeat password" required />
          </label>
          {#if error}<p class="error">{error}</p>{/if}
          <button type="submit" class="btn primary" disabled={loading}>
            {loading ? 'Registering...' : 'Create Account'}
          </button>
        </form>
        <p class="note">Your identity is recorded to ensure lesson quality and accountability. An administrator must approve your account.</p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .auth-page {
    display: flex;
    justify-content: center;
    padding: 2rem 1rem;
  }
  .auth-card, .profile-card, .success-card {
    width: 100%;
    max-width: 420px;
    background: var(--surface, #1e1e1e);
    border: 1px solid var(--border, #333);
    border-radius: 12px;
    padding: 2rem;
  }
  .tabs {
    display: flex;
    gap: 0;
    margin-bottom: 1.5rem;
    border-bottom: 2px solid var(--border, #333);
  }
  .tabs button {
    flex: 1;
    padding: 0.75rem;
    background: none;
    border: none;
    color: var(--text-muted, #888);
    font-size: 1rem;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    margin-bottom: -2px;
    transition: color 0.15s, border-color 0.15s;
  }
  .tabs button.active {
    color: var(--accent, #4fc3f7);
    border-bottom-color: var(--accent, #4fc3f7);
    font-weight: 600;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  label span {
    font-size: 0.85rem;
    color: var(--text-muted, #aaa);
  }
  input {
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--border, #444);
    border-radius: 6px;
    background: var(--bg, #121212);
    color: var(--text, #eee);
    font-size: 0.95rem;
  }
  input:focus {
    outline: none;
    border-color: var(--accent, #4fc3f7);
  }
  .btn {
    padding: 0.65rem 1.25rem;
    border: none;
    border-radius: 6px;
    font-size: 0.95rem;
    cursor: pointer;
    text-decoration: none;
    display: inline-block;
    text-align: center;
  }
  .btn.primary {
    background: var(--accent, #4fc3f7);
    color: #000;
    font-weight: 600;
  }
  .btn.primary:disabled {
    opacity: 0.5;
    cursor: wait;
  }
  .btn.secondary {
    background: var(--surface, #2a2a2a);
    color: var(--text, #eee);
    border: 1px solid var(--border, #444);
  }
  .error {
    color: #ff5252;
    font-size: 0.85rem;
    margin: 0;
  }
  .note {
    font-size: 0.8rem;
    color: var(--text-muted, #888);
    margin-top: 1rem;
    line-height: 1.4;
  }
  .profile-card h2 {
    margin: 0 0 0.25rem;
  }
  .email {
    color: var(--text-muted, #aaa);
    margin: 0 0 0.75rem;
  }
  .badge {
    display: inline-block;
    padding: 0.2rem 0.6rem;
    border-radius: 4px;
    font-size: 0.8rem;
    font-weight: 600;
  }
  .badge.approved { background: #2e7d32; color: #fff; }
  .badge.pending { background: #e65100; color: #fff; }
  .stat {
    color: var(--text-muted, #aaa);
    font-size: 0.85rem;
    margin: 0.5rem 0;
  }
  .actions {
    display: flex;
    gap: 0.75rem;
    margin-top: 1.25rem;
  }
  .success-card h2 { margin: 0 0 0.75rem; color: #66bb6a; }
  .success-card p { line-height: 1.5; color: var(--text-muted, #bbb); }
</style>
