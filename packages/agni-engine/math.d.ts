// packages/agni-engine/math.d.ts — type declarations for math.js

export const CHOLESKY_EPSILON: number;
export function zeros(n: number): number[];
export function isNonNegativeInteger(x: unknown): boolean;
export function isPositiveInteger(x: unknown): boolean;
export function assertEmbeddingDim(x: number, prefix?: string): void;
export const CHOLESKY_SYMMETRY_TOL: number;
export function dot(a: number[], b: number[]): number;
export function addVec(a: number[], b: number[]): number[];
export function scaleVec(v: number[], s: number): number[];
export function outer(a: number[], b: number[]): number[][];
export function addMat(A: number[][], B: number[][]): number[][];
export function scaleMat(A: number[][], s: number): number[][];
export function matVec(A: number[][], x: number[]): number[];
export function identity(n: number): number[][];
export function cholesky(A: number[][]): number[][];
export function forwardSub(L: number[][], b: number[]): number[];
export function backSub(L: number[][], y: number[]): number[];
export function invertSPD(A: number[][]): number[][];
export function randn(): number;
export function symmetrize(A: number[][]): number[][];
