/**
 * Creator authentication state for the AGNI portal.
 * Stores the session token in localStorage and provides reactive state.
 */
import { writable, derived, get } from 'svelte/store';
import { hubApiStore, type CreatorAccount } from '$lib/api';

const TOKEN_KEY = 'agni_creator_token';

function getStoredToken(): string {
  if (typeof localStorage === 'undefined') return '';
  return localStorage.getItem(TOKEN_KEY) || '';
}

export const creatorToken = writable(getStoredToken());
export const creatorProfile = writable<CreatorAccount | null>(null);
export const creatorLoading = writable(false);

export const isCreatorLoggedIn = derived(creatorProfile, (p) => p !== null);

export function setCreatorSession(token: string, creator: CreatorAccount): void {
  if (typeof localStorage !== 'undefined') localStorage.setItem(TOKEN_KEY, token);
  creatorToken.set(token);
  creatorProfile.set(creator);
}

export function clearCreatorSession(): void {
  if (typeof localStorage !== 'undefined') localStorage.removeItem(TOKEN_KEY);
  creatorToken.set('');
  creatorProfile.set(null);
}

/** Attempt to restore session from stored token. Call on app mount. */
export async function restoreCreatorSession(): Promise<void> {
  const token = getStoredToken();
  if (!token) return;
  creatorLoading.set(true);
  try {
    const api = get(hubApiStore);
    const { creator } = await api.getCreatorSession();
    creatorProfile.set(creator);
  } catch {
    clearCreatorSession();
  } finally {
    creatorLoading.set(false);
  }
}
