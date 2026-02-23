// src/utils/featureInference.js
// AGNI Feature Inference  v1.9.0
//
// Analyses a parsed OLS lesson object and produces two outputs:
//
//   1. inferredFeatures  — pedagogical profile, capability flags, and the
//      factory dependency manifest consumed by factory-loader.js
//
//   2. metadata_source   — 'inferred' | 'declared' | 'mixed'
//      Records whether lesson metadata was inferred by the compiler or
//      declared explicitly by the author (WYSIWYG path).
//
// Changes from v1.8.0:
//   - sensor-bridge.js added to FACTORY_LOAD_ORDER and FACTORY_FILE_MAP.
//     It must load after shared-runtime.js (which provides AGNI_SHARED) but
//     before svg-stage.js (which binds sensors via AGNI_SHARED). It is
//     always included in the factory manifest when has_sensors is true,
//     and included unconditionally when has_visuals is true since stages
//     always wire sensor subscriptions even for non-hardware lessons.
//   - _buildFactoryManifest() updated: sensor-bridge.js is inserted at
//     position 0 (after shared-runtime.js which is prepended by html.js)
//     whenever the lesson has visuals or sensor steps.
//   - Version bumped to 1.9.0.
//
// Target: Node.js 14+ (compiler). Not loaded on the edge device.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

// ── Factory file load order ──────────────────────────────────────────────────
// The order below is the ONLY valid load order for the SVG factory system.
// factory-loader.js must load files in this sequence.
//
// shared-runtime.js    — provides AGNI_SHARED (prepended by html.js, not here)
// sensor-bridge.js     — provides sensor data to AGNI_SHARED.subscribeToSensor()
//                        must load before svg-stage.js which calls subscribeToSensor
// svg-stage.js         — stage + RAF loop + sensor binding via AGNI_SHARED
// svg-factories.js     — static factory functions attached to AGNI_SVG
// svg-factories-dynamic.js — sensor-driven factories; requires stage
// svg-factories-geometry.js — geometry factories; requires stage
// svg-registry.js      — fromSpec() dispatch; must be last in SVG chain
// table-renderer.js    — uses AGNI_SVG.barGraph; loads after factories
//
var FACTORY_LOAD_ORDER = [
  'sensor-bridge.js',
  'svg-stage.js',
  'svg-factories.js',
  'svg-factories-dynamic.js',
  'svg-factories-geometry.js',
  'svg-registry.js',
  'table-renderer.js'
];

// ── Registry ID → file membership ────────────────────────────────────────────
// Maps each svg-registry.js factory id to the file that implements it.
// sensor-bridge.js has no registry id — it is included based on flags,
// not factory spec references.
//
var FACTORY_FILE_MAP = {
  // svg-factories.js (static)
  'venn':          'svg-factories.js',
  'axis':          'svg-factories.js',
  'numberLine':    'svg-factories.js',
  'balanceScale':  'svg-factories.js',
  'barGraph':      'svg-factories.js',
  'clockFace':     'svg-factories.js',
  'flowMap':       'svg-factories.js',
  'pieChart':      'svg-factories.js',
  'polygon':       'svg-factories.js',
  'tree':          'svg-factories.js',

  // svg-factories-dynamic.js (sensor-driven)
  'numberLineDynamic': 'svg-factories-dynamic.js',
  'clockFaceDynamic':  'svg-factories-dynamic.js',
  'timeGraph':         'svg-factories-dynamic.js',
  'arrowMap':          'svg-factories-dynamic.js',
  'compose':           'svg-factories-dynamic.js',

  // svg-factories-geometry.js (geometry)
  'polygonDynamic':  'svg-factories-geometry.js',
  'cartesianGrid':   'svg-factories-geometry.js',
  'unitCircle':      'svg-factories-geometry.js'
};

// ── Equation type detection patterns ────────────────────────────────────────
var EQUATION_TYPE_PATTERNS = {
  trig:     /\\(sin|cos|tan|sec|csc|cot|arcsin|arccos|arctan|theta|phi|psi)\b/,
  calculus: /\\(int|sum|prod|lim|partial|nabla|infty|frac\s*\{[^}]*d[a-z])/,
  physics:  /\\(vec|hat|dot|times|cdot|hbar|Delta|Sigma|Omega|mu|lambda|rho|epsilon|sigma|omega)\b/,
  sets:     /\\(in|notin|subset|cup|cap|emptyset|forall|exists|neg|wedge|vee|mathbb)\b/
};

// ── Visual detection patterns ────────────────────────────────────────────────
var STATIC_VISUAL_PATTERNS = [
  /\bvenn\b/i,
  /\bbarGraph\b|\bbar.graph\b|\bbar.chart\b/i,
  /\bpieChart\b|\bpie.chart\b/i,
  /\bnumberLine\b|\bnumber.line\b/i,
  /\bbalanceScale\b|\bbalance.scale\b/i,
  /\bclockFace\b|\bclock.face\b/i,
  /\bflowMap\b|\bflow.map\b/i,
  /\bpolygon\b(?!Dynamic)/i,
  /\btree\b/i,
  /\baxis\b(?!Label)/i
];

var DYNAMIC_VISUAL_PATTERNS = [
  /\bnumberLineDynamic\b/i,
  /\bclockFaceDynamic\b/i,
  /\btimeGraph\b|\btime.graph\b/i,
  /\barrowMap\b|\barrow.map\b/i,
  /\bcompose\b/i
];

var GEOMETRY_PATTERNS = [
  /\bpolygonDynamic\b/i,
  /\bcartesianGrid\b|\bcartesian.grid\b/i,
  /\bunitCircle\b|\bunit.circle\b/i
];

// ── Sensor keyword patterns ───────────────────────────────────────────────────
var SENSOR_PATTERNS = [
  /\baccel\b/i, /\baccelerometer\b/i,
  /\bgyro\b/i, /\bgyroscope\b/i,
  /\brotation\b/i, /\borientation\b/i,
  /hardware_trigger/i,
  /\bmotion\b/i, /\bshake\b/i,
  /\bfreefall\b|\bfree.fall\b/i,
  /\btilt\b/i
];

// ── Teaching style patterns ───────────────────────────────────────────────────
var TEACHING_STYLE_PATTERNS = {
  constructivist: /\bexplore\b|\bdiscover\b|\binvestigate\b|\bhypothesi[sz]e\b|\bexperiment\b/i,
  direct:         /\blearn\b|\bstudy\b|\bunderstand\b|\bremember\b|\bmemorize\b/i,
  socratic:       /\bwhy\b|\bhow\b|\bwhat if\b|\bwould\b.*\?|\bcould\b.*\?|\bdo you\b.*\?/i,
  narrative:      /\bstory\b|\bonce\b|\bimagine\b|\bpicture\b|\bjourney\b|\bcharacter\b/i
};

// ── VARK indicator patterns ───────────────────────────────────────────────────
var VARK_PATTERNS = {
  visual:      /\bdiagram\b|\bchart\b|\bgraph\b|\bfigure\b|\bshow\b|\bvisual\b|\bdraw\b|\billustrat/i,
  auditory:    /\blisten\b|\bsound\b|\bnote\b|\btone\b|\brhythm\b|\bbeat\b|\bsing\b/i,
  readWrite:   /\bread\b|\bwrite\b|\blist\b|\btable\b|\bword\b|\bdefinit\b|\btext\b/i,
  kinesthetic: /\bhold\b|\bmove\b|\btouch\b|\bfeel\b|\bpick up\b|\bdrop\b|\bshake\b|\bplace\b|\btilt\b/i
};

// ── Bloom's taxonomy level patterns ──────────────────────────────────────────
var BLOOMS_PATTERNS = [
  { level: 1, label: 'remember',   re: /\bidentify\b|\brecall\b|\bname\b|\blist\b|\bstate\b|\bdefine\b/i },
  { level: 2, label: 'understand', re: /\bexplain\b|\bdescribe\b|\bsummarise\b|\bclassify\b|\binterpret\b/i },
  { level: 3, label: 'apply',      re: /\buse\b|\bsolve\b|\bcalculate\b|\bdemonstr\b|\bapply\b/i },
  { level: 4, label: 'analyse',    re: /\bcompare\b|\bcontrast\b|\banalyse\b|\bdistinguish\b|\bexamine\b/i },
  { level: 5, label: 'evaluate',   re: /\bjudge\b|\bcritique\b|\bassess\b|\bdefend\b|\bjustify\b/i },
  { level: 6, label: 'create',     re: /\bdesign\b|\bconstruct\b|\bcompose\b|\bformulate\b|\bcreate\b/i }
];


// ═══════════════════════════════════════════════════════════════════════════
// Main inference function
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Infer lesson features from a parsed OLS lesson object.
 *
 * @param  {object} lessonData   parsed YAML lesson object
 * @returns {object}             { inferredFeatures, metadata_source }
 */
function inferFeatures(lessonData) {
  var steps    = lessonData.steps || [];
  var meta     = lessonData.meta  || {};
  var ontology = lessonData.ontology || {};

  // ── Collect all text content for pattern matching ─────────────────────────
  var allContent = steps.map(function (s) {
    return [s.content, s.title, s.label, s.feedback,
            JSON.stringify(s.spec || ''),
            JSON.stringify(s.threshold || '')
           ].filter(Boolean).join(' ');
  }).join(' ');

  allContent += ' ' + [meta.title, meta.description, meta.tags].filter(Boolean).join(' ');

  // ── Capability flags ──────────────────────────────────────────────────────
  var hasEquations = /\$[^$]+\$|\$\$[\s\S]+?\$\$/.test(allContent);
  var hasSensors   = steps.some(function (s) { return s.type === 'hardware_trigger'; }) ||
                     SENSOR_PATTERNS.some(function (p) { return p.test(allContent); });
  var hasTables    = /\|.+\|/.test(allContent);

  var specFactoryIds = _collectSpecFactoryIds(steps);
  var hasStaticVisuals  = !!specFactoryIds.length ||
    STATIC_VISUAL_PATTERNS.some(function (p) { return p.test(allContent); });
  var hasDynamicVisuals = specFactoryIds.some(function (id) {
    return FACTORY_FILE_MAP[id] === 'svg-factories-dynamic.js';
  }) || DYNAMIC_VISUAL_PATTERNS.some(function (p) { return p.test(allContent); });
  var hasGeometryVisuals = specFactoryIds.some(function (id) {
    return FACTORY_FILE_MAP[id] === 'svg-factories-geometry.js';
  }) || GEOMETRY_PATTERNS.some(function (p) { return p.test(allContent); });
  var hasVisuals = hasStaticVisuals || hasDynamicVisuals || hasGeometryVisuals;

  // ── Equation type detection ───────────────────────────────────────────────
  var equationTypes = {
    algebra:  false,
    trig:     false,
    calculus: false,
    physics:  false,
    sets:     false
  };

  if (hasEquations) {
    var anySpecific = false;
    Object.keys(EQUATION_TYPE_PATTERNS).forEach(function (type) {
      if (EQUATION_TYPE_PATTERNS[type].test(allContent)) {
        equationTypes[type] = true;
        anySpecific = true;
      }
    });
    if (!anySpecific) equationTypes.algebra = true;
  }

  // ── KaTeX asset list ──────────────────────────────────────────────────────
  var katexAssets = hasEquations ? _buildKatexAssetList(equationTypes) : [];

  // ── Factory dependency manifest ───────────────────────────────────────────
  // sensor-bridge.js is included whenever the lesson has visuals (stages always
  // bind sensors) or explicit sensor steps. html.js prepends shared-runtime.js
  // before this manifest, so the full runtime load order becomes:
  //   shared-runtime.js → sensor-bridge.js → svg-stage.js → factories...
  var needsSensorBridge = hasVisuals || hasSensors;
  var factoryManifest = hasVisuals
    ? _buildFactoryManifest(specFactoryIds, hasDynamicVisuals, hasGeometryVisuals,
        hasTables && hasVisuals, needsSensorBridge)
    : (hasSensors ? ['sensor-bridge.js'] : []);

  // ── VARK profile ──────────────────────────────────────────────────────────
  var vark = { visual: 0, auditory: 0, readWrite: 0, kinesthetic: 0 };
  Object.keys(VARK_PATTERNS).forEach(function (k) {
    var matches = allContent.match(new RegExp(VARK_PATTERNS[k].source, 'gi'));
    vark[k] = matches ? matches.length : 0;
  });

  // ── Bloom's ceiling ───────────────────────────────────────────────────────
  var bloomsCeiling = 1;
  var bloomsLabel   = 'remember';
  BLOOMS_PATTERNS.forEach(function (b) {
    if (b.re.test(allContent) && b.level > bloomsCeiling) {
      bloomsCeiling = b.level;
      bloomsLabel   = b.label;
    }
  });

  // ── Teaching style ────────────────────────────────────────────────────────
  var teachingScores = {};
  Object.keys(TEACHING_STYLE_PATTERNS).forEach(function (style) {
    var matches = allContent.match(new RegExp(TEACHING_STYLE_PATTERNS[style].source, 'gi'));
    teachingScores[style] = matches ? matches.length : 0;
  });
  var dominantStyle = Object.keys(teachingScores).reduce(function (best, k) {
    return teachingScores[k] > teachingScores[best] ? k : best;
  }, 'direct');

  // ── Step count by type ────────────────────────────────────────────────────
  var stepTypeCounts = {};
  steps.forEach(function (s) {
    var t = s.type || 'unknown';
    stepTypeCounts[t] = (stepTypeCounts[t] || 0) + 1;
  });

  // ── Difficulty estimate ───────────────────────────────────────────────────
  var difficulty = (typeof lessonData.difficulty === 'number')
    ? lessonData.difficulty
    : Math.max(1, Math.min(5, bloomsCeiling));

  // ── Assemble result ───────────────────────────────────────────────────────
  var inferredFeatures = {
    flags: {
      has_equations:       hasEquations,
      equation_types:      equationTypes,
      has_sensors:         hasSensors,
      has_tables:          hasTables,
      has_static_visuals:  hasStaticVisuals,
      has_dynamic_visuals: hasDynamicVisuals,
      has_geometry:        hasGeometryVisuals,
      has_visuals:         hasVisuals
    },
    katexAssets:      katexAssets,
    factoryManifest:  factoryManifest,
    vark:             vark,
    bloomsCeiling:    bloomsCeiling,
    bloomsLabel:      bloomsLabel,
    dominantTeachingStyle: dominantStyle,
    stepTypeCounts:   stepTypeCounts,
    difficulty:       difficulty
  };

  var metadataSource = lessonData.metadata_source || 'inferred';

  return {
    inferredFeatures: inferredFeatures,
    metadata_source:  metadataSource
  };
}


// ── Private helpers ──────────────────────────────────────────────────────────

/**
 * Collect factory ids explicitly referenced in step spec fields.
 * @param  {Array}    steps
 * @returns {string[]} deduplicated registry ids
 */
function _collectSpecFactoryIds(steps) {
  var seen = {};
  var ids  = [];
  steps.forEach(function (step) {
    if (!step.spec) return;
    var spec = step.spec;
    if (spec.factory && FACTORY_FILE_MAP[spec.factory]) {
      if (!seen[spec.factory]) { ids.push(spec.factory); seen[spec.factory] = true; }
    }
    if (spec.compose && Array.isArray(spec.layers)) {
      spec.layers.forEach(function (layer) {
        var fid = layer.factory;
        if (fid && FACTORY_FILE_MAP[fid] && !seen[fid]) {
          ids.push(fid);
          seen[fid] = true;
        }
      });
    }
  });
  return ids;
}

/**
 * Builds the ordered factory manifest for a lesson.
 *
 * sensor-bridge.js is first (after shared-runtime.js which html.js prepends).
 * svg-stage.js follows immediately — it calls AGNI_SHARED.subscribeToSensor()
 * which requires sensor-bridge.js to already be attached to AGNI_SHARED.
 * svg-registry.js is always last in the SVG chain (provides fromSpec()).
 * table-renderer.js is appended when the lesson has tables AND visuals.
 *
 * @param  {string[]} specIds
 * @param  {boolean}  hasDynamic
 * @param  {boolean}  hasGeometry
 * @param  {boolean}  includeTableRenderer
 * @param  {boolean}  includeSensorBridge
 * @returns {string[]}
 */
function _buildFactoryManifest(specIds, hasDynamic, hasGeometry,
    includeTableRenderer, includeSensorBridge) {
  var files = [];

  // sensor-bridge.js must precede svg-stage.js
  if (includeSensorBridge) files.push('sensor-bridge.js');

  files.push('svg-stage.js');
  files.push('svg-factories.js');

  if (hasDynamic)  files.push('svg-factories-dynamic.js');
  if (hasGeometry) files.push('svg-factories-geometry.js');

  files.push('svg-registry.js');

  if (includeTableRenderer) files.push('table-renderer.js');

  return files;
}

/**
 * Builds the KaTeX CSS asset list for a lesson.
 * Order: core → symbols (per active domain) → fonts.
 *
 * @param  {object} equationTypes
 * @returns {string[]}
 */
function _buildKatexAssetList(equationTypes) {
  var assets  = ['katex-core.css'];
  var domains = ['algebra', 'trig', 'calculus', 'physics', 'sets'];
  domains.forEach(function (domain) {
    if (equationTypes[domain]) assets.push('katex-symbols-' + domain + '.css');
  });
  assets.push('katex-fonts.css');
  return assets;
}


// ── Module exports ────────────────────────────────────────────────────────────

module.exports = {
  inferFeatures:         inferFeatures,
  buildKatexAssetList:   _buildKatexAssetList,
  collectSpecFactoryIds: _collectSpecFactoryIds,
  buildFactoryManifest:  _buildFactoryManifest,
  FACTORY_LOAD_ORDER:    FACTORY_LOAD_ORDER,
  FACTORY_FILE_MAP:      FACTORY_FILE_MAP
};
