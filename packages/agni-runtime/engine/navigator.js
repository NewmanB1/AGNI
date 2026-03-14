// packages/agni-runtime/engine/navigator.js

/**
 * AGNI Adaptive Navigation Engine v2.2
 *
 * Calculates the "Marginal Learning Cost" (Theta / θ) for a list of lessons.
 * Orders content based on two factors:
 *   1. The Global Knowledge Graph (Prerequisites & Skill Transfer)
 *   2. The Local Learner Profile (Pedagogical Fit & Learning Style)
 *
 * Environment: Isomorphic (Node.js & Browser)
 * Browser target: ES5 strict — must run on Android 7.0 Nougat (Chrome 51).
 * No let/const, no arrow functions, no template literals,
 * no for...of, no spread, no Set/Map, no Object.assign.
 */

'use strict';

// ES5-safe helpers
function _assign(target) {
    for (var i = 1; i < arguments.length; i++) {
        var src = arguments[i];
        if (src) { for (var k in src) { if (src.hasOwnProperty(k)) target[k] = src[k]; } }
    }
    return target;
}
function _getOpt(obj, key) { return obj ? obj[key] : undefined; }
function _indexOf(arr, val) { for (var i = 0; i < arr.length; i++) { if (arr[i] === val) return i; } return -1; }
function _arrayMin(arr) { var m = arr[0]; for (var i = 1; i < arr.length; i++) { if (arr[i] < m) m = arr[i]; } return m; }
function _arrayMax(arr) { var m = arr[0]; for (var i = 1; i < arr.length; i++) { if (arr[i] > m) m = arr[i]; } return m; }
function _objValues(obj) { var r = []; for (var k in obj) { if (obj.hasOwnProperty(k)) r.push(obj[k]); } return r; }

// Teaching mode partial-credit map (shared with archetypeMatch.js via import)
var RELATED_MODES = {
    socratic: ['guided_discovery'],
    guided_discovery: ['socratic', 'constructivist'],
    didactic: ['direct'],
    direct: ['didactic'],
    constructivist: ['narrative', 'guided_discovery'],
    narrative: ['constructivist']
};

// ============================================================================
// Constants & Configuration
// ============================================================================

var CONFIG = {
    WEIGHT_GRAPH: 0.6,
    WEIGHT_STYLE: 0.4,
    WEIGHT_COHERENCE: 0.08,
    MIN_THETA: 0.05,
    MASTERY_THRESHOLD: 0.6
};

// ============================================================================
// Helper: Pedagogical Vector Calculation
// ============================================================================

/**
 * Calculates a "Style Affinity" score (-1.0 to 1.0) for a specific feature tag.
 *
 * @param {string} feature
 * @param {Array} userLog
 * @returns {number}
 */
function calculateFeatureAffinity(feature, userLog) {
    var totalImpact = 0;
    var count = 0;

    userLog.forEach(function (entry) {
        var entryFeatures = entry.features || [];

        if (_indexOf(entryFeatures, feature) !== -1) {
            var scoreImpact = (entry.score || 0) * 2 - 1;
            var paceVal = entry.pace || 1.0;
            if (paceVal > 2.0) paceVal = 2.0;
            var paceImpact = (1.0 - paceVal) * 0.5;

            totalImpact += (scoreImpact + paceImpact);
            count++;
        }
    });

    if (count === 0) return 0;
    var result = totalImpact / count;
    if (result > 1) result = 1;
    if (result < -1) result = -1;
    return result;
}

// ============================================================================
// Main Logic
// ============================================================================

/**
 * Sorts lessons by Marginal Learning Cost (θ).
 * Lower θ = Easier/Better fit for this specific user.
 *
 * @param {Array} availableLessons
 * @param {Array} userLog
 * @param {Object} graphWeights
 * @returns {Array}
 */
function sortLessons(availableLessons, userLog, graphWeights) {
    // 1. Extract Mastered Skills as an object-set for O(1) lookup
    var masteredSkills = {};
    userLog.forEach(function (l) {
        if ((l.score || 0) >= CONFIG.MASTERY_THRESHOLD && l.skillId) {
            masteredSkills[l.skillId] = true;
        }
    });
    var masteredList = [];
    for (var mk in masteredSkills) {
        if (masteredSkills.hasOwnProperty(mk)) masteredList.push(mk);
    }

    // 2. Build User Pedagogical Profile
    var allUserFeaturesObj = {};
    userLog.forEach(function (l) {
        var feats = l.features || [];
        for (var fi = 0; fi < feats.length; fi++) { allUserFeaturesObj[feats[fi]] = true; }
    });
    var userAffinities = {};
    for (var tag in allUserFeaturesObj) {
        if (allUserFeaturesObj.hasOwnProperty(tag)) {
            userAffinities[tag] = calculateFeatureAffinity(tag, userLog);
        }
    }

    // 2b. VARK profile
    var studentVark = buildStudentVarkProfile(userLog);

    // Pre-build edge lookup map: "source->target" → edge  (S3.8 perf fix)
    var edgeMap = {};
    if (graphWeights && Array.isArray(graphWeights.edges)) {
        for (var ei = 0; ei < graphWeights.edges.length; ei++) {
            var e = graphWeights.edges[ei];
            edgeMap[e.from + '->' + e.to] = e;
        }
    }

    // 3. Score Every Candidate Lesson
    var scoredLessons = availableLessons.map(function (lesson) {
        var difficulty = lesson.difficulty || 3;
        var baseCost = difficulty / 5.0;

        // --- B. Graph Discount via edge Map (O(targets × mastered) with O(1) lookup) ---
        var graphDiscount = 0.0;
        var strongestEdge = null;

        var ont = lesson.ontology || {};
        var reqSkills = (ont.requires || []).map(function (r) { return r.skill; });
        var provSkills = (ont.provides || []).map(function (p) { return p.skill; });
        var targetSkills = reqSkills.concat(provSkills);

        for (var ti = 0; ti < targetSkills.length; ti++) {
            var target = targetSkills[ti];
            for (var mi = 0; mi < masteredList.length; mi++) {
                var source = masteredList[mi];
                var edge = edgeMap[source + '->' + target];
                if (edge) {
                    var transferBenefit = 1.0 - edge.weight;
                    var discount = transferBenefit * (edge.confidence || 0.5);
                    if (discount > graphDiscount) {
                        graphDiscount = discount;
                        strongestEdge = source + '->' + target;
                    }
                }
            }
        }

        // --- C. Style Bonus ---
        var styleBonus = 0;
        var lessonFeatures = [];

        if (lesson.inferredFeatures) {
            var sensors = lesson.inferredFeatures.sensors_used;
            if (sensors) {
                for (var si = 0; si < sensors.length; si++) lessonFeatures.push(sensors[si]);
            }
            if (lesson.inferredFeatures.has_haptic_feedback) lessonFeatures.push('haptic');
            if (lesson.inferredFeatures.has_graphs) lessonFeatures.push('visual');
            if (lesson.inferredFeatures.has_audio) lessonFeatures.push('audio');
            if ((lesson.inferredFeatures.interactive_elements_count || 0) > 0) {
                lessonFeatures.push('interactive');
            } else {
                lessonFeatures.push('passive');
            }
        }

        if (lessonFeatures.length > 0) {
            var totalAffinity = 0;
            for (var li = 0; li < lessonFeatures.length; li++) {
                totalAffinity += (userAffinities[lessonFeatures[li]] || 0);
            }
            styleBonus = totalAffinity / lessonFeatures.length;
        }

        // --- D. VARK Alignment ---
        var lessonVark = lesson.inferredFeatures ? lesson.inferredFeatures.vark : null;
        var varkBonus = varkAlignmentBonus(studentVark, lessonVark);

        // --- E. Bloom's Progression ---
        var lessonBlooms = lesson.inferredFeatures ? lesson.inferredFeatures.bloomsCeiling : 0;
        var bloomsBonus = bloomsProgressionBonus(lessonBlooms, userLog);

        // --- F. Archetype Coherence ---
        var coherenceRaw = lesson.inferredFeatures ? lesson.inferredFeatures.coherence : 0;
        var coherenceBonus = (typeof coherenceRaw === 'number' && coherenceRaw > 0)
            ? coherenceRaw * CONFIG.WEIGHT_COHERENCE
            : 0;

        // --- G. Final Theta Calculation ---
        var theta = baseCost
            - (graphDiscount * CONFIG.WEIGHT_GRAPH)
            - (styleBonus * CONFIG.WEIGHT_STYLE)
            - varkBonus
            - bloomsBonus
            - coherenceBonus;

        if (theta < CONFIG.MIN_THETA) theta = CONFIG.MIN_THETA;

        return _assign({}, lesson, {
            _score: {
                theta: parseFloat(theta.toFixed(3)),
                components: {
                    base: parseFloat(baseCost.toFixed(2)),
                    graphDiscount: parseFloat(graphDiscount.toFixed(2)),
                    styleBonus: parseFloat(styleBonus.toFixed(2)),
                    varkBonus: parseFloat(varkBonus.toFixed(2)),
                    bloomsBonus: parseFloat(bloomsBonus.toFixed(2)),
                    coherenceBonus: parseFloat(coherenceBonus.toFixed(3))
                },
                debug: {
                    features: lessonFeatures,
                    affinity: styleBonus > 0.1 ? 'High Match' : (styleBonus < -0.1 ? 'Mismatch' : 'Neutral'),
                    strongestEdge: strongestEdge,
                    bloomsCeiling: lessonBlooms,
                    vark: lessonVark,
                    archetypeId: lesson.inferredFeatures ? lesson.inferredFeatures.archetypeId : null
                }
            }
        });
    });

    // 4. Sort Ascending (Lowest Theta = Best)
    return scoredLessons.sort(function (a, b) { return a._score.theta - b._score.theta; });
}

// ============================================================================
// VARK-Aware Selection
// ============================================================================

var VARK_DIMS = ['visual', 'auditory', 'readWrite', 'kinesthetic'];

/**
 * Build a student VARK profile from performance history.
 * @param {Array} userLog
 * @returns {{ visual: number, auditory: number, readWrite: number, kinesthetic: number }}
 */
function buildStudentVarkProfile(userLog) {
    var profile = { visual: 0, auditory: 0, readWrite: 0, kinesthetic: 0 };
    var counts  = { visual: 0, auditory: 0, readWrite: 0, kinesthetic: 0 };

    userLog.forEach(function (entry) {
        var vark = entry.vark;
        if (!vark) return;
        var score = entry.score || 0;
        var weight = score > CONFIG.MASTERY_THRESHOLD ? score : score * 0.5;

        for (var di = 0; di < VARK_DIMS.length; di++) {
            var dim = VARK_DIMS[di];
            if (vark[dim] > 0) {
                profile[dim] += weight * vark[dim];
                counts[dim] += vark[dim];
            }
        }
    });

    /** @type {{ visual: number, auditory: number, readWrite: number, kinesthetic: number }} */
    var result = { visual: 0, auditory: 0, readWrite: 0, kinesthetic: 0 };
    for (var di = 0; di < VARK_DIMS.length; di++) {
        var dim = VARK_DIMS[di];
        result[dim] = counts[dim] > 0 ? profile[dim] / counts[dim] : 0;
    }
    return result;
}

/**
 * Calculate VARK alignment bonus.
 * @param {{ visual, auditory, readWrite, kinesthetic }} studentVark
 * @param {{ visual, auditory, readWrite, kinesthetic }} lessonVark
 * @returns {number} Bonus in [-0.15, +0.15]
 */
function varkAlignmentBonus(studentVark, lessonVark) {
    if (!studentVark || !lessonVark) return 0;

    var sTotal = 0, lTotal = 0;
    for (var i = 0; i < VARK_DIMS.length; i++) {
        sTotal += (studentVark[VARK_DIMS[i]] || 0);
        lTotal += (lessonVark[VARK_DIMS[i]] || 0);
    }
    if (sTotal === 0 || lTotal === 0) return 0;

    var dotProduct = 0;
    for (var j = 0; j < VARK_DIMS.length; j++) {
        var d = VARK_DIMS[j];
        var sNorm = (studentVark[d] || 0) / sTotal;
        var lNorm = (lessonVark[d] || 0) / lTotal;
        dotProduct += sNorm * lNorm;
    }

    return (dotProduct - 0.25) * 0.2;
}

// ============================================================================
// Bloom's Taxonomy Progression
// ============================================================================

/**
 * Calculate a Bloom's progression bonus.
 * @param {number} lessonBloomsCeiling
 * @param {Array} userLog
 * @returns {number} Bonus in [-0.1, +0.1]
 */
function bloomsProgressionBonus(lessonBloomsCeiling, userLog) {
    if (!lessonBloomsCeiling || userLog.length === 0) return 0;

    var totalBlooms = 0;
    var countBlooms = 0;
    userLog.forEach(function (entry) {
        if ((entry.score || 0) >= CONFIG.MASTERY_THRESHOLD && entry.bloomsCeiling) {
            totalBlooms += entry.bloomsCeiling;
            countBlooms++;
        }
    });

    if (countBlooms === 0) return 0;
    var avgBlooms = totalBlooms / countBlooms;

    var idealNext = Math.min(6, avgBlooms + 1);
    var distance = Math.abs(lessonBloomsCeiling - idealNext);

    if (distance <= 0.5) return 0.1;
    if (distance <= 1.0) return 0.05;
    if (distance <= 2.0) return 0;
    return -0.05;
}

// ============================================================================
// Teaching Mode + UTU Coordinate Filtering
// ============================================================================

/**
 * Filter and re-weight lessons based on teaching_mode and UTU spine alignment.
 *
 * @param {Array} scoredLessons
 * @param {object} opts
 * @returns {Array}
 */
function applyTeachingModeFilter(scoredLessons, opts) {
    opts = opts || {};
    var mode = opts.teachingMode;
    var spine = opts.utuSpine;
    var protocol = opts.utuProtocol;

    if (!mode && !spine && !protocol) return scoredLessons;

    return scoredLessons.map(function (lesson) {
        var bonus = 0;

        if (mode && lesson.teaching_mode) {
            if (lesson.teaching_mode === mode) {
                bonus += 0.15;
            } else {
                var related = RELATED_MODES[mode] || [];
                if (_indexOf(related, lesson.teaching_mode) !== -1) bonus += 0.05;
                else bonus -= 0.05;
            }
        }

        if (spine && lesson.ontology) {
            var provides = lesson.ontology.provides || [];
            var requires = lesson.ontology.requires || [];
            var allSkills = provides.concat(requires);
            var hasSpine = allSkills.some(function (s) {
                return s.skill && s.skill.indexOf(spine) === 0;
            });
            if (hasSpine) bonus += 0.1;
        }

        if (protocol && lesson.utu_protocol) {
            if (lesson.utu_protocol === protocol) bonus += 0.08;
        }

        var adjustedTheta = Math.max(CONFIG.MIN_THETA, lesson._score.theta - bonus);
        return _assign({}, lesson, {
            _score: _assign({}, lesson._score, {
                theta: parseFloat(adjustedTheta.toFixed(3)),
                components: _assign({}, lesson._score.components, {
                    teachingModeBonus: parseFloat(bonus.toFixed(2))
                })
            })
        });
    }).sort(function (a, b) { return a._score.theta - b._score.theta; });
}

// ============================================================================
// Markov Transition Model (client-side)
// ============================================================================

/**
 * Lightweight client-side Markov transition scoring.
 *
 * @param {Array} candidates
 * @param {string[]} recentLessons
 * @param {Object} transitionTable
 * @returns {Object.<string, { prob: number, quality: number }>}
 */
function scoreMarkovTransitions(candidates, recentLessons, transitionTable) {
    if (!transitionTable || !recentLessons || recentLessons.length === 0) return {};

    var RECENCY_DECAY = 0.7;
    /** @type {Record<string, { prob: number, quality: number }>} */
    var scores = {};

    candidates.forEach(function (lesson) {
        var lid = lesson.identifier || _getOpt(lesson.meta, 'identifier') || '';
        var totalWeight = 0;
        var weightedProb = 0;
        var weightedGain = 0;

        for (var i = recentLessons.length - 1; i >= 0; i--) {
            var stepsBack = recentLessons.length - 1 - i;
            var recency = Math.pow(RECENCY_DECAY, stepsBack);
            var from = recentLessons[i];
            var edges = transitionTable[from];
            if (!edges || !edges[lid]) continue;

            weightedProb += recency * edges[lid].prob;
            weightedGain += recency * edges[lid].avgGain;
            totalWeight += recency;
        }

        if (totalWeight > 0) {
            scores[lid] = {
                prob: weightedProb / totalWeight,
                quality: weightedGain / totalWeight
            };
        }
    });

    return scores;
}

// ============================================================================
// PageRank Authority (client-side)
// ============================================================================

/**
 * Lightweight PageRank computation for the client.
 *
 * @param {string[]} nodes
 * @param {Object.<string, string[]>} edges
 * @param {object} [opts]
 * @returns {Object.<string, number>}
 */
function computeClientPageRank(nodes, edges, opts) {
    opts = opts || {};
    var d = opts.damping || 0.85;
    var maxIter = opts.maxIter || 50;
    var N = nodes.length;
    if (N === 0) return {};

    var idx = {};
    for (var ni = 0; ni < N; ni++) { idx[nodes[ni]] = ni; }

    var rank = [];
    for (var ri = 0; ri < N; ri++) rank[ri] = 1.0 / N;

    for (var iter = 0; iter < maxIter; iter++) {
        var next = [];
        for (var xi = 0; xi < N; xi++) next[xi] = (1 - d) / N;

        for (var s = 0; s < N; s++) {
            var outs = edges[nodes[s]] || [];
            if (outs.length === 0) {
                var share = d * rank[s] / N;
                for (var dn = 0; dn < N; dn++) next[dn] += share;
            } else {
                var w = d * rank[s] / outs.length;
                for (var oi = 0; oi < outs.length; oi++) {
                    if (idx[outs[oi]] !== undefined) next[idx[outs[oi]]] += w;
                }
            }
        }

        var diff = 0;
        for (var c = 0; c < N; c++) diff += Math.abs(next[c] - rank[c]);
        rank = next;
        if (diff < 1e-6) break;
    }

    /** @type {Record<string, number>} */
    var result = {};
    for (var ki = 0; ki < N; ki++) { result[nodes[ki]] = rank[ki]; }
    return result;
}

/**
 * Enhanced lesson sorting with Markov transitions and PageRank.
 *
 * @param {Array} availableLessons
 * @param {Array} userLog
 * @param {Object} graphWeights
 * @param {object} [sequenceData]
 * @returns {Array}
 */
function sortLessonsEnhanced(availableLessons, userLog, graphWeights, sequenceData) {
    var baseSorted = sortLessons(availableLessons, userLog, graphWeights);
    if (!sequenceData) return baseSorted;

    var MARKOV_WEIGHT = 0.12;
    var PAGERANK_WEIGHT = 0.08;

    var markovScores = sequenceData.transitionTable
        ? scoreMarkovTransitions(baseSorted, sequenceData.recentLessons || [], sequenceData.transitionTable)
        : {};

    var prScores = {};
    if (sequenceData.pageRankGraph) {
        var prg = sequenceData.pageRankGraph;
        prScores = computeClientPageRank(prg.nodes || [], prg.edges || {});
    }

    var prValues = _objValues(prScores);
    var prMin = prValues.length > 0 ? _arrayMin(prValues) : 0;
    var prMax = prValues.length > 0 ? _arrayMax(prValues) : 0;
    var prRange = prMax - prMin;

    return baseSorted.map(function (lesson) {
        var lid = lesson.identifier || _getOpt(lesson.meta, 'identifier') || '';
        var ms = markovScores[lid] || { prob: 0, quality: 0 };
        var pr = prScores[lid] || 0;
        var prNorm = prRange > 0 ? (pr - prMin) / prRange : 0;

        var markovBonus = MARKOV_WEIGHT * (ms.prob + ms.quality);
        var prBonus = PAGERANK_WEIGHT * prNorm;
        var totalBonus = markovBonus + prBonus;

        var adjustedTheta = Math.max(CONFIG.MIN_THETA, lesson._score.theta - totalBonus);

        return _assign({}, lesson, {
            _score: _assign({}, lesson._score, {
                theta: parseFloat(adjustedTheta.toFixed(3)),
                components: _assign({}, lesson._score.components, {
                    markovBonus: parseFloat(markovBonus.toFixed(3)),
                    pageRankBonus: parseFloat(prBonus.toFixed(3))
                })
            })
        });
    }).sort(function (a, b) { return a._score.theta - b._score.theta; });
}

// ============================================================================
// Exports
// ============================================================================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        sortLessons: sortLessons,
        sortLessonsEnhanced: sortLessonsEnhanced,
        calculateFeatureAffinity: calculateFeatureAffinity,
        applyTeachingModeFilter: applyTeachingModeFilter,
        buildStudentVarkProfile: buildStudentVarkProfile,
        varkAlignmentBonus: varkAlignmentBonus,
        bloomsProgressionBonus: bloomsProgressionBonus,
        scoreMarkovTransitions: scoreMarkovTransitions,
        computeClientPageRank: computeClientPageRank,
        RELATED_MODES: RELATED_MODES
    };
} else {
    window.AGNI_NAVIGATOR = {
        sortLessons: sortLessons,
        sortLessonsEnhanced: sortLessonsEnhanced,
        calculateFeatureAffinity: calculateFeatureAffinity,
        applyTeachingModeFilter: applyTeachingModeFilter,
        buildStudentVarkProfile: buildStudentVarkProfile,
        varkAlignmentBonus: varkAlignmentBonus,
        bloomsProgressionBonus: bloomsProgressionBonus,
        scoreMarkovTransitions: scoreMarkovTransitions,
        computeClientPageRank: computeClientPageRank,
        RELATED_MODES: RELATED_MODES
    };
}
