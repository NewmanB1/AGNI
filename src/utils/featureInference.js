// src/utils/featureInference.js
// AGNI Feature Inference  v1.8.0
//
// Analyses a parsed OLS lesson object and produces two outputs:
//
//   1. inferredFeatures  — pedagogical profile, capability flags, and the
//      factory dependency manifest consumed by factory-loader.js (Phase 3)
//
//   2. metadata_source   — 'inferred' | 'declared' | 'mixed'
//      Records whether lesson metadata was inferred by the compiler or
//      declared explicitly by the author (WYSIWYG path). This prepares
//      the schema for the future WYSIWYG lesson builder, which will write
//      structured metadata directly into the YAML packet so the compiler
//      can verify rather than discover. Per-feature source tracking is
//      WYSIWYG work; this field is the top-level marker for now.
//
// Changes from v1.7.0:
//   - Added equation_types detection (trig, calculus, physics, sets, algebra)
//     for KaTeX CSS subset selection. katex-core.css is loaded whenever
//     has_equations is true; katex-symbols.css subsets are loaded based
//     on equation_types; katex-fonts.css is loaded once and cached.
//   - Added metadata_source field to IR root (always 'inferred' from the
//     compiler; 'declared' or 'mixed' reserved for WYSIWYG builder).
//   - Factory manifest now uses svg-registry.js canonical IDs and respects
//     the required load order:
//       svg-stage.js → svg-factories.js → svg-factories-dynamic.js
//       → svg-factories-geometry.js → svg-registry.js → table-renderer.js
//     Only the files actually needed for the lesson are included.
//   - Version bumped to 1.8.0.
//
// Target: Node.js 14+ (compiler). Not loaded on the edge device.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

// ── Factory file load order ──────────────────────────────────────────────────
// The order below is the ONLY valid load order for the SVG factory system.
// factory-loader.js (Phase 3) must load files in this sequence.
// Each file depends on the previous ones being attached to AGNI_SVG.
//
// svg-stage.js is always loaded first when any visual is present.
// svg-factories.js provides static factories (venn, barGraph, clockFace, etc.)
// svg-factories-dynamic.js provides sensor-driven factories — requires stage.
// svg-factories-geometry.js provides geometry factories — requires stage.
// svg-registry.js provides the self-describing schema and fromSpec() — must
//   load last so all factory functions are already on AGNI_SVG.
// table-renderer.js is independent of the SVG factory chain but uses
//   AGNI_SVG.barGraph for the chart upgrade button, so it loads after factories.
//
var FACTORY_LOAD_ORDER = [
  'svg-stage.js',
  'svg-factories.js',
  'svg-factories-dynamic.js',
  'svg-factories-geometry.js',
  'svg-registry.js',
  'table-renderer.js'
];

// ── Registry ID → file membership ────────────────────────────────────────────
// Maps each svg-registry.js factory id to the file that implements it.
// Used to compute the minimal set of files needed for a given lesson.
// svg-stage.js and svg-registry.js are always included when any visual is
// present — they are the stage and the dispatch layer respectively.
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
// Applied only when has_equations is already true (a $...$ or $$...$$ block
// was found in the content). Each pattern is tested against the full lesson
// content string. Algebra is the fallback — it is set true when has_equations
// is true but no other type pattern matches.
//
var EQUATION_TYPE_PATTERNS = {
  trig:     /\\(sin|cos|tan|sec|csc|cot|arcsin|arccos|arctan|theta|phi|psi)\b/,
  calculus: /\\(int|sum|prod|lim|partial|nabla|infty|frac\s*\{[^}]*d[a-z])/,
  physics:  /\\(vec|hat|dot|times|cdot|hbar|Delta|Sigma|Omega|mu|lambda|rho|epsilon|sigma|omega)\b/,
  sets:     /\\(in|notin|subset|cup|cap|emptyset|forall|exists|neg|wedge|vee|mathbb)\b/
};

// ── Visual detection patterns ────────────────────────────────────────────────
// Detect static and dynamic factory references in lesson content.
// Patterns match both YAML spec keys and prose references.
//
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
 * If the lesson already has inferredFeatures attached (e.g. from a WYSIWYG
 * that declared metadata explicitly), this function verifies the flags
 * rather than computing them from scratch, and sets metadata_source to
 * 'declared' or 'mixed' accordingly. Currently metadata_source is always
 * 'inferred' because the WYSIWYG does not exist yet — this field is
 * reserved for that integration.
 *
 * @param  {object} lessonData   parsed YAML lesson object
 * @returns {object}             { inferredFeatures, metadata_source }
 */
function inferFeatures(lessonData) {
  var steps    = lessonData.steps || [];
  var meta     = lessonData.meta  || {};
  var ontology = lessonData.ontology || {};

  // ── Collect all text content for pattern matching ─────────────────────────
  // Concatenate step content, titles, labels — anything an author wrote.
  // This is the input to all heuristic detection.
  var allContent = steps.map(function (s) {
    return [s.content, s.title, s.label, s.feedback,
            JSON.stringify(s.spec || ''),
            JSON.stringify(s.threshold || '')
           ].filter(Boolean).join(' ');
  }).join(' ');

  // Also include meta fields
  allContent += ' ' + [meta.title, meta.description, meta.tags].filter(Boolean).join(' ');

  // ── Capability flags ──────────────────────────────────────────────────────
  var hasEquations = /\$[^$]+\$|\$\$[\s\S]+?\$\$/.test(allContent);
  var hasSensors   = steps.some(function (s) { return s.type === 'hardware_trigger'; }) ||
                     SENSOR_PATTERNS.some(function (p) { return p.test(allContent); });
  var hasTables    = /\|.+\|/.test(allContent);

  // Detect which factory files are needed by scanning spec fields directly
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
  // Only meaningful when has_equations is true.
  // algebra is the fallback — set when has_equations is true but no specific
  // type is detected. It is the most common case (basic variables, fractions).
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
    // algebra is the fallback for unclassified equations
    if (!anySpecific) equationTypes.algebra = true;
  }

  // ── KaTeX asset list ──────────────────────────────────────────────────────
  // Determines which CSS files factory-loader.js should request.
  // Always ordered: core → symbols subset → fonts (fonts load last,
  // cached aggressively — see Phase 2b specification).
  var katexAssets = hasEquations ? _buildKatexAssetList(equationTypes) : [];

  // ── Factory dependency manifest ───────────────────────────────────────────
  // The minimal set of SVG runtime files needed for this lesson, in the
  // required load order. factory-loader.js (Phase 3) reads this manifest
  // and fetches only the listed files from the hub cache.
  var factoryManifest = hasVisuals ? _buildFactoryManifest(specFactoryIds,
    hasDynamicVisuals, hasGeometryVisuals, hasTables && hasVisuals) : [];

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
  // Carry through declared difficulty if present; otherwise infer from
  // Bloom's ceiling. This value feeds theta's base cost calculation.
  var difficulty = (typeof lessonData.difficulty === 'number')
    ? lessonData.difficulty
    : Math.max(1, Math.min(5, bloomsCeiling));

  // ── Assemble result ───────────────────────────────────────────────────────
  var inferredFeatures = {
    flags: {
      has_equations:       hasEquations,
      equation_types:      equationTypes,   // ← NEW v1.8.0
      has_sensors:         hasSensors,
      has_tables:          hasTables,
      has_static_visuals:  hasStaticVisuals,
      has_dynamic_visuals: hasDynamicVisuals,
      has_geometry:        hasGeometryVisuals,
      has_visuals:         hasVisuals
    },
    katexAssets:      katexAssets,        // ← NEW v1.8.0
    factoryManifest:  factoryManifest,    // updated v1.8.0
    vark:             vark,
    bloomsCeiling:    bloomsCeiling,
    bloomsLabel:      bloomsLabel,
    dominantTeachingStyle: dominantStyle,
    stepTypeCounts:   stepTypeCounts,
    difficulty:       difficulty
  };

  // ── metadata_source ───────────────────────────────────────────────────────
  // 'inferred' — compiler detected all features from content analysis.
  // 'declared' — WYSIWYG wrote explicit metadata into the YAML packet;
  //              compiler verified rather than discovered. (Future)
  // 'mixed'    — some fields declared, some inferred. (Future)
  //
  // The WYSIWYG builder will populate lesson.metadata_source directly in
  // the YAML. When that field is present, inference becomes verification
  // and per-feature detection patterns become fallbacks, not primary paths.
  var metadataSource = lessonData.metadata_source || 'inferred';

  return {
    inferredFeatures: inferredFeatures,
    metadata_source:  metadataSource
  };
}


// ── Private helpers ──────────────────────────────────────────────────────────

/**
 * Collect factory ids explicitly referenced in step spec fields.
 * These are the most reliable signal — no heuristic needed.
 * @param  {Array} steps
 * @returns {string[]}   deduplicated registry ids
 */
function _collectSpecFactoryIds(steps) {
  var seen = {};
  var ids  = [];
  steps.forEach(function (step) {
    if (!step.spec) return;
    var spec = step.spec;
    // Single factory: { factory: 'barGraph', opts: {...} }
    if (spec.factory && FACTORY_FILE_MAP[spec.factory]) {
      if (!seen[spec.factory]) { ids.push(spec.factory); seen[spec.factory] = true; }
    }
    // Composed: { compose: true, layers: [{ factory: 'cartesianGrid', ... }] }
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
 * Only includes files that are actually needed, in the required load order.
 *
 * svg-stage.js is always first when any visual is present.
 * svg-factories.js is always included when any visual is present (static
 *   factories are used by table-renderer chart upgrade too).
 * svg-registry.js is always last in the SVG chain (provides fromSpec()).
 * table-renderer.js is appended when the lesson has tables AND visuals.
 *
 * @param  {string[]} specIds           factory ids from step specs
 * @param  {boolean}  hasDynamic
 * @param  {boolean}  hasGeometry
 * @param  {boolean}  includeTableRenderer
 * @returns {string[]}                  ordered file list
 */
function _buildFactoryManifest(specIds, hasDynamic, hasGeometry, includeTableRenderer) {
  var files = ['svg-stage.js', 'svg-factories.js'];

  if (hasDynamic) files.push('svg-factories-dynamic.js');
  if (hasGeometry) files.push('svg-factories-geometry.js');

  files.push('svg-registry.js');

  if (includeTableRenderer) files.push('table-renderer.js');

  return files;
}

/**
 * Builds the KaTeX CSS asset list for a lesson.
 * Order: core → symbols (if any equations) → fonts (always, cached once).
 *
 * katex-core.css   — layout and sizing rules (~15KB). Always loaded.
 * katex-symbols.css subsets — one per detected equation domain. Selective.
 * katex-fonts.css  — @font-face declarations (~80KB). Always loaded last,
 *   cached aggressively by the hub PWA so it is only transferred once.
 *
 * @param  {object} equationTypes   from flags.equation_types
 * @returns {string[]}              ordered CSS asset filenames
 */
function _buildKatexAssetList(equationTypes) {
  var assets = ['katex-core.css'];

  // One symbols file per active domain
  var domains = ['algebra', 'trig', 'calculus', 'physics', 'sets'];
  domains.forEach(function (domain) {
    if (equationTypes[domain]) {
      assets.push('katex-symbols-' + domain + '.css');
    }
  });

  // Fonts always last — browser can start rendering with core while fonts load
  assets.push('katex-fonts.css');

  return assets;
}


// ── Module exports ────────────────────────────────────────────────────────────

module.exports = {
  inferFeatures:         inferFeatures,
  // Exposed for testing and for html.js buildKatexAssetList call
  buildKatexAssetList:   _buildKatexAssetList,
  // Exposed for testing
  collectSpecFactoryIds: _collectSpecFactoryIds,
  buildFactoryManifest:  _buildFactoryManifest,
  // Constants exposed for factory-loader.js (Phase 3)
  FACTORY_LOAD_ORDER:    FACTORY_LOAD_ORDER,
  FACTORY_FILE_MAP:      FACTORY_FILE_MAP
};
