// src/utils/archetypeMatch.js
// AGNI Pedagogical Archetype Matching  v1.0.0
//
// Finds the best-fit archetype for a lesson and computes a coherence score.
// Two consumers:
//   1. Compiler (buildLessonIR) — attaches archetype + coherence to inferredFeatures
//   2. Theta / Navigator — uses coherence as a scoring signal
//
// Target: Node.js 14+ (compiler-side). Not loaded on the edge device.

'use strict';

const path = require('path');
const envConfig = require('./env-config');

// ── Dimension weights ────────────────────────────────────────────────────────
// How much each pedagogical dimension contributes to the coherence score.
// Sum = 1.0. Adjust if field studies show some dimensions are more predictive.
const WEIGHTS = {
  band:         0.22,
  protocol:     0.22,
  blooms:       0.16,
  vark:         0.18,
  teachingMode: 0.22
};

// Partial-credit map for teaching modes that are pedagogically adjacent.
// Keys: mode → array of related modes with credit fractions.
const RELATED_MODES = {
  socratic:         [{ mode: 'guided_discovery', credit: 0.5 }],
  guided_discovery: [{ mode: 'socratic', credit: 0.5 }, { mode: 'constructivist', credit: 0.4 }],
  didactic:         [{ mode: 'direct', credit: 0.6 }],
  direct:           [{ mode: 'didactic', credit: 0.6 }],
  constructivist:   [{ mode: 'narrative', credit: 0.4 }, { mode: 'guided_discovery', credit: 0.4 }],
  narrative:        [{ mode: 'constructivist', credit: 0.4 }]
};

// Bloom's adjacency: levels within 1 step get partial credit
const BLOOMS_ORDER = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'];

// ── Archetype data loading ───────────────────────────────────────────────────

let _archetypes = null;
let _archetypeMap = null;

function _loadArchetypes() {
  if (_archetypes) return _archetypes;
  var dataPath = path.join(envConfig.dataDir, 'archetypes.json');
  var data = require(dataPath);
  _archetypes = data.archetypes;
  _archetypeMap = {};
  _archetypes.forEach(function (a) { _archetypeMap[a.id] = a; });
  return _archetypes;
}

function getArchetypeById(id) {
  _loadArchetypes();
  return _archetypeMap[id] || null;
}

function getAllArchetypes() {
  return _loadArchetypes().slice();
}

// ── VARK cosine similarity ───────────────────────────────────────────────────

function _varkCosine(a, b) {
  if (!a || !b) return 0;
  var dims = ['visual', 'auditory', 'readWrite', 'kinesthetic'];
  var dot = 0, magA = 0, magB = 0;
  for (var i = 0; i < dims.length; i++) {
    var av = a[dims[i]] || 0;
    var bv = b[dims[i]] || 0;
    dot  += av * bv;
    magA += av * av;
    magB += bv * bv;
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

// ── Bloom's proximity ────────────────────────────────────────────────────────

function _bloomsProximity(lessonBlooms, archetypeBlooms) {
  if (!lessonBlooms || !archetypeBlooms || archetypeBlooms.length === 0) return 0;

  var label = typeof lessonBlooms === 'string'
    ? lessonBlooms.toLowerCase()
    : null;
  var level = typeof lessonBlooms === 'number' ? lessonBlooms : null;

  if (!label && level !== null) {
    label = BLOOMS_ORDER[level - 1] || null;
  }
  if (!label) return 0;

  if (archetypeBlooms.indexOf(label) !== -1) return 1.0;

  var lessonIdx = BLOOMS_ORDER.indexOf(label);
  if (lessonIdx === -1) return 0;

  var bestProximity = 0;
  for (var i = 0; i < archetypeBlooms.length; i++) {
    var archIdx = BLOOMS_ORDER.indexOf(archetypeBlooms[i]);
    if (archIdx === -1) continue;
    var distance = Math.abs(lessonIdx - archIdx);
    var proximity = distance === 1 ? 0.5 : (distance === 2 ? 0.15 : 0);
    if (proximity > bestProximity) bestProximity = proximity;
  }
  return bestProximity;
}

// ── Teaching mode scoring ────────────────────────────────────────────────────

function _teachingModeScore(lessonMode, archetypeModes) {
  if (!lessonMode || !archetypeModes || archetypeModes.length === 0) return 0;

  var mode = lessonMode.toLowerCase();
  if (archetypeModes.indexOf(mode) !== -1) return 1.0;

  var related = RELATED_MODES[mode] || [];
  for (var i = 0; i < related.length; i++) {
    if (archetypeModes.indexOf(related[i].mode) !== -1) {
      return related[i].credit;
    }
  }
  return 0;
}

// ── Core scoring ─────────────────────────────────────────────────────────────

/**
 * Compute the fit score between a lesson's features and a single archetype.
 *
 * @param {object} features  Normalized lesson features (see extractLessonFeatures)
 * @param {object} archetype An archetype object from data/archetypes.json
 * @returns {number} Score in [0, 1]
 */
function computeFitScore(features, archetype) {
  var score = 0;

  // Band match: full credit if in range, partial if within 1 band of boundary
  if (features.band != null) {
    if (features.band >= archetype.bandRange[0] && features.band <= archetype.bandRange[1]) {
      score += WEIGHTS.band;
    } else {
      var distToRange = Math.min(
        Math.abs(features.band - archetype.bandRange[0]),
        Math.abs(features.band - archetype.bandRange[1])
      );
      if (distToRange === 1) score += WEIGHTS.band * 0.3;
    }
  }

  // Protocol match
  if (features.protocol != null) {
    if (archetype.protocols.indexOf(features.protocol) !== -1) {
      score += WEIGHTS.protocol;
    } else {
      var minDist = Infinity;
      for (var i = 0; i < archetype.protocols.length; i++) {
        var d = Math.abs(features.protocol - archetype.protocols[i]);
        if (d < minDist) minDist = d;
      }
      if (minDist === 1) score += WEIGHTS.protocol * 0.3;
    }
  }

  // Bloom's
  var bloomsScore = _bloomsProximity(
    features.bloomsLabel || features.bloomsCeiling,
    archetype.blooms
  );
  score += WEIGHTS.blooms * bloomsScore;

  // VARK
  var varkScore = _varkCosine(features.vark, archetype.varkProfile);
  score += WEIGHTS.vark * varkScore;

  // Teaching mode
  var modeSource = features.teachingMode || features.teachingStyle || features.dominantTeachingStyle;
  var modeScore = _teachingModeScore(modeSource, archetype.teachingModes);
  score += WEIGHTS.teachingMode * modeScore;

  return Math.round(score * 1000) / 1000;
}

// ── Feature extraction ───────────────────────────────────────────────────────

/**
 * Extract normalized features from a lesson object for archetype matching.
 * Handles both raw OLS lesson objects and compiled IR/sidecar objects.
 *
 * @param {object} lesson  OLS lesson, LessonIR, or LessonSidecar
 * @returns {object}
 */
function extractLessonFeatures(lesson) {
  var meta = lesson.meta || lesson;
  var utu = meta.utu || lesson.utu || {};
  var declared = (meta.declared_features) || {};
  var inferred = lesson.inferredFeatures || {};

  return {
    band:     utu.band || null,
    protocol: utu.protocol || null,

    bloomsLabel:   declared.blooms_level || inferred.bloomsLabel || null,
    bloomsCeiling: inferred.bloomsCeiling || null,

    vark: (declared.vark && !Array.isArray(declared.vark))
      ? null
      : (inferred.vark || null),

    teachingMode:         meta.teaching_mode || lesson.teaching_mode || null,
    teachingStyle:        declared.teaching_style || null,
    dominantTeachingStyle: inferred.dominantTeachingStyle || null,

    stepTypes: Array.isArray(lesson.steps)
      ? lesson.steps.map(function (s) { return s.type || 'unknown'; })
      : null
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Find the best-fit archetype for a lesson and compute a coherence score.
 *
 * @param {object} lesson  OLS lesson, LessonIR, or LessonSidecar object
 * @returns {{ archetype: object|null, coherence: number, scores: object[] }}
 *   archetype:  best-matching archetype object (null if no data)
 *   coherence:  fit score × thetaModifier, in [0, ~1.38]
 *   scores:     all archetypes ranked by fit (for debugging/reporting)
 */
function findBestArchetype(lesson) {
  var archetypes = _loadArchetypes();
  var features = extractLessonFeatures(lesson);

  var scored = archetypes.map(function (arch) {
    var fit = computeFitScore(features, arch);
    return {
      id:        arch.id,
      name:      arch.name,
      fit:       fit,
      coherence: Math.round(fit * arch.thetaModifier * 1000) / 1000
    };
  });

  scored.sort(function (a, b) { return b.coherence - a.coherence; });

  var best = scored[0] || null;
  return {
    archetype:  best ? getArchetypeById(best.id) : null,
    coherence:  best ? best.coherence : 0,
    archetypeId: best ? best.id : null,
    scores:     scored
  };
}

/**
 * Validate a lesson's pedagogical coherence and return warnings.
 * Intended for use in the compiler pipeline (buildLessonIR) and governance.
 *
 * @param {object} lesson  OLS lesson object
 * @returns {{ archetypeId: string|null, coherence: number, warnings: string[] }}
 */
function validateCoherence(lesson) {
  var result = findBestArchetype(lesson);
  var warnings = [];

  if (result.coherence < 0.30) {
    warnings.push(
      'Low pedagogical coherence (' + result.coherence.toFixed(2) +
      '). This lesson\'s combination of UTU, Bloom\'s, VARK, and teaching mode ' +
      'does not match any recognized archetype well. Review the dimension settings.'
    );
  } else if (result.coherence < 0.50) {
    warnings.push(
      'Moderate pedagogical coherence (' + result.coherence.toFixed(2) +
      '). Best-fit archetype: "' + result.archetypeId +
      '". Consider adjusting dimensions for a tighter match.'
    );
  }

  var features = extractLessonFeatures(lesson);
  var arch = result.archetype;
  if (arch && features.band != null) {
    var bandOk = features.band >= arch.bandRange[0] && features.band <= arch.bandRange[1];
    if (!bandOk) {
      warnings.push(
        'UTU Band ' + features.band + ' is outside the expected range [' +
        arch.bandRange[0] + '-' + arch.bandRange[1] + '] for archetype "' + arch.id + '".'
      );
    }
  }

  if (arch && features.protocol != null) {
    if (arch.protocols.indexOf(features.protocol) === -1) {
      warnings.push(
        'UTU Protocol P' + features.protocol + ' is not typical for archetype "' + arch.id +
        '" (expected P' + arch.protocols.join('/P') + ').'
      );
    }
  }

  var modeSource = features.teachingMode || features.teachingStyle || features.dominantTeachingStyle;
  if (arch && modeSource) {
    var modeScore = _teachingModeScore(modeSource, arch.teachingModes);
    if (modeScore === 0) {
      warnings.push(
        'Teaching mode "' + modeSource + '" is not aligned with archetype "' + arch.id +
        '" (recommended: ' + arch.teachingModes.join(', ') + ').'
      );
    }
  }

  return {
    archetypeId: result.archetypeId,
    coherence:   result.coherence,
    warnings:    warnings
  };
}

/**
 * Get design hints for a given archetype. Used by the portal editor
 * and the lesson design prompt stack.
 *
 * @param {string} archetypeId
 * @returns {object|null} designHints object or null
 */
function getDesignHints(archetypeId) {
  var arch = getArchetypeById(archetypeId);
  return arch ? arch.designHints : null;
}

/**
 * Get recommended step pattern for a given archetype.
 *
 * @param {string} archetypeId
 * @returns {string[]|null}
 */
function getStepPattern(archetypeId) {
  var arch = getArchetypeById(archetypeId);
  return arch ? arch.stepPattern : null;
}

/**
 * Filter archetypes by UTU constraints. Useful for the portal editor
 * to show only relevant archetypes when the author has selected a band/protocol.
 *
 * @param {object} opts
 * @param {number} [opts.band]     UTU band
 * @param {number} [opts.protocol] UTU protocol
 * @returns {object[]} Matching archetypes sorted by relevance
 */
function filterArchetypes(opts) {
  opts = opts || {};
  var archetypes = _loadArchetypes();

  return archetypes.filter(function (arch) {
    if (opts.band != null) {
      if (opts.band < arch.bandRange[0] || opts.band > arch.bandRange[1]) return false;
    }
    if (opts.protocol != null) {
      if (arch.protocols.indexOf(opts.protocol) === -1) return false;
    }
    return true;
  });
}

// ── Reset (for testing) ──────────────────────────────────────────────────────

function _resetCache() {
  _archetypes = null;
  _archetypeMap = null;
}

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  findBestArchetype:     findBestArchetype,
  validateCoherence:     validateCoherence,
  extractLessonFeatures: extractLessonFeatures,
  computeFitScore:       computeFitScore,
  getDesignHints:        getDesignHints,
  getStepPattern:        getStepPattern,
  getArchetypeById:      getArchetypeById,
  getAllArchetypes:       getAllArchetypes,
  filterArchetypes:      filterArchetypes,
  _resetCache:           _resetCache
};
