/**
 * Stub pages — clear placeholder + next steps (UX)
 */
import { t } from '../i18n.js';

export function renderStub(main, title, description = '', opts = {}) {
  opts = opts || {};
  const cta = opts.ctaHref && opts.ctaLabel
    ? `<p style="margin-top:1rem;"><a href="${escapeAttr(opts.ctaHref)}" class="btn btn-primary">${escapeHtml(opts.ctaLabel)}</a></p>`
    : '';
  const secondary = opts.secondaryHref && opts.secondaryLabel
    ? `<p style="margin-top:0.75rem;"><a href="${escapeAttr(opts.secondaryHref)}">${escapeHtml(opts.secondaryLabel)}</a></p>`
    : '';
  main.innerHTML = `
    <div class="top-page">
      <div class="card" style="border-style: dashed;">
        <p class="hint" style="margin-bottom:0.5rem;text-transform:uppercase;letter-spacing:0.05em;font-size:0.75rem;">${escapeHtml(t('stub_coming_soon'))}</p>
        <h1>${escapeHtml(title)}</h1>
        ${description ? `<p style="margin-top:0.75rem;opacity:0.95;">${escapeHtml(description)}</p>` : ''}
        ${opts.detail ? `<p class="hint" style="margin-top:1rem;">${escapeHtml(opts.detail)}</p>` : ''}
        ${cta}
        ${secondary}
      </div>
      <p style="margin-top: 1rem;"><a href="#/">${escapeHtml(t('common_back_home'))}</a></p>
    </div>
  `;
}

function escapeHtml(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}
