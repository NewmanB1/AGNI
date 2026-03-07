// src/types/index.d.ts
// Central type definitions for AGNI / OLS.
// These are used by JSDoc `import('../types')` references in JS modules
// and by TS-aware tooling, but have no runtime impact.

// ──────────────────────────────────────────────────────────────────────────────
// Lesson + IR types
// ──────────────────────────────────────────────────────────────────────────────

export interface UTULabel {
  class?: string;     // e.g. "MAC-2"
  band?: number;      // developmental band (1–6)
  protocol?: number;  // pedagogical protocol (1–5)
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
  /** Whether this lesson is designed for group/collaborative work. */
  is_group?: boolean;
  /** Author-declared pedagogical feature overrides (confidence 1.0). */
  declared_features?: {
    blooms_level?: 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create';
    vark?: string | string[];
    teaching_style?: string;
  };
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
  /** Best-fit pedagogical archetype ID (e.g. 'embodied-discovery'). Set by compiler via archetypeMatch. */
  archetypeId?: string | null;
  /** Archetype coherence score (0–~1.38). Higher = lesson's dimensions are more pedagogically aligned. */
  coherence?: number;
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
  _schemaVersion: string;   // e.g. "1.8.0"
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
  is_group?: boolean;

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
  /** Sync IDs already merged — prevents duplicate sync double-counting. */
  seenSyncIds?: string[];
}

export interface MarkovTransitionEdge {
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

export interface MarkovState {
  transitions: Record<string, Record<string, MarkovTransitionEdge>>;
  bigrams: Record<string, Record<string, MarkovTransitionEdge>>;
  studentHistory: Record<string, string[]>;
  dropouts: Record<string, MarkovDropoutEntry>;
  cooldowns: Record<string, Record<string, MarkovCooldownEntry>>;
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

