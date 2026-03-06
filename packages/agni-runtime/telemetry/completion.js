// packages/agni-runtime/telemetry/completion.js
// AGNI Completion Screen Renderer
//
// Renders the lesson-complete screen: mastery score, pace summary,
// step-by-step review, skills earned, and action buttons (retry/next/dashboard).
//
// Registers: window.AGNI_COMPLETION
// Depends on: AGNI_TELEMETRY (optional), AGNI_CHECKPOINT
// Load order: before player.js
//
// ES5 only — targets Android 6.0+ (Chrome 44 WebView).

(function (global) {
  'use strict';

  var _a11y = global.AGNI_A11Y || { addAria: function () {} };

  /**
   * Render the completion screen.
   * @param {object} opts
   * @param {object}   opts.lesson       LESSON_DATA
   * @param {Array}    opts.stepOutcomes recorded outcomes
   * @param {Array}    opts.probeResults recorded probe results
   * @param {Array}    opts.steps        lesson steps array
   * @param {number}   opts.lessonStartMs timestamp
   * @param {number}   opts.expectedDurationMs from meta
   * @param {Function} opts.t            i18n function
   * @param {Function} opts.onRetry      callback for retry button
   * @param {boolean}  opts.devMode
   */
  function render(opts) {
    var lesson = opts.lesson;
    var stepOutcomes = opts.stepOutcomes;
    var probeResults = opts.probeResults;
    var steps = opts.steps;
    var lessonStartMs = opts.lessonStartMs;
    var expectedDurationMs = opts.expectedDurationMs || 0;
    var t = opts.t || function (key) { return key; };
    var onRetry = opts.onRetry;
    var devMode = opts.devMode;

    var app = document.getElementById('app');
    app.innerHTML = '';

    var container = document.createElement('div');
    container.className = 'completion-screen';
    _a11y.addAria(container, 'main', 'Lesson completion');

    var LESSON_ID = (lesson.meta && lesson.meta.identifier) || lesson.id || 'unknown';
    if (global.AGNI_CHECKPOINT) global.AGNI_CHECKPOINT.clear(LESSON_ID, devMode);

    var computedMastery = null;
    if (global.AGNI_TELEMETRY && global.AGNI_TELEMETRY.computeMastery) {
      computedMastery = global.AGNI_TELEMETRY.computeMastery(stepOutcomes);
    }
    var masteryPct = computedMastery ? Math.round(computedMastery.mastery * 100) : null;

    var tier = masteryPct >= 90 ? 'excellent' : (masteryPct >= 70 ? 'good' : 'complete');
    var icons = { excellent: '\u2B50', good: '\u2714', complete: '\u2714' };
    var titles = {
      excellent: t('completion_excellent') || 'Excellent work!',
      good: t('completion_good') || 'Well done!',
      complete: (lesson.meta && lesson.meta.completion_message) || t('lesson_complete')
    };

    var checkmark = document.createElement('div');
    checkmark.className = 'completion-icon completion-' + tier;
    checkmark.textContent = icons[tier];
    container.appendChild(checkmark);

    var msg = document.createElement('h2');
    msg.className = 'completion-title';
    msg.textContent = titles[tier];
    container.appendChild(msg);

    if (masteryPct !== null) {
      var masteryEl = document.createElement('div');
      masteryEl.className = 'mastery-ring';
      var pctSpan = document.createElement('span');
      pctSpan.className = 'mastery-pct';
      pctSpan.textContent = masteryPct + '%';
      masteryEl.appendChild(pctSpan);
      var labelSpan = document.createElement('span');
      labelSpan.className = 'mastery-label';
      labelSpan.textContent = t('mastery_label');
      masteryEl.appendChild(labelSpan);
      container.appendChild(masteryEl);
    }

    if (expectedDurationMs > 0) {
      var elapsed = Date.now() - lessonStartMs;
      var pace = elapsed / expectedDurationMs;
      var paceEl = document.createElement('p');
      paceEl.className = 'pace-summary';
      if (pace < 0.8) {
        paceEl.textContent = t('pace_fast');
        paceEl.style.color = '#1B5E20';
      } else if (pace <= 1.2) {
        paceEl.textContent = t('pace_ontime');
        paceEl.style.color = '#0B5FFF';
      } else {
        paceEl.textContent = t('pace_slow');
        paceEl.style.color = '#996600';
      }
      container.appendChild(paceEl);
    }

    var reviewable = stepOutcomes.filter(function (o) {
      return o.type !== 'instruction' && o.type !== 'completion';
    });
    if (reviewable.length > 0) {
      var reviewSection = document.createElement('div');
      reviewSection.className = 'completion-review';

      var reviewToggle = document.createElement('button');
      reviewToggle.className = 'btn btn-secondary review-toggle';
      reviewToggle.textContent = t('review_steps') || 'Review your answers';
      var reviewList = document.createElement('div');
      reviewList.className = 'review-list';
      reviewList.style.display = 'none';

      reviewable.forEach(function (outcome) {
        var step = null;
        for (var i = 0; i < steps.length; i++) {
          if (steps[i].id === outcome.stepId) { step = steps[i]; break; }
        }
        var item = document.createElement('div');
        var status = outcome.skipped ? 'skipped' : (outcome.passed ? 'passed' : 'failed');
        item.className = 'review-step review-' + status;

        var icon = outcome.skipped ? '\u23ED' : (outcome.passed ? '\u2714' : '\u2718');
        var label = (step && step.title) || outcome.stepId;

        var iconSpan = document.createElement('span');
        iconSpan.className = 'review-icon';
        iconSpan.textContent = icon;
        item.appendChild(iconSpan);
        var labelSpan2 = document.createElement('span');
        labelSpan2.className = 'review-label';
        labelSpan2.textContent = label;
        item.appendChild(labelSpan2);
        var detailSpan = document.createElement('span');
        detailSpan.className = 'review-detail';
        detailSpan.textContent = outcome.skipped ? t('skipped') : (outcome.passed
          ? (outcome.attempts > 1 ? t('passed_attempts', { n: outcome.attempts }) : t('passed_first'))
          : t('not_passed'));
        item.appendChild(detailSpan);
        reviewList.appendChild(item);
      });

      reviewToggle.onclick = function () {
        var visible = reviewList.style.display !== 'none';
        reviewList.style.display = visible ? 'none' : 'block';
        reviewToggle.textContent = visible
          ? (t('review_steps') || 'Review your answers')
          : (t('hide_review') || 'Hide review');
      };
      reviewSection.appendChild(reviewToggle);
      reviewSection.appendChild(reviewList);
      container.appendChild(reviewSection);
    }

    var provides = (lesson.ontology && lesson.ontology.provides) || [];
    if (provides.length > 0) {
      var skillsDiv = document.createElement('div');
      skillsDiv.className = 'skills-earned';
      var skillTitle = document.createElement('h3');
      skillTitle.textContent = t('skills_practised');
      skillsDiv.appendChild(skillTitle);
      var skillList = document.createElement('ul');
      provides.forEach(function (p) {
        var li = document.createElement('li');
        li.textContent = p.skill + (p.declaredLevel ? ' (level ' + p.declaredLevel + ')' : '');
        skillList.appendChild(li);
      });
      skillsDiv.appendChild(skillList);
      container.appendChild(skillsDiv);
    }

    var actionsDiv = document.createElement('div');
    actionsDiv.className = 'next-lesson-actions';
    actionsDiv.style.marginTop = '1.5rem';

    var retryBtn = document.createElement('button');
    retryBtn.className = 'btn btn-secondary';
    retryBtn.textContent = t('retry_lesson') || 'Retry Lesson';
    retryBtn.onclick = function () {
      if (onRetry) onRetry();
    };
    actionsDiv.appendChild(retryBtn);

    try {
      var params = new URLSearchParams(global.location.search || '');
      var pseudoId = params.get('pseudoId');
      var hubBase  = params.get('hub') || '';
      if (pseudoId) {
        var nextBtn = document.createElement('button');
        nextBtn.className = 'btn btn-primary';
        nextBtn.textContent = t('next_lesson');
        nextBtn.onclick = function () {
          var portalUrl = hubBase
            ? hubBase.replace(/\/$/, '') + '/learn?pseudoId=' + encodeURIComponent(pseudoId)
            : '/learn?pseudoId=' + encodeURIComponent(pseudoId);
          global.location.href = portalUrl;
        };
        actionsDiv.appendChild(nextBtn);

        var homeBtn = document.createElement('button');
        homeBtn.className = 'btn btn-secondary';
        homeBtn.textContent = t('back_dashboard');
        homeBtn.onclick = function () {
          var portalUrl = hubBase
            ? hubBase.replace(/\/$/, '') + '/learn/progress?pseudoId=' + encodeURIComponent(pseudoId)
            : '/learn/progress?pseudoId=' + encodeURIComponent(pseudoId);
          global.location.href = portalUrl;
        };
        actionsDiv.appendChild(homeBtn);
      }
    } catch (e) {
      if (devMode) console.warn('[COMPLETION] URL parse failed:', e);
    }
    container.appendChild(actionsDiv);

    app.appendChild(container);

    var totalDuration = Date.now() - lessonStartMs;
    if (global.AGNI_TELEMETRY && global.AGNI_TELEMETRY.record) {
      global.AGNI_TELEMETRY.record(lesson, stepOutcomes, totalDuration, probeResults)
        .catch(function (err) {
          if (devMode) console.warn('[COMPLETION] Telemetry record failed:', err);
        });
    }
  }

  global.AGNI_COMPLETION = {
    render: render
  };

})(typeof self !== 'undefined' ? self : this);
