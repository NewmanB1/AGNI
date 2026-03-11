/**
 * DO NOT EDIT. Generated from schemas/*.schema.json by scripts/codegen-types.js.
 * Regenerate with: npm run codegen:types
 */

/**
 * Aggregated transfer difficulty discounts between skills for a discovered cohort. Lower weight = easier transfer (strong collapse). Weight semantics: 0.0 = complete transfer (almost no additional effort needed), 1.0 = no transfer benefit (full difficulty remains). Self-loops (from == to) are invalid and must be rejected by application logic. Edges must be unique by (from, to) pair — duplicates should be rejected or merged during insertion.
 */
export interface OLSGraphWeightsDiscoveredCohortCognitionMap {
  /**
   * Optional reference to this schema
   */
  $schema?: string;
  /**
   * Semver-compatible version (e.g. 1.0, 1.0.0, 1.1, 2.3.4)
   */
  version: string;
  /**
   * Opaque identifier for a discovered (clustered) cohort. Never human-readable or containing PII.
   */
  discovered_cohort: string;
  level: "village" | "regional" | "global";
  /**
   * Number of distinct learners in this discovered cohort
   */
  sample_size: number;
  /**
   * ISO 8601 timestamp when this graph was first created/computed
   */
  created_date: string;
  /**
   * ISO 8601 timestamp of the most recent update or recomputation
   */
  last_updated: string;
  /**
   * Default transfer difficulty when no edge exists (1.0 = no discount / full difficulty)
   */
  default_weight?: number;
  /**
   * Method used to compute the transfer weights (required for reproducibility)
   */
  weight_estimation_method:
    | "ols_regression"
    | "bayesian"
    | "collaborative_filtering"
    | "correlation_based"
    | "other"
    | "unknown";
  /**
   * Clustering algorithm or technique used to discover this cohort (required for reproducibility). Use 'unknown' for legacy or early data.
   */
  clustering_method: string;
  /**
   * @minItems 0
   */
  edges: {
    /**
     * Skill identifier (e.g. namespace:skill or ols:physics:gravity_concept). At least two colon-separated segments.
     */
    from: string;
    /**
     * Skill identifier (e.g. namespace:skill or ols:physics:gravity_concept). At least two colon-separated segments.
     */
    to: string;
    /**
     * Transfer difficulty discount: 0.0 = complete transfer, 1.0 = no benefit
     */
    weight: number;
    /**
     * Reliability of this edge (0.8+ = high confidence, 0.5–0.8 = medium, <0.5 = weak/low confidence)
     */
    confidence: number;
    /**
     * Number of distinct learners who exhibited this transfer pattern at least once (should be ≤ cohort sample_size)
     */
    sample_size: number;
  }[];
  metadata?: {
    noise_added?: {
      mechanism?: "laplace" | "gaussian" | "none" | "other";
      epsilon?: number;
      delta?: number;
      noise_scale?: number;
      [k: string]: unknown;
    };
    aggregation_sources?: {
      discovered_cohort: string;
      level?: string;
      contribution_weight?: number;
      [k: string]: unknown;
    }[];
    aggregation_method?: "weighted_average" | "max_confidence" | "median" | "bayesian_update" | "other";
    computation_date?: string;
    software_version?: string;
    [k: string]: unknown;
  };
}
