// packages/agni-utils/feature-inference.js
// AGNI Feature Inference  v1.9.0
// Analyses a parsed OLS lesson object and produces inferredFeatures.
// See src/utils/feature-inference.js for full documentation.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const runtimeManifest = require('./runtimeManifest');
const FACTORY_LOAD_ORDER = runtimeManifest.FACTORY_LOAD_ORDER;
const FACTORY_FILE_MAP  = runtimeManifest.FACTORY_FILE_MAP;

const EQUATION_TYPE_PATTERNS = {
  trig:     /\\(sin|cos|tan|sec|csc|cot|arcsin|arccos|arctan|theta|phi|psi)\b/,
  calculus: /\\(int|sum|prod|lim|partial|nabla|infty|frac\s*\{[^}]*d[a-z])/,
  physics:  /\\(vec|hat|dot|times|cdot|hbar|Delta|Sigma|Omega|mu|lambda|rho|epsilon|sigma|omega)\b/,
  sets:     /\\(in|notin|subset|cup|cap|emptyset|forall|exists|neg|wedge|vee|mathbb)\b/
};

const STATIC_VISUAL_PATTERNS = [
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

const DYNAMIC_VISUAL_PATTERNS = [
  /\bnumberLineDynamic\b/i,
  /\bclockFaceDynamic\b/i,
  /\btimeGraph\b|\btime.graph\b/i,
  /\barrowMap\b|\barrow.map\b/i,
  /\bcompose\b/i
];

const GEOMETRY_PATTERNS = [
  /\bpolygonDynamic\b/i,
  /\bcartesianGrid\b|\bcartesian.grid\b/i,
  /\bunitCircle\b|\bunit.circle\b/i
];

const SENSOR_PATTERNS = [
  /\baccel\b/i, /\baccelerometer\b/i,
  /\bgyro\b/i, /\bgyroscope\b/i,
  /\brotation\b/i, /\borientation\b/i,
  /hardware_trigger/i,
  /\bmotion\b/i, /\bshake\b/i,
  /\bfreefall\b|\bfree.fall\b/i,
  /\btilt\b/i
];

const TEACHING_STYLE_PATTERNS = {
  constructivist: /\bexplore\b|\bdiscover\b|\binvestigate\b|\bhypothesi[sz]e\b|\bexperiment\b/i,
  direct:         /\blearn\b|\bstudy\b|\bunderstand\b|\bremember\b|\bmemorize\b/i,
  socratic:       /\bwhy\b|\bhow\b|\bwhat if\b|\bwould\b.*\?|\bcould\b.*\?|\bdo you\b.*\?/i,
  narrative:      /\bstory\b|\bonce\b|\bimagine\b|\bpicture\b|\bjourney\b|\bcharacter\b/i
};

const VARK_PATTERNS = {
  visual:      /\bdiagram\b|\bchart\b|\bgraph\b|\bfigure\b|\bshow\b|\bvisual\b|\bdraw\b|\billustrat/i,
  auditory:    /\blisten\b|\bsound\b|\bnote\b|\btone\b|\brhythm\b|\bbeat\b|\bsing\b/i,
  readWrite:   /\bread\b|\bwrite\b|\blist\b|\btable\b|\bword\b|\bdefinit\b|\btext\b/i,
  kinesthetic: /\bhold\b|\bmove\b|\btouch\b|\bfeel\b|\bpick up\b|\bdrop\b|\bshake\b|\bplace\b|\btilt\b/i
};

const BLOOMS_PATTERNS = [
  { level: 1, label: 'remember',   re: /\bidentify\b|\brecall\b|\bname\b|\blist\b|\bstate\b|\bdefine\b/i },
  { level: 2, label: 'understand', re: /\bexplain\b|\bdescribe\b|\bsummarise\b|\bclassify\b|\binterpret\b/i },
  { level: 3, label: 'apply',      re: /\buse\b|\bsolve\b|\bcalculate\b|\bdemonstr\b|\bapply\b/i },
  { level: 4, label: 'analyse',    re: /\bcompare\b|\bcontrast\b|\banalyse\b|\bdistinguish\b|\bexamine\b/i },
  { level: 5, label: 'evaluate',   re: /\bjudge\b|\bcritique\b|\bassess\b|\bdefend\b|\bjustify\b/i },
  { level: 6, label: 'create',     re: /\bdesign\b|\bconstruct\b|\bcompose\b|\bformulate\b|\bcreate\b/i }
];

function _collectAllText(steps, meta) {
  let allContent = steps.map(function (s) {
    return [s.content, s.title, s.label, s.feedback,
            JSON.stringify(s.spec || ''),
            JSON.stringify(s.svg_spec || ''),
            JSON.stringify(s.threshold || '')
           ].filter(Boolean).join(' ');
  }).join(' ');
  allContent += ' ' + [meta.title, meta.description, meta.tags].filter(Boolean).join(' ');
  return allContent;
}

function _detectCapabilityFlags(steps, allContent) {
  const hasEquations = /\$[^$]+\$|\$\$[\s\S]+?\$\$/.test(allContent);
  const hasSensors   = steps.some(function (s) { return s.type === 'hardware_trigger'; }) ||
                     SENSOR_PATTERNS.some(function (p) { return p.test(allContent); });
  const hasTables    = /\|.+\|/.test(allContent);

  const specFactoryIds = _collectSpecFactoryIds(steps);
  const hasStaticVisuals  = !!specFactoryIds.length ||
    STATIC_VISUAL_PATTERNS.some(function (p) { return p.test(allContent); });
  const hasDynamicVisuals = specFactoryIds.some(function (id) {
    return runtimeManifest.getFileForFactoryId(id) === 'svg-factories-dynamic.js';
  }) || DYNAMIC_VISUAL_PATTERNS.some(function (p) { return p.test(allContent); });
  const hasGeometryVisuals = specFactoryIds.some(function (id) {
    return runtimeManifest.getFileForFactoryId(id) === 'svg-factories-geometry.js';
  }) || GEOMETRY_PATTERNS.some(function (p) { return p.test(allContent); });
  const hasVisuals = hasStaticVisuals || hasDynamicVisuals || hasGeometryVisuals;

  return {
    hasEquations: hasEquations, hasSensors: hasSensors, hasTables: hasTables,
    hasStaticVisuals: hasStaticVisuals, hasDynamicVisuals: hasDynamicVisuals,
    hasGeometryVisuals: hasGeometryVisuals, hasVisuals: hasVisuals,
    specFactoryIds: specFactoryIds
  };
}

function _detectEquationTypes(allContent, hasEquations) {
  const equationTypes = {
    algebra: false, trig: false, calculus: false, physics: false, sets: false
  };
  if (hasEquations) {
    let anySpecific = false;
    Object.keys(EQUATION_TYPE_PATTERNS).forEach(function (type) {
      if (EQUATION_TYPE_PATTERNS[type].test(allContent)) {
        equationTypes[type] = true;
        anySpecific = true;
      }
    });
    if (!anySpecific) equationTypes.algebra = true;
  }
  return equationTypes;
}

function _profileVARK(allContent) {
  const vark = { visual: 0, auditory: 0, readWrite: 0, kinesthetic: 0 };
  let totalMatches = 0;
  Object.keys(VARK_PATTERNS).forEach(function (k) {
    const matches = allContent.match(new RegExp(VARK_PATTERNS[k].source, 'gi'));
    const count = matches ? matches.length : 0;
    vark[k] = count;
    totalMatches += count;
  });
  const wordCount = allContent.split(/\s+/).length || 1;
  vark.matchDensity = totalMatches / wordCount;
  return vark;
}

function _detectBloomsCeiling(allContent) {
  let ceiling = 1;
  let label   = 'remember';
  let matchCount = 0;
  BLOOMS_PATTERNS.forEach(function (b) {
    const matches = allContent.match(new RegExp(b.re.source, 'gi'));
    if (matches) {
      matchCount += matches.length;
      if (b.level > ceiling) {
        ceiling = b.level;
        label   = b.label;
      }
    }
  });
  const wordCount = allContent.split(/\s+/).length || 1;
  return { bloomsCeiling: ceiling, bloomsLabel: label, matchDensity: matchCount / wordCount };
}

function _detectTeachingStyle(allContent) {
  const scores = {};
  let totalMatches = 0;
  Object.keys(TEACHING_STYLE_PATTERNS).forEach(function (style) {
    const matches = allContent.match(new RegExp(TEACHING_STYLE_PATTERNS[style].source, 'gi'));
    const count = matches ? matches.length : 0;
    scores[style] = count;
    totalMatches += count;
  });
  const dominant = Object.keys(scores).reduce(function (best, k) {
    return scores[k] > scores[best] ? k : best;
  }, 'direct');
  const wordCount = allContent.split(/\s+/).length || 1;
  return { style: dominant, scores: scores, matchDensity: totalMatches / wordCount };
}

function _computeConfidence(matchDensity) {
  if (typeof matchDensity !== 'number' || isNaN(matchDensity)) return 0.5;
  return Math.min(1, Math.max(0, Math.round(matchDensity * 100) / 100));
}

function _collectSpecFactoryIds(steps) {
  const seen = {};
  const ids  = [];

  function collectFromSpec(spec) {
    if (!spec) return;
    if (spec.factory && runtimeManifest.getFileForFactoryId(spec.factory)) {
      if (!seen[spec.factory]) { ids.push(spec.factory); seen[spec.factory] = true; }
    }
    if (spec.compose && Array.isArray(spec.layers)) {
      spec.layers.forEach(function (layer) {
        const fid = layer.factory;
        if (fid && runtimeManifest.getFileForFactoryId(fid) && !seen[fid]) {
          ids.push(fid);
          seen[fid] = true;
        }
      });
    }
  }

  steps.forEach(function (step) {
    collectFromSpec(step.spec);
    collectFromSpec(step.svg_spec);
  });
  return ids;
}

function _buildFactoryManifest(hasDynamic, hasGeometry, includeTableRenderer, includeSensorBridge) {
  return runtimeManifest.getOrderedFactoryFiles({
    hasDynamic: hasDynamic,
    hasGeometry: hasGeometry,
    includeTableRenderer: includeTableRenderer,
    includeSensorBridge: includeSensorBridge
  });
}

function _buildKatexAssetList(equationTypes) {
  const assets  = ['katex-core.css'];
  const domains = ['algebra', 'trig', 'calculus', 'physics', 'sets'];
  domains.forEach(function (domain) {
    if (equationTypes[domain]) assets.push('katex-symbols-' + domain + '.css');
  });
  assets.push('katex-fonts.css');
  return assets;
}

function inferFeatures(lessonData) {
  const steps = lessonData.steps || [];
  const meta  = lessonData.meta  || {};

  const allContent = _collectAllText(steps, meta);
  const caps       = _detectCapabilityFlags(steps, allContent);
  const eqTypes    = _detectEquationTypes(allContent, caps.hasEquations);
  const katexAssets = caps.hasEquations ? _buildKatexAssetList(eqTypes) : [];

  const needsSensorBridge = caps.hasVisuals || caps.hasSensors;
  const factoryManifest = caps.hasVisuals
    ? _buildFactoryManifest(caps.hasDynamicVisuals, caps.hasGeometryVisuals,
        caps.hasTables && caps.hasVisuals, needsSensorBridge)
    : (caps.hasSensors ? ['sensor-bridge.js'] : []);

  const vark   = _profileVARK(allContent);
  const blooms = _detectBloomsCeiling(allContent);
  const dominantStyle = _detectTeachingStyle(allContent);

  const stepTypeCounts = {};
  steps.forEach(function (s) {
    const t = s.type || 'unknown';
    stepTypeCounts[t] = (stepTypeCounts[t] || 0) + 1;
  });

  const difficulty = (typeof lessonData.difficulty === 'number')
    ? lessonData.difficulty
    : Math.max(1, Math.min(5, blooms.bloomsCeiling));

  var features = {
    flags: {
      has_equations:       caps.hasEquations,
      equation_types:      eqTypes,
      has_sensors:         caps.hasSensors,
      has_tables:          caps.hasTables,
      has_static_visuals:  caps.hasStaticVisuals,
      has_dynamic_visuals: caps.hasDynamicVisuals,
      has_geometry:        caps.hasGeometryVisuals,
      has_visuals:         caps.hasVisuals
    },
    katexAssets:      katexAssets,
    factoryManifest:  factoryManifest,
    vark:             vark,
    bloomsCeiling:    blooms.bloomsCeiling,
    bloomsLabel:      blooms.bloomsLabel,
    dominantTeachingStyle: dominantStyle.style,
    stepTypeCounts:   stepTypeCounts,
    difficulty:       difficulty
  };

  var metadataSource = lessonData.metadata_source || 'inferred';
  var featureSources = {};
  var confidence = {};

  confidence.blooms = _computeConfidence(blooms.matchDensity);
  confidence.vark = _computeConfidence(vark.matchDensity);
  confidence.teachingStyle = _computeConfidence(dominantStyle.matchDensity);

  featureSources.blooms = 'inferred';
  featureSources.vark = 'inferred';
  featureSources.teachingStyle = 'inferred';

  var declared = meta.declared_features;
  if (declared && typeof declared === 'object') {
    metadataSource = 'mixed';

    if (declared.blooms_level) {
      features.bloomsLabel = declared.blooms_level;
      var bloomsMap = { remember: 1, understand: 2, apply: 3, analyze: 4, evaluate: 5, create: 6 };
      var normalised = String(declared.blooms_level).toLowerCase();
      if (bloomsMap[normalised]) features.bloomsCeiling = bloomsMap[normalised];
      featureSources.blooms = 'declared';
      confidence.blooms = 1.0;
    }

    if (declared.vark) {
      var declaredVark = Array.isArray(declared.vark) ? declared.vark : [declared.vark];
      features.vark = Object.assign({}, vark, { dominant: declaredVark });
      featureSources.vark = 'declared';
      confidence.vark = 1.0;
    }

    if (declared.teaching_style) {
      features.dominantTeachingStyle = declared.teaching_style;
      featureSources.teachingStyle = 'declared';
      confidence.teachingStyle = 1.0;
    }
  }

  features.confidence = confidence;
  features.featureSources = featureSources;

  return {
    inferredFeatures: features,
    metadata_source: metadataSource
  };
}

module.exports = {
  inferFeatures:         inferFeatures,
  buildKatexAssetList:   _buildKatexAssetList,
  collectSpecFactoryIds: _collectSpecFactoryIds,
  buildFactoryManifest:  _buildFactoryManifest,
  FACTORY_LOAD_ORDER:    FACTORY_LOAD_ORDER,
  FACTORY_FILE_MAP:      FACTORY_FILE_MAP
};
