// packages/agni-runtime/ui/i18n.js
// AGNI Internationalization (i18n) module v1.0
//
// Lightweight string localization for the lesson player.
// Reads preferred language from:
//   1. URL ?lang= parameter
//   2. localStorage 'agni_lang'
//   3. navigator.language
//   4. Falls back to 'en'
//
// Usage:
//   var t = AGNI_I18N.t;
//   el.textContent = t('lesson_complete');
//
// Target platform: iOS 9+, Android 4+. No ES6 except Map.
// ─────────────────────────────────────────────────────────

(function (global) {
  'use strict';

  var STRINGS = {
    en: {
      lesson_complete:     'Lesson complete!',
      score_label:         'Score',
      step_of:             'Step {current} of {total}',
      resume_title:        'Welcome back!',
      resume_msg:          'You have progress saved at step {step} of {total}.',
      resume_btn:          'Resume',
      restart_btn:         'Start over',
      next_btn:            'Next',
      continue_btn:        'Continue',
      correct:             'Correct!',
      incorrect:           'Incorrect.',
      try_again:           'Not quite — try again. ({remaining} attempt(s) remaining)',
      threshold_met:       'Threshold met!',
      waiting_sensor:      'Waiting for sensor input\u2026',
      enable_sensors:      'Enable Motion Sensors',
      sensor_unavailable:  'Motion sensor unavailable — some interactions may not work.',
      tap_to_continue:     'Tap to continue',
      skills_practised:    'Skills practised',
      steps_passed:        'Steps passed: {passed} / {total}',
      pace_fast:           'Great pace! You finished ahead of schedule.',
      pace_ontime:         'Right on time — good work!',
      pace_slow:           'You took a bit longer than expected — no worries, understanding matters most.',
      next_lesson:         'Next recommended lesson',
      back_dashboard:      'Back to dashboard',
      integrity_error:     'This lesson file could not be verified for your device. Please re-download from your learning hub.',
      loading_failed:      'Failed to load lesson. Please try again.'
    },
    es: {
      lesson_complete:     '\u00a1Lecci\u00f3n completa!',
      score_label:         'Puntuaci\u00f3n',
      step_of:             'Paso {current} de {total}',
      resume_title:        '\u00a1Bienvenido de nuevo!',
      resume_msg:          'Tienes progreso guardado en el paso {step} de {total}.',
      resume_btn:          'Continuar',
      restart_btn:         'Empezar de nuevo',
      next_btn:            'Siguiente',
      continue_btn:        'Continuar',
      correct:             '\u00a1Correcto!',
      incorrect:           'Incorrecto.',
      try_again:           'Casi — int\u00e9ntalo otra vez. ({remaining} intento(s) restante(s))',
      threshold_met:       '\u00a1Umbral alcanzado!',
      waiting_sensor:      'Esperando entrada del sensor\u2026',
      enable_sensors:      'Habilitar sensores de movimiento',
      sensor_unavailable:  'Sensor de movimiento no disponible — algunas interacciones podr\u00edan no funcionar.',
      tap_to_continue:     'Toca para continuar',
      skills_practised:    'Habilidades practicadas',
      steps_passed:        'Pasos aprobados: {passed} / {total}',
      pace_fast:           '\u00a1Buen ritmo! Terminaste antes de lo previsto.',
      pace_ontime:         'Justo a tiempo — \u00a1buen trabajo!',
      pace_slow:           'Tomaste un poco m\u00e1s de lo esperado — no te preocupes, lo importante es entender.',
      next_lesson:         'Siguiente lecci\u00f3n recomendada',
      back_dashboard:      'Volver al panel',
      integrity_error:     'No se pudo verificar este archivo de lecci\u00f3n para tu dispositivo. Vuelve a descargarlo desde tu hub.',
      loading_failed:      'Error al cargar la lecci\u00f3n. Int\u00e9ntalo de nuevo.'
    },
    sw: {
      lesson_complete:     'Somo limekamilika!',
      score_label:         'Alama',
      step_of:             'Hatua {current} ya {total}',
      resume_title:        'Karibu tena!',
      resume_msg:          'Una maendeleo yaliyohifadhiwa kwenye hatua {step} ya {total}.',
      resume_btn:          'Endelea',
      restart_btn:         'Anza upya',
      next_btn:            'Ifuatayo',
      continue_btn:        'Endelea',
      correct:             'Sahihi!',
      incorrect:           'Si sahihi.',
      try_again:           'Karibu \u2014 jaribu tena. (majaribio {remaining} yaliyobaki)',
      threshold_met:       'Kiwango kimefikiwa!',
      waiting_sensor:      'Kusubiri ingizo la sensori\u2026',
      enable_sensors:      'Washa sensori za mwendo',
      sensor_unavailable:  'Sensori ya mwendo haipatikani \u2014 baadhi ya maingiliano yanaweza yasifanye kazi.',
      tap_to_continue:     'Gusa ili kuendelea',
      skills_practised:    'Ujuzi uliofanyiwa mazoezi',
      steps_passed:        'Hatua zilizofaulu: {passed} / {total}',
      pace_fast:           'Kasi nzuri! Umemaliza mapema.',
      pace_ontime:         'Kwa wakati \u2014 kazi nzuri!',
      pace_slow:           'Umechukua muda kidogo zaidi \u2014 usijali, kuelewa ndio muhimu.',
      next_lesson:         'Somo linalofuata lililopendekezwa',
      back_dashboard:      'Rudi kwenye dashibodi',
      integrity_error:     'Faili hii ya somo haiwezi kuthibitishwa kwa kifaa chako. Tafadhali ipakue tena.',
      loading_failed:      'Imeshindwa kupakia somo. Tafadhali jaribu tena.'
    },
    fr: {
      lesson_complete:     'Le\u00e7on termin\u00e9e !',
      score_label:         'Score',
      step_of:             '\u00c9tape {current} sur {total}',
      resume_title:        'Bon retour !',
      resume_msg:          'Vous avez une progression sauvegard\u00e9e \u00e0 l\'\u00e9tape {step} sur {total}.',
      resume_btn:          'Reprendre',
      restart_btn:         'Recommencer',
      next_btn:            'Suivant',
      continue_btn:        'Continuer',
      correct:             'Correct !',
      incorrect:           'Incorrect.',
      try_again:           'Pas tout \u00e0 fait \u2014 essayez encore. ({remaining} tentative(s) restante(s))',
      threshold_met:       'Seuil atteint !',
      waiting_sensor:      'En attente du capteur\u2026',
      enable_sensors:      'Activer les capteurs de mouvement',
      sensor_unavailable:  'Capteur de mouvement indisponible \u2014 certaines interactions peuvent ne pas fonctionner.',
      tap_to_continue:     'Appuyez pour continuer',
      skills_practised:    'Comp\u00e9tences pratiqu\u00e9es',
      steps_passed:        '\u00c9tapes r\u00e9ussies : {passed} / {total}',
      pace_fast:           'Bon rythme ! Vous avez termin\u00e9 en avance.',
      pace_ontime:         'Juste \u00e0 temps \u2014 bon travail !',
      pace_slow:           'Vous avez pris un peu plus de temps \u2014 pas de souci, la compr\u00e9hension est essentielle.',
      next_lesson:         'Prochaine le\u00e7on recommand\u00e9e',
      back_dashboard:      'Retour au tableau de bord',
      integrity_error:     'Ce fichier de le\u00e7on n\'a pas pu \u00eatre v\u00e9rifi\u00e9 pour votre appareil.',
      loading_failed:      '\u00c9chec du chargement de la le\u00e7on. Veuillez r\u00e9essayer.'
    }
  };

  function detectLanguage() {
    try {
      var params = new URLSearchParams(global.location.search || '');
      var fromUrl = params.get('lang');
      if (fromUrl && STRINGS[fromUrl]) return fromUrl;
    } catch (e) {}

    try {
      var stored = localStorage.getItem('agni_lang');
      if (stored && STRINGS[stored]) return stored;
    } catch (e) {}

    try {
      var nav = (navigator.language || '').split('-')[0];
      if (STRINGS[nav]) return nav;
    } catch (e) {}

    return 'en';
  }

  var _lang = detectLanguage();

  /**
   * Get a translated string, with optional interpolation.
   * @param {string} key - String key from the STRINGS table
   * @param {object} [vars] - Optional key-value pairs for interpolation
   * @returns {string}
   */
  function t(key, vars) {
    var table = STRINGS[_lang] || STRINGS.en;
    var str = table[key] || STRINGS.en[key] || key;
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        str = str.replace(new RegExp('\\{' + k + '\\}', 'g'), String(vars[k]));
      });
    }
    return str;
  }

  function setLanguage(lang) {
    if (STRINGS[lang]) {
      _lang = lang;
      try { localStorage.setItem('agni_lang', lang); } catch (e) {}
    }
  }

  function getLanguage() { return _lang; }

  function getAvailableLanguages() {
    return Object.keys(STRINGS);
  }

  /**
   * Register additional translations (e.g. from lesson metadata).
   * @param {string} lang
   * @param {object} strings - Key-value map of additional strings
   */
  function addStrings(lang, strings) {
    if (!STRINGS[lang]) STRINGS[lang] = {};
    var table = STRINGS[lang];
    Object.keys(strings).forEach(function (k) {
      table[k] = strings[k];
    });
  }

  global.AGNI_I18N = {
    t:                     t,
    setLanguage:           setLanguage,
    getLanguage:           getLanguage,
    getAvailableLanguages: getAvailableLanguages,
    addStrings:            addStrings
  };

}(window));
