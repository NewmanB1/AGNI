// src/runtime/shell/library.js

// 1. Mock Data (In production, this comes from fetch() or CacheStorage)
const AVAILABLE_LESSONS = [
    { 
        identifier: "math:fractions", 
        title: "Fractions w/ Rhythm", 
        difficulty: 3, 
        inferredFeatures: { sensors_used: ["accelerometer"], has_haptic_feedback: true } 
    },
    { 
        identifier: "math:ratios", 
        title: "Ratios (Textbook)", 
        difficulty: 3, 
        inferredFeatures: { sensors_used: [], interactive_elements_count: 0 } 
    },
    { 
        identifier: "science:gravity", 
        title: "Gravity Lab", 
        difficulty: 2, 
        inferredFeatures: { sensors_used: ["accelerometer"], has_graphs: true } 
    }
];

// Mock User History (The "Kinetic Learner")
const USER_LOG = [
    { skillId: "intro:sensors", features: ["accelerometer"], score: 1.0, pace: 0.8 }
];

// Mock Village Graph
const GRAPH_WEIGHTS = { edges: [] };

async function initLibrary() {
    const listEl = document.getElementById('lesson-list');

    // 1. Run the Adaptive Engine
    // (Note: sortLessons is available globally via window.AGNI_NAVIGATOR in browser)
    const sorted = window.AGNI_NAVIGATOR.sortLessons(AVAILABLE_LESSONS, USER_LOG, GRAPH_WEIGHTS);

    // 2. Render
    listEl.innerHTML = '';
    sorted.forEach((lesson, index) => {
        const isRecommended = index === 0;
        const el = document.createElement('div');
        el.className = `card ${isRecommended ? 'recommended' : ''}`;
        
        // Visualizing the Theta score for debugging/trust
        const affinityLabel = lesson._score.components.styleBonus > 0 ? "Matches Your Style" : "";

        el.innerHTML = `
            <h3>${lesson.title} ${isRecommended ? '⭐' : ''}</h3>
            <div class="meta">
                <span>
                    ${lesson.inferredFeatures.sensors_used.map(s => `<span class="tag">${s}</span>`).join(' ')}
                    <span style="color:#00e676; margin-left:5px;">${affinityLabel}</span>
                </span>
                <span class="theta-score">θ ${lesson._score.theta}</span>
            </div>
        `;
        
        el.onclick = () => launchLesson(lesson.identifier);
        listEl.appendChild(el);
    });
}

function launchLesson(id) {
    console.log(`Launching ${id}...`);
    // In PWA mode, this would: window.location.href = `/lessons/${id}/index.html`;
    alert(`Opening: ${id}`);
}

// Start
document.addEventListener('DOMContentLoaded', initLibrary);
