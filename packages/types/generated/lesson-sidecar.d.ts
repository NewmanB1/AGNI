/**
 * DO NOT EDIT. Generated from schemas/*.schema.json by scripts/codegen-types.js.
 * Regenerate with: npm run codegen:types
 */

/**
 * Lesson sidecar (index-ir.json) written alongside compiled HTML. Consumed by theta, governance, hub.
 */
export interface AGNILessonSidecar {
  /**
   * Unique lesson identifier (e.g. ols:physics:gravity_v1).
   */
  identifier: string;
  /**
   * URL-safe lesson slug.
   */
  slug: string;
  /**
   * Lesson title.
   */
  title: string;
  /**
   * BCP-47 language tag.
   */
  language: string;
  /**
   * Difficulty 1-5.
   */
  difficulty: number;
  utu?: UTULabel;
  /**
   * Teaching mode (e.g. socratic, didactic).
   */
  teaching_mode?: string;
  /**
   * Whether designed for group work.
   */
  is_group?: boolean;
  /**
   * ISO timestamp of compilation.
   */
  compiledAt: string;
  /**
   * Schema version (e.g. 1.8.0).
   */
  schemaVersion: string;
  /**
   * Whether metadata came from inference, declaration, or both.
   */
  metadata_source: "inferred" | "declared" | "mixed";
  ontology: {
    requires: LessonSkillRef[];
    provides: LessonSkillRef[];
  };
  /**
   * Prerequisite gate (quiz or manual).
   */
  gate: GateLogic | null;
  inferredFeatures: AGNIInferredFeatures;
  /**
   * KaTeX asset identifiers.
   */
  katexAssets: string[];
  /**
   * SVG factory filenames.
   */
  factoryManifest: string[];
  /**
   * SHA-256 hash of IR for caching, deduplication, federation.
   */
  lessonHash?: string;
}
/**
 * Governance / taxonomy (UTU).
 */
export interface UTULabel {
  /**
   * e.g. MAC-2
   */
  class?: string;
  /**
   * Developmental band 1-6
   */
  band?: number;
  protocol?: number;
}
export interface LessonSkillRef {
  skill: string;
  level?: number;
}
export interface GateLogic {
  type: "quiz" | "manual_verification";
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
/**
 * Feature profile for LMS and reporting.
 */
export interface AGNIInferredFeatures {
  flags: InferredFeatureFlags;
  /**
   * KaTeX asset identifiers used in the lesson.
   */
  katexAssets: string[];
  /**
   * SVG factory filenames required by the lesson.
   */
  factoryManifest: string[];
  vark: VarkProfile;
  /**
   * Highest Bloom level inferred (1-6).
   */
  bloomsCeiling: number;
  /**
   * Bloom level label (e.g. remember, understand, apply).
   */
  bloomsLabel: string;
  /**
   * Dominant teaching style inferred (e.g. socratic, didactic).
   */
  dominantTeachingStyle: string;
  /**
   * Count of steps by type (text, svg, quiz, etc.).
   */
  stepTypeCounts: {
    [k: string]: number;
  };
  /**
   * Difficulty rating 1-5.
   */
  difficulty: number;
  /**
   * Best-fit pedagogical archetype ID (e.g. embodied-discovery). Set by compiler via archetypeMatch.
   */
  archetypeId?: string | null;
  /**
   * Archetype coherence score (0–~1.38). Higher = more pedagogically aligned.
   */
  coherence?: number;
  [k: string]: unknown;
}
/**
 * Boolean flags for equation types, sensors, visuals, etc.
 */
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
/**
 * VARK learning style profile (visual, auditory, read/write, kinesthetic).
 */
export interface VarkProfile {
  visual: number;
  auditory: number;
  readWrite: number;
  kinesthetic: number;
}
