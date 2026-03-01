// src/engine/thompson.d.ts — type declarations for thompson.js (Backlog task 14)

import type { LMSState } from '../types';

export function ensureBanditInitialized(state: LMSState): void;
export function selectLesson(
  state: LMSState,
  studentId: string
): string | null;
export function updateBandit(
  state: LMSState,
  studentId: string,
  lessonId: string,
  gain: number
): void;
