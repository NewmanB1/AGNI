/**
 * Shared markdown-like renderer for lesson content preview.
 * Handles bold, italic, code, inline math, block math, and basic sanitization.
 * Used by StepEditor and PreviewPanel to ensure consistent rendering.
 */

const HTML_ENTITY_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, ch => HTML_ENTITY_MAP[ch]);
}

export function renderMarkdown(text) {
  if (!text) return '';
  let safe = escapeHtml(text);
  safe = safe
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\\\((.+?)\\\)/g, '<span class="math-inline">$1</span>')
    .replace(/\\\[(.+?)\\\]/gs, '<div class="math-block">$1</div>')
    .replace(/\n/g, '<br/>');
  return safe;
}
