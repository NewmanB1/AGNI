// src/builders/html.js
// AGNI HTML Builder  v1.9.0
//
// Compiles a parsed OLS lesson object into a single HTML lesson file
// plus supporting assets in the same output directory.
//
// Changes from v1.8.0:
//   - factory-loader.js is now inlined into lesson HTML as the first script.
//     It bootstraps the asset loading pipeline before any other runtime code
//     runs. AGNI_LOADER must exist before shared-runtime.js executes so
//     shared-runtime can self-register via AGNI_LOADER.register().
//   - sensor-bridge.js inline block removed. sensor-bridge.js is now a
//     versioned cached asset loaded by factory-loader.js at runtime, the
//     same as svg-stage.js and the factory files. The TEMPORARY comment
//     and tracking issue placeholder have been removed.
//   - shared-runtime.js <script src> tag removed from the HTML template.
//     factory-loader.js calls AGNI_LOADER.loadDependencies(LESSON_DATA)
//     which loads shared-runtime.js first (before any factory files) as
//     part of the factory manifest sequence. Lessons with no factory
//     dependencies still get shared-runtime.js via the loader — it is
//     always included as the first entry in the requires.factories list
//     written into LESSON_DATA.
//   - KaTeX CSS files written to output directory at build time via
//     buildKatexCss() (src/utils/katex-css-builder.js). factory-loader.js
//     injects the <link> tags at runtime from sidecar.katexAssets —
//     no more placeholder comment.
//   - Version bumped to 1.9.0.
//
// Output structure:
//   dist/
//     gravity.html              — lesson HTML (inlines factory-loader + player)
//     gravity-ir.json           — metadata sidecar for theta engine
//     shared-runtime.js         — cached shared asset (loaded by factory-loader)
//     katex-core.css            — KaTeX layout rules (written if lesson has equations)
//     katex-symbols-{x}.css    — per-domain symbol subsets (written as needed)
//     katex-fonts.css           — KaTeX @font-face rules (written if lesson has equations)
//
// Load order in the browser (enforced by factory-loader.js):
//   1. factory-loader.js (inline)   — AGNI_LOADER bootstrap
//   2. LESSON_DATA (inline)         — lesson IR + factory manifest
//   3. player.js (inline)           — calls AGNI_LOADER.loadDependencies()
//   4. shared-runtime.js (fetched)  — AGNI_SHARED
//   5. svg-stage.js (fetched)       — AGNI_SVG.stage
//   6. svg-factories*.js (fetched)  — AGNI_SVG factory functions
//   7. svg-registry.js (fetched)    — AGNI_SVG.fromSpec()
//   8. table-renderer.js (fetched)  — if lesson has tables + visuals
//
// Target: Node.js 14+. Not loaded on the edge device.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

var fs   = require('fs');
var path = require('path');

var signContent        = require('../utils/crypto').signContent;
var ensureDir          = require('../utils/io').ensureDir;
var buildLessonIR      = require('../compiler/buildLessonIR').buildLessonIR;
var buildLessonSidecar = require('../compiler/buildLessonIR').buildLessonSidecar;
var buildKatexCss      = require('../utils/katex-css-builder').buildKatexCss;


/**
 * Builds a lesson HTML file, lesson-ir.json sidecar, and CSS assets from a
 * parsed OLS lesson object.
 *
 * @param {object} lessonData   parsed YAML lesson object
 * @param {object} options      CLI options: output, deviceId, privateKey, dev
 */
async function buildHtml(lessonData, options) {
  console.log('[HTML] Building lesson:', (lessonData.meta && lessonData.meta.title) || 'Unnamed');
  console.log('[HTML] Device:', options.deviceId || 'Unbound (Development Mode)');

  // -- 1. Build the canonical IR -----------------------------------------------
  var ir = await buildLessonIR(lessonData, options);

  // -- 2. Write lesson-ir.json sidecar -----------------------------------------
  // Written before the HTML so a partial build failure on the HTML step does
  // not leave the theta index pointing at a non-existent HTML file.
  var outputDir   = path.dirname(options.output);
  var sidecar     = buildLessonSidecar(ir);
  var sidecarPath = options.output.replace(/\.html$/, '-ir.json');
  ensureDir(outputDir);
  fs.writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2));
  console.log('[HTML] Sidecar written:', sidecarPath);

  // -- 3. Write KaTeX CSS assets -----------------------------------------------
  // buildKatexCss() splits katex.min.css and writes only the subset files the
  // lesson needs (from ir.inferredFeatures.katexAssets) to the output directory.
  // Files already present and up-to-date are skipped (write-if-newer).
  // factory-loader.js injects the corresponding <link> tags at runtime.
  buildKatexCss(ir.inferredFeatures.katexAssets, outputDir);

  // -- 4. Read runtime files ---------------------------------------------------
  var runtimeDir = path.join(__dirname, '../runtime');

  var playerJs        = fs.readFileSync(path.join(runtimeDir, 'player.js'),         'utf8');
  var factoryLoaderJs = fs.readFileSync(path.join(runtimeDir, 'factory-loader.js'), 'utf8');
  var styles          = fs.readFileSync(path.join(runtimeDir, 'style.css'),          'utf8');

  // -- 5. Handle shared-runtime.js (write once, reuse across lessons) ----------
  // shared-runtime.js is a cached shared asset — not inlined into lesson HTML.
  // factory-loader.js fetches it at runtime as the first step of loadDependencies().
  // We still write it to the output directory here so it is available for
  // sneakernet delivery (the whole dist/ folder is copied to a USB stick).
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

  // -- 6. Build the factory dependency list for LESSON_DATA --------------------
  // factory-loader.js reads LESSON_DATA.requires.factories at runtime to know
  // which files to fetch. We build this list from the sidecar factoryManifest
  // and always prepend shared-runtime.js so the loader fetches it first.
  //
  // Each entry: { file, version }
  // version is the current builder version — factory-loader uses this as the
  // cache key so a version bump forces a cache refresh on all devices.
  var RUNTIME_VERSION = '1.9.0';

  var factoryDeps = [];

  // shared-runtime.js is always first — all other files depend on AGNI_SHARED
  factoryDeps.push({ file: 'shared-runtime.js', version: RUNTIME_VERSION });

  // Add factory files from the lesson manifest in the required load order
  var manifest = (ir.inferredFeatures && ir.inferredFeatures.factoryManifest) || [];
  manifest.forEach(function (filename) {
    // shared-runtime.js already prepended above; svg-stage.js is always
    // first in the manifest but loads after shared-runtime.js
    factoryDeps.push({ file: filename, version: RUNTIME_VERSION });
  });

  // Attach the factory dependency list to the IR before serialisation
  ir.requires = { factories: factoryDeps };

  // -- 7. Serialize and sign lesson data ---------------------------------------
  var dataString     = JSON.stringify(ir);
  var signature      = signContent(dataString, options.deviceId, options.privateKey);
  var safeDataString = dataString.replace(/<\/script>/gi, '<\\/script>');

  // -- 8. Assemble lesson-specific script block --------------------------------
  // Load order:
  //   factory-loader.js  — must be first so AGNI_LOADER exists before anything else
  //   LESSON_DATA        — the IR including requires.factories
  //   player.js          — calls AGNI_LOADER.loadDependencies(LESSON_DATA) on init
  //
  // player.js is responsible for calling AGNI_LOADER.loadDependencies() before
  // mounting the first step. The loader fetches shared-runtime.js first, then
  // factory files in manifest order, then resolves the Promise so player.js
  // can proceed with step rendering.
  var lessonScript = [
    '// factory-loader.js — AGNI_LOADER bootstrap (must run before all other runtime code)',
    factoryLoaderJs,
    '',
    '// Lesson data + factory dependency manifest',
    'window.LESSON_DATA        = ' + safeDataString + ';',
    'window.OLS_SIGNATURE      = ' + JSON.stringify(signature || '') + ';',
    'window.OLS_INTENDED_OWNER = ' + JSON.stringify(options.deviceId || '') + ';',
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

  // -- 9. Assemble HTML --------------------------------------------------------
  var html = [
    '<!DOCTYPE html>',
    '<html lang="' + escapeHtml((ir.meta && ir.meta.language) || 'en') + '">',
    '<head>',
    '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">',
    '  <meta name="theme-color" content="#1a1a2e">',
    '  <title>' + escapeHtml((ir.meta && ir.meta.title) || 'AGNI Lesson') + '</title>',
    '  <style>' + styles + '</style>',
    '</head>',
    '<body>',
    '  <div id="loading">Loading lesson\u2026</div>',
    '  <div id="app"></div>',
    '  <script>',
    lessonScript,
    '  </script>',
    '</body>',
    '</html>'
  ].join('\n');

  // -- 10. Write lesson HTML ---------------------------------------------------
  fs.writeFileSync(options.output, html);

  var sizeKB = (Buffer.byteLength(html) / 1024).toFixed(1);
  console.log('\u2705 Lesson HTML: ' + options.output + ' (' + sizeKB + ' KB)');

  // Size budget note: 500KB covers lesson HTML only (factory-loader + player +
  // LESSON_DATA). shared-runtime.js, factory files, and KaTeX CSS are cached
  // separately and not counted against this budget.
  if (parseFloat(sizeKB) > 500) {
    console.warn('\u26A0\uFE0F  Lesson HTML exceeds 500KB (' + sizeKB + ' KB)');
  }
}


/**
 * Escapes HTML special characters for safe use in attributes and text nodes.
 * Used for lesson title and language tag only — step content is handled
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
