// src/runtime/navigator.js

/**
 * AGNI Adaptive Navigation Engine v2.1
 * 
 * This module calculates the "Marginal Learning Cost" (Theta / θ) for a list of lessons.
 * It orders content based on two factors:
 * 1. The Global Knowledge Graph (Prerequisites & Skill Transfer)
 * 2. The Local Learner Profile (Pedagogical Fit & Learning Style)
 * 
 * Environment: Isomorphic (Node.js & Browser)
 * Browser target: Chrome 49+ (Android Marshmallow). No optional chaining,
 * no flatMap, no object spread syntax.
 */

// Polyfill-free helpers for Chrome 49 compatibility
function _assign(target) {
    for (var i = 1; i < arguments.length; i++) {
        var src = arguments[i];
        if (src) { for (var k in src) { if (src.hasOwnProperty(k)) target[k] = src[k]; } }
    }
    return target;
}
function _getOpt(obj, key) { return obj ? obj[key] : undefined; }

// ============================================================================
// Constants & Configuration
// ============================================================================

const CONFIG = {
    // How much weight to give the Village Graph (Prerequisites)
    WEIGHT_GRAPH: 0.6,
    
    // How much weight to give User Preference (Learning Style)
    WEIGHT_STYLE: 0.4,
    
    // Minimum possible cost (prevents divide-by-zero or zero-effort assumptions)
    MIN_THETA: 0.05,
    
    // Mastery threshold (score > 0.6 means the skill counts as "known" for graph traversal)
    MASTERY_THRESHOLD: 0.6
};

// ============================================================================
// Helper: Pedagogical Vector Calculation
// ============================================================================

/**
 * Calculates a "Style Affinity" score (-1.0 to 1.0) for a specific feature tag
 * based on user history.
 * 
 * @param {string} feature - The feature tag (e.g., "haptic", "text_heavy", "accelerometer")
 * @param {Array} userLog - The full performance history
 * @returns {number} Average affinity (-1.0 = Struggle, 1.0 = Excel)
 */
function calculateFeatureAffinity(feature, userLog) {
    let totalImpact = 0;
    let count = 0;

    userLog.forEach(entry => {
        // Normalize entry features
        const entryFeatures = entry.features || [];
        
        if (entryFeatures.includes(feature)) {
            // 1. Performance Impact (-1 to 1 based on score)
            // Score 0.0 -> -1.0
            // Score 0.5 ->  0.0
            // Score 1.0 -> +1.0
            const scoreImpact = (entry.score || 0) * 2 - 1;

            // 2. Pace Impact (Efficiency Bonus)
            // If they finished faster than expected (pace < 1.0), add a small bonus.
            // If they took too long (pace > 1.0), subtract.
            // We cap pace at 2.0 (double time) to prevent massive penalties for distractions.
            let paceVal = entry.pace || 1.0;
            if (paceVal > 2.0) paceVal = 2.0;
            
            // Inverted: Lower pace is better. 
            // 0.5 pace (fast) -> +0.25 bonus
            // 1.5 pace (slow) -> -0.25 penalty
            const paceImpact = (1.0 - paceVal) * 0.5;

            totalImpact += (scoreImpact + paceImpact);
            count++;
        }
    });

    // Return average, capped between -1 and 1
    if (count === 0) return 0;
    let result = totalImpact / count;
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
 * @param {Array} availableLessons - List of lesson meta objects with `inferredFeatures`.
 * @param {Array} userLog - User history: [{ skillId: string, features: string[], score: number, pace: number }]
 * @param {Object} graphWeights - The Village Graph: { edges: [{ from, to, weight, confidence }] }
 * @returns {Array} Sorted lessons with `_score` metadata attached.
 */
function sortLessons(availableLessons, userLog, graphWeights) {
    // 1. Extract Mastered Skills (for Prerequisite/Graph Logic)
    // We only count skills where the user scored above the threshold.
    const masteredSkills = new Set(
        userLog
            .filter(l => (l.score || 0) >= CONFIG.MASTERY_THRESHOLD)
            .map(l => l.skillId)
            .filter(Boolean) // Remove nulls
    );

    // 2. Build User Pedagogical Profile (The "Fingerprint")
    // Pre-calculate affinities for every feature tag found in their history.
    const allUserFeatures = new Set(userLog.reduce(function(acc, l) {
        return acc.concat(l.features || []);
    }, []));
    const userAffinities = {};
    allUserFeatures.forEach(tag => {
        userAffinities[tag] = calculateFeatureAffinity(tag, userLog);
    });

    // 2b. VARK profile for modality-aware selection
    const studentVark = buildStudentVarkProfile(userLog);

    // 3. Score Every Candidate Lesson
    const scoredLessons = availableLessons.map(lesson => {
        
        // --- A. Base Cost Calculation ---
        // Normalize difficulty (1-5) to (0.2-1.0). Default to 3 if missing.
        const difficulty = lesson.difficulty || 3;
        const baseCost = difficulty / 5.0;

        // --- B. Graph Discount (The "Skill Collapse") ---
        // Does the user have skills that make THIS lesson easier?
        let graphDiscount = 0.0;
        let strongestEdge = null;

        const ont = lesson.ontology || {};
        const targetSkills = (ont.requires || []).map(r => r.skill)
            .concat((ont.provides || []).map(p => p.skill));

        if (graphWeights && Array.isArray(graphWeights.edges)) {
            targetSkills.forEach(target => {
                masteredSkills.forEach(source => {
                    const edge = graphWeights.edges.find(e => e.from === source && e.to === target);
                    if (edge) {
                        // Graph Weight logic: 
                        // 0.0 = Perfect Transfer (Easy)
                        // 1.0 = No Transfer (Hard)
                        const transferBenefit = 1.0 - edge.weight;
                        const discount = transferBenefit * (edge.confidence || 0.5);

                        if (discount > graphDiscount) {
                            graphDiscount = discount;
                            strongestEdge = `${source}->${target}`;
                        }
                    }
                });
            });
        }

        // --- C. Style Bonus (The "Pedagogical Fit") ---
        // Does this lesson match the user's historical success patterns?
        let styleBonus = 0;
        const lessonFeatures = [];

        // Hydrate features from OLS inferred data
        if (lesson.inferredFeatures) {
            if (lesson.inferredFeatures.sensors_used) lessonFeatures.push(...lesson.inferredFeatures.sensors_used);
            if (lesson.inferredFeatures.has_haptic_feedback) lessonFeatures.push('haptic');
            if (lesson.inferredFeatures.has_graphs) lessonFeatures.push('visual');
            if (lesson.inferredFeatures.has_audio) lessonFeatures.push('audio');
            // Check interactivity
            if ((lesson.inferredFeatures.interactive_elements_count || 0) > 0) {
                lessonFeatures.push('interactive');
            } else {
                lessonFeatures.push('passive');
            }
        }

        if (lessonFeatures.length > 0) {
            let totalAffinity = 0;
            lessonFeatures.forEach(tag => {
                // If user has no history with this tag, affinity is 0 (neutral)
                totalAffinity += (userAffinities[tag] || 0);
            });
            styleBonus = totalAffinity / lessonFeatures.length;
        }

        // --- D. VARK Alignment ---
        const lessonVark = lesson.inferredFeatures ? lesson.inferredFeatures.vark : null;
        const varkBonus = varkAlignmentBonus(studentVark, lessonVark);

        // --- E. Bloom's Progression ---
        const lessonBlooms = lesson.inferredFeatures ? lesson.inferredFeatures.bloomsCeiling : 0;
        const bloomsBonus = bloomsProgressionBonus(lessonBlooms, userLog);

        // --- F. Final Theta Calculation ---
        // θ = Base - (Graph * W) - (Style * W) - VARK - Blooms
        let theta = baseCost 
            - (graphDiscount * CONFIG.WEIGHT_GRAPH) 
            - (styleBonus * CONFIG.WEIGHT_STYLE)
            - varkBonus
            - bloomsBonus;

        // Clamp logic
        if (theta < CONFIG.MIN_THETA) theta = CONFIG.MIN_THETA;

        return _assign({}, lesson, {
            _score: {
                theta: parseFloat(theta.toFixed(3)),
                components: {
                    base: parseFloat(baseCost.toFixed(2)),
                    graphDiscount: parseFloat(graphDiscount.toFixed(2)),
                    styleBonus: parseFloat(styleBonus.toFixed(2)),
                    varkBonus: parseFloat(varkBonus.toFixed(2)),
                    bloomsBonus: parseFloat(bloomsBonus.toFixed(2))
                },
                debug: {
                    features: lessonFeatures,
                    affinity: styleBonus > 0.1 ? 'High Match' : (styleBonus < -0.1 ? 'Mismatch' : 'Neutral'),
                    strongestEdge: strongestEdge,
                    bloomsCeiling: lessonBlooms,
                    vark: lessonVark
                }
            }
        });
    });

    // 4. Sort Ascending (Lowest Theta = Best)
    return scoredLessons.sort((a, b) => a._score.theta - b._score.theta);
}

// ============================================================================
// VARK-Aware Selection
// ============================================================================

/**
 * Build a student VARK profile from their performance history.
 * Tracks which modality (visual/auditory/readWrite/kinesthetic) the student
 * performs best in, weighted by score and pace.
 *
 * @param {Array} userLog - Performance history with lesson VARK profiles
 * @returns {{ visual: number, auditory: number, readWrite: number, kinesthetic: number }}
 */
function buildStudentVarkProfile(userLog) {
    const profile = { visual: 0, auditory: 0, readWrite: 0, kinesthetic: 0 };
    const counts  = { visual: 0, auditory: 0, readWrite: 0, kinesthetic: 0 };

    userLog.forEach(entry => {
        const vark = entry.vark;
        if (!vark) return;
        const score = entry.score || 0;
        const weight = score > CONFIG.MASTERY_THRESHOLD ? score : score * 0.5;

        for (const dim of ['visual', 'auditory', 'readWrite', 'kinesthetic']) {
            if (vark[dim] > 0) {
                profile[dim] += weight * vark[dim];
                counts[dim] += vark[dim];
            }
        }
    });

    const result = {};
    for (const dim of ['visual', 'auditory', 'readWrite', 'kinesthetic']) {
        result[dim] = counts[dim] > 0 ? profile[dim] / counts[dim] : 0;
    }
    return result;
}

/**
 * Calculate VARK alignment bonus: how well a lesson's VARK profile
 * matches the student's strongest modalities.
 *
 * @param {{ visual, auditory, readWrite, kinesthetic }} studentVark
 * @param {{ visual, auditory, readWrite, kinesthetic }} lessonVark
 * @returns {number} Bonus in [-0.15, +0.15]
 */
function varkAlignmentBonus(studentVark, lessonVark) {
    if (!studentVark || !lessonVark) return 0;

    const dims = ['visual', 'auditory', 'readWrite', 'kinesthetic'];
    const sTotal = dims.reduce((s, d) => s + (studentVark[d] || 0), 0);
    const lTotal = dims.reduce((s, d) => s + (lessonVark[d] || 0), 0);
    if (sTotal === 0 || lTotal === 0) return 0;

    let dotProduct = 0;
    dims.forEach(d => {
        const sNorm = (studentVark[d] || 0) / sTotal;
        const lNorm = (lessonVark[d] || 0) / lTotal;
        dotProduct += sNorm * lNorm;
    });

    // dotProduct ranges [0, 1]; map to [-0.05, +0.15]
    return (dotProduct - 0.25) * 0.2;
}

// ============================================================================
// Bloom's Taxonomy Progression
// ============================================================================

/**
 * Calculate a Bloom's progression bonus that encourages students
 * to advance up the taxonomy over time.
 *
 * @param {number} lessonBloomsCeiling - The lesson's Bloom's ceiling (1-6)
 * @param {Array} userLog - Performance history
 * @returns {number} Bonus in [-0.1, +0.1]
 */
function bloomsProgressionBonus(lessonBloomsCeiling, userLog) {
    if (!lessonBloomsCeiling || userLog.length === 0) return 0;

    // Find the student's current average Bloom's level from mastered lessons
    let totalBlooms = 0;
    let countBlooms = 0;
    userLog.forEach(entry => {
        if ((entry.score || 0) >= CONFIG.MASTERY_THRESHOLD && entry.bloomsCeiling) {
            totalBlooms += entry.bloomsCeiling;
            countBlooms++;
        }
    });

    if (countBlooms === 0) return 0;
    const avgBlooms = totalBlooms / countBlooms;

    // Ideal next lesson is one level above current average (stretch zone)
    const idealNext = Math.min(6, avgBlooms + 1);
    const distance = Math.abs(lessonBloomsCeiling - idealNext);

    // Close to ideal = bonus; far = penalty
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
 * @param {Array} scoredLessons - Output from sortLessons (with _score.theta)
 * @param {object} opts
 *   teachingMode: 'socratic' | 'didactic' | 'guided_discovery' | 'narrative' | 'constructivist' | 'direct' | null
 *   utuSpine:     target UTU spine id to align to (e.g. "K-PHY-1") or null
 *   utuProtocol:  target protocol (e.g. "ke-phys-p1") or null
 * @returns {Array} Re-ordered lessons
 */
function applyTeachingModeFilter(scoredLessons, opts) {
    opts = opts || {};
    const mode = opts.teachingMode;
    const spine = opts.utuSpine;
    const protocol = opts.utuProtocol;

    if (!mode && !spine && !protocol) return scoredLessons;

    return scoredLessons.map(lesson => {
        let bonus = 0;

        if (mode && lesson.teaching_mode) {
            if (lesson.teaching_mode === mode) {
                bonus += 0.15;
            } else {
                // Partial credit for related modes in the OLS vocabulary:
                // socratic ~ guided_discovery, didactic ~ direct, constructivist ~ narrative
                const RELATED = {
                    socratic: ['guided_discovery'],
                    guided_discovery: ['socratic', 'constructivist'],
                    didactic: ['direct'],
                    direct: ['didactic'],
                    constructivist: ['narrative', 'guided_discovery'],
                    narrative: ['constructivist']
                };
                const related = RELATED[mode] || [];
                if (related.indexOf(lesson.teaching_mode) !== -1) bonus += 0.05;
                else bonus -= 0.05;
            }
        }

        if (spine && lesson.ontology) {
            const provides = lesson.ontology.provides || [];
            const requires = lesson.ontology.requires || [];
            const allSkills = provides.concat(requires);
            const hasSpine = allSkills.some(s => s.skill && s.skill.startsWith(spine));
            if (hasSpine) bonus += 0.1;
        }

        if (protocol && lesson.utu_protocol) {
            if (lesson.utu_protocol === protocol) bonus += 0.08;
        }

        const adjustedTheta = Math.max(CONFIG.MIN_THETA, lesson._score.theta - bonus);
        return _assign({}, lesson, {
            _score: _assign({}, lesson._score, {
                theta: parseFloat(adjustedTheta.toFixed(3)),
                components: _assign({}, lesson._score.components, {
                    teachingModeBonus: parseFloat(bonus.toFixed(2))
                })
            })
        });
    }).sort((a, b) => a._score.theta - b._score.theta);
}

// ============================================================================
// Markov Transition Model (client-side)
// ============================================================================

/**
 * Lightweight client-side Markov transition scoring.
 *
 * Given the student's recent lesson history and a transition table
 * (precomputed on the hub and shipped to the client), score each
 * candidate lesson by how well it fits the student's learning path.
 *
 * @param {Array} candidates - Lesson meta objects
 * @param {string[]} recentLessons - Student's recently completed lesson IDs (most recent last)
 * @param {Object} transitionTable - { fromId: { toId: { prob: number, avgGain: number } } }
 * @returns {Object.<string, { prob: number, quality: number }>}
 */
function scoreMarkovTransitions(candidates, recentLessons, transitionTable) {
    if (!transitionTable || !recentLessons || recentLessons.length === 0) return {};

    const RECENCY_DECAY = 0.7;
    const scores = {};

    candidates.forEach(lesson => {
        const lid = lesson.identifier || _getOpt(lesson.meta, 'identifier') || '';
        let totalWeight = 0;
        let weightedProb = 0;
        let weightedGain = 0;

        for (let i = recentLessons.length - 1; i >= 0; i--) {
            const stepsBack = recentLessons.length - 1 - i;
            const recency = Math.pow(RECENCY_DECAY, stepsBack);
            const from = recentLessons[i];
            const edges = transitionTable[from];
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
 * Operates on a pre-built adjacency list (shipped from the hub).
 * Returns a lesson authority map where higher = more important gateway.
 *
 * @param {string[]} nodes - All lesson IDs in the graph
 * @param {Object.<string, string[]>} edges - Adjacency list (outgoing)
 * @param {object} [opts]
 * @param {number} [opts.damping=0.85]
 * @param {number} [opts.maxIter=50]
 * @returns {Object.<string, number>}
 */
function computeClientPageRank(nodes, edges, opts) {
    opts = opts || {};
    const d = opts.damping || 0.85;
    const maxIter = opts.maxIter || 50;
    const N = nodes.length;
    if (N === 0) return {};

    const idx = {};
    nodes.forEach((n, i) => { idx[n] = i; });

    let rank = new Array(N).fill(1.0 / N);

    for (let iter = 0; iter < maxIter; iter++) {
        const next = new Array(N).fill((1 - d) / N);

        for (let s = 0; s < N; s++) {
            const outs = edges[nodes[s]] || [];
            if (outs.length === 0) {
                const share = d * rank[s] / N;
                for (let dn = 0; dn < N; dn++) next[dn] += share;
            } else {
                const w = d * rank[s] / outs.length;
                outs.forEach(dst => {
                    if (idx[dst] !== undefined) next[idx[dst]] += w;
                });
            }
        }

        let diff = 0;
        for (let c = 0; c < N; c++) diff += Math.abs(next[c] - rank[c]);
        rank = next;
        if (diff < 1e-6) break;
    }

    const result = {};
    nodes.forEach((n, i) => { result[n] = rank[i]; });
    return result;
}

/**
 * Enhanced lesson sorting that incorporates Markov transitions and PageRank.
 *
 * Wraps sortLessons with two additional signals:
 *   - Markov transition quality: lessons that historically lead to good outcomes
 *   - PageRank authority: gateway lessons that unlock the most downstream content
 *
 * @param {Array} availableLessons
 * @param {Array} userLog
 * @param {Object} graphWeights
 * @param {object} [sequenceData]  Optional data from the hub for Markov/PageRank
 *   transitionTable: { fromId: { toId: { prob, avgGain } } }
 *   recentLessons:   string[] of recently completed lesson IDs
 *   pageRankGraph:   { nodes: string[], edges: { id: string[] } }
 * @returns {Array} Sorted lessons with enhanced scoring
 */
function sortLessonsEnhanced(availableLessons, userLog, graphWeights, sequenceData) {
    const baseSorted = sortLessons(availableLessons, userLog, graphWeights);
    if (!sequenceData) return baseSorted;

    const MARKOV_WEIGHT = 0.12;
    const PAGERANK_WEIGHT = 0.08;

    const markovScores = sequenceData.transitionTable
        ? scoreMarkovTransitions(baseSorted, sequenceData.recentLessons || [], sequenceData.transitionTable)
        : {};

    let prScores = {};
    if (sequenceData.pageRankGraph) {
        const prg = sequenceData.pageRankGraph;
        prScores = computeClientPageRank(prg.nodes || [], prg.edges || {});
    }

    const prValues = Object.values(prScores);
    const prMin = prValues.length > 0 ? Math.min(...prValues) : 0;
    const prMax = prValues.length > 0 ? Math.max(...prValues) : 0;
    const prRange = prMax - prMin;

    return baseSorted.map(lesson => {
        const lid = lesson.identifier || _getOpt(lesson.meta, 'identifier') || '';
        const ms = markovScores[lid] || { prob: 0, quality: 0 };
        const pr = prScores[lid] || 0;
        const prNorm = prRange > 0 ? (pr - prMin) / prRange : 0;

        const markovBonus = MARKOV_WEIGHT * (ms.prob + ms.quality);
        const prBonus = PAGERANK_WEIGHT * prNorm;
        const totalBonus = markovBonus + prBonus;

        const adjustedTheta = Math.max(CONFIG.MIN_THETA, lesson._score.theta - totalBonus);

        return _assign({}, lesson, {
            _score: _assign({}, lesson._score, {
                theta: parseFloat(adjustedTheta.toFixed(3)),
                components: _assign({}, lesson._score.components, {
                    markovBonus: parseFloat(markovBonus.toFixed(3)),
                    pageRankBonus: parseFloat(prBonus.toFixed(3))
                })
            })
        });
    }).sort((a, b) => a._score.theta - b._score.theta);
}

// ============================================================================
// Exports
// ============================================================================

// Support both Node.js (CommonJS) and Browser (Global)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        sortLessons,
        sortLessonsEnhanced,
        calculateFeatureAffinity,
        applyTeachingModeFilter,
        buildStudentVarkProfile,
        varkAlignmentBonus,
        bloomsProgressionBonus,
        scoreMarkovTransitions,
        computeClientPageRank
    };
} else {
    window.AGNI_NAVIGATOR = {
        sortLessons,
        sortLessonsEnhanced,
        calculateFeatureAffinity,
        applyTeachingModeFilter,
        buildStudentVarkProfile,
        varkAlignmentBonus,
        bloomsProgressionBonus,
        scoreMarkovTransitions,
        computeClientPageRank
    };
}
