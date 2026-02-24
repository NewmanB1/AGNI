// src/engine/federation.d.ts — type declarations for federation.js (Backlog task 14)

import type { LMSState, BanditSummary } from '../types';

export function getBanditSummary(state: LMSState): BanditSummary;
export function mergeBanditSummaries(
  local: BanditSummary,
  remote: BanditSummary
): BanditSummary;
