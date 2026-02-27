const STORAGE_KEY = 'agni_pseudo_id';

/** Read-only: returns existing pseudoId or empty string. */
export function getPseudoId(): string {
  if (typeof localStorage === 'undefined') return '';
  return localStorage.getItem(STORAGE_KEY) || '';
}

/** Returns existing pseudoId, or generates & persists a new one. */
export function getOrCreatePseudoId(): string {
  if (typeof localStorage === 'undefined') return '';
  let id = localStorage.getItem(STORAGE_KEY);
  if (id) return id;
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  id = 'px-' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  localStorage.setItem(STORAGE_KEY, id);
  return id;
}
