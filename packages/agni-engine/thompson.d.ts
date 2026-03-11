// packages/agni-engine/thompson.d.ts — type declarations for thompson.js

import type { LMSState } from '@agni/types';

export function assertEmbeddingDimValid(state: LMSState): void;
export function banditFeature(studentVec: number[], lessonVec: number[]): number[];
export function ensureBanditInitialized(state: LMSState): void;
export function sampleTheta(state: LMSState): number[];
export function selectLesson(
  state: LMSState,
  studentId: string,
  opts?: { readOnly?: boolean; eligibleLessonIds?: string[] }
): string | null;
export function updateBandit(
  state: LMSState,
  studentId: string,
  lessonId: string,
  gain: number
): void;
