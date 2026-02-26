// src/types/index.d.ts
// Central type definitions for AGNI / OLS.
// These are used by JSDoc `import('../types')` references in JS modules
// and by TS-aware tooling, but have no runtime impact.

// ──────────────────────────────────────────────────────────────────────────────
// Lesson + IR types
// ──────────────────────────────────────────────────────────────────────────────

export interface UTULabel {
  class?: string;  // e.g. "MAC-2"
  band?: number;   // developmental band
}

export interface LessonMeta {
  identifier?: string;
  slug?: string;
  title?: string;
  language?: string;
  /** Governance / taxonomy (UTU). See docs/ARCHITECTURE.md */
  utu?: UTULabel;
  /** Author-declared teaching mode (e.g. socratic, didactic, guided_discovery). */
  teaching_mode?: string;
  // Additional author-defined metadata is allowed.
  [key: string]: unknown;
}

export interface LessonSkillRef {
  skill: string;
  level?: number;
}

export interface LessonOntology {
  requires?: Array<string | LessonSkillRef>;
  provides?: Array<string | LessonSkillRef>;
  [key: string]: unknown;
}

export interface LessonGate {
  [key: string]: unknown;
}

export interface LessonStep {
  id?: string;
  type?: string;
  title?: string;
  label?: string;
  content?: string;
  feedback?: string;
  spec?: Record<string, unknown>;
  threshold?: Record<string, unknown>;
  // Added by buildLessonIR:
  htmlContent?: string;
  // Allow for future step-level fields.
  [key: string]: unknown;
}

export interface InferredFeatureFlags {
  has_equations: boolean;
  equation_types: {
    algebra: boolean;
    trig: boolean;
    calculus: boolean;
    physics: boolean;
    sets: boolean;
  };
  has_sensors: boolean;
  has_tables: boolean;
  has_static_visuals: boolean;
  has_dynamic_visuals: boolean;
  has_geometry: boolean;
  has_visuals: boolean;
}

export interface VarkProfile {
  visual: number;
  auditory: number;
  readWrite: number;
  kinesthetic: number;
}

export interface InferredFeatures {
  flags: InferredFeatureFlags;
  katexAssets: string[];
  factoryManifest: string[];
  vark: VarkProfile;
  bloomsCeiling: number;
  bloomsLabel: string;
  dominantTeachingStyle: string;
  stepTypeCounts: Record<string, number>;
  difficulty: number;
  // Open-ended extension point for future inference fields.
  [key: string]: unknown;
}

/** Runtime dependency list (factories) embedded in LESSON_DATA by compiler. */
export interface LessonRequires {
  factories?: Array<{ file: string; version: string }>;
}

export interface LessonIR {
  meta?: LessonMeta;
  ontology?: LessonOntology;
  gate?: LessonGate | null;
  steps: LessonStep[];
  inferredFeatures: InferredFeatures;
  /** Set by html.js / hub-transform; consumed by factory-loader.js */
  requires?: LessonRequires;
  metadata_source: 'inferred' | 'declared' | 'mixed' | string;
  _devMode: boolean;
  _compiledAt: string;      // ISO timestamp
  _schemaVersion: string;   // e.g. "1.7.0"
  // Allow additional fields copied through from YAML.
  [key: string]: unknown;
}

export interface LessonSidecar {
  // Identity
  identifier: string;
  slug: string;
  title: string;
  language: string;
  difficulty: number;

  // Governance / pedagogy (for reporting and compliance)
  utu?: UTULabel;
  teaching_mode?: string;

  // Compiler stamps
  compiledAt: string;
  schemaVersion: string;
  metadata_source: LessonIR['metadata_source'];

  // Curriculum / scheduling
  ontology: {
    requires: LessonSkillRef[];
    provides: LessonSkillRef[];
  };
  gate: LessonGate | null;

  // Feature profile
  inferredFeatures: InferredFeatures;
  katexAssets: string[];
  factoryManifest: string[];
}

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
  // Recursive least-squares matrices/vectors.
  A: number[][];
  b: number[];
  featureDim: number;
  forgetting: number;
  observationCount: number;
}

export interface LMSState {
  rasch: RaschState;
  embedding: EmbeddingState;
  bandit: BanditState;
}

export interface BanditSummary {
  mean: number[];
  precision: number[][];
  sampleSize: number;
}

/** Input to applyObservation: one completed lesson attempt. Reference implementation: pure (state, observation) → newState. */
export interface LMSObservation {
  studentId: string;
  lessonId: string;
  probeResults: Array<{ probeId: string; correct: boolean }>;
}

// ──────────────────────────────────────────────────────────────────────────────
// Governance types
// ──────────────────────────────────────────────────────────────────────────────

export interface GovernancePolicy {
  utuTargets?: Array<{ class: string; band: number }>;
  allowedTeachingModes?: string[];
  minDifficulty?: number;
  maxDifficulty?: number;
  requireUtu?: boolean;
  requireTeachingMode?: boolean;
  allowedProtocols?: number[];   // P1–P5; e.g. [1,2,3] for rigor
  minProtocol?: number;
  maxProtocol?: number;
  failureModeHints?: boolean;
}

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

