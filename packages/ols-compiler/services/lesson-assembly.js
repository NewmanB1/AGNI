'use strict';

function buildLessonScript(ir, options) {
  options = options || {};
  const dataString     = JSON.stringify(ir);
  const safeDataString = dataString.replace(/<\/script\s*>/gi, '<\\/script>').replace(/<\/script/gi, '<\\/script');
  const signature      = options.signature != null ? options.signature : '';
  const publicKeySpki  = options.publicKeySpki != null ? options.publicKeySpki : '';
  const deviceId       = options.deviceId != null ? options.deviceId : '';
  const factoryLoaderJs = options.factoryLoaderJs || '';
  const stepRenderersJs = options.stepRenderersJs || '';
  const playerJs        = options.playerJs || '';

  return [
    '// factory-loader.js — AGNI_LOADER bootstrap (must run before all other runtime code)',
    factoryLoaderJs,
    '',
    '// Lesson data + factory dependency manifest',
    'window.LESSON_DATA        = ' + safeDataString + ';',
    '',
    '// Phase 4 integrity globals',
    'window.OLS_SIGNATURE      = ' + JSON.stringify(signature) + ';',
    'window.OLS_PUBLIC_KEY     = ' + JSON.stringify(publicKeySpki) + ';',
    'window.OLS_INTENDED_OWNER = ' + JSON.stringify(deviceId) + ';',
    '',
    stepRenderersJs ? '// step-renderers.js (quiz, fill-blank, matching, ordering, hardware_trigger)\n' + stepRenderersJs + '\n' : '',
    '// player.js',
    playerJs,
    '',
    'window.addEventListener(\'load\', function () {',
    '  setTimeout(function () {',
    '    var loading = document.getElementById(\'loading\');',
    '    if (loading) loading.style.display = \'none\';',
    '  }, 5000);',
    '});'
  ].join('\n');
}

module.exports = { buildLessonScript };
