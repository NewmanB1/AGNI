/**
 * Creator auth - vanilla JS
 */
import { getHubUrl, createHubApi } from './api.js';

const TOKEN_KEY = 'agni_creator_token';

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setCreatorSession(token, creator) {
  localStorage.setItem(TOKEN_KEY, token);
  return { token, creator };
}

export function clearCreatorSession() {
  localStorage.removeItem(TOKEN_KEY);
  return null;
}

export function getCreatorProfile() {
  const t = getStoredToken();
  return t ? { hasToken: true } : { hasToken: false };
}

export async function restoreCreatorSession() {
  const token = getStoredToken();
  if (!token) return null;
  const baseUrl = getHubUrl();
  if (!baseUrl) return null;
  try {
    const api = createHubApi(baseUrl);
    const { creator } = await api.getCreatorSession();
    return creator;
  } catch {
    clearCreatorSession();
    return null;
  }
}
