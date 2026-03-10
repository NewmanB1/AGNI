// packages/agni-engine/rasch.d.ts — type declarations for rasch.js

import type { LMSState } from '@agni/types';

export function updateAbility(
  state: LMSState,
  studentId: string,
  probeResults: Array<{ probeId: string; correct: boolean }>
): number;
