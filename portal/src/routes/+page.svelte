
<div class="top-page">
  <h1>AGNI Portal</h1>
  <p class="tagline">Open Lesson Standard — offline, sensor-rich education</p>

  <div class="cards">
    <a href="/hub" class="card card-link">
      <h2>Teacher Hub</h2>
      <p>Class overview, heterogeneity, recommendations, and overrides.</p>
    </a>
    <a href="/groups" class="card card-link">
      <h2>Student Groups</h2>
      <p>Create groups and assign students from the roster for reading groups, lab pairs, etc.</p>
    </a>
    <a href="/author/new" class="card card-link">
      <h2>Lesson Author</h2>
      <p>Create or edit lessons: set metadata, UTU coordinates, steps, and save as YAML.</p>
    </a>
    <a href="/parent/dashboard" class="card card-link">
      <h2>Parent Dashboard</h2>
      <p>Link to your child with an invite code and view their learning progress.</p>
    </a>
    <a href="/governance/setup" class="card card-link">
      <h2>Governance</h2>
      <p>Policy, approved catalog, import and export.</p>
    </a>
    <a href="/admin/onboarding" class="card card-link">
      <h2>Admin</h2>
      <p>First-run onboarding or hub setup: paths, ports, config. Provision in one flow.</p>
    </a>
  </div>

  <p class="footer">Configure hub URL in <a href="/settings">Settings</a> to connect to a live hub.</p>
</div>

<style>
  .top-page {
    max-width: 700px;
    margin: 0 auto;
    padding: 2rem 0;
  }

  .top-page h1 {
    font-size: 2rem;
    margin-bottom: 0.5rem;
  }

  .tagline {
    opacity: 0.9;
    margin-bottom: 2.5rem;
  }

  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1.5rem;
  }

  .card-link {
    display: block;
    padding: 1.5rem;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 12px;
    text-decoration: none;
    color: inherit;
    transition: border-color 0.2s, transform 0.2s;
  }

  .card-link:hover {
    border-color: var(--accent);
    transform: translateY(-2px);
  }

  .card-link h2 {
    margin-bottom: 0.5rem;
    color: var(--accent);
  }

  .card-link p {
    opacity: 0.9;
    font-size: 0.95rem;
    line-height: 1.5;
  }

  .footer {
    margin-top: 2.5rem;
    font-size: 0.9rem;
    opacity: 0.7;
  }
</style>
