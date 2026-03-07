export function render(main) {
  main.innerHTML = `
    <div class="top-page">
      <h1>AGNI Portal</h1>
      <p class="tagline">Open Lesson Standard — offline, sensor-rich education</p>

      <div class="cards">
        <a href="#/hub" class="card card-link">
          <h2>Teacher Hub</h2>
          <p>Class overview, heterogeneity, recommendations, and overrides.</p>
        </a>
        <a href="#/groups" class="card card-link">
          <h2>Student Groups</h2>
          <p>Create groups and assign students from the roster.</p>
        </a>
        <a href="#/author/new" class="card card-link">
          <h2>Lesson Author</h2>
          <p>Create or edit lessons: set metadata, steps, and save as YAML.</p>
        </a>
        <a href="#/parent/dashboard" class="card card-link">
          <h2>Parent Dashboard</h2>
          <p>Link to your child with an invite code and view their progress.</p>
        </a>
        <a href="#/governance/setup" class="card card-link">
          <h2>Governance</h2>
          <p>Policy, approved catalog, import and export.</p>
        </a>
        <a href="#/admin/onboarding" class="card card-link">
          <h2>Admin</h2>
          <p>First-run onboarding or hub setup.</p>
        </a>
      </div>

      <p class="footer">Configure hub URL in <a href="#/settings">Settings</a> to connect to a live hub.</p>
    </div>
  `;
}
