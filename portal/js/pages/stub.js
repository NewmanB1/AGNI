/**
 * Stub pages - show a simple placeholder for routes not yet implemented
 */
export function renderStub(main, title, description = '') {
  main.innerHTML = `
    <div class="top-page">
      <h1>${escapeHtml(title)}</h1>
      ${description ? `<p>${escapeHtml(description)}</p>` : ''}
      <p style="margin-top: 1rem;"><a href="#/">← Back to Home</a></p>
    </div>
  `;
}

function escapeHtml(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
