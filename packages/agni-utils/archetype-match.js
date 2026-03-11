// packages/agni-utils/archetype-match.js
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
const WEIGHTS = {
  band:         0.22,
  protocol:     0.22,
  blooms:       0.16,
  vark:         0.18,
  teachingMode: 0.22
};

const RELATED_MODES = {
  socratic:         [{ mode: 'guided_discovery', credit: 0.5 }],
  guided_discovery: [{ mode: 'socratic', credit: 0.5 }, { mode: 'constructivist', credit: 0.4 }],
  didactic:         [{ mode: 'direct', credit: 0.6 }],
  direct:           [{ mode: 'didactic', credit: 0.6 }],
  constructivist:   [{ mode: 'narrative', credit: 0.4 }, { mode: 'guided_discovery', credit: 0.4 }],
  narrative:        [{ mode: 'constructivist', credit: 0.4 }]
};

const BLOOMS_ORDER = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'];

let _archetypes = null;
let _archetypeMap = null;

function _loadArchetypes() {
  if (_archetypes) return _archetypes;
  const dataPath = path.join(envConfig.dataDir, 'archetypes.json');
  const data = require(dataPath);
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

function _varkCosine(a, b) {
  if (!a || !b) return 0;
  const dims = ['visual', 'auditory', 'readWrite', 'kinesthetic'];
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < dims.length; i++) {
    const av = a[dims[i]] || 0;
    const bv = b[dims[i]] || 0;
    dot  += av * bv;
    magA += av * av;
    magB += bv * bv;
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function _bloomsProximity(lessonBlooms, archetypeBlooms) {
  if (!lessonBlooms || !archetypeBlooms || archetypeBlooms.length === 0) return 0;

  let label = typeof lessonBlooms === 'string'
    ? lessonBlooms.toLowerCase()
    : null;
  const level = typeof lessonBlooms === 'number' ? lessonBlooms : null;

  if (!label && level !== null) {
    label = BLOOMS_ORDER[level - 1] || null;
  }
  if (!label) return 0;

  if (archetypeBlooms.indexOf(label) !== -1) return 1.0;

  const lessonIdx = BLOOMS_ORDER.indexOf(label);
  if (lessonIdx === -1) return 0;

  let bestProximity = 0;
  for (let i = 0; i < archetypeBlooms.length; i++) {
    const archIdx = BLOOMS_ORDER.indexOf(archetypeBlooms[i]);
    if (archIdx === -1) continue;
    const distance = Math.abs(lessonIdx - archIdx);
    const proximity = distance === 1 ? 0.5 : (distance === 2 ? 0.15 : 0);
    if (proximity > bestProximity) bestProximity = proximity;
  }
  return bestProximity;
}

function _teachingModeScore(lessonMode, archetypeModes) {
  if (!lessonMode || !archetypeModes || archetypeModes.length === 0) return 0;

  const mode = lessonMode.toLowerCase();
  if (archetypeModes.indexOf(mode) !== -1) return 1.0;

  const related = RELATED_MODES[mode] || [];
  for (let i = 0; i < related.length; i++) {
    if (archetypeModes.indexOf(related[i].mode) !== -1) {
      return related[i].credit;
    }
  }
  return 0;
}

function computeFitScore(features, archetype) {
  let score = 0;

  if (features.band != null) {
    if (features.band >= archetype.bandRange[0] && features.band <= archetype.bandRange[1]) {
      score += WEIGHTS.band;
    } else {
      const distToRange = Math.min(
        Math.abs(features.band - archetype.bandRange[0]),
        Math.abs(features.band - archetype.bandRange[1])
      );
      if (distToRange === 1) score += WEIGHTS.band * 0.3;
    }
  }

  if (features.protocol != null) {
    if (archetype.protocols.indexOf(features.protocol) !== -1) {
      score += WEIGHTS.protocol;
    } else {
      let minDist = Infinity;
      for (let i = 0; i < archetype.protocols.length; i++) {
        const d = Math.abs(features.protocol - archetype.protocols[i]);
        if (d < minDist) minDist = d;
      }
      if (minDist === 1) score += WEIGHTS.protocol * 0.3;
    }
  }

  const bloomsScore = _bloomsProximity(
    features.bloomsLabel || features.bloomsCeiling,
    archetype.blooms
  );
  score += WEIGHTS.blooms * bloomsScore;

  const varkScore = _varkCosine(features.vark, archetype.modalityWeighting);
  score += WEIGHTS.vark * varkScore;

  const modeSource = features.teachingMode || features.teachingStyle || features.dominantTeachingStyle;
  const modeScore = _teachingModeScore(modeSource, archetype.teachingModes);
  score += WEIGHTS.teachingMode * modeScore;

  return Math.round(score * 1000) / 1000;
}

function extractLessonFeatures(lesson) {
  const meta = lesson.meta || lesson;
  const utu = meta.utu || lesson.utu || {};
  const declared = (meta.declared_features) || {};
  const inferred = lesson.inferredFeatures || {};

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

function findBestArchetype(lesson) {
  const archetypes = _loadArchetypes();
  const features = extractLessonFeatures(lesson);

  const scored = archetypes.map(function (arch) {
    const fit = computeFitScore(features, arch);
    return {
      id:        arch.id,
      name:      arch.name,
      fit:       fit,
      coherence: Math.round(fit * arch.thetaModifier * 1000) / 1000
    };
  });

  scored.sort(function (a, b) { return b.coherence - a.coherence; });

  const best = scored[0] || null;
  return {
    archetype:  best ? getArchetypeById(best.id) : null,
    coherence:  best ? best.coherence : 0,
    archetypeId: best ? best.id : null,
    scores:     scored
  };
}

function validateCoherence(lesson) {
  const result = findBestArchetype(lesson);
  const warnings = [];

  if (result.coherence < 0.30) {
    warnings.push(
      'Low pedagogical coherence (' + result.coherence.toFixed(2) +
      '). This lesson\'s combination of UTU, Bloom\'s, modality weighting, and teaching mode ' +
      'does not match any recognized archetype well. Review the dimension settings.'
    );
  } else if (result.coherence < 0.50) {
    warnings.push(
      'Moderate pedagogical coherence (' + result.coherence.toFixed(2) +
      '). Best-fit archetype: "' + result.archetypeId +
      '". Consider adjusting dimensions for a tighter match.'
    );
  }

  const features = extractLessonFeatures(lesson);
  const arch = result.archetype;
  if (arch && features.band != null) {
    const bandOk = features.band >= arch.bandRange[0] && features.band <= arch.bandRange[1];
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

  const modeSource = features.teachingMode || features.teachingStyle || features.dominantTeachingStyle;
  if (arch && modeSource) {
    const modeScore = _teachingModeScore(modeSource, arch.teachingModes);
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

function getDesignHints(archetypeId) {
  const arch = getArchetypeById(archetypeId);
  return arch ? arch.designHints : null;
}

function getStepPattern(archetypeId) {
  const arch = getArchetypeById(archetypeId);
  return arch ? arch.stepPattern : null;
}

function filterArchetypes(opts) {
  opts = opts || {};
  const archetypes = _loadArchetypes();

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

function _resetCache() {
  _archetypes = null;
  _archetypeMap = null;
}

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
