/**
 * DO NOT EDIT. Generated from schemas/*.schema.json by scripts/codegen-types.js.
 * Regenerate with: npm run codegen:types
 */

/**
 * A standard for offline, sensor-rich interactive lessons. Supports forking, adaptive reordering (θ), learner pacing metrics, fill-in-the-blank / matching / ordering assessments, and author-declared feature overrides. Metadata complies with Dublin Core (DC) and LRMI/Schema.org.
 */
export interface AGNIOpenLessonStandardV18 {
  /**
   * Semver version of the OLS spec.
   */
  version: "1.6.0" | "1.7.0" | "1.8.0";
  /**
   * Bibliographic, educational, and performance metadata.
   */
  meta: {
    /**
     * Unique namespaced ID. Convention: ols:<domain>:<topic>_<variant>_v<N>
     */
    identifier: string;
    title: string;
    description?: string;
    /**
     * BCP-47 language tag (e.g., 'en', 'sw', 'es-MX').
     */
    language: string;
    /**
     * Cultural/regional adaptation target (e.g., 'KE', 'US', 'IN-TN'). Two lessons can share a language but differ in locale.
     */
    locale?: string;
    license: string;
    created: string;
    updated?: string;
    authors?: {
      name: string;
      email?: string;
      url?: string;
    }[];
    /**
     * Structured subject categories (e.g., 'Physics', 'Classical Mechanics').
     */
    subject?: string[];
    /**
     * Free-form tags for discovery (e.g., 'beginner', 'indoor', 'no-drop').
     */
    tags?: string[];
    audience?: {
      educational_role?: "student" | "teacher" | "parent";
      typical_age_range?: string;
    };
    /**
     * Expected total lesson duration in ISO 8601 duration format (e.g., 'PT12M' for 12 minutes).
     */
    time_required?: string;
    /**
     * Difficulty rating from 1 (easiest) to 5 (hardest). Used by θ for adaptive ordering.
     */
    difficulty?: number;
    /**
     * SHA-256 of canonical lesson content (meta + steps, sorted keys). Computed on save; forms the basis of the immutability chain.
     */
    content_hash?: string;
    /**
     * Content hash of the previous version of this lesson. Null for the first version. Forms a hash chain for immutability verification.
     */
    parent_hash?: string | null;
    /**
     * Canonical lesson URI: agni:<creator_id>/<slug>. Auto-generated from creator ID and slug; not set by hand.
     */
    uri?: string;
    /**
     * ID of the creator account that authored this lesson. Set automatically on save.
     */
    creator_id?: string;
    /**
     * UTU label (3D coordinate): Spine, Band, Protocol. See docs/specs/utu-architecture.md.
     */
    utu?: {
      /**
       * Spine ID (e.g. MAC-2, SCI-1, SOC-3). Canonical: MAC-1..8, SCI-1..7, SOC-1..7.
       */
      class?: string;
      /**
       * Alias for class. Spine ID for the lesson target.
       */
      spineId?: string;
      /**
       * Developmental band B1-B6.
       */
      band?: number;
      /**
       * Pedagogical protocol P1-P5: 1=Transmission, 2=Guided Construction, 3=Apprenticeship, 4=Dev. Sequencing, 5=Meaning Activation.
       */
      protocol?: number;
    };
    /**
     * Author-declared teaching mode.
     */
    teaching_mode?: "socratic" | "didactic" | "guided_discovery" | "narrative" | "constructivist" | "direct";
    /**
     * Whether this lesson is designed for group/collaborative work. When true, teachers can assign it to student groups.
     */
    is_group?: boolean;
    /**
     * Optional schema version for forward-compat checks. When present, old compilers can warn on unknown versions. Convention: match OLS version (e.g. 1.8.0) or author-specific semver.
     */
    yamlSchemaVersion?: string;
    /**
     * Primary accessibility mode this lesson targets. 'audio_first' enables auto-narration of all steps for blind or illiterate learners. The runtime honours this by enabling AGNI_NARRATION automatically.
     */
    accessibility_mode?: "visual" | "audio_first" | "high_contrast" | "motor_adapted";
    /**
     * Author-declared pedagogical feature overrides. Values here take precedence over compiler-inferred features and receive confidence 1.0.
     */
    declared_features?: {
      /**
       * Bloom's Taxonomy level declared by the author.
       */
      blooms_level?: "remember" | "understand" | "apply" | "analyze" | "evaluate" | "create";
      /**
       * VARK modality or modalities declared by the author.
       */
      vark?:
        | ("visual" | "auditory" | "read_write" | "kinesthetic")
        | [
            "visual" | "auditory" | "read_write" | "kinesthetic",
            ...("visual" | "auditory" | "read_write" | "kinesthetic")[]
          ];
      /**
       * Declared dominant teaching style (e.g. 'socratic', 'didactic', 'guided').
       */
      teaching_style?: string;
    };
    /**
     * Client-side checkpoint expiry in milliseconds. Overrides the default 7-day (604800000 ms) expiry.
     */
    checkpointExpiryMs?: number;
  };
  /**
   * Provenance tracking for forked lessons.
   */
  fork?: {
    /**
     * Identifier of the original lesson this was forked from.
     */
    source_identifier: string;
    /**
     * Version of the OLS spec the source lesson used.
     */
    source_version: string;
    /**
     * Content hash of the source lesson at time of fork.
     */
    source_hash?: string;
    /**
     * What kind of fork this is. 'translation' = same content, new language. 'adaptation' = same topic, different cultural context. 'remix' = structural changes. 'correction' = bug/error fix.
     */
    fork_type?: "translation" | "adaptation" | "remix" | "correction";
    /**
     * Human-readable summary of what changed from the source.
     */
    changes?: string;
  };
  ontology?: {
    requires?: SkillNode[];
    provides?: SkillNode[];
  };
  gate?: GateLogic;
  /**
   * @minItems 1
   */
  steps: [Step, ...Step[]];
  signatures?: {
    role?: string;
    entity?: string;
    signature?: string;
  }[];
}
export interface SkillNode {
  skill: string;
  level?: number;
}
export interface GateLogic {
  type: "quiz" | "manual_verification";
  skill_target?: string;
  question?: string;
  expected_answer?: string;
  on_fail?: string;
  /**
   * Minimum score (0.0–1.0) to pass this gate. Default: 1.0 (must answer correctly).
   */
  passing_score?: number;
  /**
   * Minimum wait time before retrying this gate (ISO 8601 duration). Prevents brute-forcing.
   */
  retry_delay?: string;
}
export interface Step {
  /**
   * Unique step identifier within this lesson. Used by θ for reordering and by forks for change tracking.
   */
  id: string;
  /**
   * instruction: text/content; hardware_trigger: sensor gate; quiz: MCQ with answers; fill_blank: cloze with ___ placeholders; matching: pair left↔right items; ordering: arrange items in sequence; completion: lesson-complete screen.
   */
  type: "instruction" | "hardware_trigger" | "quiz" | "fill_blank" | "matching" | "ordering" | "completion";
  content?: string;
  sensor?: string;
  threshold?: string;
  /**
   * If true, when sensors are unavailable (e.g. desktop, permission denied), show a tap-to-continue fallback instead of waiting indefinitely.
   */
  sensor_optional?: boolean;
  /**
   * Feedback text (string) or per-outcome feedback object with 'correct' and 'incorrect' messages.
   */
  feedback?:
    | string
    | {
        correct?: string;
        incorrect?: string;
      };
  /**
   * Optional haptic feedback pattern. Alternative to embedding in feedback string. Runtime prefers this when present.
   */
  feedback_pattern?: "vibration:short" | "vibration:success_pattern";
  answer_options?: string[];
  correct_index?: number;
  /**
   * For fill_blank steps: one entry per ___ placeholder in content. Each blank defines the correct answer and optional accepted alternatives.
   */
  blanks?: {
    /**
     * Canonical correct answer.
     */
    answer: string;
    /**
     * Additional accepted spellings/variants (case-insensitive match at runtime).
     */
    accept?: string[];
  }[];
  /**
   * For matching steps: each pair links a left term to a right term. The player shuffles the right column.
   */
  pairs?: {
    /**
     * Left-column item (displayed in order).
     */
    left: string;
    /**
     * Right-column item (shuffled for the student).
     */
    right: string;
  }[];
  /**
   * For ordering steps: list of items to arrange. The player shuffles them; the student drags them into the correct sequence.
   */
  items?: string[];
  /**
   * For ordering steps: zero-based indices defining the correct arrangement of 'items'. E.g. [0,1,2] means items are already in correct order.
   */
  correct_order?: number[];
  /**
   * How long this step should take for an on-pace learner (ISO 8601 duration). θ compares actual vs. expected to detect struggling or excelling.
   */
  expected_duration?: string;
  /**
   * Maximum attempts for quiz, fill_blank, matching, or ordering steps before marking as failed. Default varies by type.
   */
  max_attempts?: number;
  /**
   * Importance of this step to the lesson's learning objective (0.0–1.0). A core concept quiz might be 0.9; a calibration step might be 0.2.
   */
  weight?: number;
  /**
   * Action when max_attempts is exhausted. Can be a redirect (e.g., 'redirect:step_id'), a hint, or 'skip'.
   */
  on_fail?: string;
  /**
   * Action on successful completion. Can skip ahead (e.g., 'skip_to:step_id') for excelling learners.
   */
  on_success?: string;
  /**
   * Author-provided narration text for this step. When present, the audio-first mode speaks this instead of extracting text from HTML content. Essential for SVG-heavy or visual steps where the rendered text alone is insufficient for blind or illiterate learners.
   */
  audio_description?: string;
  /**
   * Conditional expression for whether this step should be shown. Used for adaptive paths.
   */
  condition?: string;
  /**
   * Conditional next step override. Format: 'condition -> step_id'.
   */
  next_if?: string;
  /**
   * SVGFactory visual specification. Rendered by the player via svg-registry.js. Can be a single factory (factory + opts) or a compose layer (compose: true + layers[]).
   */
  svg_spec?: {
    /**
     * Registered factory name: venn, barGraph, pieChart, numberLine, balanceScale, clockFace, flowMap, polygon, axis, tree, numberLineDynamic, clockFaceDynamic, timeGraph, arrowMap, gauge, polygonDynamic, cartesianGrid, unitCircle.
     */
    factory?:
      | "venn"
      | "barGraph"
      | "pieChart"
      | "numberLine"
      | "balanceScale"
      | "clockFace"
      | "flowMap"
      | "polygon"
      | "axis"
      | "tree"
      | "numberLineDynamic"
      | "clockFaceDynamic"
      | "timeGraph"
      | "arrowMap"
      | "gauge"
      | "polygonDynamic"
      | "cartesianGrid"
      | "unitCircle";
    /**
     * Factory-specific options. See svg-registry.js for valid keys per factory. Limited to 64 keys to prevent DoS.
     */
    opts?: {
      [k: string]: unknown;
    };
    /**
     * Alt-text description of this visual for screen readers and auto-narration mode. Spoken aloud when the SVG is rendered.
     */
    description?: string;
    /**
     * If true, layers[] is used instead of factory/opts.
     */
    compose?: boolean;
    /**
     * Array of factory layers when compose is true. Limited to 32 layers to prevent memory DoS.
     *
     * @maxItems 32
     */
    layers?: {
      factory?: string;
      opts?: {
        [k: string]: unknown;
      };
      name?: string;
      [k: string]: unknown;
    }[];
    /**
     * Viewport width override (shared across layers in compose mode).
     */
    w?: number;
    /**
     * Viewport height override.
     */
    h?: number;
    [k: string]: unknown;
  };
}
