// src/engine/federation.d.ts — type declarations for federation.js (Backlog task 14)

import type { LMSState, BanditSummary } from '../types';

export const MAX_SEEN_SYNC_IDS: number;
export function addSyncId(summary: BanditSummary, opts?: { hubId: string; exportSequence: number }): BanditSummary;
export function contentHash(summary: BanditSummary): string;
export function getBanditSummary(state: LMSState): BanditSummary;
export function mergeBanditSummaries(
  local: BanditSummary,
  remote: BanditSummary
): BanditSummary;
