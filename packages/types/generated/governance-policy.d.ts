/**
 * DO NOT EDIT. Generated from schemas/*.schema.json by scripts/codegen-types.js.
 * Regenerate with: npm run codegen:types
 */

/**
 * Policy for lesson compliance: UTU, teaching modes, difficulty bounds.
 */
export interface AGNIGovernancePolicy {
  /**
   * Target UTU coordinates for cohort coverage. Each target specifies a Spine + Band, optionally a Protocol.
   */
  utuTargets?: {
    /**
     * Spine ID (e.g. MAC-2, SCI-1, SOC-3).
     */
    class: string;
    /**
     * Developmental band B1–B6.
     */
    band: number;
    /**
     * Optional. Target protocol P1–P5 for this coordinate.
     */
    protocol?: number;
  }[];
  /**
   * Teaching modes permitted for lessons.
   */
  allowedTeachingModes?: string[];
  /**
   * Minimum lesson difficulty (1-5).
   */
  minDifficulty?: number;
  /**
   * Maximum lesson difficulty (1-5).
   */
  maxDifficulty?: number;
  /**
   * If true, lessons must have a UTU label.
   */
  requireUtu?: boolean;
  /**
   * If true, lessons must declare teaching_mode.
   */
  requireTeachingMode?: boolean;
  /**
   * Pedagogical protocols permitted (P1-P5). E.g. [1,2,3] for rigor.
   */
  allowedProtocols?: number[];
  /**
   * Minimum protocol for rigor bounds.
   */
  minProtocol?: number;
  /**
   * Maximum protocol for rigor bounds.
   */
  maxProtocol?: number;
  /**
   * Include failure-mode hint when protocol check fails.
   */
  failureModeHints?: boolean;
}
