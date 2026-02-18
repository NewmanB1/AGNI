// src/runtime/navigator.js

/**
 * AGNI Adaptive Navigation Engine v2.0
 * 
 * This module calculates the "Marginal Learning Cost" (Theta / θ) for a list of lessons.
 * It orders content based on two factors:
 * 1. The Global Knowledge Graph (Prerequisites & Skill Transfer)
 * 2. The Local Learner Profile (Pedagogical Fit & Learning Style)
 * 
 * Environment: Isomorphic (Node.js & Browser)
 */

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
    const allUserFeatures = new Set(userLog.flatMap(l => l.features || []));
    const userAffinities = {};
    allUserFeatures.forEach(tag => {
        userAffinities[tag] = calculateFeatureAffinity(tag, userLog);
    });

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

        const targetSkills = [
            ...(lesson.ontology?.requires || []).map(r => r.skill),
            ...(lesson.ontology?.provides || []).map(p => p.skill)
        ];

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

        // --- D. Final Theta Calculation ---
        // θ = Base - (Graph * W) - (Style * W)
        let theta = baseCost 
            - (graphDiscount * CONFIG.WEIGHT_GRAPH) 
            - (styleBonus * CONFIG.WEIGHT_STYLE);

        // Clamp logic
        if (theta < CONFIG.MIN_THETA) theta = CONFIG.MIN_THETA;

        return {
            ...lesson,
            _score: {
                theta: parseFloat(theta.toFixed(3)),
                components: {
                    base: parseFloat(baseCost.toFixed(2)),
                    graphDiscount: parseFloat(graphDiscount.toFixed(2)),
                    styleBonus: parseFloat(styleBonus.toFixed(2))
                },
                debug: {
                    features: lessonFeatures,
                    affinity: styleBonus > 0.1 ? 'High Match' : (styleBonus < -0.1 ? 'Mismatch' : 'Neutral'),
                    strongestEdge: strongestEdge
                }
            }
        };
    });

    // 4. Sort Ascending (Lowest Theta = Best)
    return scoredLessons.sort((a, b) => a._score.theta - b._score.theta);
}

// ============================================================================
// Exports
// ============================================================================

// Support both Node.js (CommonJS) and Browser (Global)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { sortLessons, calculateFeatureAffinity };
} else {
    // In browser, attach to window namespace
    window.AGNI_NAVIGATOR = { sortLessons, calculateFeatureAffinity };
}
