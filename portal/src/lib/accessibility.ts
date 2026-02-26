/**
 * Student accessibility preferences.
 * Persisted to localStorage so the runtime player can read them
 * without importing Svelte (reads raw keys from localStorage).
 *
 * Keys in localStorage:
 *   agni_haptic_intensity  — "0" to "1" (float string), default "1"
 *   agni_reduced_motion    — "true" | "false", default "false"
 *   agni_high_contrast     — "true" | "false", default "false"
 *   agni_font_scale        — "0.8" to "1.5" (float string), default "1"
 */
import { writable } from 'svelte/store';

export interface AccessibilityPrefs {
  hapticIntensity: number;
  reducedMotion: boolean;
  highContrast: boolean;
  fontScale: number;
}

const DEFAULTS: AccessibilityPrefs = {
  hapticIntensity: 1,
  reducedMotion: false,
  highContrast: false,
  fontScale: 1,
};

function loadFromStorage(): AccessibilityPrefs {
  if (typeof localStorage === 'undefined') return { ...DEFAULTS };
  const hi = localStorage.getItem('agni_haptic_intensity');
  const rm = localStorage.getItem('agni_reduced_motion');
  const hc = localStorage.getItem('agni_high_contrast');
  const fs = localStorage.getItem('agni_font_scale');
  return {
    hapticIntensity: hi !== null ? Math.max(0, Math.min(1, parseFloat(hi))) : DEFAULTS.hapticIntensity,
    reducedMotion: rm === 'true',
    highContrast: hc === 'true',
    fontScale: fs !== null ? Math.max(0.8, Math.min(1.5, parseFloat(fs))) : DEFAULTS.fontScale,
  };
}

function saveToStorage(prefs: AccessibilityPrefs): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem('agni_haptic_intensity', String(prefs.hapticIntensity));
  localStorage.setItem('agni_reduced_motion', String(prefs.reducedMotion));
  localStorage.setItem('agni_high_contrast', String(prefs.highContrast));
  localStorage.setItem('agni_font_scale', String(prefs.fontScale));
}

export const a11yPrefs = writable<AccessibilityPrefs>(loadFromStorage());

export function updateA11yPrefs(partial: Partial<AccessibilityPrefs>): void {
  a11yPrefs.update(current => {
    const next = { ...current, ...partial };
    saveToStorage(next);
    return next;
  });
}

export function resetA11yPrefs(): void {
  saveToStorage(DEFAULTS);
  a11yPrefs.set({ ...DEFAULTS });
}
