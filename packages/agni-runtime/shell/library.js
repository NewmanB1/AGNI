// @ts-nocheck — edge-theta module shape, callback types
// packages/agni-runtime/shell/library.js
// ES5 compatible — targets Android 7.0+ (Nougat, API 24).
// Uses edge-theta when available to order precached lessons offline.

var AVAILABLE_LESSONS = [
    { identifier: 'math:fractions', title: 'Fractions w/ Rhythm', difficulty: 3, inferredFeatures: { sensors_used: ['accelerometer'], has_haptic_feedback: true } },
    { identifier: 'math:ratios', title: 'Ratios (Textbook)', difficulty: 3, inferredFeatures: { sensors_used: [], interactive_elements_count: 0 } },
    { identifier: 'science:gravity', title: 'Gravity Lab', difficulty: 2, inferredFeatures: { sensors_used: ['accelerometer'], has_graphs: true } }
];
var USER_LOG = [{ skillId: 'intro:sensors', features: ['accelerometer'], score: 1.0, pace: 0.8 }];
var GRAPH_WEIGHTS = { edges: [] };

function renderLessons(sorted, listEl) {
    listEl.innerHTML = '';
    if (sorted.length === 0) {
        listEl.innerHTML = '<p style="color:#555;padding:1rem;">No lessons available. Connect to the hub and open a lesson to precache.</p>';
        return;
    }
    sorted.forEach(function (lesson, index) {
        var isRecommended = index === 0;
        var el = document.createElement('div');
        el.className = 'card' + (isRecommended ? ' recommended' : '');
        
        var affinityLabel = (lesson._score && lesson._score.components && lesson._score.components.styleBonus > 0) ? 'Matches Your Style' : '';
        var sensors = (lesson.inferredFeatures && lesson.inferredFeatures.sensors_used) ? lesson.inferredFeatures.sensors_used : [];

        var h3 = document.createElement('h3');
        h3.textContent = (lesson.title || lesson.identifier || '') + (isRecommended ? ' ⭐' : '');
        var metaDiv = document.createElement('div');
        metaDiv.className = 'meta';
        var tagSpan = document.createElement('span');
        sensors.forEach(function (s) {
            var tag = document.createElement('span');
            tag.className = 'tag';
            tag.textContent = s;
            tagSpan.appendChild(tag);
        });
        if (affinityLabel) {
            var affSpan = document.createElement('span');
            affSpan.style.cssText = 'color:#0B5FFF;margin-left:5px;font-weight:bold;';
            affSpan.textContent = affinityLabel;
            tagSpan.appendChild(affSpan);
        }
        var thetaSpan = document.createElement('span');
        thetaSpan.className = 'theta-score';
        thetaSpan.textContent = 'θ ' + (lesson._score ? lesson._score.theta : '—');
        metaDiv.appendChild(tagSpan);
        metaDiv.appendChild(thetaSpan);
        el.appendChild(h3);
        el.appendChild(metaDiv);
        
        el.onclick = function () { launchLesson(lesson.identifier || lesson.slug || lesson.lessonId); };
        listEl.appendChild(el);
    });
}

function initLibrary() {
    var listEl = document.getElementById('lesson-list');
    if (!listEl) return;

    var loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.textContent = 'Loading lessons...';

    function done(sorted) {
        if (loadingEl) loadingEl.style.display = 'none';
        renderLessons(sorted, listEl);
    }

    var edgeTheta = window.AGNI_EDGE_THETA;
    if (edgeTheta && typeof edgeTheta.getOrderedPrecachedLessons === 'function') {
        edgeTheta.getOrderedPrecachedLessons().then(function (sorted) {
            if (sorted && sorted.length > 0) return done(sorted);
            if (window.AGNI_NAVIGATOR && typeof window.AGNI_NAVIGATOR.sortLessons === 'function') {
                return done(window.AGNI_NAVIGATOR.sortLessons(AVAILABLE_LESSONS, USER_LOG, GRAPH_WEIGHTS));
            }
            done([]);
        }).catch(function () { done([]); });
        return;
    }

    if (window.AGNI_NAVIGATOR && typeof window.AGNI_NAVIGATOR.sortLessons === 'function') {
        done(window.AGNI_NAVIGATOR.sortLessons(AVAILABLE_LESSONS, USER_LOG, GRAPH_WEIGHTS));
    } else {
        done([]);
    }
}

function launchLesson(id) {
    console.log('Launching ' + id + '...');
    window.location.href = '/lessons/' + encodeURIComponent(id);
}

// Start
document.addEventListener('DOMContentLoaded', initLibrary);
