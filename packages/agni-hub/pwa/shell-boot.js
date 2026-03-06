// shell-boot.js ΓÇö PWA shell bootstrap
// Loaded as external script to satisfy CSP script-src 'self'.
// ES5 compatible ΓÇö targets Android 6.0+ (Chrome 44 WebView).

(function () {
  'use strict';

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js');
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

      if (step.type === 'svg') {
        var svgContainer = document.createElement('div');
        if (step.svg_spec && step.svg_spec.factory && window.AGNI_SVG && typeof window.AGNI_SVG.fromSpec === 'function') {
          try {
            window.AGNI_SVG.fromSpec(step.svg_spec, svgContainer);
          } catch (err) {
            var msg = (err && err.message) ? err.message : String(err);
            svgContainer.textContent = 'SVG preview unavailable' + (msg ? ' (' + msg + ')' : '');
          }
          document.getElementById('app').appendChild(svgContainer);
        } else if (window.svgGenerators && step.svg_type && window.svgGenerators[step.svg_type]) {
          if (typeof window.AGNI_SHARED !== 'undefined' && window.AGNI_SHARED.setSafeHtml) {
            window.AGNI_SHARED.setSafeHtml(svgContainer, window.svgGenerators[step.svg_type](step.params || {}));
          } else {
            svgContainer.innerHTML = window.svgGenerators[step.svg_type](step.params || {});
          }
          document.getElementById('app').appendChild(svgContainer);
        }
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
      }).catch(function (err) {
        var app = document.getElementById('app');
        if (app && err) app.setAttribute('data-load-error', err.message || String(err));
        renderLesson(LESSON_DATA);
      });
    } else {
      renderLesson(LESSON_DATA);
    }
  }

  boot();
})();
