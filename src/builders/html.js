// src/builders/html.js
// AGNI HTML Builder  v1.8.0
//
// Compiles a parsed OLS lesson object into a single HTML lesson file
// plus supporting assets in the same output directory.
//
// Changes from v1.7.0:
//   - Delegates lesson data preparation to buildLessonIR() in
//     src/compiler/buildLessonIR.js. html.js is now a pure builder:
//     it receives a fully enriched IR and produces HTML. All feature
//     inference, Markdown processing, and compiler stamping moved to the IR.
//   - Writes a lesson-ir.json sidecar alongside the lesson HTML.
//     The theta engine reads this file directly instead of scraping
//     window.LESSON_DATA from compiled HTML with a regex.
//   - KaTeX CSS assets are referenced in the sidecar (via ir.inferredFeatures
//     .katexAssets) and loaded at runtime by factory-loader.js (Phase 3).
//     They are NOT inlined here — inlining would add ~95KB to every lesson
//     with equations and violate the 500KB lesson packet budget on 2G links.
//   - Version bumped to 1.8.0.
//
// Output structure:
//   dist/
//     gravity.html          — lesson HTML (inlines sensor-bridge, player.js)
//     gravity-ir.json       — metadata sidecar for theta engine
//     shared-runtime.js     — shared cached asset (updated only when newer)
//
// TEMPORARY: sensor-bridge.js is currently inlined into lesson HTML
//   alongside player.js. This is a bridge measure until factory-loader.js
//   lands in Phase 3, at which point sensor-bridge.js will be served as a
//   versioned cached asset from the village hub. When factory-loader.js
//   lands, remove the sensor-bridge inline block from lessonScript below.
//   Track at: https://github.com/NewmanB1/AGNI/issues/XXX
//
// Target: Node.js 14+. Not loaded on the edge device.
// -----------------------------------------------------------------------------

'use strict';

var fs   = require('fs');
var path = require('path');

var signContent        = require('../utils/crypto').signContent;
var ensureDir          = require('../utils/io').ensureDir;
var buildLessonIR      = require('../compiler/buildLessonIR').buildLessonIR;
var buildLessonSidecar = require('../compiler/buildLessonIR').buildLessonSidecar;


/**
 * Builds a lesson HTML file and lesson-ir.json sidecar from a parsed OLS
 * lesson object.
 *
 * @param {object} lessonData   parsed YAML lesson object
 * @param {object} options      CLI options: output, deviceId, privateKey, dev
 */
async function buildHtml(lessonData, options) {
  console.log('[HTML] Building lesson:', (lessonData.meta && lessonData.meta.title) || 'Unnamed');
  console.log('[HTML] Device:', options.deviceId || 'Unbound (Development Mode)');

  // -- 1. Build the canonical IR -----------------------------------------------
  // All data preparation -- feature inference, Markdown rendering, compiler
  // stamping -- happens in buildLessonIR(). html.js receives a finished IR
  // and decides only how to package it.
  var ir = await buildLessonIR(lessonData, options);

  // -- 2. Write lesson-ir.json sidecar -----------------------------------------
  // Metadata-only extract for the theta engine. Omits steps and htmlContent.
  // Written first so a partial build failure on the HTML step does not leave
  // the theta index pointing to a non-existent HTML file.
  var outputDir   = path.dirname(options.output);
  var sidecar     = buildLessonSidecar(ir);
  var sidecarPath = options.output.replace(/\.html$/, '-ir.json');
  ensureDir(outputDir);
  fs.writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2));
  console.log('[HTML] Sidecar written:', sidecarPath);

  // -- 3. Read runtime files ---------------------------------------------------
  var runtimeDir = path.join(__dirname, '../runtime');

  var playerJs       = fs.readFileSync(path.join(runtimeDir, 'player.js'),        'utf8');
  var styles         = fs.readFileSync(path.join(runtimeDir, 'style.css'),         'utf8');

  // TEMPORARY: sensor-bridge.js inlined until factory-loader.js (Phase 3).
  // See file header comment for full explanation and tracking issue.
  var sensorBridgeJs = fs.readFileSync(path.join(runtimeDir, 'sensor-bridge.js'), 'utf8');

  // -- 4. Handle shared-runtime.js (write once, reuse across lessons) ----------
  // shared-runtime.js is a cached shared asset -- not inlined into lesson HTML.
  // Lessons reference it via <script src="./shared-runtime.js">.
  var sharedOutput = path.join(outputDir, 'shared-runtime.js');
  var sharedSource = path.join(runtimeDir, 'shared-runtime.js');

  var shouldWriteShared = false;
  if (!fs.existsSync(sharedOutput)) {
    shouldWriteShared = true;
    console.log('[HTML] Shared runtime missing -> generating');
  } else {
    var sourceStat = fs.statSync(sharedSource);
    var destStat   = fs.statSync(sharedOutput);
    if (sourceStat.mtimeMs > destStat.mtimeMs) {
      shouldWriteShared = true;
      console.log('[HTML] Shared runtime source newer -> updating');
    }
  }

  if (shouldWriteShared) {
    var sharedCode = fs.readFileSync(sharedSource, 'utf8');
    fs.writeFileSync(sharedOutput, sharedCode);
    console.log('[HTML] Shared runtime written:', sharedOutput);
  } else {
    console.log('[HTML] Shared runtime up-to-date');
  }

  // -- 5. Serialize and sign lesson data ---------------------------------------
  // The IR is serialized into the lesson HTML as window.LESSON_DATA.
  // </script> sequences are escaped so they cannot break the inline block.
  var dataString     = JSON.stringify(ir);
  var signature      = signContent(dataString, options.deviceId, options.privateKey);
  var safeDataString = dataString.replace(/<\/script>/gi, '<\\/script>');

  // -- 6. Assemble lesson-specific script block --------------------------------
  var lessonScript = [
    'window.LESSON_DATA        = ' + safeDataString + ';',
    'window.OLS_SIGNATURE      = ' + JSON.stringify(signature || '') + ';',
    'window.OLS_INTENDED_OWNER = ' + JSON.stringify(options.deviceId || '') + ';',
    '',
    '// TEMPORARY: sensor-bridge.js inlined until factory-loader.js (Phase 3)',
    '// See html.js header comment for tracking issue.',
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

  // -- 7. KaTeX placeholder comment --------------------------------------------
  // KaTeX CSS is NOT inlined. factory-loader.js (Phase 3) reads
  // sidecar.katexAssets and injects <link> tags at runtime.
  // Until Phase 3, lessons with equations render correctly in structure
  // but without KaTeX styling applied.
  var katexComment = ir.inferredFeatures.katexAssets.length > 0
    ? '<!-- KaTeX assets (loaded by factory-loader.js Phase 3): ' +
      ir.inferredFeatures.katexAssets.join(', ') + ' -->'
    : '';

  // -- 8. Assemble HTML --------------------------------------------------------
  var htmlLines = [
    '<!DOCTYPE html>',
    '<html lang="' + escapeHtml((ir.meta && ir.meta.language) || 'en') + '">',
    '<head>',
    '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">',
    '  <meta name="theme-color" content="#1a1a2e">',
    '  <title>' + escapeHtml((ir.meta && ir.meta.title) || 'AGNI Lesson') + '</title>'
  ];
  if (katexComment) htmlLines.push('  ' + katexComment);
  htmlLines = htmlLines.concat([
    '  <style>' + styles + '</style>',
    '</head>',
    '<body>',
    '  <div id="loading">Loading lesson\u2026</div>',
    '  <div id="app"></div>',
    '  <!-- shared-runtime.js is a versioned cached asset served by the village hub. -->',
    '  <!-- It is not inlined here. -->',
    '  <script src="./shared-runtime.js"></script>',
    '  <script>',
    lessonScript,
    '  </script>',
    '</body>',
    '</html>'
  ]);
  var html = htmlLines.join('\n');

  // -- 9. Write lesson HTML ----------------------------------------------------
  fs.writeFileSync(options.output, html);

  var sizeKB = (Buffer.byteLength(html) / 1024).toFixed(1);
  console.log('\u2705 Lesson HTML: ' + options.output + ' (' + sizeKB + ' KB)');

  // Size budget: 500KB covers lesson HTML only. shared-runtime.js and
  // factory files are cached separately and not counted here.
  // Document total payload budget when factory-loader.js lands (Phase 3).
  if (parseFloat(sizeKB) > 500) {
    console.warn('\u26A0\uFE0F  Lesson HTML exceeds 500KB (' + sizeKB + ' KB)');
  }
}


/**
 * Escapes HTML special characters for safe use in attributes and text nodes.
 * Used for lesson title and language tag only -- step content is handled
 * by the Markdown pipeline which manages its own escaping.
 *
 * @param  {string} str
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
