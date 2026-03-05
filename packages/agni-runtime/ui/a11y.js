// src/runtime/a11y.js
// AGNI Accessibility Module
//
// Loads accessibility preferences from localStorage and applies them:
// font scale, high contrast, reduced motion, haptic intensity.
// Injects all AGNI runtime CSS (shared across player, completion, etc.).
//
// Registers: window.AGNI_A11Y
// Depends on: nothing (standalone)
// Load order: before player.js (prefs must be available at init)
//
// ES5 only — targets Android 6.0+ (Chrome 44 WebView).

(function (global) {
  'use strict';

  var prefs = (function loadPrefs() {
    var osReducedMotion = false;
    try {
      if (typeof matchMedia === 'function') {
        osReducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
      }
    } catch (e) { /* matchMedia not available */ }
    var defaultHaptic = osReducedMotion ? 0 : 1;
    var defaults = { fontScale: 1, highContrast: false, reducedMotion: osReducedMotion, hapticIntensity: defaultHaptic, autoNarrate: false };
    try {
      var fs = localStorage.getItem('agni_font_scale');
      var hc = localStorage.getItem('agni_high_contrast');
      var rm = localStorage.getItem('agni_reduced_motion');
      var hi = localStorage.getItem('agni_haptic_intensity');
      var an = localStorage.getItem('agni_auto_narrate');
      return {
        fontScale:       fs !== null ? Math.max(0.8, Math.min(1.5, parseFloat(fs))) : 1,
        highContrast:    hc === 'true',
        reducedMotion:   rm !== null ? rm === 'true' : osReducedMotion,
        hapticIntensity: hi !== null ? Math.max(0, Math.min(1, parseFloat(hi))) : defaultHaptic,
        autoNarrate:     an === 'true'
      };
    } catch (e) { return defaults; }
  })();

  function apply() {
    var root = document.documentElement;
    if (prefs.fontScale !== 1) {
      root.style.fontSize = (prefs.fontScale * 100) + '%';
    }
    if (prefs.highContrast) {
      root.classList.add('agni-high-contrast');
    }
    if (prefs.reducedMotion) {
      root.classList.add('agni-reduced-motion');
    }
    injectStyles();
  }

  function injectStyles() {
    if (document.getElementById('agni-a11y-style')) return;
    var style = document.createElement('style');
    style.id = 'agni-a11y-style';
    style.textContent =
      '.agni-high-contrast { --bg: #000; --text: #fff; --accent: #ffff00; }' +
      '.agni-high-contrast .step-content { color: #fff !important; }' +
      '.agni-high-contrast .quiz-option { border: 2px solid #fff !important; color: #fff !important; }' +
      '.agni-high-contrast .btn { border: 2px solid #fff !important; }' +
      '.agni-reduced-motion * { transition: none !important; animation: none !important; }' +
      '.sensor-gauge { margin: 1.5rem 0; text-align: center; }' +
      '.gauge-label { font-size: 0.85em; color: #555; margin-bottom: 0.3rem; }' +
      '.gauge-track { position: relative; height: 1.5rem; background: #DDDAD0; border-radius: 2px; overflow: visible; }' +
      '.gauge-fill { height: 100%; width: 0%; border-radius: 2px; background: #0B5FFF; transition: width 0.1s; }' +
      '.gauge-threshold { position: absolute; top: -2px; bottom: -2px; width: 3px; background: #1A1A1A; border-radius: 1px; }' +
      '.gauge-value { font-size: 1.25rem; font-weight: bold; margin-top: 0.25rem; }' +
      '.hw-hint { color: #555; font-style: italic; }' +
      '.hw-status { font-size: 0.9em; margin-top: 1rem; }' +
      '.completion-icon { font-size: 3rem; color: #1B5E20; margin-bottom: 0.5rem; }' +
      '.completion-title { margin-bottom: 0.5rem; }' +
      '.skills-earned { margin: 1rem 0; text-align: left; }' +
      '.skills-earned h3 { font-size: 0.95em; color: #555; }' +
      '.skills-earned ul { padding-left: 1.2em; }' +
      '.skills-earned li { margin: 0.25rem 0; }' +
      '.score-breakdown { margin-top: 0.5rem; color: #333; }' +
      '.pace-summary { margin: 0.5rem 0; font-size: 0.9em; }' +
      '.next-lesson-actions { display: flex; justify-content: center; gap: 0.75rem; flex-wrap: wrap; }' +
      '.step-progress { font-size: 0.8em; color: #555; margin-bottom: 0.5rem; }' +
      '.step-hint-nudge { margin-top: 1rem; padding: 0.75rem; background: #FFF8E1; border: 2px solid #996600; border-radius: 2px; font-size: 0.9em; }' +
      '.hint-tier-1 { border-color: #0B5FFF; background: #E3F2FD; }' +
      '.hint-tier-2 { border-color: #996600; background: #FFF8E1; }' +
      '.hint-tier-3 { border-color: #B00020; background: #FFEBEE; }' +
      '.hint-skip { font-size: 0.9em; padding: 18px; min-height: 48px; }' +
      '.completion-excellent .completion-icon { font-size: 4rem; }' +
      '.mastery-ring { text-align: center; margin: 1rem 0; }' +
      '.mastery-pct { display: block; font-size: 2.5rem; font-weight: bold; color: #0B5FFF; }' +
      '.mastery-label { display: block; font-size: 0.8rem; color: #555; }' +
      '.completion-review { margin: 1.5rem 0; }' +
      '.review-toggle { width: 100%; text-align: center; }' +
      '.review-list { margin-top: 0.75rem; }' +
      '.review-step { display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.5rem; border-radius: 2px; margin-bottom: 0.25rem; font-size: 0.9em; }' +
      '.review-passed { background: #E8F5E9; }' +
      '.review-failed { background: #FFEBEE; }' +
      '.review-skipped { background: #F5F5F5; color: #555; }' +
      '.review-icon { min-width: 1.2em; text-align: center; }' +
      '.review-label { flex: 1; }' +
      '.review-detail { font-size: 0.85em; color: #555; }' +
      '.frustration-nudge { margin-top: 1rem; padding: 0.75rem; background: #E3F2FD; border: 2px solid #0B5FFF; border-radius: 2px; font-size: 0.9em; }';
    document.head.appendChild(style);
  }

  function addAria(el, role, label) {
    if (role) el.setAttribute('role', role);
    if (label) el.setAttribute('aria-label', label);
  }

  function injectSettingsStyles() {
    if (document.getElementById('agni-settings-style')) return;
    var s = document.createElement('style');
    s.id = 'agni-settings-style';
    s.textContent =
      '.agni-settings-btn { position: fixed; top: 0.5rem; right: 0.5rem; z-index: 9998; width: 48px; height: 48px; border-radius: 50%; border: 2px solid #555; background: #fff; font-size: 1.4rem; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 1px 4px rgba(0,0,0,.2); }' +
      '.agni-high-contrast .agni-settings-btn { background: #222; border-color: #fff; color: #fff; }' +
      '.agni-settings-overlay { position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 9999; background: rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center; }' +
      '.agni-settings-panel { background: #FFFDF5; border-radius: 4px; padding: 1.5rem; width: 90%; max-width: 360px; max-height: 90vh; overflow-y: auto; box-shadow: 0 4px 16px rgba(0,0,0,.3); }' +
      '.agni-high-contrast .agni-settings-panel { background: #111; color: #fff; border: 2px solid #fff; }' +
      '.agni-settings-panel h2 { margin: 0 0 1rem; font-size: 1.2rem; }' +
      '.agni-settings-row { margin-bottom: 1.25rem; }' +
      '.agni-settings-row label { display: block; font-weight: bold; margin-bottom: 0.3rem; font-size: 0.95em; }' +
      '.agni-settings-row input[type="range"] { width: 100%; }' +
      '.agni-settings-val { font-size: 0.85em; color: #555; }' +
      '.agni-high-contrast .agni-settings-val { color: #ccc; }' +
      '.agni-settings-toggle { display: flex; align-items: center; gap: 0.75rem; }' +
      '.agni-settings-toggle input[type="checkbox"] { width: 24px; height: 24px; }' +
      '.agni-settings-close { display: block; width: 100%; margin-top: 1rem; padding: 0.75rem; font-size: 1rem; min-height: 48px; cursor: pointer; border: 2px solid #555; border-radius: 2px; background: #0B5FFF; color: #fff; }' +
      '.agni-high-contrast .agni-settings-close { background: #fff; color: #000; border-color: #fff; }';
    document.head.appendChild(s);
  }

  function savePrefs() {
    try {
      localStorage.setItem('agni_font_scale', String(prefs.fontScale));
      localStorage.setItem('agni_high_contrast', String(prefs.highContrast));
      localStorage.setItem('agni_reduced_motion', String(prefs.reducedMotion));
      localStorage.setItem('agni_haptic_intensity', String(prefs.hapticIntensity));
      localStorage.setItem('agni_auto_narrate', String(prefs.autoNarrate));
    } catch (e) { /* quota exceeded — non-critical */ }
  }

  function applyLive() {
    var root = document.documentElement;
    root.style.fontSize = prefs.fontScale === 1 ? '' : (prefs.fontScale * 100) + '%';
    if (prefs.highContrast) root.classList.add('agni-high-contrast');
    else root.classList.remove('agni-high-contrast');
    if (prefs.reducedMotion) root.classList.add('agni-reduced-motion');
    else root.classList.remove('agni-reduced-motion');
  }

  /**
   * Render an in-player settings panel as a modal overlay.
   * All controls update preferences live and persist to localStorage.
   */
  function renderSettingsPanel() {
    if (document.getElementById('agni-settings-overlay')) return;
    injectSettingsStyles();

    var overlay = document.createElement('div');
    overlay.id = 'agni-settings-overlay';
    overlay.className = 'agni-settings-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Accessibility settings');

    var panel = document.createElement('div');
    panel.className = 'agni-settings-panel';

    var title = document.createElement('h2');
    title.textContent = 'Settings';
    panel.appendChild(title);

    // Font size slider
    var fontRow = document.createElement('div');
    fontRow.className = 'agni-settings-row';
    var fontLabel = document.createElement('label');
    fontLabel.textContent = 'Font Size';
    fontLabel.setAttribute('for', 'agni-s-font');
    fontRow.appendChild(fontLabel);
    var fontSlider = document.createElement('input');
    fontSlider.type = 'range';
    fontSlider.id = 'agni-s-font';
    fontSlider.min = '0.8';
    fontSlider.max = '1.5';
    fontSlider.step = '0.1';
    fontSlider.value = String(prefs.fontScale);
    var fontVal = document.createElement('span');
    fontVal.className = 'agni-settings-val';
    fontVal.textContent = Math.round(prefs.fontScale * 100) + '%';
    fontSlider.oninput = function () {
      prefs.fontScale = Math.round(parseFloat(fontSlider.value) * 10) / 10;
      fontVal.textContent = Math.round(prefs.fontScale * 100) + '%';
      applyLive();
      savePrefs();
    };
    fontRow.appendChild(fontSlider);
    fontRow.appendChild(fontVal);
    panel.appendChild(fontRow);

    // High contrast toggle
    var hcRow = document.createElement('div');
    hcRow.className = 'agni-settings-row agni-settings-toggle';
    var hcCheck = document.createElement('input');
    hcCheck.type = 'checkbox';
    hcCheck.id = 'agni-s-hc';
    hcCheck.checked = prefs.highContrast;
    var hcLabel = document.createElement('label');
    hcLabel.textContent = 'High Contrast';
    hcLabel.setAttribute('for', 'agni-s-hc');
    hcCheck.onchange = function () {
      prefs.highContrast = hcCheck.checked;
      applyLive();
      savePrefs();
    };
    hcRow.appendChild(hcCheck);
    hcRow.appendChild(hcLabel);
    panel.appendChild(hcRow);

    // Reduced motion toggle
    var rmRow = document.createElement('div');
    rmRow.className = 'agni-settings-row agni-settings-toggle';
    var rmCheck = document.createElement('input');
    rmCheck.type = 'checkbox';
    rmCheck.id = 'agni-s-rm';
    rmCheck.checked = prefs.reducedMotion;
    var rmLabel = document.createElement('label');
    rmLabel.textContent = 'Reduced Motion';
    rmLabel.setAttribute('for', 'agni-s-rm');
    rmCheck.onchange = function () {
      prefs.reducedMotion = rmCheck.checked;
      applyLive();
      savePrefs();
    };
    rmRow.appendChild(rmCheck);
    rmRow.appendChild(rmLabel);
    panel.appendChild(rmRow);

    // Haptic intensity slider
    var hapRow = document.createElement('div');
    hapRow.className = 'agni-settings-row';
    var hapLabel = document.createElement('label');
    hapLabel.textContent = 'Vibration Intensity';
    hapLabel.setAttribute('for', 'agni-s-hap');
    hapRow.appendChild(hapLabel);
    var hapSlider = document.createElement('input');
    hapSlider.type = 'range';
    hapSlider.id = 'agni-s-hap';
    hapSlider.min = '0';
    hapSlider.max = '1';
    hapSlider.step = '0.1';
    hapSlider.value = String(prefs.hapticIntensity);
    var hapVal = document.createElement('span');
    hapVal.className = 'agni-settings-val';
    hapVal.textContent = prefs.hapticIntensity === 0 ? 'Off' : Math.round(prefs.hapticIntensity * 100) + '%';
    hapSlider.oninput = function () {
      prefs.hapticIntensity = Math.round(parseFloat(hapSlider.value) * 10) / 10;
      hapVal.textContent = prefs.hapticIntensity === 0 ? 'Off' : Math.round(prefs.hapticIntensity * 100) + '%';
      savePrefs();
    };
    hapRow.appendChild(hapSlider);
    hapRow.appendChild(hapVal);
    panel.appendChild(hapRow);

    // Auto-narrate toggle (reads everything aloud for blind/illiterate learners)
    if (global.speechSynthesis) {
      var narr = global.AGNI_NARRATION;

      var anRow = document.createElement('div');
      anRow.className = 'agni-settings-row agni-settings-toggle';
      var anCheck = document.createElement('input');
      anCheck.type = 'checkbox';
      anCheck.id = 'agni-s-an';
      anCheck.checked = prefs.autoNarrate;
      var anLabel = document.createElement('label');
      anLabel.textContent = 'Read Everything Aloud';
      anLabel.setAttribute('for', 'agni-s-an');
      anCheck.onchange = function () {
        prefs.autoNarrate = anCheck.checked;
        if (narr) narr.setEnabled(prefs.autoNarrate);
        applyLive();
        savePrefs();
        if (prefs.autoNarrate && narr) narr.speakNow('Auto narration is now on. Every step will be read aloud.');
      };
      anRow.appendChild(anCheck);
      anRow.appendChild(anLabel);
      panel.appendChild(anRow);

      var srRow = document.createElement('div');
      srRow.className = 'agni-settings-row';
      var srLabel = document.createElement('label');
      srLabel.textContent = 'Speech Speed';
      srLabel.setAttribute('for', 'agni-s-sr');
      srRow.appendChild(srLabel);
      var srSlider = document.createElement('input');
      srSlider.type = 'range';
      srSlider.id = 'agni-s-sr';
      srSlider.min = '0.5';
      srSlider.max = '2';
      srSlider.step = '0.1';
      srSlider.value = narr ? String(narr.getRate()) : '1';
      var srVal = document.createElement('span');
      srVal.className = 'agni-settings-val';
      srVal.textContent = (narr ? narr.getRate() : 1) + 'x';
      srSlider.oninput = function () {
        var r = Math.round(parseFloat(srSlider.value) * 10) / 10;
        srVal.textContent = r + 'x';
        if (narr) narr.setRate(r);
      };
      srRow.appendChild(srSlider);
      srRow.appendChild(srVal);
      panel.appendChild(srRow);
    }

    // Close button
    var closeBtn = document.createElement('button');
    closeBtn.className = 'agni-settings-close';
    closeBtn.textContent = 'Done';
    closeBtn.onclick = function () {
      document.body.removeChild(overlay);
    };
    panel.appendChild(closeBtn);

    overlay.appendChild(panel);

    // Close on overlay click outside panel
    overlay.onclick = function (e) {
      if (e.target === overlay) document.body.removeChild(overlay);
    };

    document.body.appendChild(overlay);

    // Trap focus: move focus to close button
    closeBtn.focus();
  }

  /**
   * Inject a gear icon button into the page for opening settings.
   * Called by player.js during initPlayer().
   */
  function injectSettingsButton() {
    if (document.getElementById('agni-settings-btn')) return;
    injectSettingsStyles();
    var btn = document.createElement('button');
    btn.id = 'agni-settings-btn';
    btn.className = 'agni-settings-btn';
    btn.setAttribute('aria-label', 'Accessibility settings');
    btn.textContent = '\u2699';
    btn.onclick = renderSettingsPanel;
    document.body.appendChild(btn);
  }

  global.AGNI_A11Y = {
    prefs:                prefs,
    apply:                apply,
    addAria:              addAria,
    renderSettingsPanel:  renderSettingsPanel,
    injectSettingsButton: injectSettingsButton,
    savePrefs:            savePrefs
  };

})(typeof self !== 'undefined' ? self : this);
