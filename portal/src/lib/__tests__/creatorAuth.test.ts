import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const mockLocalStorage: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: vi.fn((key: string) => mockLocalStorage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { mockLocalStorage[key] = value; }),
  removeItem: vi.fn((key: string) => { delete mockLocalStorage[key]; })
});

import {
  creatorToken,
  creatorProfile,
  isCreatorLoggedIn,
  setCreatorSession,
  clearCreatorSession
} from '../creatorAuth';

import type { CreatorAccount } from '../api';

const testCreator: CreatorAccount = {
  id: 'c1',
  name: 'Test Creator',
  email: 'test@example.com',
  role: 'creator',
  approved: true,
  createdAt: '2025-01-01T00:00:00Z',
  lessonsAuthored: ['lesson-1']
};

describe('creatorAuth', () => {
  beforeEach(() => {
    clearCreatorSession();
    Object.keys(mockLocalStorage).forEach(k => delete mockLocalStorage[k]);
  });

  it('starts with no profile', () => {
    expect(get(creatorProfile)).toBeNull();
    expect(get(isCreatorLoggedIn)).toBe(false);
  });

  it('setCreatorSession updates stores', () => {
    setCreatorSession('tok123', testCreator);
    expect(get(creatorToken)).toBe('tok123');
    expect(get(creatorProfile)).toEqual(testCreator);
    expect(get(isCreatorLoggedIn)).toBe(true);
  });

  it('setCreatorSession persists token to localStorage', () => {
    setCreatorSession('tok456', testCreator);
    expect(localStorage.setItem).toHaveBeenCalledWith('agni_creator_token', 'tok456');
  });

  it('clearCreatorSession resets stores', () => {
    setCreatorSession('tok', testCreator);
    clearCreatorSession();
    expect(get(creatorToken)).toBe('');
    expect(get(creatorProfile)).toBeNull();
    expect(get(isCreatorLoggedIn)).toBe(false);
  });

  it('clearCreatorSession removes token from localStorage', () => {
    setCreatorSession('tok', testCreator);
    clearCreatorSession();
    expect(localStorage.removeItem).toHaveBeenCalledWith('agni_creator_token');
  });
});
