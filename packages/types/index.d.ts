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

/** Validated OLS lesson YAML (schema-validated input). Use for compiler input. */
export type OlsLessonInput = import('./generated/ols').AGNIOpenLessonStandardV18;

/** Graph weights (sentry/theta). Generated from schemas/graph-weights.schema.json */
export type GraphWeights = import('./generated/graph-weights').OLSGraphWeightsDiscoveredCohortCognitionMap;

// ──────────────────────────────────────────────────────────────────────────────
// Lesson + IR types (hand-written; no schemas for IR/sidecar yet)
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
  /** Optional schema version for forward-compat checks (e.g. 1.8.0). */
  yamlSchemaVersion?: string;
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

/** Raw YAML ontology input: allows string shorthand or full LessonSkillRef. */
export interface LessonOntology {
  requires?: Array<string | LessonSkillRef>;
  provides?: Array<string | LessonSkillRef>;
  [key: string]: unknown;
}

/** Normalized ontology: compiler produces this. Consumers use LessonSkillRef[] only. */
export interface LessonOntologyNormalized {
  requires: LessonSkillRef[];
  provides: LessonSkillRef[];
}

/** Gate logic for Zero-Trust prerequisite check. Matches schemas/ols.schema.json gateLogic.
 *  Must be schema-validated; do not allow arbitrary unknown payloads in executable logic.
 *  Runtime may add: max_attempts, answer (alias for expected_answer), on_pass. */
export interface GateLogic {
  type: 'quiz' | 'manual_verification';
  skill_target?: string;
  question?: string;
  expected_answer?: string;
  answer?: string;
  on_fail?: string;
  on_pass?: string;
  passing_score?: number;
  retry_delay?: string;
  max_attempts?: number;
}

/** Gate in lesson IR. When schema-validated, must be GateLogic. Legacy paths may pass unknown. */
export type LessonGate = GateLogic;

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
  factories?: Array<{ file: string; version: string; integrity?: string }>;
}

export interface LessonIR {
  meta?: LessonMeta;
  /** Normalized at compile time; consumers use LessonSkillRef[] only. */
  ontology?: LessonOntologyNormalized;
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

  /** Deterministic SHA-256 hash of IR for caching, deduplication, federation. */
  lessonHash?: string;
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
