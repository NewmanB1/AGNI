/**
 * DO NOT EDIT. Generated from schemas/*.schema.json by scripts/codegen-types.js.
 * Regenerate with: npm run codegen:types
 */

/**
 * Compiler intermediate representation. Output of buildLessonIR.
 */
export interface AGNILessonIR {
  meta?: LessonMeta;
  ontology?: LessonOntologyNormalized;
  /**
   * Prerequisite gate.
   */
  gate?: GateLogic | null;
  /**
   * Lesson steps (content, specs, thresholds).
   */
  steps: LessonStep[];
  inferredFeatures: AGNIInferredFeatures;
  requires?: LessonRequires;
  /**
   * inferred, declared, or mixed.
   */
  metadata_source: string;
  /**
   * Development mode flag.
   */
  _devMode: boolean;
  /**
   * ISO timestamp of compilation.
   */
  _compiledAt: string;
  /**
   * Schema version (e.g. 1.8.0).
   */
  _schemaVersion: string;
  [k: string]: unknown;
}
/**
 * Lesson metadata (identifier, title, etc.).
 */
export interface LessonMeta {
  identifier?: string;
  slug?: string;
  title?: string;
  language?: string;
  utu?: UTULabel;
  teaching_mode?: string;
  is_group?: boolean;
  yamlSchemaVersion?: string;
  declared_features?: {
    blooms_level?: "remember" | "understand" | "apply" | "analyze" | "evaluate" | "create";
    vark?: string | string[];
    teaching_style?: string;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}
export interface UTULabel {
  class?: string;
  band?: number;
  protocol?: number;
}
/**
 * Normalized skill requires/provides.
 */
export interface LessonOntologyNormalized {
  requires: LessonSkillRef[];
  provides: LessonSkillRef[];
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
export interface LessonStep {
  id?: string;
  type?: string;
  title?: string;
  label?: string;
  content?: string;
  feedback?: string;
  spec?: {
    [k: string]: unknown;
  };
  threshold?: {
    [k: string]: unknown;
  };
  htmlContent?: string;
  [k: string]: unknown;
}
/**
 * Inferred pedagogical features.
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
/**
 * Factory dependencies for factory-loader.
 */
export interface LessonRequires {
  factories?: {
    file: string;
    version: string;
    integrity?: string;
  }[];
}
