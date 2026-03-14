/**
 * Central type definitions for AGNI / OLS.
 * Canonical types package — used by JSDoc and TS-aware tooling.
 * No runtime impact.
 *
 * Schema-driven types (generated from schemas/*.schema.json) are in ./generated/.
 * Regenerate with: npm run codegen:types
 */

// ──────────────────────────────────────────────────────────────────────────────
// Schema-generated types (do not edit generated/*.d.ts)
// ──────────────────────────────────────────────────────────────────────────────

export type { AGNIOpenLessonStandardV18 } from './generated/ols';
export type { AGNIGovernancePolicy } from './generated/governance-policy';
export type { OLSGraphWeightsDiscoveredCohortCognitionMap } from './generated/graph-weights';
export type { AGNIInferredFeatures, InferredFeatureFlags, VarkProfile } from './generated/inferred-features';
export type { AGNILessonSidecar } from './generated/lesson-sidecar';
export type {
  AGNILessonIR,
  LessonMeta,
  LessonSkillRef,
  LessonOntologyNormalized,
  GateLogic,
  LessonStep,
  LessonRequires,
  UTULabel,
} from './generated/lesson-ir';

/** Validated OLS lesson YAML (schema-validated input). Use for compiler input. */
export type OlsLessonInput = import('./generated/ols').AGNIOpenLessonStandardV18;

/** Graph weights (sentry/theta). Generated from schemas/graph-weights.schema.json */
export type GraphWeights = import('./generated/graph-weights').OLSGraphWeightsDiscoveredCohortCognitionMap;

/** Lesson IR. Generated from schemas/lesson-ir.schema.json */
export type LessonIR = import('./generated/lesson-ir').AGNILessonIR;

/** Lesson sidecar (index-ir.json). Generated from schemas/lesson-sidecar.schema.json */
export type LessonSidecar = import('./generated/lesson-sidecar').AGNILessonSidecar;

/** Inferred pedagogical features. Generated from schemas/inferred-features.schema.json */
export type InferredFeatures = import('./generated/inferred-features').AGNIInferredFeatures;

// ──────────────────────────────────────────────────────────────────────────────
// Lesson types (hand-written; raw YAML input, aliases)
// ──────────────────────────────────────────────────────────────────────────────

import type { LessonSkillRef, GateLogic } from './generated/lesson-ir';

/** Raw YAML ontology input: allows string shorthand or full LessonSkillRef. */
export interface LessonOntology {
  requires?: Array<string | LessonSkillRef>;
  provides?: Array<string | LessonSkillRef>;
  [key: string]: unknown;
}

/** Gate in lesson IR. Alias for GateLogic (generated). */
export type LessonGate = GateLogic;

// Factory manifest entries are currently just filenames, but aliased here
// to make future refactors (e.g. richer objects) easier.
export type FactoryManifestEntry = string;

// ──────────────────────────────────────────────────────────────────────────────
// LMS engine types
// ──────────────────────────────────────────────────────────────────────────────

export interface RaschStudentState {
  ability: number;
  variance: number;
}

export interface RaschProbe {
  difficulty: number;
  skill: string;
}

export interface RaschGlobalAnchor {
  meanAbility: number;
  stdAbility: number;
}

export interface RaschState {
  students: Record<string, RaschStudentState>;
  probes: Record<string, RaschProbe>;
  globalAnchor: RaschGlobalAnchor;
}

export interface EmbeddingEntityState {
  // Latent factor vector; length == embedding.dim.
  vector: number[] | null | undefined;
  // Additional per-entity stats may be stored here.
  [key: string]: unknown;
}

export interface EmbeddingState {
  dim: number;
  lr: number;
  reg: number;
  forgetting: number;
  students: Record<string, EmbeddingEntityState>;
  lessons: Record<string, EmbeddingEntityState>;
}

export interface BanditState {
  /** Recursive least-squares matrices/vectors. */
  A: number[][];
  b: number[];
  /** Must equal embedding.dim * 2 (BanditSummary.embeddingDim). Enforced at runtime. */
  featureDim: number;
  forgetting: number;
  observationCount: number;
  /** Sync IDs already merged — prevents duplicate sync double-counting. Runtime cap: 500 (FIFO). */
  seenSyncIds?: string[];
  /** Export sequence for federation deduplication (hubHighWater). */
  exportSequence?: number;
  /** Per-hub high-water mark for federation merge. */
  hubHighWater?: Record<string, number>;
  /** Monotonic merge counter; incremented on each successful federation merge. (AUDIT-C2.3) */
  mergeVersion?: number;
  count: number;
  totalGain: number;
  avgGain: number;
}

export interface MarkovDropoutEntry {
  count: number;
  totalStudents: number;
}

export interface MarkovCooldownEntry {
  timestamp: number;
  gain: number;
}

/** Edge in Markov transitions/bigrams: count and gain tracking. */
export interface MarkovTransitionEdge {
  count: number;
  totalGain?: number;
  avgGain?: number;
}

export interface MarkovState {
  /** First-order transitions. Runtime evicts oldest sources when over MAX_TRANSITION_SOURCES (300). */
  transitions: Record<string, Record<string, MarkovTransitionEdge>>;
  /** Second-order bigrams. Runtime evicts when over MAX_BIGRAM_SOURCES (200). */
  bigrams?: Record<string, Record<string, MarkovTransitionEdge>>;
  /** Per-student recent lesson IDs. Runtime cap: MAX_HISTORY (10) per student. */
  studentHistory: Record<string, string[]>;
  dropouts?: Record<string, MarkovDropoutEntry>;
  cooldowns?: Record<string, Record<string, MarkovCooldownEntry>>;
}

export interface LMSState {
  rasch: RaschState;
  embedding: EmbeddingState;
  bandit: BanditState;
  markov?: MarkovState;
}

export interface BanditSummary {
  /** Embedding dimension (featureDim = embeddingDim * 2). Required for federation contract: all federating hubs must use the same value. */
  embeddingDim: number;
  mean: number[];
  precision: number[][];
  sampleSize: number;
  /** Content hash for deduplication — added by exporter, checked by importer. */
  syncId?: string;
  /** Hub ID for federation merge deduplication. */
  hubId?: string;
  /** Export sequence for federation merge (hubHighWater check). */
  exportSequence?: number;
  /** Posterior version for merge ordering. */
  posteriorVersion?: number;
  /** Training window for merge. */
  trainingWindow?: number;
}

/** Input to applyObservation: one completed lesson attempt. Reference implementation: pure (state, observation) → newState. */
export interface LMSObservation {
  studentId: string;
  lessonId: string;
  probeResults: Array<{ probeId: string; correct: boolean }>;
}

/** Result of LMS selectBestLesson / explainSelection. */
export interface LMSSelectResult {
  selected: string | null;
  ability: RaschStudentState | null;
  breakdown: Record<string, unknown>;
  candidates?: string[];
}

/** Result of hub-transform compileLesson (IR + sidecar; HTML assembled at response time). */
export interface HubCompileResult {
  ir: LessonIR;
  sidecar: LessonSidecar;
  lessonIR: LessonIR;
}

// ──────────────────────────────────────────────────────────────────────────────
// Governance types
// ──────────────────────────────────────────────────────────────────────────────

/** Policy for lesson compliance. Generated from schemas/governance-policy.schema.json */
export type GovernancePolicy = import('./generated/governance-policy').AGNIGovernancePolicy;

export interface ComplianceResult {
  status: 'ok' | 'warning' | 'fail';
  issues: string[];
}

export interface CohortCoverageReport {
  byUtu: Record<string, { lessons: number; skills: string[]; studentMasteryCount: number }>;
  bySkill: Record<string, { lessons: number; studentMasteryCount: number }>;
  studentCount: number;
  lessonCount: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// Auth / Hub context (JS-2.3)
// ──────────────────────────────────────────────────────────────────────────────

/** Authenticated creator from validateSession. Passed to authOnly/adminOnly handlers as opts.creator. */
export interface AuthCreator {
  id?: string;
  creatorId?: string;
  role?: string;
  [key: string]: unknown;
}
