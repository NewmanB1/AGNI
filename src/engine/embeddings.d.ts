// src/engine/embeddings.d.ts — type declarations for embeddings.js (Backlog task 14)

import type { LMSState } from '../types';

export function ensureStudentVector(state: LMSState, studentId: string): void;
export function ensureLessonVector(state: LMSState, lessonId: string): void;
export function updateEmbedding(
  state: LMSState,
  studentId: string,
  lessonId: string,
  gain: number
): void;
