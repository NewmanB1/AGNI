// shell-boot.js — PWA shell bootstrap
// Loaded as external script to satisfy CSP script-src 'self'.
// ES5 compatible — targets Android 6.0+ (Chrome 44 WebView).

(function () {
  'use strict';

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js');
  }

  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function renderLesson(lesson) {
    if (!lesson || !lesson.meta) {
      document.getElementById('loading').textContent = 'Error: invalid lesson data';
      return;
    }
    document.getElementById('loading').style.display = 'none';
    document.getElementById('app').style.display = 'block';

    var title = document.createElement('h1');
    title.textContent = lesson.meta.title || 'Untitled';
    document.getElementById('app').appendChild(title);

    var steps = lesson.steps || [];
    for (var i = 0; i < steps.length; i++) {
      var step = steps[i];
      var div = document.createElement('div');

      if (step.htmlContent) {
        if (typeof window.AGNI_SHARED !== 'undefined' && window.AGNI_SHARED.setSafeHtml) {
          window.AGNI_SHARED.setSafeHtml(div, step.htmlContent);
        } else {
          div.textContent = step.content || '[content]';
        }
      } else if (step.content) {
        div.textContent = step.content;
      }
      document.getElementById('app').appendChild(div);

      if (step.type === 'svg' && window.svgGenerators && window.svgGenerators[step.svg_type]) {
        var svgContainer = document.createElement('div');
        if (typeof window.AGNI_SHARED !== 'undefined' && window.AGNI_SHARED.setSafeHtml) {
          window.AGNI_SHARED.setSafeHtml(svgContainer, window.svgGenerators[step.svg_type](step.params || {}));
        } else {
          svgContainer.innerHTML = window.svgGenerators[step.svg_type](step.params || {});
        }
        document.getElementById('app').appendChild(svgContainer);
      }
    }
  }

  function boot() {
    if (typeof LESSON_DATA === 'undefined' || LESSON_DATA === null) {
      document.getElementById('loading').textContent = 'Error loading lesson';
      return;
    }

    // If AGNI_LOADER is available (factory-loader.js loaded), use it to
    // load factories in the correct dependency order before rendering.
    if (typeof window.AGNI_LOADER !== 'undefined' && LESSON_DATA.requires) {
      window.AGNI_LOADER.loadDependencies(LESSON_DATA).then(function () {
        renderLesson(LESSON_DATA);
      }).catch(function () {
        renderLesson(LESSON_DATA);
      });
    } else {
      renderLesson(LESSON_DATA);
    }
  }

  boot();
})();
