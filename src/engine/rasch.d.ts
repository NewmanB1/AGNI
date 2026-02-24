// src/engine/rasch.d.ts — type declarations for rasch.js (Backlog task 14)

import type { LMSState } from '../types';

export function updateAbility(
  state: LMSState,
  studentId: string,
  probeResults: Array<{ probeId: string; correct: boolean }>
): void;
