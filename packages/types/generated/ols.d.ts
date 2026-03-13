/**
 * DO NOT EDIT. Generated from schemas/*.schema.json by scripts/codegen-types.js.
 * Regenerate with: npm run codegen:types
 */

/**
 * Step discriminated by type. Each step type has required fields and allowed properties enforced by its schema.
 */
export type Step =
  | StepInstruction
  | StepHardwareTrigger
  | StepQuiz
  | StepFillBlank
  | StepMatching
  | StepOrdering
  | StepCompletion;
export type StepInstruction = StepCommonProps & {
  type: "instruction";
  [k: string]: unknown;
};
export type StepHardwareTrigger = StepCommonProps & {
  type: "hardware_trigger";
  sensor?: string;
  threshold: string;
  sensor_optional?: boolean;
  [k: string]: unknown;
};
export type StepQuiz = StepCommonProps & {
  type: "quiz";
  /**
   * @minItems 2
   */
  answer_options: [string, string, ...string[]];
  correct_index: number;
  [k: string]: unknown;
};
export type StepFillBlank = StepCommonProps & {
  type: "fill_blank";
  /**
   * @minItems 1
   */
  blanks: [
    {
      answer: string;
      accept?: string[];
    },
    ...{
      answer: string;
      accept?: string[];
    }[]
  ];
  [k: string]: unknown;
};
export type StepMatching = StepCommonProps & {
  type: "matching";
  /**
   * @minItems 2
   */
  pairs: [
    {
      left: string;
      right: string;
    },
    {
      left: string;
      right: string;
    },
    ...{
      left: string;
      right: string;
    }[]
  ];
  [k: string]: unknown;
};
export type StepOrdering = StepCommonProps & {
  type: "ordering";
  /**
   * @minItems 2
   */
  items: [string, string, ...string[]];
  /**
   * @minItems 2
   */
  correct_order: [number, number, ...number[]];
  [k: string]: unknown;
};
export type StepCompletion = StepCommonProps & {
  type: "completion";
  [k: string]: unknown;
};

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
export interface StepCommonProps {
  /**
   * Unique step identifier within this lesson. Used by θ for reordering and by forks for change tracking.
   */
  id?: string;
  type?: string;
  content?: string;
  sensor?: string;
  threshold?: string;
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
   * Optional haptic feedback pattern. Alternative to embedding in feedback string.
   */
  feedback_pattern?: "vibration:short" | "vibration:success_pattern";
  answer_options?: string[];
  correct_index?: number;
  blanks?: {
    answer?: string;
    accept?: string[];
    [k: string]: unknown;
  }[];
  pairs?: {
    left?: string;
    right?: string;
    [k: string]: unknown;
  }[];
  items?: string[];
  correct_order?: number[];
  /**
   * How long this step should take for an on-pace learner (ISO 8601 duration).
   */
  expected_duration?: string;
  max_attempts?: number;
  weight?: number;
  on_fail?: string;
  on_success?: string;
  audio_description?: string;
  condition?: string;
  next_if?: string;
  svg_spec?: SvgSpec;
  spec?: SvgSpec1;
}
/**
 * SVGFactory visual specification. Rendered by the player via svg-registry.js.
 */
export interface SvgSpec {
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
  opts?: {
    [k: string]: unknown;
  };
  description?: string;
  compose?: boolean;
  /**
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
  w?: number;
  h?: number;
  [k: string]: unknown;
}
/**
 * SVGFactory visual specification. Rendered by the player via svg-registry.js.
 */
export interface SvgSpec1 {
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
  opts?: {
    [k: string]: unknown;
  };
  description?: string;
  compose?: boolean;
  /**
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
  w?: number;
  h?: number;
  [k: string]: unknown;
}
