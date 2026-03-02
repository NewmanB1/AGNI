'use strict';

// Shared lesson assembly — single source for the inline script block used by
// the CLI HTML builder and hub-transform PWA shell. Keeps integrity globals,
// LESSON_DATA, and runtime bootstrap in one place so version and behavior stay
// consistent. See ARCHITECTURE.md §5.1.

/**
 * Build the inline lesson script block: factory-loader, LESSON_DATA, Phase 4
 * integrity globals (OLS_SIGNATURE, OLS_PUBLIC_KEY, OLS_INTENDED_OWNER), player,
 * and the loading safety net. Caller must supply pre-read factoryLoaderJs and
 * playerJs so this module stays I/O-free.
 *
 * @param  {object} ir       Compiled lesson IR (will be JSON.stringify'd and escaped)
 * @param  {object} options  { signature, publicKeySpki, deviceId, factoryLoaderJs, playerJs }
 * @returns {string}         Single script block (no <script> wrapper)
 */
function buildLessonScript(ir, options) {
  options = options || {};
  const dataString     = JSON.stringify(ir);
  const safeDataString = dataString.replace(/<\/script\s*>/gi, '<\\/script>').replace(/<\/script/gi, '<\\/script');
  const signature      = options.signature != null ? options.signature : '';
  const publicKeySpki  = options.publicKeySpki != null ? options.publicKeySpki : '';
  const deviceId       = options.deviceId != null ? options.deviceId : '';
  const factoryLoaderJs = options.factoryLoaderJs || '';
  const playerJs        = options.playerJs || '';

  return [
    '// factory-loader.js — AGNI_LOADER bootstrap (must run before all other runtime code)',
    factoryLoaderJs,
    '',
    '// Lesson data + factory dependency manifest',
    'window.LESSON_DATA        = ' + safeDataString + ';',
    '',
    '// Phase 4 integrity globals — written at build/transform time.',
    '// player.js verifyIntegrity() reads these to verify the lesson has not',
    '// been tampered with and belongs to this device.',
    '// OLS_PUBLIC_KEY: base64 SPKI DER Ed25519 public key (44 bytes decoded).',
    '//   Import in browser: crypto.subtle.importKey("spki", bytes, {name:"Ed25519"}, ...)',
    '//   Do NOT strip the DER header — SubtleCrypto requires the full SPKI wrapper.',
    '// OLS_SIGNATURE: base64 Ed25519 signature over SHA-256(content + NUL + deviceId).',
    '// OLS_INTENDED_OWNER: UUID of the intended device.',
    'window.OLS_SIGNATURE      = ' + JSON.stringify(signature) + ';',
    'window.OLS_PUBLIC_KEY     = ' + JSON.stringify(publicKeySpki) + ';',
    'window.OLS_INTENDED_OWNER = ' + JSON.stringify(deviceId) + ';',
    '',
    '// player.js — lesson state machine. Calls AGNI_LOADER.loadDependencies()',
    '// before mounting the first step.',
    playerJs,
    '',
    '// Safety net: hide loading spinner if init stalls beyond 5s.',
    'window.addEventListener(\'load\', function () {',
    '  setTimeout(function () {',
    '    var loading = document.getElementById(\'loading\');',
    '    if (loading) loading.style.display = \'none\';',
    '  }, 5000);',
    '});'
  ].join('\n');
}

module.exports = {
  buildLessonScript: buildLessonScript
};
