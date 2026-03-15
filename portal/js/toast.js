/**
 * Lightweight toast / status feedback (no deps)
 */
let _toastTimer = null;

export function showToast(message, type) {
  type = type || 'info';
  let el = document.getElementById('agni-portal-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'agni-portal-toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.className = 'portal-toast portal-toast-' + type;
  el.textContent = message;
  el.style.display = 'block';
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function () {
    el.style.display = 'none';
  }, type === 'error' ? 8000 : 4500);
}
