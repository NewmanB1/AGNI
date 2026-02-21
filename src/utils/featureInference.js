// src/utils/featureInference.js
// AGNI Feature Inference
//
// Analyses a parsed OLS lesson and returns:
//   1. Feature flags          — has_sensors, has_equations, has_graphs, etc.
//   2. Dependency manifest    — which factory files are needed and why
//   3. Pedagogical profile    — VARK scores, teaching style, Bloom's level,
//                               metaphor types, cultural framing signals
//
// The dependency manifest is written into lesson HTML by html.js as the
// requires.factories block. factory-loader.js reads it at runtime to
// resolve files from the device cache or village hub.
//
// The pedagogical profile is used by:
//   - The WYSIWYG (authoring warnings and suggestions)
//   - The curriculum sequencer (adaptive path ordering)
//   - Analytics (understanding what lesson styles are in the library)
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// SECTION A — Factory dependency tables
// ═══════════════════════════════════════════════════════════════════════════

// Single source of truth: factory key → { file, version }.
// When a factory file is updated, bump its version here and in the file's
// own register() call so factory-loader.js can detect staleness.

var FACTORY_FILES = {
  'shared-runtime':         { file: 'shared-runtime.js',        version: '1.7.0' },
  'svg-stage':              { file: 'svg-stage.js',              version: '1.7.0' },
  'svg-factories':          { file: 'svg-factories.js',          version: '1.7.0' },
  'svg-factories-dynamic':  { file: 'svg-factories-dynamic.js',  version: '1.7.0' },
  'svg-factories-geometry': { file: 'svg-factories-geometry.js', version: '1.7.0' },
  'sensor-bridge':          { file: 'sensor-bridge.js',          version: '1.7.0' },
  'threshold-evaluator':    { file: 'threshold-evaluator.js',    version: '1.7.0' },
  'math-renderer':          { file: 'math-renderer.js',          version: '1.7.0' }
};

// Load order matters: each file must load after its dependencies.
var LOAD_ORDER = [
  'shared-runtime',
  'svg-stage',
  'svg-factories',
  'svg-factories-dynamic',
  'svg-factories-geometry',
  'sensor-bridge',
  'threshold-evaluator',
  'math-renderer'
];

// Each rule: { key, reason, when(flags) → boolean }
// If when() returns true the factory file is added to the manifest.
var DEPENDENCY_RULES = [
  {
    key: 'shared-runtime',
    reason: 'Core AGNI shared runtime',
    when: function () { return true; }
  },
  {
    key: 'sensor-bridge',
    reason: 'Sensor access (accelerometer / gyroscope)',
    when: function (f) { return f.sensor_count > 0; }
  },
  {
    key: 'threshold-evaluator',
    reason: 'Threshold evaluation for hardware triggers',
    when: function (f) { return f.sensor_count > 0; }
  },
  {
    key: 'math-renderer',
    reason: 'LaTeX / KaTeX equation rendering',
    when: function (f) { return f.has_equations; }
  },
  {
    key: 'svg-stage',
    reason: 'SVG stage (required by all SVG factories)',
    when: function (f) {
      return f.has_graphs || f.has_visuals || f.has_dynamic_visuals ||
             f.has_geometry || f.has_sensor_visuals || f.has_map;
    }
  },
  {
    key: 'svg-factories',
    reason: 'Static SVG factory library',
    when: function (f) { return f.has_graphs || f.has_visuals; }
  },
  {
    key: 'svg-factories-dynamic',
    reason: 'Dynamic / sensor-connected SVG factories',
    when: function (f) {
      return f.has_dynamic_visuals || f.has_sensor_visuals || f.has_map;
    }
  },
  {
    key: 'svg-factories-geometry',
    reason: 'Geometry SVG factories (polygon, grid, unit circle)',
    when: function (f) { return f.has_geometry; }
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// SECTION B — Visual factory detection patterns
// ═══════════════════════════════════════════════════════════════════════════

var STATIC_VISUAL_PATTERNS = {
  barGraph:     /bar.?graph|bar.?chart|histogram/i,
  pieChart:     /pie.?chart|donut.?chart/i,
  venn:         /venn/i,
  numberLine:   /number.?line/i,
  balanceScale: /balance|scale|equation.?balance/i,
  clockFace:    /clock|analogue.?time|analog.?time/i,
  flowMap:      /flow.?map|flow.?chart|concept.?map|mind.?map/i,
  polygon:      /polygon|hexagon|pentagon|triangle|quadrilateral|octagon/i,
  tree:         /tree.?diagram|taxonomy|hierarchy/i,
  axis:         /axis.?plot|simple.?graph/i
};

var DYNAMIC_VISUAL_PATTERNS = {
  timeGraph:         /time.?graph|live.?graph|sensor.?graph|scrolling.?graph/i,
  arrowMap:          /arrow.?map|movement.?map|migration|battle.?map|troop/i,
  numberLineDynamic: /dynamic.?number.?line|bouncing.?ball/i,
  clockDynamic:      /live.?clock|real.?time.?clock/i
};

var GEOMETRY_PATTERNS = {
  polygonDynamic: /rotat|transform|decompos|scale.?shape/i,
  cartesianGrid:  /cartesian|coordinate.?plane|slope|tangent|derivative|function.?plot/i,
  unitCircle:     /unit.?circle|\bsin\b|\bcos\b|\btrig\b/i
};

// ═══════════════════════════════════════════════════════════════════════════
// SECTION C — Pedagogical style patterns
// ═══════════════════════════════════════════════════════════════════════════

// ── VARK ─────────────────────────────────────────────────────────────────────
// Fleming's Visual-Auditory-Read/Write-Kinaesthetic model.
// Each entry: content patterns, step types that count as a hit,
// and already-computed feature flags that count as a hit.

var VARK_PATTERNS = {
  visual: {
    content: [
      /!\[.*?\]\(.*?\)/,                                           // any markdown image
      /\bgraph\b|\bchart\b|\bdiagram\b|\bfigure\b|\bsketch\b/i,
      /look at|see the|observe|notice the|shown in|displayed|illustrated/i,
      /\bcolou?r.?coded\b|\bicon\b|\bpicture\b|\bimage\b|\billustration\b/i
    ],
    stepTypes:    ['vis:'],   // any step whose type starts with vis:
    featureFlags: ['has_visuals', 'has_graphs', 'has_dynamic_visuals',
                   'has_geometry', 'has_map']
  },

  auditory: {
    content: [
      /audio:|\.mp3|\.wav|\.ogg|\.m4a|\[sound\b|<audio/i,
      /\blisten\b|\bhear\b|\bsound\b|\brhythm\b|\bbeat\b|\bmelody\b|\btune\b/i,
      /\bspoken\b|\bvoice\b|\bread aloud\b|\bsay it\b|\brepeat after\b/i,
      /\bdiscuss\b|\btalk about\b|\bexplain to a partner\b/i
    ],
    stepTypes:    [],
    featureFlags: ['has_audio']
  },

  readWrite: {
    content: [
      /write down|take notes|note that|record your|list the|define|definition/i,
      /read the following|the passage|the text below|in the article/i,
      /\bspell\b|\blabel\b|\bannotate\b|\bsummarise\b|\bsummarize\b|\bessay\b/i,
      /\bvocabulary\b|\bterm\b|\bconcept\b|\bglossary\b|\bdescribe in words\b/i
    ],
    stepTypes:    ['quiz'],   // text-answer quizzes are inherently R/W
    featureFlags: []
  },

  kinaesthetic: {
    content: [
      /\bshake\b|\bdrop\b|\btilt\b|\bhold\b|\btap\b|\btouch\b|\bpress\b/i,
      /\bmove\b|\brotate\b|\bflip\b|\bthrow\b|\bcatch\b|\bswing\b|\bpick up\b/i,
      /try it|hands.?on|do this|carry out|perform|physical|experiment/i,
      /feel the|place the phone|what does it feel like/i
    ],
    stepTypes:    ['hardware_trigger'],
    featureFlags: ['has_sensors']
  }
};

// ── Teaching style ────────────────────────────────────────────────────────────
// Detected from tone, sentence structure, question density, and vocabulary.

var TEACHING_STYLE_PATTERNS = {
  // Socratic: questions and prompts that elicit student thinking
  socratic: [
    /\?/,
    /what do you think|why do you think|how might|what would happen if/i,
    /can you explain|what if|do you notice|why might|what could cause/i,
    /consider this|reflect on|wonder about|predict what|which do you think/i,
    /is that always true|can you find a case where/i
  ],

  // Didactic: direct instruction — teacher tells, student receives
  didactic: [
    /is defined as|refers to|this means that|in other words|which means/i,
    /remember that|note that|important:|key fact:|the formula is|the rule is/i,
    /step \d+[\.\:)]|first,|secondly,|thirdly,|finally,/i,
    /you will learn|by the end of this lesson|the answer is/i
  ],

  // Constructivist: student builds understanding through doing and discovering
  constructivist: [
    /find out|discover|explore|investigate|experiment|test your/i,
    /what happens when|try changing|observe what|see if you can/i,
    /build|create|design|make your own|construct|put together/i,
    /predict.*then check|was your prediction correct/i
  ],

  // Narrative / story-framed: content delivered through story or scenario
  narrative: [
    /once upon|meanwhile|suddenly|after that|the story|a character named/i,
    /journey|adventure|imagine you are|you are a|in this world|our hero/i,
    /\d{3,4}\s*(AD|BC|CE|BCE)?|last (century|decade|year)|during the \w+ era/i,
    /historical|legend|folklore|traditional story/i
  ],

  // Inquiry-based: structured around a driving question or problem
  inquiryBased: [
    /big question|essential question|driving question|how can we/i,
    /problem to solve|challenge:|mission:|your task is/i,
    /investigate the question|find evidence|what evidence do you have/i
  ],

  // Project-based: leads toward a student-produced artefact
  projectBased: [
    /your project|final product|you will create|you will produce|you will build/i,
    /present your|share your findings|show your work|submit|portfolio/i,
    /design brief|criteria|constraints/i
  ]
};

// ── Bloom's Taxonomy ──────────────────────────────────────────────────────────
// Anderson & Krathwohl's revised taxonomy, lower to higher order.
// dominant = most common level; ceiling = highest level present.

var BLOOMS_PATTERNS = {
  remember: [
    /\bwhat is\b|\bwho is\b|\bwhen did\b|\bwhere is\b|\bname the\b/i,
    /\bdefine\b|\blist\b|\bidentify\b|\brecall\b|\bstate\b|\brecognise\b|\brecognize\b/i,
    /\bmemorize\b|\bfact\b|\bvocabulary\b/i
  ],
  understand: [
    /\bexplain\b|\bdescribe\b|\bsummarise\b|\bsummarize\b|\binterpret\b/i,
    /\bparaphrase\b|\bclassify\b|\bin your own words\b/i,
    /why does|how does|what does.*mean|give an example of/i
  ],
  apply: [
    /\buse\b|\bapply\b|\bdemonstrate\b|\bsolve\b|\bcalculate\b|\bshow how\b/i,
    /\bperform\b|\bcarry out\b|\btry it\b|\bdo this\b/i,
    /hardware_trigger|sensor/i   // physical action is always Apply-level
  ],
  analyse: [
    /\bcompare\b|\bcontrast\b|\bexamine\b|\bbreak down\b|\bdifferentiate\b/i,
    /what is the difference|how are.*similar|identify the pattern/i,
    /\banalyse\b|\banalyze\b|\bwhat causes\b|\brelationship between\b/i
  ],
  evaluate: [
    /\bjudge\b|\bassess\b|\bjustify\b|\bargue\b|\bcritique\b|\bdefend\b/i,
    /which is better|do you agree|is it valid|what evidence supports/i,
    /support your answer|weigh up|pros and cons/i
  ],
  create: [
    /\bdesign\b|\binvent\b|\bcompose\b|\bproduce\b|\bdevelop your own\b/i,
    /make a|build a|write your own|how would you design|create something/i,
    /original|novel solution|your own version/i
  ]
};

// ── Metaphor types ────────────────────────────────────────────────────────────
// Extended from the original four types. These help identify cultural
// resonance and can be used to localise lessons by swapping metaphor frames.

var METAPHOR_PATTERNS = {
  weaving:  /\bweav\w*\b|\bthread\b|\bloom\b|\bfabric\b|\bstitch\w*\b/i,
  farming:  /\bfarm\w*\b|\bseed\w*\b|\bharvest\w*\b|\bcrop\w*\b|\bsoil\b|\bplant\w*\b/i,
  building: /\bbuild\w*\b|\bconstruct\w*\b|\bfoundation\b|\bbrick\w*\b/i,
  cooking:  /\bcook\w*\b|\brecipe\b|\bmix\w*\b|\bstir\w*\b|\bbake\w*\b/i,
  music:    /\brhythm\b|\bbeat\b|\bmelody\b|\btune\b|\bdrum\b|\bsong\b/i,
  water:    /\briver\b|\bflow\w*\b|\bstream\b|\btide\b|\bwave\b|\bocean\b/i,
  fire:     /\bfire\b|\bflame\b|\bheat\w*\b|\bignit\w*\b|\bspark\b/i,
  journey:  /\bjourney\b|\bpath\b|\broad\b|\btravel\w*\b|\bdistance\b/i,
  body:     /\bbody\b|\bheart\b|\bbrain\b|\bblood\b|\bbreath\w*\b/i,
  nature:   /\btree\b|\broot\w*\b|\bbranch\w*\b|\bseason\b|\bgrow\w*\b/i
};

// ── Cultural / framing signals ────────────────────────────────────────────────
// Not value judgements — signals that help designers identify which
// communities a lesson is suited for, or where localisation is needed.

var CULTURAL_SIGNALS = {
  oral_tradition:       /elder|story.*told|passed down|generation|ancestor|community gather/i,
  indigenous_knowledge: /traditional knowledge|local knowledge|indigenous|native practice/i,
  collectivist_framing: /together|our community|we can|let us|our class|share with your group/i,
  individualist_framing:/you will|your own|independently|by yourself|personal goal/i,
  gender_inclusive:     /they\/them|everyone|all students|any student|regardless of/i,
  religious_framing:    /faith|belief|spiritual|prayer|sacred/i
};

// ═══════════════════════════════════════════════════════════════════════════
// SECTION D — Scoring helpers
// ═══════════════════════════════════════════════════════════════════════════

/** Count how many patterns in an array produce at least one match */
function countMatches(patterns, text) {
  return patterns.reduce(function (acc, re) {
    return acc + (re.test(text) ? 1 : 0);
  }, 0);
}

/**
 * Normalise raw per-step counts to 0–1 scores.
 * Returns { scores, dominant, isMultimodal }.
 * isMultimodal = true when two or more categories score within 20% of dominant.
 */
function normaliseScores(rawScores, stepCount) {
  var max      = 0;
  var dominant = null;
  var normalised = {};

  Object.keys(rawScores).forEach(function (key) {
    var n = stepCount > 0
      ? Math.min(1, rawScores[key] / Math.max(1, stepCount))
      : 0;
    normalised[key] = parseFloat(n.toFixed(3));
    if (n > max) { max = n; dominant = key; }
  });

  var threshold  = max * 0.8;
  var highCount  = Object.keys(normalised).filter(function (k) {
    return normalised[k] >= threshold && normalised[k] > 0;
  }).length;

  return {
    scores:       normalised,
    dominant:     dominant,
    isMultimodal: highCount >= 2
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION E — Main inference function
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Infers features, factory dependencies, and pedagogical profile
 * from a parsed OLS lesson object.
 *
 * @param  {object} lesson  Parsed YAML lesson
 * @returns {object}
 *   flags      — feature flags (used by dependency rules and the player)
 *   factories  — ordered dependency manifest for factory-loader.js
 *   reasons    — human-readable dependency explanations
 *   pedagogy   — VARK, teaching style, Bloom's, metaphor, cultural signals
 */
function inferFeatures(lesson) {

  // ── Feature flags ───────────────────────────────────────────────────────────
  var features = {
    title:                        (lesson.meta && lesson.meta.title) || 'Untitled',
    has_sensors:                  false,
    sensor_count:                 0,
    sensors_used:                 new Set(),
    has_haptic_feedback:          false,
    interactive_elements_count:   0,
    has_branching:                false,
    has_audio:                    false,
    has_quiz:                     false,
    has_graphs:                   false,
    has_equations:                false,
    has_visuals:                  false,
    has_dynamic_visuals:          false,
    has_sensor_visuals:           false,
    has_geometry:                 false,
    has_map:                      false,
    has_metaphor:                 false,
    metaphor_types:               new Set()
  };

  // ── Pedagogical score accumulators ─────────────────────────────────────────
  var varkRaw   = { visual: 0, auditory: 0, readWrite: 0, kinaesthetic: 0 };
  var styleRaw  = {
    socratic: 0, didactic: 0, constructivist: 0,
    narrative: 0, inquiryBased: 0, projectBased: 0
  };
  var bloomsRaw = {
    remember: 0, understand: 0, apply: 0,
    analyse: 0, evaluate: 0, create: 0
  };
  var culturalRaw = {};
  Object.keys(CULTURAL_SIGNALS).forEach(function (k) { culturalRaw[k] = 0; });

  var stepCount     = (lesson.steps || []).length;
  var questionCount = 0;   // raw '?' count across all content, for Socratic ratio

  // ── Per-step loop ───────────────────────────────────────────────────────────
  (lesson.steps || []).forEach(function (step) {
    var content = (step.content || '') + ' ' + (step.title || '');

    // ── Sensors ───────────────────────────────────────────────────────────────
    if (step.type === 'hardware_trigger') {
      features.has_sensors = true;
      features.sensor_count++;
      if (step.sensor) features.sensors_used.add(step.sensor.toLowerCase());
    }

    // ── Haptic feedback ───────────────────────────────────────────────────────
    if (step.feedback && /vibration:/i.test(step.feedback)) {
      features.has_haptic_feedback = true;
    }

    // ── Interactivity / branching ─────────────────────────────────────────────
    if (step.type === 'quiz') {
      features.has_quiz = true;
      features.interactive_elements_count++;
    }
    if (step.on_fail || step.on_success || step.condition || step.next_if) {
      features.has_branching = true;
      features.interactive_elements_count++;
    }

    // ── Audio ─────────────────────────────────────────────────────────────────
    if (/audio:|\.mp3|\.wav|\.ogg|\[sound\b|<audio|sound effect|voice|spoken/i.test(content)) {
      features.has_audio = true;
    }

    // ── Metaphor ──────────────────────────────────────────────────────────────
    Object.keys(METAPHOR_PATTERNS).forEach(function (type) {
      if (METAPHOR_PATTERNS[type].test(content)) {
        features.has_metaphor = true;
        features.metaphor_types.add(type);
      }
    });

    // ── Visuals ───────────────────────────────────────────────────────────────
    // Markdown tables
    if (/\|.*\|/m.test(content) && /[-:| ]{3,}/.test(content)) {
      features.has_graphs = true;
      features.has_visuals = true;
    }
    // Image tags with graph-like alt text
    if (/!\[.*?(\bgraph\b|\bchart\b|\bdiagram\b|\bplot\b|\bbar\b|\bpie\b).*?\]\(/gi.test(content)) {
      features.has_graphs = true;
      features.has_visuals = true;
    }
    // LaTeX equations
    if (/\$\$.+?\$\$/s.test(content) || /\$[^$\n]+?\$/g.test(content)) {
      var mathBlocks = (content.match(/\$\$(.+?)\$\$/gs) || [])
                       .concat(content.match(/\$([^$\n]+?)\$/g) || []);
      mathBlocks.forEach(function (block) {
        var math = block.replace(/\$/g, '');
        if (/[=~→:]/.test(math) && /[a-zA-Z0-9]/.test(math)) {
          features.has_equations = true;
        }
      });
    }
    // vis: step type prefix
    if (step.type && step.type.startsWith('vis:')) {
      var visType = step.type.replace('vis:', '');
      if (STATIC_VISUAL_PATTERNS[visType])  { features.has_visuals = true; features.has_graphs = true; }
      if (DYNAMIC_VISUAL_PATTERNS[visType]) { features.has_dynamic_visuals = true; }
      if (GEOMETRY_PATTERNS[visType])       { features.has_geometry = true; }
      if (visType === 'arrowMap')           { features.has_map = true; features.has_dynamic_visuals = true; }
    }
    // Embedded visual spec on step
    if (step.spec && step.spec.factory) {
      classifyFactory(step.spec.factory, features);
    }
    if (step.spec && step.spec.compose && step.spec.layers) {
      step.spec.layers.forEach(function (layer) {
        if (layer.factory) classifyFactory(layer.factory, features);
      });
    }
    // Keyword detection
    Object.keys(STATIC_VISUAL_PATTERNS).forEach(function (id) {
      if (STATIC_VISUAL_PATTERNS[id].test(content)) { features.has_visuals = true; }
    });
    Object.keys(DYNAMIC_VISUAL_PATTERNS).forEach(function (id) {
      if (DYNAMIC_VISUAL_PATTERNS[id].test(content)) { features.has_dynamic_visuals = true; }
    });
    Object.keys(GEOMETRY_PATTERNS).forEach(function (id) {
      if (GEOMETRY_PATTERNS[id].test(content)) { features.has_geometry = true; }
    });
    if (DYNAMIC_VISUAL_PATTERNS.arrowMap.test(content)) { features.has_map = true; }
    if (features.has_dynamic_visuals && features.has_sensors) {
      features.has_sensor_visuals = true;
    }

    // ── VARK scoring ──────────────────────────────────────────────────────────
    Object.keys(VARK_PATTERNS).forEach(function (channel) {
      var spec = VARK_PATTERNS[channel];
      var hits = countMatches(spec.content, content);
      spec.stepTypes.forEach(function (t) {
        if ((step.type || '').startsWith(t) || step.type === t) hits++;
      });
      // Feature flags already computed above also count
      spec.featureFlags.forEach(function (flag) {
        if (features[flag]) hits++;
      });
      if (hits > 0) varkRaw[channel]++;
    });

    // ── Teaching style scoring ─────────────────────────────────────────────
    Object.keys(TEACHING_STYLE_PATTERNS).forEach(function (style) {
      if (countMatches(TEACHING_STYLE_PATTERNS[style], content) > 0) {
        styleRaw[style]++;
      }
    });

    // Raw question-mark count for Socratic ratio
    questionCount += (content.match(/\?/g) || []).length;

    // ── Bloom's scoring ────────────────────────────────────────────────────
    Object.keys(BLOOMS_PATTERNS).forEach(function (level) {
      var hits = countMatches(BLOOMS_PATTERNS[level], content);
      // Physical steps are inherently Apply-level
      if (level === 'apply' && step.type === 'hardware_trigger') hits++;
      // Reasoned quizzes push toward Evaluate
      if (level === 'evaluate' && step.type === 'quiz' &&
          (step.on_fail || step.explanation)) hits++;
      if (hits > 0) bloomsRaw[level]++;
    });

    // ── Cultural signals ──────────────────────────────────────────────────
    Object.keys(CULTURAL_SIGNALS).forEach(function (signal) {
      if (CULTURAL_SIGNALS[signal].test(content)) culturalRaw[signal]++;
    });
  });

  // ── Gate-level branching ─────────────────────────────────────────────────
  if (lesson.gate && (lesson.gate.on_fail || lesson.gate.on_success)) {
    features.has_branching = true;
  }

  // ── Serialise Sets ───────────────────────────────────────────────────────
  features.sensors_used   = Array.from(features.sensors_used);
  features.metaphor_types = Array.from(features.metaphor_types);

  // ── Socratic ratio ───────────────────────────────────────────────────────
  // More than one question per two steps = strongly Socratic regardless of
  // keyword matching. Boost the raw score to reflect this.
  var socraticRatio = stepCount > 0 ? questionCount / stepCount : 0;
  if (socraticRatio > 0.5) {
    styleRaw.socratic = Math.max(styleRaw.socratic, Math.ceil(stepCount * 0.5));
  }

  // ── Normalise ────────────────────────────────────────────────────────────
  var varkResult   = normaliseScores(varkRaw,   stepCount);
  var styleResult  = normaliseScores(styleRaw,  stepCount);
  var bloomsResult = normaliseScores(bloomsRaw, stepCount);

  // Bloom's ceiling: highest-order level with any presence
  var bloomsOrder   = ['create', 'evaluate', 'analyse', 'apply', 'understand', 'remember'];
  var bloomsCeiling = bloomsOrder.find(function (l) {
    return bloomsResult.scores[l] > 0;
  }) || 'remember';

  // Cultural presence (boolean, not ratio)
  var culturalPresence = {};
  Object.keys(culturalRaw).forEach(function (k) {
    culturalPresence[k] = culturalRaw[k] > 0;
  });

  // ── Build dependency manifest ─────────────────────────────────────────────
  var neededKeys = {};
  var reasons    = {};
  DEPENDENCY_RULES.forEach(function (rule) {
    if (rule.when(features)) {
      neededKeys[rule.key] = true;
      reasons[rule.key]    = rule.reason;
    }
  });

  var factories = [];
  var seenFiles = {};
  LOAD_ORDER.forEach(function (key) {
    if (!neededKeys[key]) return;
    var def = FACTORY_FILES[key];
    if (!def || seenFiles[def.file]) return;
    seenFiles[def.file] = true;
    factories.push({ file: def.file, version: def.version, reason: reasons[key] });
  });

  // ── Assemble pedagogical profile ──────────────────────────────────────────
  var pedagogy = {
    // VARK: which sensory channels the lesson activates
    vark: {
      scores:       varkResult.scores,
      dominant:     varkResult.dominant,
      isMultimodal: varkResult.isMultimodal
    },

    // Teaching style: didactic, Socratic, constructivist, narrative, etc.
    teachingStyle: {
      scores:        styleResult.scores,
      dominant:      styleResult.dominant,
      isMultimodal:  styleResult.isMultimodal,
      socraticRatio: parseFloat(socraticRatio.toFixed(3))
    },

    // Bloom's: cognitive level of activities
    blooms: {
      scores:   bloomsResult.scores,
      dominant: bloomsResult.dominant,
      ceiling:  bloomsCeiling       // highest level present in the lesson
    },

    // Metaphor and cultural framing
    metaphor: {
      present: features.has_metaphor,
      types:   features.metaphor_types
    },

    cultural: culturalPresence,

    // Convenience flags for quick checks by the WYSIWYG and sequencer
    flags: {
      isSensorDriven:          features.sensor_count > 0,
      isVisuallyRich:          (varkResult.scores.visual || 0) > 0.3,
      hasHigherOrderThinking:  ['analyse', 'evaluate', 'create'].indexOf(bloomsCeiling) !== -1,
      hasNarrative:            (styleResult.scores.narrative || 0) > 0,
      isConstructivist:        (styleResult.scores.constructivist || 0) > 0.2
    }
  };

  return {
    flags:     features,
    factories: factories,
    reasons:   reasons,
    pedagogy:  pedagogy
  };
}

// ── classifyFactory: maps a factory id onto feature flags ─────────────────────
// Used when a step has an embedded spec: { factory: '...' } block.
function classifyFactory(id, features) {
  if (STATIC_VISUAL_PATTERNS[id])  { features.has_visuals = true; features.has_graphs = true; }
  if (DYNAMIC_VISUAL_PATTERNS[id]) { features.has_dynamic_visuals = true; }
  if (GEOMETRY_PATTERNS[id])       { features.has_geometry = true; }
  if (id === 'arrowMap')           { features.has_map = true; features.has_dynamic_visuals = true; }
  if (id === 'unitCircle' || id === 'cartesianGrid' || id === 'polygonDynamic') {
    features.has_geometry = true;
  }
  if (id === 'timeGraph' || id === 'numberLineDynamic' || id === 'clockFaceDynamic') {
    features.has_dynamic_visuals = true;
  }
}

module.exports = { inferFeatures: inferFeatures, FACTORY_FILES: FACTORY_FILES };
