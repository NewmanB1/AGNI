/**
 * DO NOT EDIT. Generated from schemas/*.schema.json by scripts/codegen-types.js.
 * Regenerate with: npm run codegen:types
 */

/**
 * Compiler-inferred pedagogical features: VARK profile, Bloom ceiling, factory manifest, etc.
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
