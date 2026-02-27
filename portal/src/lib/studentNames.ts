/**
 * localStorage-backed student nickname/alias map.
 * Teachers assign human-readable names to pseudoIds so they can
 * identify students without exposing real identities.
 */

const STORAGE_KEY = 'agni_student_names';

function loadNames(): Record<string, string> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveNames(names: Record<string, string>): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(names));
}

let _cache: Record<string, string> = loadNames();

/** Returns nickname if set, otherwise the raw pseudoId. */
export function getStudentName(pseudoId: string): string {
  return _cache[pseudoId] || pseudoId;
}

/** Sets or clears a student nickname. Empty string removes the alias. */
export function setStudentName(pseudoId: string, name: string): void {
  const trimmed = name.trim();
  if (trimmed) {
    _cache[pseudoId] = trimmed;
  } else {
    delete _cache[pseudoId];
  }
  saveNames(_cache);
}

/** Returns a snapshot of all stored nicknames. Refreshes from localStorage first. */
export function getAllStudentNames(): Record<string, string> {
  _cache = loadNames();
  return { ..._cache };
}

export function hasNickname(pseudoId: string): boolean {
  return pseudoId in _cache;
}
