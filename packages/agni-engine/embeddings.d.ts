// packages/agni-engine/embeddings.d.ts — type declarations for embeddings.js

import type { LMSState } from '@agni/types';

export function ensureStudentVector(state: LMSState, studentId: string): number[];
export function ensureLessonVector(state: LMSState, lessonId: string): number[];
export function updateEmbedding(
  state: LMSState,
  studentId: string,
  lessonId: string,
  gain: number
): void;
