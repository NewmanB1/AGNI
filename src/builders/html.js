// src/builders/html.js
// AGNI HTML Builder
//
// Compiles a parsed OLS lesson object into a single HTML lesson file
// plus a shared-runtime.js asset in the same output directory.
//
// Output structure (temporary — see TEMPORARY note below):
//   dist/
//     gravity.html          — lesson file (lesson-specific content + inlined runtimes)
//     shared-runtime.js     — shared cached asset (updated only when source is newer)
//
// Delivery model:
//   The village hub compiles YAML → HTML and serves the result as a PWA.
//   shared-runtime.js and factory files are cached on the edge device by
//   the service worker (capable devices) or AppCache / inline fallback (iOS 9).
//   Lesson HTML files are small because they reference cached shared assets
//   rather than bundling everything.
//
// TEMPORARY: sensor-bridge.js is currently inlined into the lesson HTML
//   alongside player.js. This is a bridge measure until factory-loader.js
//   is implemented in Phase 3, at which point sensor-bridge.js will be
//   served as a versioned cached asset from the village hub and loaded on
//   demand based on the lesson dependency manifest. When factory-loader.js
//   lands, remove the sensor-bridge inline block from this file.
//   Track at: https://github.com/NewmanB1/AGNI/issues/XXX
//
// Target platform: the compiled HTML runs on iOS 9+, Android 4+.
//   The builder itself runs on Node.js >= 14.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

var fs   = require('fs');
var path = require('path');

var signContent = require('../utils/crypto').signContent;
var ensureDir   = require('../utils/io').ensureDir;
var config      = require('../config');

/**
 * Builds a lesson HTML file from a parsed OLS lesson object.
 *
 * @param {object} lessonData   parsed YAML lesson
 * @param {object} options      CLI options: output, deviceId, privateKey, dev
 */
async function buildHtml(lessonData, options) {
  console.log('[HTML] Building lesson:', lessonData.meta && lessonData.meta.title || 'Unnamed');
  console.log('[HTML] Device:', options.deviceId || 'Unbound (Development Mode)');

  // ── 1. Stamp dev mode onto lesson data so the runtime can read it ──────────
  // The runtime resolves DEV_MODE from LESSON_DATA._devMode — never hardcoded.
  // Only true when --dev flag was explicitly passed to the compiler.
  var runtimeMeta = Object.assign({}, lessonData, {
    _devMode: options.dev === true
  });

  // ── 2. Process Markdown in each step (async) ───────────────────────────────
  var runtimeData = Object.assign({}, runtimeMeta, {
    steps: await Promise.all(
      (lessonData.steps || []).map(async function (step) {
        var htmlContent = '';
        if (step.content) {
          try {
            htmlContent = await config.processMarkdown(step.content);
          } catch (err) {
            console.error('[HTML] Markdown failed for step', step.id || '?', ':', err.message);
            htmlContent = step.content.replace(/\n/g, '<br>');
          }
        }
        return Object.assign({}, step, { htmlContent: htmlContent });
      })
    )
  });

  // ── 3. Read runtime files ──────────────────────────────────────────────────
  var runtimeDir = path.join(__dirname, '../runtime');

  var playerJs      = fs.readFileSync(path.join(runtimeDir, 'player.js'),       'utf8');
  var styles        = fs.readFileSync(path.join(runtimeDir, 'style.css'),        'utf8');

  // TEMPORARY: sensor-bridge.js inlined until factory-loader.js (Phase 3).
  // See file header comment for full explanation.
  var sensorBridgeJs = fs.readFileSync(path.join(runtimeDir, 'sensor-bridge.js'), 'utf8');

  // ── 4. Handle shared-runtime.js (write once, reuse across lessons) ─────────
  // shared-runtime.js is a cached shared asset — it is not inlined into the
  // lesson HTML. Lessons reference it via <script src="./shared-runtime.js">.
  // The hub's service worker (Phase 3) caches it across lessons.
  var outputDir    = path.dirname(options.output);
  var sharedOutput = path.join(outputDir, 'shared-runtime.js');
  var sharedSource = path.join(runtimeDir, 'shared-runtime.js');

  var shouldWriteShared = false;
  if (!fs.existsSync(sharedOutput)) {
    shouldWriteShared = true;
    console.log('[HTML] Shared runtime missing → generating');
  } else {
    var sourceStat = fs.statSync(sharedSource);
    var destStat   = fs.statSync(sharedOutput);
    if (sourceStat.mtimeMs > destStat.mtimeMs) {
      shouldWriteShared = true;
      console.log('[HTML] Shared runtime source newer → updating');
    }
  }

  if (shouldWriteShared) {
    var sharedCode = fs.readFileSync(sharedSource, 'utf8');
    ensureDir(outputDir);
    fs.writeFileSync(sharedOutput, sharedCode);
    console.log('[HTML] Shared runtime written:', sharedOutput);
  } else {
    console.log('[HTML] Shared runtime up-to-date:', sharedOutput);
  }

  // ── 5. Serialize & sign lesson data ───────────────────────────────────────
  var dataString    = JSON.stringify(runtimeData);
  var signature     = signContent(dataString, options.deviceId, options.privateKey);

  // Escape </script> sequences that would break the inline script block
  var safeDataString = dataString.replace(/<\/script>/gi, '<\\/script>');

  // ── 6. Assemble lesson-specific script block ───────────────────────────────
  var lessonScript = [
    'window.LESSON_DATA        = ' + safeDataString + ';',
    'window.OLS_SIGNATURE      = ' + JSON.stringify(signature || '') + ';',
    'window.OLS_INTENDED_OWNER = ' + JSON.stringify(options.deviceId || '') + ';',
    '',
    '// TEMPORARY: sensor-bridge.js inlined until factory-loader.js (Phase 3)',
    sensorBridgeJs,
    '',
    playerJs,
    '',
    '// Safety net: hide loading spinner if init stalls beyond 5s.',
    '// player.js also sets this timeout as an additional safety layer.',
    'window.addEventListener(\'load\', function () {',
    '  setTimeout(function () {',
    '    var loading = document.getElementById(\'loading\');',
    '    if (loading) loading.style.display = \'none\';',
    '  }, 5000);',
    '});'
  ].join('\n');

  // ── 7. Assemble HTML ───────────────────────────────────────────────────────
  var html = [
    '<!DOCTYPE html>',
    '<html lang="' + (lessonData.meta.language || 'en') + '">',
    '<head>',
    '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">',
    '  <meta name="theme-color" content="#1a1a2e">',
    '  <title>' + escapeHtml(lessonData.meta.title || 'AGNI Lesson') + '</title>',
    '  <style>' + styles + '</style>',
    '</head>',
    '<body>',
    '  <div id="loading">Loading lesson\u2026</div>',
    '  <div id="app"></div>',
    '  <!-- shared-runtime.js is a versioned cached asset served by the village hub -->',
    '  <!-- and cached by the PWA service worker. It is not inlined here. -->',
    '  <script src="./shared-runtime.js"></script>',
    '  <script>',
    lessonScript,
    '  </script>',
    '</body>',
    '</html>'
  ].join('\n');

  // ── 8. Write lesson HTML ───────────────────────────────────────────────────
  ensureDir(outputDir);
  fs.writeFileSync(options.output, html);

  var sizeKB = (Buffer.byteLength(html) / 1024).toFixed(1);
  console.log('\u2705 Lesson HTML: ' + options.output + ' (' + sizeKB + ' KB)');

  // Size warning: 500KB covers lesson HTML only. The full payload includes
  // shared-runtime.js and any factory files loaded from the device cache.
  // Document total payload budget when factory-loader.js lands (Phase 3).
  if (parseFloat(sizeKB) > 500) {
    console.warn('\u26A0\uFE0F  Lesson HTML exceeds 500KB (' + sizeKB + ' KB)');
  }
}

/**
 * Escapes HTML special characters for safe insertion into HTML attributes
 * and text content. Used for lesson title only — content is processed by
 * the Markdown pipeline which handles its own escaping.
 *
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#039;');
}

module.exports = buildHtml;
